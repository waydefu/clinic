import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter, once } from 'node:events';
import { request } from 'node:http';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';

import {
  createCalendarPilotServer,
  installCalendarPilotProcessHandlers
} from './calendar-pilot-main.js';
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
      run: () => {
        calls.push('sync');
        return Promise.resolve({ ok: true });
      },
      reconcile: () => {
        calls.push('reconcile');
        return Promise.resolve();
      }
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
      reconcile: () => {
        reconciled = true;
        return Promise.resolve();
      }
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
      const result = await http(
        (server.address() as AddressInfo).port,
        '/tasks/calendar-sync',
        'POST'
      );
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

describe('calendar-pilot structured logging and crash safety', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('catches synchronous throws from run and inspect without crashing the server', async () => {
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    let reconciled = false;
    const server = createCalendarPilotServer({
      inspect: () => {
        throw new TypeError('synthetic-sync-inspect-boom');
      },
      run: () => {
        throw new RangeError('synthetic-sync-run-boom');
      },
      reconcile: () => {
        reconciled = true;
        return Promise.resolve();
      }
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const port = (server.address() as AddressInfo).port;
    try {
      const sync = await http(port, '/tasks/calendar-sync', 'POST');
      expect(sync.status).toBe(503);
      expect(JSON.parse(sync.body)).toEqual({ error: 'worker_unavailable' });
      expect(reconciled).toBe(false);

      const health = await http(port, '/health', 'GET');
      expect(health.status).toBe(503);
      expect(JSON.parse(health.body)).toEqual({ error: 'worker_unavailable' });

      const live = await http(port, '/live', 'GET');
      expect(live.status).toBe(200);

      expect(errorSpy).toHaveBeenCalledTimes(2);
      const syncLog = JSON.parse(String(errorSpy.mock.calls[0]?.[0]));
      expect(syncLog).toMatchObject({
        severity: 'ERROR',
        service: 'calendar-pilot-worker',
        event: 'calendar_sync_failed',
        route: '/tasks/calendar-sync',
        stage: 'run',
        errorName: 'RangeError',
        errorCode: 'worker_error'
      });
      expect(typeof syncLog.durationMs).toBe('number');

      const healthLog = JSON.parse(String(errorSpy.mock.calls[1]?.[0]));
      expect(healthLog).toMatchObject({
        severity: 'ERROR',
        service: 'calendar-pilot-worker',
        event: 'calendar_health_failed',
        route: '/health',
        stage: 'inspect',
        errorName: 'TypeError',
        errorCode: 'worker_error'
      });
      expect(typeof healthLog.durationMs).toBe('number');
    } finally {
      server.close();
      await once(server, 'close');
    }
  });

  it('logs sanitized structured errors for run, reconcile, and inspect rejections', async () => {
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const sensitiveParts = [
      'synthetic-bearer-placeholder',
      'synthetic-contact@example.invalid',
      'synthetic-calendar-placeholder',
      '0900000000'
    ];
    const sensitiveMessage = sensitiveParts.join(' ');
    const reconcileError = Object.assign(new Error(sensitiveMessage), {
      name: 'GoogleCalendarSyncError',
      status: 403
    });

    const runFailServer = createCalendarPilotServer({
      inspect: () => Promise.reject(new Error('Unreadable CAL-PILOT record.')),
      run: () => Promise.reject(new Error(sensitiveMessage))
    });
    runFailServer.listen(0, '127.0.0.1');
    await once(runFailServer, 'listening');
    const runPort = (runFailServer.address() as AddressInfo).port;
    try {
      const sync = await http(runPort, '/tasks/calendar-sync', 'POST');
      expect(sync.status).toBe(503);
      const health = await http(runPort, '/health', 'GET');
      expect(health.status).toBe(503);
    } finally {
      runFailServer.close();
      await once(runFailServer, 'close');
    }

    const reconcileFailServer = createCalendarPilotServer({
      inspect: () => Promise.resolve(CLEAN_INSPECTION),
      run: () => Promise.resolve({ acquired: true, processedJobs: 0 }),
      reconcile: () => Promise.reject(reconcileError)
    });
    reconcileFailServer.listen(0, '127.0.0.1');
    await once(reconcileFailServer, 'listening');
    const reconcilePort = (reconcileFailServer.address() as AddressInfo).port;
    try {
      const sync = await http(reconcilePort, '/tasks/calendar-sync', 'POST');
      expect(sync.status).toBe(503);
    } finally {
      reconcileFailServer.close();
      await once(reconcileFailServer, 'close');
    }

    expect(errorSpy).toHaveBeenCalledTimes(3);
    const rawLogs = errorSpy.mock.calls.map((call) => String(call[0]));
    for (const raw of rawLogs) {
      for (const secret of sensitiveParts) {
        expect(raw).not.toContain(secret);
      }
    }

    expect(JSON.parse(rawLogs[0]!)).toMatchObject({
      severity: 'ERROR',
      service: 'calendar-pilot-worker',
      event: 'calendar_sync_failed',
      route: '/tasks/calendar-sync',
      stage: 'run',
      errorName: 'Error',
      errorCode: 'worker_error'
    });
    expect(JSON.parse(rawLogs[1]!)).toMatchObject({
      severity: 'ERROR',
      service: 'calendar-pilot-worker',
      event: 'calendar_health_failed',
      route: '/health',
      stage: 'inspect',
      errorName: 'Error',
      errorCode: 'unreadable_record'
    });
    expect(JSON.parse(rawLogs[2]!)).toMatchObject({
      severity: 'ERROR',
      service: 'calendar-pilot-worker',
      event: 'calendar_sync_failed',
      route: '/tasks/calendar-sync',
      stage: 'reconcile',
      errorName: 'GoogleCalendarSyncError',
      errorCode: 'calendar_api_403'
    });
  });

  it('logs low-cardinality completion metrics on sync success without extra strings', async () => {
    const lines: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      lines.push(String(chunk));
      return true;
    });
    const server = createCalendarPilotServer({
      inspect: () => Promise.resolve(CLEAN_INSPECTION),
      run: () =>
        Promise.resolve({
          acquired: true,
          processedJobs: 1,
          failedJobs: 0,
          unexpectedEmail: 'synthetic-contact@example.invalid',
          sync: {
            mode: 'incremental',
            pages: 1,
            seen: 2,
            candidates: 1,
            skipped: 1,
            rebuiltAfterExpiredToken: false,
            completedAt: '2026-11-18T15:43:50.000Z'
          }
        }),
      reconcile: () => Promise.resolve()
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const port = (server.address() as AddressInfo).port;
    try {
      const sync = await http(port, '/tasks/calendar-sync', 'POST');
      expect(sync.status).toBe(200);
      const completed = lines
        .map((line) => JSON.parse(line.trim()))
        .find((entry) => entry.event === 'calendar_sync_completed');
      expect(completed).toMatchObject({
        severity: 'INFO',
        service: 'calendar-pilot-worker',
        event: 'calendar_sync_completed',
        route: '/tasks/calendar-sync',
        reconciled: true,
        acquired: true,
        processedJobs: 1,
        failedJobs: 0,
        syncMode: 'incremental',
        pages: 1,
        seen: 2,
        candidates: 1,
        skipped: 1,
        rebuiltAfterExpiredToken: false
      });
      expect(typeof completed.durationMs).toBe('number');
      expect(JSON.stringify(completed)).not.toContain('example.invalid');
    } finally {
      server.close();
      await once(server, 'close');
    }
  });

  it('logs sanitized fatal errors on uncaughtException and unhandledRejection before exit', () => {
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    const uncaughtEmitter = new EventEmitter();
    const uncaughtExits: number[] = [];
    installCalendarPilotProcessHandlers(uncaughtEmitter, (code) => {
      uncaughtExits.push(code);
    });
    const fatalError = Object.assign(
      new Error(
        'synthetic-bearer-placeholder synthetic-contact@example.invalid'
      ),
      { code: 'ECONNRESET' }
    );
    uncaughtEmitter.emit('uncaughtException', fatalError);
    uncaughtEmitter.emit('uncaughtException', new Error('duplicate'));

    expect(uncaughtExits).toEqual([1]);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const uncaughtRaw = String(errorSpy.mock.calls[0]?.[0]);
    expect(uncaughtRaw).not.toContain('synthetic-bearer-placeholder');
    expect(uncaughtRaw).not.toContain('example.invalid');
    expect(JSON.parse(uncaughtRaw)).toEqual({
      severity: 'ERROR',
      service: 'calendar-pilot-worker',
      event: 'worker_uncaught_exception',
      stage: 'process',
      errorName: 'Error',
      errorCode: 'ECONNRESET'
    });

    const rejectionEmitter = new EventEmitter();
    const rejectionExits: number[] = [];
    installCalendarPilotProcessHandlers(rejectionEmitter, (code) => {
      rejectionExits.push(code);
    });
    rejectionEmitter.emit(
      'unhandledRejection',
      'synthetic-calendar-placeholder'
    );

    expect(rejectionExits).toEqual([1]);
    expect(errorSpy).toHaveBeenCalledTimes(2);
    const rejectionRaw = String(errorSpy.mock.calls[1]?.[0]);
    expect(rejectionRaw).not.toContain('synthetic-calendar-placeholder');
    expect(JSON.parse(rejectionRaw)).toEqual({
      severity: 'ERROR',
      service: 'calendar-pilot-worker',
      event: 'worker_unhandled_rejection',
      stage: 'process',
      errorName: 'NonErrorThrow',
      errorCode: 'worker_error'
    });
  });
});

describe('calendar pilot production wiring', () => {
  it('injects the Firestore maintenance control at the entry point', () => {
    const source = readFileSync(
      fileURLToPath(new URL('./calendar-pilot-main.ts', import.meta.url)),
      'utf8'
    );
    expect(source).toContain('createFirestoreMaintenanceControl(db)');
  });
});
