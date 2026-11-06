import { describe, expect, it } from 'vitest';
import { once } from 'node:events';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';

import { createCalendarPilotServer } from './calendar-pilot-main.js';
import type { CalendarPilotHealthInspection } from './calendar-pilot-health.js';

const CLEAN_INSPECTION: CalendarPilotHealthInspection = {
  health: 'ok',
  inboundEnabled: true,
  outboundEnabled: true,
  snapshot: { pending: 0, processing: 0, failed: 0 },
  alerts: []
};

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

describe('calendar-pilot HTTP surface (no watch webhook)', () => {
  it('serves health and calendar-sync, and 404s a watch path', async () => {
    const calls: string[] = [];
    const server = createCalendarPilotServer({
      inspect: () => Promise.resolve(CLEAN_INSPECTION),
      run: () => { calls.push('sync'); return Promise.resolve({ ok: true }); },
      reconcile: () => { calls.push('reconcile'); return Promise.resolve(); }
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const port = (server.address() as AddressInfo).port;
    try {
      const live = await http(port, '/live', 'GET');
      expect(live.status).toBe(200);
      expect(JSON.parse(live.body)).toEqual({
        service: 'calendar-pilot-worker',
        status: 'ok'
      });
      const health = await http(port, '/health', 'GET');
      expect(health.status).toBe(200);
      expect(JSON.parse(health.body)).toEqual({
        service: 'calendar-pilot-worker',
        status: 'ok',
        health: 'ok',
        snapshot: CLEAN_INSPECTION.snapshot,
        alerts: [],
        inboundEnabled: true,
        outboundEnabled: true
      });
      const sync = await http(port, '/tasks/calendar-sync', 'POST');
      expect(sync.status).toBe(200);
      expect(calls).toEqual(['sync', 'reconcile']);
      const watch = await http(port, '/calendar-watch', 'POST');
      expect(watch.status).toBe(404);
      expect(JSON.parse(watch.body)).toEqual({ error: 'not_found' });
    } finally {
      server.close();
      await once(server, 'close');
    }
  });

  it('does not start a slice when the original sync fails', async () => {
    let reconciled = false;
    const server = createCalendarPilotServer({
      inspect: () => Promise.resolve(CLEAN_INSPECTION),
      run: () => Promise.reject(new Error('sync failed')),
      reconcile: () => { reconciled = true; return Promise.resolve(); }
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
      const result = await http((server.address() as AddressInfo).port, '/tasks/calendar-sync', 'POST');
      expect(result.status).toBe(503);
      expect(reconciled).toBe(false);
    } finally {
      server.close();
      await once(server, 'close');
    }
  });

  it('reports degraded health when inspect has an immediate alert', async () => {
    const inspection: CalendarPilotHealthInspection = {
      health: 'expired',
      inboundEnabled: false,
      outboundEnabled: false,
      snapshot: { pending: 0, processing: 0, failed: 1 },
      alerts: [
        { code: 'configuration_expired', severity: 'immediate' },
        { code: 'inbound_outbound_disabled', severity: 'immediate' },
        { code: 'failed_jobs_present', severity: 'immediate' }
      ]
    };
    const server = createCalendarPilotServer({
      inspect: () => Promise.resolve(inspection),
      run: () => Promise.reject(new Error('sync must not run for health'))
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const port = (server.address() as AddressInfo).port;
    try {
      const health = await http(port, '/health', 'GET');
      expect(health.status).toBe(200);
      expect(JSON.parse(health.body)).toEqual({
        service: 'calendar-pilot-worker',
        status: 'degraded',
        health: 'expired',
        snapshot: inspection.snapshot,
        alerts: inspection.alerts,
        inboundEnabled: false,
        outboundEnabled: false
      });
    } finally {
      server.close();
      await once(server, 'close');
    }
  });

  it('returns 503 when health inspect throws', async () => {
    const server = createCalendarPilotServer({
      inspect: () => Promise.reject(new Error('firestore unavailable')),
      run: () => Promise.reject(new Error('sync must not run for health'))
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const port = (server.address() as AddressInfo).port;
    try {
      const health = await http(port, '/health', 'GET');
      expect(health.status).toBe(503);
      expect(JSON.parse(health.body)).toEqual({ error: 'worker_unavailable' });
    } finally {
      server.close();
      await once(server, 'close');
    }
  });
});
