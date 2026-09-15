import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { once } from 'node:events';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';

import { createInternalTestOutboxServer } from './internal-test-outbox-main.js';
import { assertInternalTestOutboxBootAllowed } from './internal-test-outbox-runtime.js';

function http(
  port: number,
  path: string,
  method: 'GET' | 'POST'
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request(
      { hostname: '127.0.0.1', port, path, method },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk) => chunks.push(chunk as Buffer));
        response.on('end', () =>
          resolve({
            status: response.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8')
          })
        );
      }
    );
    req.on('error', reject);
    req.end();
  });
}

const EMPTY_SNAPSHOT = {
  pending: 0,
  inProgress: 0,
  deadLettered: 0,
  oldestPendingAgeSeconds: 0
};

const NOOP_CALENDAR_READY = () => Promise.resolve();

describe('internal-test outbox HTTP surface', () => {
  it('serves health and outbox-drain, and 404s a watch path', async () => {
    const runtime = {
      calendar: {},
      calendarReady: NOOP_CALENDAR_READY,
      inspect: () =>
        Promise.resolve({
          snapshot: EMPTY_SNAPSHOT,
          alerts: []
        }),
      run: () =>
        Promise.resolve({
          summary: { claimed: 0, completed: 0, retried: 0, deadLettered: 0 },
          snapshot: EMPTY_SNAPSHOT,
          alerts: []
        })
    };
    const server = createInternalTestOutboxServer(runtime);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const port = (server.address() as AddressInfo).port;
    try {
      const live = await http(port, '/live', 'GET');
      expect(live.status).toBe(200);
      expect(JSON.parse(live.body)).toEqual({
        service: 'internal-test-outbox-worker',
        status: 'ok'
      });
      const health = await http(port, '/health', 'GET');
      expect(health.status).toBe(200);
      expect(JSON.parse(health.body)).toEqual({
        service: 'internal-test-outbox-worker',
        status: 'ok',
        snapshot: EMPTY_SNAPSHOT,
        alerts: [],
        processingEnabled: true
      });
      const drain = await http(port, '/tasks/outbox-drain', 'POST');
      expect(drain.status).toBe(200);
      const watch = await http(port, '/calendar-watch', 'POST');
      expect(watch.status).toBe(404);
      expect(JSON.parse(watch.body)).toEqual({ error: 'not_found' });
    } finally {
      server.close();
      await once(server, 'close');
    }
  });

  it('reports degraded health when SLO inspection has an immediate alert', async () => {
    const runtime = {
      calendar: {},
      calendarReady: NOOP_CALENDAR_READY,
      inspect: () =>
        Promise.resolve({
          snapshot: { ...EMPTY_SNAPSHOT, deadLettered: 1 },
          alerts: [{ code: 'dead_letter_present', severity: 'immediate' }],
          attemptFailRate10m: 0
        }),
      run: () => Promise.reject(new Error('drain must not run for health'))
    };
    const server = createInternalTestOutboxServer(runtime);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const port = (server.address() as AddressInfo).port;
    try {
      const health = await http(port, '/health', 'GET');
      expect(health.status).toBe(200);
      expect(JSON.parse(health.body)).toEqual({
        service: 'internal-test-outbox-worker',
        status: 'degraded',
        snapshot: { ...EMPTY_SNAPSHOT, deadLettered: 1 },
        alerts: [{ code: 'dead_letter_present', severity: 'immediate' }],
        processingEnabled: true,
        attemptFailRate10m: 0
      });
      const ready = await http(port, '/ready', 'GET');
      expect(ready.status).toBe(503);
      expect(JSON.parse(ready.body).status).toBe('degraded');
    } finally {
      server.close();
      await once(server, 'close');
    }
  });

  it('keeps health ok for a weekday fail-rate alert and forwards the rate', async () => {
    const runtime = {
      calendar: {},
      calendarReady: NOOP_CALENDAR_READY,
      inspect: () =>
        Promise.resolve({
          snapshot: EMPTY_SNAPSHOT,
          alerts: [{ code: 'calendar_attempt_fail_rate', severity: 'weekday' }],
          attemptFailRate10m: 0.25
        }),
      run: () => Promise.reject(new Error('drain must not run for health'))
    };
    const server = createInternalTestOutboxServer(runtime);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const port = (server.address() as AddressInfo).port;
    try {
      const health = await http(port, '/health', 'GET');
      expect(health.status).toBe(200);
      expect(JSON.parse(health.body)).toMatchObject({
        status: 'ok',
        attemptFailRate10m: 0.25,
        alerts: [{ code: 'calendar_attempt_fail_rate', severity: 'weekday' }]
      });
    } finally {
      server.close();
      await once(server, 'close');
    }
  });

  it('refuses boot on the forbidden staging project and without the emulator', () => {
    expect(() =>
      assertInternalTestOutboxBootAllowed({
        GOOGLE_CLOUD_PROJECT: 'beauessence-clinic-staging',
        FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080'
      })
    ).toThrow(/forbidden staging project/);
    expect(() =>
      assertInternalTestOutboxBootAllowed({
        GOOGLE_CLOUD_PROJECT: 'beauessence-clinic-stg-c1a01'
      })
    ).toThrow(/FIRESTORE_EMULATOR_HOST/);
  });

  it('allows emulator boot off the forbidden project', () => {
    expect(() =>
      assertInternalTestOutboxBootAllowed({
        GOOGLE_CLOUD_PROJECT: 'beauessence-appointment-local',
        FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080'
      })
    ).not.toThrow();
  });

  it('allows isolated cloud boot only with CLOUD_ADC, a calendar id, and a source SHA', () => {
    const cloud = {
      INTERNAL_TEST_OUTBOX_EXECUTION: 'cloud',
      GOOGLE_CLOUD_PROJECT: 'beauessence-clinic-stg-c1a01',
      INTERNAL_TEST_OUTBOX_PROCESSING_ENABLED: 'true',
      GOOGLE_CALENDAR_INTEGRATION_MODE: 'test',
      GOOGLE_CALENDAR_AUTH: 'CLOUD_ADC',
      GOOGLE_CALENDAR_ID: 'synthetic-calendar-id',
      INTERNAL_TEST_SOURCE_SHA: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    };
    expect(() => assertInternalTestOutboxBootAllowed(cloud)).not.toThrow();
    expect(() =>
      assertInternalTestOutboxBootAllowed({
        ...cloud,
        GOOGLE_CALENDAR_INTEGRATION_MODE: 'production'
      })
    ).toThrow(/production/);
    expect(() =>
      assertInternalTestOutboxBootAllowed({
        ...cloud,
        GOOGLE_SERVICE_ACCOUNT_JSON: '{"client_email":"x"}'
      })
    ).toThrow(/GOOGLE_SERVICE_ACCOUNT_JSON/);
    expect(() =>
      assertInternalTestOutboxBootAllowed({
        ...cloud,
        GOOGLE_APPLICATION_CREDENTIALS: '/var/secrets/key.json'
      })
    ).toThrow(/GOOGLE_APPLICATION_CREDENTIALS/);
    expect(() =>
      assertInternalTestOutboxBootAllowed({
        INTERNAL_TEST_OUTBOX_EXECUTION: 'cloud',
        GOOGLE_CLOUD_PROJECT: 'beauessence-clinic-stg-c1a01'
      })
    ).toThrow(/CLOUD_ADC|PROCESSING_ENABLED|GOOGLE_CALENDAR/);
  });

  it('keeps the runtime calendar-port injectable and does not enable watch', () => {
    const source = readFileSync(
      fileURLToPath(new URL('./internal-test-outbox-main.ts', import.meta.url)),
      'utf8'
    );
    const runtime = readFileSync(
      fileURLToPath(
        new URL('./internal-test-outbox-runtime.ts', import.meta.url)
      ),
      'utf8'
    );
    expect(runtime).not.toMatch(/google-calendar/);
    expect(source).toMatch(/createCalendarPort/);
    expect(source).toMatch(/calendar_unavailable/);
    expect(source).not.toMatch(/CalendarWatch|events\.watch/);
  });

  it('fails /ready closed when Calendar access is unavailable', async () => {
    const runtime = {
      calendar: {},
      calendarReady: () =>
        Promise.reject(new Error('Calendar access token was empty.')),
      inspect: () =>
        Promise.resolve({
          snapshot: EMPTY_SNAPSHOT,
          alerts: []
        }),
      run: () => Promise.reject(new Error('drain must not run for ready'))
    };
    const server = createInternalTestOutboxServer(runtime);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const port = (server.address() as AddressInfo).port;
    try {
      const health = await http(port, '/health', 'GET');
      expect(health.status).toBe(200);
      const ready = await http(port, '/ready', 'GET');
      expect(ready.status).toBe(503);
      expect(JSON.parse(ready.body)).toEqual({ error: 'calendar_unavailable' });
    } finally {
      server.close();
      await once(server, 'close');
    }
  });

  it('refuses drain when processing is disabled for rollback', async () => {
    const runtime = {
      calendar: {},
      calendarReady: NOOP_CALENDAR_READY,
      inspect: () =>
        Promise.resolve({
          snapshot: EMPTY_SNAPSHOT,
          alerts: []
        }),
      run: () => Promise.reject(new Error('drain must not run'))
    };
    const server = createInternalTestOutboxServer(runtime, {
      processingEnabled: false
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const port = (server.address() as AddressInfo).port;
    try {
      const drain = await http(port, '/tasks/outbox-drain', 'POST');
      expect(drain.status).toBe(503);
      expect(JSON.parse(drain.body)).toEqual({ error: 'processing_disabled' });
    } finally {
      server.close();
      await once(server, 'close');
    }
  });
});
