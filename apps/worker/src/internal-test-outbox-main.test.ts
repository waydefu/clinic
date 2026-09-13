import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { once } from 'node:events';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';

import { createInternalTestOutboxServer } from './internal-test-outbox-main.js';
import { assertInternalTestOutboxBootAllowed } from './internal-test-outbox-runtime.js';

function post(
  port: number,
  path: string
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request(
      { hostname: '127.0.0.1', port, path, method: 'POST' },
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

describe('internal-test outbox HTTP surface', () => {
  it('serves health and outbox-drain, and 404s a watch path', async () => {
    const runtime = {
      calendar: {},
      run: () =>
        Promise.resolve({
          summary: { claimed: 0, completed: 0, retried: 0, deadLettered: 0 },
          snapshot: {
            pending: 0,
            inProgress: 0,
            deadLettered: 0,
            oldestPendingAgeSeconds: 0
          },
          alerts: []
        })
    };
    const server = createInternalTestOutboxServer(runtime);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const port = (server.address() as AddressInfo).port;
    try {
      const health = await new Promise<{ status: number; body: string }>(
        (resolve, reject) => {
          request(
            { hostname: '127.0.0.1', port, path: '/health', method: 'GET' },
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
          )
            .on('error', reject)
            .end();
        }
      );
      expect(health.status).toBe(200);
      expect(JSON.parse(health.body)).toEqual({
        service: 'internal-test-outbox-worker',
        status: 'ok'
      });
      const drain = await post(port, '/tasks/outbox-drain');
      expect(drain.status).toBe(200);
      const watch = await post(port, '/calendar-watch');
      expect(watch.status).toBe(404);
      expect(JSON.parse(watch.body)).toEqual({ error: 'not_found' });
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

  it('does not import the Google Calendar adapter', () => {
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
    expect(source).not.toMatch(/google-calendar/);
    expect(runtime).not.toMatch(/google-calendar/);
  });
});
