import { describe, expect, it, vi } from 'vitest';

import {
  planCalendarPilotReconciliation,
  runCalendarPilotReconciliation,
  type CalendarPilotReconciliationPort,
  type ReconcileSnapshot
} from './calendar-pilot-reconciler.js';
import type { CalendarWriteEvent } from './google-sync-client.js';

const desired: CalendarWriteEvent = {
  eventId: 'original',
  linkId: 'link_a',
  title: 'synthetic title',
  startsAt: '2026-11-06T01:00:00Z',
  endsAt: '2026-11-06T01:30:00Z'
};
const current = {
  id: 'original',
  etag: '"v1"',
  linkId: 'link_a',
  status: 'confirmed' as const,
  title: 'stale title',
  startsAt: '2026-11-06T01:00:00Z',
  endsAt: '2026-11-06T01:30:00Z'
};
function snapshot(): ReconcileSnapshot {
  return {
    linkId: 'link_a', blockedByOwner: false, mirrorEventId: 'original',
    projectionEventId: 'projection', projectionOwned: true,
    desired, events: [current]
  };
}

describe('calendar pilot reconciliation', () => {
  it('plans from the authoritative appointment and never deletes its mirror', () => {
    expect(planCalendarPilotReconciliation(snapshot())).toEqual({ kind: 'patch', event: desired, etag: '"v1"' });
    expect(planCalendarPilotReconciliation({ ...snapshot(), desired: undefined })).toEqual({ kind: 'conflict' });
    expect(planCalendarPilotReconciliation({ ...snapshot(), events: [] })).toEqual({ kind: 'conflict' });
  });

  it('conditionally removes only owned duplicates and reports unknown ownership', () => {
    const matching = { ...current, title: desired.title };
    const duplicate = { ...matching, id: 'projection', etag: '"v2"' };
    expect(planCalendarPilotReconciliation({ ...snapshot(), events: [matching, duplicate] })).toEqual({
      kind: 'delete', id: 'projection', etag: '"v2"'
    });
    expect(planCalendarPilotReconciliation({ ...snapshot(), projectionOwned: false, events: [matching, duplicate] })).toEqual({ kind: 'conflict' });
    expect(planCalendarPilotReconciliation({ ...snapshot(), events: [matching, { ...duplicate, id: 'unknown' }] })).toEqual({ kind: 'conflict' });
    expect(planCalendarPilotReconciliation({ ...snapshot(), blockedByOwner: true })).toEqual({ kind: 'blocked' });
  });

  it('patches in the first round and only settles after the second round is a no-op', async () => {
    let state = snapshot();
    let failed = true;
    const apply = vi.fn<CalendarPilotReconciliationPort['apply']>(async (_linkId, action) => {
      if (action.kind !== 'patch') throw new Error('unexpected action');
      expect(action.etag).toBe('"v1"');
      state = { ...state, events: [{ ...current, title: desired.title, etag: '"v2"' }] };
    });
    const port: CalendarPilotReconciliationPort = {
      scan: async () => ['link_a'],
      read: async () => state,
      apply,
      settleIfUnchanged: async () => { failed = false; return true; },
      recordConflict: async () => { throw new Error('unexpected conflict'); }
    };
    const bounds = { maxItems: 1, deadline: 100, now: () => 0 };
    expect(await runCalendarPilotReconciliation(port, bounds)).toEqual({ processed: 1, converged: 0, conflicts: 0, blocked: 0 });
    expect(failed).toBe(true);
    expect(await runCalendarPilotReconciliation(port, bounds)).toEqual({ processed: 1, converged: 1, conflicts: 0, blocked: 0 });
    expect(failed).toBe(false);
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('does not mutate or settle blocked and conflicted links', async () => {
    const apply = vi.fn<CalendarPilotReconciliationPort['apply']>();
    const settleIfUnchanged = vi.fn<CalendarPilotReconciliationPort['settleIfUnchanged']>();
    const recordConflict = vi.fn<CalendarPilotReconciliationPort['recordConflict']>();
    const port: CalendarPilotReconciliationPort = {
      scan: async () => ['blocked', 'conflict'],
      read: async (id) => ({ ...snapshot(), linkId: id, blockedByOwner: id === 'blocked' }),
      apply, settleIfUnchanged, recordConflict
    };
    expect(await runCalendarPilotReconciliation(port, { maxItems: 2, deadline: 10, now: () => 0 })).toEqual({
      processed: 2, converged: 0, conflicts: 1, blocked: 1
    });
    expect(apply).not.toHaveBeenCalled();
    expect(settleIfUnchanged).not.toHaveBeenCalled();
    expect(recordConflict).toHaveBeenCalledTimes(1);
  });
});
