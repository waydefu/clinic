import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

import {
  evaluateCalendarPilotHealth,
  inspectCalendarPilotHealth,
  type CalendarPilotHealthStore
} from './calendar-pilot-health.js';
import { createCalendarPilotServer } from './calendar-pilot-main.js';

const NOW = '2026-09-14T01:00:00.000Z';

function fakeStore(options: {
  readonly config: Record<string, unknown> | null;
  readonly jobs?: Readonly<Record<string, number>>;
}): CalendarPilotHealthStore {
  const jobs = options.jobs ?? {};
  return {
    collection(name: string) {
      if (name === 'calendar_pilot_configuration') {
        return {
          doc() {
            return {
              get: () =>
                Promise.resolve({
                  exists: options.config !== null,
                  data: () => options.config ?? undefined
                })
            };
          },
          where() {
            return { get: () => Promise.resolve({ size: 0 }) };
          }
        };
      }
      return {
        doc() {
          return {
            get: () => Promise.resolve({ exists: false, data: () => undefined })
          };
        },
        where(_field: string, _op: string, value: unknown) {
          const status = typeof value === 'string' ? value : '';
          return {
            get: () => Promise.resolve({ size: jobs[status] ?? 0 })
          };
        }
      };
    }
  };
}

describe('evaluateCalendarPilotHealth', () => {
  it('is ok when inbound and outbound are enabled, unexpired, and jobs are clean', () => {
    expect(
      evaluateCalendarPilotHealth({
        exists: true,
        nowUtc: NOW,
        health: 'syncing',
        expiresAt: '2026-11-28T00:00:00.000Z',
        inboundEnabled: true,
        outboundEnabled: true,
        failedJobs: 0
      })
    ).toEqual({ health: 'ok', alerts: [] });
  });

  it('fails closed when the configuration document is missing', () => {
    expect(
      evaluateCalendarPilotHealth({
        exists: false,
        nowUtc: NOW,
        health: 'syncing',
        expiresAt: '2026-11-28T00:00:00.000Z',
        inboundEnabled: true,
        outboundEnabled: true,
        failedJobs: 0
      })
    ).toEqual({
      health: 'missing',
      alerts: [{ code: 'configuration_missing', severity: 'immediate' }]
    });
  });

  it('treats a past expiresAt as expired even if health is still syncing', () => {
    expect(
      evaluateCalendarPilotHealth({
        exists: true,
        nowUtc: NOW,
        health: 'syncing',
        expiresAt: '2026-09-14T00:00:00.000Z',
        inboundEnabled: true,
        outboundEnabled: true,
        failedJobs: 0
      }).health
    ).toBe('expired');
  });
});

describe('inspectCalendarPilotHealth', () => {
  const healthyConfiguration = {
    health: 'healthy',
    expiresAt: '2028-03-01T00:00:00Z',
    inboundEnabled: true,
    outboundEnabled: true
  };

  it.each([
    '2026-02-30T00:00:00Z',
    '2026-01-01T24:00:00Z',
    '2026-01-01T00:00:00',
    '2026-01-01T08:00:00+08:00',
    'Jan 1 2026 GMT'
  ])('rejects clock %s before reading configuration or outbox', async (now) => {
    const store = fakeStore({ config: healthyConfiguration });
    const collection = vi.spyOn(store, 'collection');
    await expect(inspectCalendarPilotHealth(store, now)).rejects.toThrow(/UTC/);
    expect(collection).not.toHaveBeenCalled();
  });

  it.each(['2028-02-29T00:00:00Z', '2028-02-29T00:00:00.123456789Z'])(
    'accepts leap-day clock %s',
    async (now) => {
      await expect(
        inspectCalendarPilotHealth(
          fakeStore({ config: healthyConfiguration }),
          now
        )
      ).resolves.toMatchObject({ health: 'ok', alerts: [] });
    }
  );

  it('serves HTTP 503 for a rejected clock without database access or a drain', async () => {
    const store = fakeStore({ config: healthyConfiguration });
    const collection = vi.spyOn(store, 'collection');
    const run = vi.fn(() => Promise.resolve());
    const server = createCalendarPilotServer({
      run,
      inspect: () => inspectCalendarPilotHealth(store, '2026-02-30T00:00:00Z')
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve)
    );
    try {
      const address = server.address();
      if (address === null || typeof address === 'string')
        throw new Error('Expected a loopback TCP address.');
      const response = await fetch(`http://127.0.0.1:${address.port}/health`);
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({
        error: 'worker_unavailable'
      });
      expect(collection).not.toHaveBeenCalled();
      expect(run).not.toHaveBeenCalled();
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      });
    }
  });

  it.each([
    { health: 'unknown' },
    { expiresAt: '2030-02-30T00:00:00Z' },
    { inboundEnabled: 'true' },
    { schemaVersion: 2 }
  ])(
    'rejects malformed stored configuration without an ok result',
    async (invalid) => {
      await expect(
        inspectCalendarPilotHealth(
          fakeStore({
            config: {
              health: 'healthy',
              expiresAt: '2026-11-28T00:00:00.000Z',
              inboundEnabled: true,
              outboundEnabled: true,
              ...invalid
            }
          }),
          NOW
        )
      ).rejects.toThrow('Unreadable CAL-PILOT record.');
    }
  );

  it('keeps missing configuration distinct from unreadable data', async () => {
    await expect(
      inspectCalendarPilotHealth(fakeStore({ config: null }), NOW)
    ).resolves.toMatchObject({ health: 'missing' });
  });

  it('reads only configuration and outbox status counts', async () => {
    const inspection = await inspectCalendarPilotHealth(
      fakeStore({
        config: {
          health: 'degraded',
          expiresAt: '2026-11-28T00:00:00.000Z',
          inboundEnabled: true,
          outboundEnabled: true
        },
        jobs: { pending: 2, processing: 1, failed: 3 }
      }),
      NOW
    );
    expect(inspection).toEqual({
      health: 'degraded',
      inboundEnabled: true,
      outboundEnabled: true,
      snapshot: { pending: 2, processing: 1, failed: 3 },
      alerts: [
        { code: 'sync_degraded', severity: 'immediate' },
        { code: 'failed_jobs_present', severity: 'immediate' }
      ]
    });
  });

  it('does not import the Google Calendar adapter or watch controller', () => {
    const source = readFileSync(
      fileURLToPath(new URL('./calendar-pilot-health.ts', import.meta.url)),
      'utf8'
    );
    expect(source).not.toMatch(
      /google-calendar|google-sync-client|watch-channel/
    );
  });
});
