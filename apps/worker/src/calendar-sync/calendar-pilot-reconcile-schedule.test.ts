import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CalendarPilotFullScanState } from './calendar-pilot-full-scan.js';
import { scheduleCalendarPilotReconciliation } from './calendar-pilot-reconcile-schedule.js';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('synthetic calendar reconciliation schedule', () => {
  it('resumes interrupted scans and resets the cursor only after a complete pass', async () => {
    vi.useFakeTimers();
    const partial: CalendarPilotFullScanState = {
      scope: 'synthetic', phase: 'calendar', pageLoaded: false,
      pageToken: 'page_2', pending: [], clean: true
    };
    const complete: CalendarPilotFullScanState = {
      scope: 'synthetic', phase: 'complete', pageLoaded: true, pending: [], clean: true
    };
    const runReconciliationRound = vi.fn((state?: CalendarPilotFullScanState) => Promise.resolve({
      acquired: true as const, blocked: undefined,
      state: state === undefined ? partial : complete, processed: 1, converged: state !== undefined
    }));
    const stop = scheduleCalendarPilotReconciliation({ runReconciliationRound });
    await vi.advanceTimersByTimeAsync(60_000);
    await vi.advanceTimersByTimeAsync(60_000);
    await vi.advanceTimersByTimeAsync(60_000);
    stop();
    expect(runReconciliationRound).toHaveBeenCalledTimes(3);
    expect(runReconciliationRound.mock.calls[0]).toEqual([undefined]);
    expect(runReconciliationRound.mock.calls[1]).toEqual([partial]);
    expect(runReconciliationRound.mock.calls[2]).toEqual([undefined]);
  });

  it('reports an owner block without overlapping rounds', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let release: (() => void) | undefined;
    const runReconciliationRound = vi.fn(() => new Promise<{
      acquired: false; blocked: string; processed: number; converged: false;
    }>((resolve) => { release = () => resolve({ acquired: false, blocked: 'owner_present', processed: 0, converged: false }); }));
    const stop = scheduleCalendarPilotReconciliation({ runReconciliationRound });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(runReconciliationRound).toHaveBeenCalledTimes(1);
    release?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(warn).toHaveBeenCalledWith('calendar_reconciliation_blocked', 'owner_present');
    stop();
  });
});
