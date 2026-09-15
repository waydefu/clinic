import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import {
  inspectCalendarPilotHealth,
  type CalendarPilotHttpRuntime
} from './calendar-pilot-health.js';
import { CalendarPilotRuntime } from './calendar-pilot-runtime.js';

function send(
  response: import('node:http').ServerResponse,
  status: number,
  body: unknown
) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8'
  });
  response.end(JSON.stringify(body));
}

export function createCalendarPilotServer(runtime: CalendarPilotHttpRuntime) {
  return createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/live') {
      send(response, 200, {
        service: 'calendar-pilot-worker',
        status: 'ok'
      });
      return;
    }
    if (request.method === 'GET' && request.url === '/health') {
      void runtime.inspect().then(
        (inspection) =>
          send(response, 200, {
            service: 'calendar-pilot-worker',
            status: inspection.alerts.some(
              (alert) => alert.severity === 'immediate'
            )
              ? 'degraded'
              : 'ok',
            health: inspection.health,
            snapshot: inspection.snapshot,
            alerts: inspection.alerts,
            inboundEnabled: inspection.inboundEnabled,
            outboundEnabled: inspection.outboundEnabled
          }),
        () => send(response, 503, { error: 'worker_unavailable' })
      );
      return;
    }
    if (request.method !== 'POST' || request.url !== '/tasks/calendar-sync') {
      send(response, 404, { error: 'not_found' });
      return;
    }
    void runtime.run().then(
      (summary) => send(response, 200, summary),
      () => send(response, 503, { error: 'worker_unavailable' })
    );
  });
}

export function startCalendarPilotWorker(): void {
  if (getApps().length === 0) initializeApp();
  const db = getFirestore();
  const runtime = new CalendarPilotRuntime(db);
  createCalendarPilotServer({
    run: () => runtime.run(),
    inspect: (nowUtc) =>
      inspectCalendarPilotHealth(db, nowUtc ?? new Date().toISOString())
  }).listen(
    Number(process.env['PORT'] ?? '8080'),
    process.env['HOST'] ?? '0.0.0.0'
  );
}

const entrypoint = process.argv[1];
if (
  entrypoint !== undefined &&
  fileURLToPath(import.meta.url) === resolve(entrypoint)
)
  startCalendarPilotWorker();
