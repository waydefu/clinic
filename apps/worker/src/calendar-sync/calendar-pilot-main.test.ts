import { describe, expect, it } from 'vitest';
import { once } from 'node:events';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';

import { createCalendarPilotServer } from './calendar-pilot-main.js';

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

describe('calendar-pilot HTTP surface (no watch webhook)', () => {
  it('serves health and calendar-sync, and 404s a watch path', async () => {
    const runtime = {
      run: () => Promise.resolve({ ok: true })
    };
    const server = createCalendarPilotServer(runtime as never);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const port = (server.address() as AddressInfo).port;
    try {
      const health = await new Promise<{ status: number }>(
        (resolve, reject) => {
          request(
            { hostname: '127.0.0.1', port, path: '/health', method: 'GET' },
            (response) => resolve({ status: response.statusCode ?? 0 })
          )
            .on('error', reject)
            .end();
        }
      );
      expect(health.status).toBe(200);
      const sync = await post(port, '/tasks/calendar-sync');
      expect(sync.status).toBe(200);
      const watch = await post(port, '/calendar-watch');
      expect(watch.status).toBe(404);
      expect(JSON.parse(watch.body)).toEqual({ error: 'not_found' });
    } finally {
      server.close();
      await once(server, 'close');
    }
  });
});
