import type { CalendarPilotFullScanState } from './calendar-pilot-full-scan.js';
import type { CalendarPilotRuntime } from './calendar-pilot-runtime.js';

const RECONCILIATION_INTERVAL_MS = 60_000;

export function scheduleCalendarPilotReconciliation(
  runtime: Pick<CalendarPilotRuntime, 'runReconciliationRound'>
): () => void {
  let state: CalendarPilotFullScanState | undefined;
  let running = false;
  // shortcut: process-local scheduling stops on shutdown; use a durable scheduler before deployment.
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    void runtime.runReconciliationRound(state).then(
      (result: Awaited<ReturnType<CalendarPilotRuntime['runReconciliationRound']>>) => {
        if ('state' in result && result.state !== undefined)
          state = result.state.phase === 'complete' ? undefined : result.state;
        if (result.blocked !== undefined)
          console.warn('calendar_reconciliation_blocked', result.blocked);
      },
      () => console.warn('calendar_reconciliation_round_failed')
    ).finally(() => { running = false; });
  }, RECONCILIATION_INTERVAL_MS);
  return () => clearInterval(timer);
}
