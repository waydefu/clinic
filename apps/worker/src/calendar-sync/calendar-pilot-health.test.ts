import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  evaluateCalendarPilotHealth,
  inspectCalendarPilotHealth,
  type CalendarPilotHealthStore
} from './calendar-pilot-health.js';

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
