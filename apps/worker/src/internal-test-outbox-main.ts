import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import { InMemoryCalendar } from './calendar-port.js';
import {
  assertInternalTestOutboxBootAllowed,
  createInternalTestOutboxRuntime,
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

export function createInternalTestOutboxServer(
  runtime: InternalTestOutboxRuntime
) {
  return createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/health') {
      send(response, 200, {
        service: 'internal-test-outbox-worker',
        status: 'ok'
      });
      return;
    }
    if (request.method !== 'POST' || request.url !== '/tasks/outbox-drain') {
      send(response, 404, { error: 'not_found' });
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
  assertInternalTestOutboxBootAllowed(env);
  if (getApps().length === 0) initializeApp();
  const runtime = createInternalTestOutboxRuntime({
    db: getFirestore(),
    calendar: new InMemoryCalendar()
  });
  createInternalTestOutboxServer(runtime).listen(
    Number(env['PORT'] ?? '8080'),
    env['HOST'] ?? '0.0.0.0'
  );
}

const entrypoint = process.argv[1];
if (
  entrypoint !== undefined &&
  fileURLToPath(import.meta.url) === resolve(entrypoint)
)
  startInternalTestOutboxWorker();
