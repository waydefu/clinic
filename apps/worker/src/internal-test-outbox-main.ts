import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import { InMemoryCalendar } from './calendar-port.js';
import { createCalendarPort } from './google-calendar.js';
import {
  assertInternalTestOutboxBootAllowed,
  createInternalTestOutboxRuntime,
  isInternalTestOutboxProcessingEnabled,
  type InternalTestOutboxRuntime
} from './internal-test-outbox-runtime.js';

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

export interface InternalTestOutboxServerOptions {
  readonly processingEnabled?: boolean;
}

export function createInternalTestOutboxServer(
  runtime: InternalTestOutboxRuntime,
  options: InternalTestOutboxServerOptions = {}
) {
  const processingEnabled = options.processingEnabled !== false;
  return createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/live') {
      send(response, 200, {
        service: 'internal-test-outbox-worker',
        status: 'ok'
      });
      return;
    }
    if (
      request.method === 'GET' &&
      (request.url === '/health' || request.url === '/ready')
    ) {
      void runtime.inspect().then(
        (inspection) => {
          const degraded = inspection.alerts.some(
            (alert) => alert.severity === 'immediate'
          );
          send(response, request.url === '/ready' && degraded ? 503 : 200, {
            service: 'internal-test-outbox-worker',
            status: degraded ? 'degraded' : 'ok',
            snapshot: inspection.snapshot,
            alerts: inspection.alerts,
            processingEnabled,
            ...(typeof inspection.attemptFailRate10m === 'number'
              ? { attemptFailRate10m: inspection.attemptFailRate10m }
              : {})
          });
        },
        () => send(response, 503, { error: 'worker_unavailable' })
      );
      return;
    }
    if (request.method !== 'POST' || request.url !== '/tasks/outbox-drain') {
      send(response, 404, { error: 'not_found' });
      return;
    }
    if (!processingEnabled) {
      send(response, 503, { error: 'processing_disabled' });
      return;
    }
    void runtime.run().then(
      (drain) => send(response, 200, drain),
      () => send(response, 503, { error: 'worker_unavailable' })
    );
  });
}

export function startInternalTestOutboxWorker(
  env: NodeJS.ProcessEnv = process.env
): void {
  const execution = assertInternalTestOutboxBootAllowed(env);
  if (getApps().length === 0) initializeApp();
  const runtime = createInternalTestOutboxRuntime({
    db: getFirestore(),
    calendar:
      execution === 'cloud' ? createCalendarPort(env) : new InMemoryCalendar()
  });
  createInternalTestOutboxServer(runtime, {
    processingEnabled: isInternalTestOutboxProcessingEnabled(env)
  }).listen(Number(env['PORT'] ?? '8080'), env['HOST'] ?? '0.0.0.0');
}

const entrypoint = process.argv[1];
if (
  entrypoint !== undefined &&
  fileURLToPath(import.meta.url) === resolve(entrypoint)
)
  startInternalTestOutboxWorker();
