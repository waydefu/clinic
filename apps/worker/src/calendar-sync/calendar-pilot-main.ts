import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import { createFirestoreMaintenanceControl } from '@beauessence/domain/maintenance-control.node';

import {
  inspectCalendarPilotHealth,
  type CalendarPilotHttpRuntime
} from './calendar-pilot-health.js';
import {
  CalendarPilotRuntime,
  C1_SYNTHETIC_ADC_MODE
} from './calendar-pilot-runtime.js';

const SERVICE_NAME = 'calendar-pilot-worker';

const KNOWN_ERROR_CODES = new Map<string, string>([
  ['Unreadable CAL-PILOT record.', 'unreadable_record'],
  ['Maintenance control is unavailable.', 'maintenance_unavailable'],
  ['CAL-PILOT configuration is missing.', 'configuration_missing'],
  ['CAL-PILOT source is missing.', 'source_missing'],
  ['CAL-PILOT source generation changed.', 'source_generation_changed'],
  ['CAL-PILOT worker lease is no longer valid.', 'lease_lost'],
  ['Calendar source is not allowlisted.', 'source_not_allowlisted'],
  [
    'CAL-PILOT Calendar transport is not allowlisted.',
    'transport_not_allowlisted'
  ],
  [
    'CAL-PILOT reconciliation is restricted to the synthetic C1 runtime.',
    'reconcile_not_allowed'
  ],
  [
    'CAL-PILOT reconciliation worker identity is not configured.',
    'reconcile_identity_missing'
  ],
  ['Unreadable CAL-PILOT job counts.', 'unreadable_job_counts']
]);

export interface CalendarPilotProcessEvents {
  on(event: 'uncaughtException', listener: (error: Error) => void): unknown;
  on(event: 'unhandledRejection', listener: (reason: unknown) => void): unknown;
}

function elapsedMs(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

function safeErrorName(error: unknown): string {
  if (!(error instanceof Error)) return 'NonErrorThrow';
  return /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(error.name)
    ? error.name
    : 'UnknownError';
}

function safeErrorCode(error: unknown): string {
  if (!(error instanceof Error)) return 'worker_error';
  if (error.name === 'CalendarPilotLeaseLostError') return 'lease_lost';
  if (error.name === 'CalendarSyncTokenExpiredError')
    return 'sync_token_expired';
  if (error.name === 'GoogleCalendarSyncError') {
    const status: unknown = (error as { readonly status?: unknown }).status;
    return typeof status === 'number' &&
      Number.isInteger(status) &&
      status >= 100 &&
      status <= 599
      ? `calendar_api_${status}`
      : 'calendar_api_error';
  }
  const code: unknown = (error as { readonly code?: unknown }).code;
  if (
    typeof code === 'number' &&
    Number.isInteger(code) &&
    code >= 0 &&
    code <= 999
  )
    return String(code);
  if (typeof code === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(code))
    return code;
  return KNOWN_ERROR_CODES.get(error.message) ?? 'worker_error';
}

function safeSyncMetrics(
  summary: unknown
): Record<string, boolean | number | string> {
  if (typeof summary !== 'object' || summary === null || Array.isArray(summary))
    return {};
  const record = summary as Record<string, unknown>;
  const metrics: Record<string, boolean | number | string> = {};
  if (typeof record['acquired'] === 'boolean')
    metrics['acquired'] = record['acquired'];
  if (
    typeof record['processedJobs'] === 'number' &&
    Number.isFinite(record['processedJobs'])
  )
    metrics['processedJobs'] = record['processedJobs'];
  if (
    typeof record['failedJobs'] === 'number' &&
    Number.isFinite(record['failedJobs'])
  )
    metrics['failedJobs'] = record['failedJobs'];
  const sync = record['sync'];
  if (typeof sync === 'object' && sync !== null && !Array.isArray(sync)) {
    const syncRecord = sync as Record<string, unknown>;
    if (syncRecord['mode'] === 'full' || syncRecord['mode'] === 'incremental')
      metrics['syncMode'] = syncRecord['mode'];
    for (const key of ['pages', 'seen', 'candidates', 'skipped'] as const) {
      const value = syncRecord[key];
      if (typeof value === 'number' && Number.isFinite(value))
        metrics[key] = value;
    }
    if (typeof syncRecord['rebuiltAfterExpiredToken'] === 'boolean')
      metrics['rebuiltAfterExpiredToken'] =
        syncRecord['rebuiltAfterExpiredToken'];
  }
  return metrics;
}

function logInfo(fields: Record<string, boolean | number | string>): void {
  process.stdout.write(
    `${JSON.stringify({
      severity: 'INFO',
      service: SERVICE_NAME,
      ...fields
    })}\n`
  );
}

function logWarn(fields: Record<string, boolean | number | string>): void {
  console.warn(
    JSON.stringify({
      severity: 'WARNING',
      service: SERVICE_NAME,
      ...fields
    })
  );
}

function logError(input: {
  readonly event: string;
  readonly stage: 'run' | 'reconcile' | 'inspect' | 'startup' | 'process';
  readonly error: unknown;
  readonly route?: '/tasks/calendar-sync' | '/health';
  readonly durationMs?: number;
}): void {
  console.error(
    JSON.stringify({
      severity: 'ERROR',
      service: SERVICE_NAME,
      event: input.event,
      ...(input.route === undefined ? {} : { route: input.route }),
      stage: input.stage,
      errorName: safeErrorName(input.error),
      errorCode: safeErrorCode(input.error),
      ...(input.durationMs === undefined
        ? {}
        : { durationMs: input.durationMs })
    })
  );
}

export function installCalendarPilotProcessHandlers(
  target: CalendarPilotProcessEvents = process,
  exit: (code: number) => void = (code) => {
    process.exit(code);
  }
): void {
  let terminating = false;
  const terminate = (
    event: 'worker_uncaught_exception' | 'worker_unhandled_rejection',
    error: unknown
  ) => {
    if (terminating) return;
    terminating = true;
    logError({ event, stage: 'process', error });
    exit(1);
  };
  target.on('uncaughtException', (error) => {
    terminate('worker_uncaught_exception', error);
  });
  target.on('unhandledRejection', (reason) => {
    terminate('worker_unhandled_rejection', reason);
  });
}

function send(
  response: import('node:http').ServerResponse,
  status: number,
  body: unknown
) {
  if (response.writableEnded) return;
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8'
  });
  response.end(JSON.stringify(body));
}

export function createCalendarPilotServer(runtime: CalendarPilotHttpRuntime) {
  return createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/live') {
      send(response, 200, {
        service: SERVICE_NAME,
        status: 'ok'
      });
      return;
    }
    if (request.method === 'GET' && request.url === '/health') {
      const startedAt = performance.now();
      void Promise.resolve()
        .then(() => runtime.inspect())
        .then(
          (inspection) =>
            send(response, 200, {
              service: SERVICE_NAME,
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
          (error: unknown) => {
            logError({
              event: 'calendar_health_failed',
              route: '/health',
              stage: 'inspect',
              durationMs: elapsedMs(startedAt),
              error
            });
            send(response, 503, { error: 'worker_unavailable' });
          }
        );
      return;
    }
    if (request.method !== 'POST' || request.url !== '/tasks/calendar-sync') {
      send(response, 404, { error: 'not_found' });
      return;
    }
    const startedAt = performance.now();
    let stage: 'run' | 'reconcile' = 'run';
    void Promise.resolve()
      .then(() => runtime.run())
      .then(async (summary) => {
        if (runtime.reconcile !== undefined) {
          stage = 'reconcile';
          await runtime.reconcile();
        }
        return summary;
      })
      .then(
        (summary) => {
          logInfo({
            event: 'calendar_sync_completed',
            route: '/tasks/calendar-sync',
            durationMs: elapsedMs(startedAt),
            reconciled: runtime.reconcile !== undefined,
            ...safeSyncMetrics(summary)
          });
          send(response, 200, summary);
        },
        (error: unknown) => {
          logError({
            event: 'calendar_sync_failed',
            route: '/tasks/calendar-sync',
            stage,
            durationMs: elapsedMs(startedAt),
            error
          });
          send(response, 503, { error: 'worker_unavailable' });
        }
      );
  });
}

let processHandlersInstalled = false;

export function startCalendarPilotWorker(): void {
  if (!processHandlersInstalled) {
    processHandlersInstalled = true;
    installCalendarPilotProcessHandlers();
  }
  try {
    if (getApps().length === 0) initializeApp();
    const db = getFirestore();
    const runtime = new CalendarPilotRuntime(
      db,
      process.env,
      () => new Date().toISOString(),
      createFirestoreMaintenanceControl(db)
    );
    const port = Number(process.env['PORT'] ?? '8080');
    const host = process.env['HOST'] ?? '0.0.0.0';
    const runtimeMode =
      process.env['CALENDAR_PILOT_RUNTIME_MODE'] === C1_SYNTHETIC_ADC_MODE
        ? C1_SYNTHETIC_ADC_MODE
        : 'legacy';
    const server = createCalendarPilotServer({
      run: () => runtime.run(),
      ...(runtimeMode === C1_SYNTHETIC_ADC_MODE
        ? {
            reconcile: async () => {
              const result = await runtime.runReconciliationRound();
              if (result.blocked !== undefined) {
                logWarn({
                  event: 'calendar_reconciliation_blocked',
                  route: '/tasks/calendar-sync',
                  stage: 'reconcile',
                  reason: result.blocked
                });
              }
            }
          }
        : {}),
      inspect: (nowUtc) =>
        inspectCalendarPilotHealth(db, nowUtc ?? new Date().toISOString())
    });
    server.on('error', (error: unknown) => {
      logError({ event: 'worker_startup_failed', stage: 'startup', error });
      process.exit(1);
    });
    server.listen(port, host, () => {
      logInfo({
        event: 'worker_started',
        stage: 'startup',
        port,
        runtimeMode
      });
    });
  } catch (error: unknown) {
    logError({ event: 'worker_startup_failed', stage: 'startup', error });
    throw error;
  }
}

const entrypoint = process.argv[1];
if (
  entrypoint !== undefined &&
  fileURLToPath(import.meta.url) === resolve(entrypoint)
) {
  try {
    startCalendarPilotWorker();
  } catch {
    process.exit(1);
  }
}
