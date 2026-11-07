import { describe, expect, it, vi } from 'vitest';

import { calendarEventId } from './calendar-pilot-event-id.js';
import {
  planCalendarPilotReconciliation,
  runCalendarPilotReconciliation,
  type CalendarPilotReconciliationPort,
  type ReconcileSnapshot
} from './calendar-pilot-reconciler.js';
import {
  GoogleCalendarEventWriter,
  type CalendarWriteEvent
} from './google-sync-client.js';

const projectionId = calendarEventId('link_a');

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
    linkId: 'link_a',
    blockedByOwner: false,
    inventoryComplete: true,
    mirrorEventId: 'original',
    projectionEventId: projectionId,
    projectionOwned: true,
    workerServiceAccount: 'worker@synthetic.invalid',
    desired,
    events: [current]
  };
}

describe('calendar pilot reconciliation', () => {
  it('plans from the authoritative appointment and never deletes its mirror', () => {
    expect(planCalendarPilotReconciliation(snapshot())).toEqual({
      kind: 'patch',
      event: desired,
      etag: '"v1"'
    });
    expect(
      planCalendarPilotReconciliation({ ...snapshot(), desired: undefined })
    ).toEqual({ kind: 'conflict' });
    expect(
      planCalendarPilotReconciliation({ ...snapshot(), events: [] })
    ).toEqual({ kind: 'conflict' });
  });

  it('conditionally removes only owned duplicates and reports unknown ownership', () => {
    const matching = { ...current, title: desired.title };
    const duplicate = {
      ...matching,
      id: projectionId,
      etag: '"v2"',
      linkMarker: 'link_a',
      creatorEmail: 'worker@synthetic.invalid'
    };
    expect(
      planCalendarPilotReconciliation({
        ...snapshot(),
        events: [matching, duplicate]
      })
    ).toEqual({
      kind: 'delete',
      id: projectionId,
      etag: '"v2"'
    });
    expect(
      planCalendarPilotReconciliation({
        ...snapshot(),
        events: [
          matching,
          {
            ...matching,
            id: projectionId,
            etag: '"v2"',
            linkMarker: 'link_a'
          }
        ]
      })
    ).toEqual({ kind: 'conflict' });
    expect(
      planCalendarPilotReconciliation({
        ...snapshot(),
        mirrorEventId: projectionId,
        desired: undefined,
        events: [duplicate]
      })
    ).toEqual({ kind: 'conflict' });
    expect(
      planCalendarPilotReconciliation({
        ...snapshot(),
        events: [
          matching,
          { ...duplicate, creatorEmail: 'other@synthetic.invalid' }
        ]
      })
    ).toEqual({ kind: 'conflict' });
    expect(
      planCalendarPilotReconciliation({
        ...snapshot(),
        events: [matching, { ...duplicate, linkMarker: 'another_link' }]
      })
    ).toEqual({ kind: 'conflict' });
    expect(
      planCalendarPilotReconciliation({
        ...snapshot(),
        events: [
          matching,
          {
            ...duplicate,
            creatorEmail: 'other@synthetic.invalid',
            organizerEmail: 'worker@synthetic.invalid'
          }
        ]
      })
    ).toEqual({ kind: 'delete', id: projectionId, etag: '"v2"' });
    expect(
      planCalendarPilotReconciliation({
        ...snapshot(),
        projectionEventId: 'forged_event_id',
        events: [matching, { ...duplicate, id: 'forged_event_id' }]
      })
    ).toEqual({ kind: 'conflict' });
    expect(
      planCalendarPilotReconciliation({
        ...snapshot(),
        projectionOwned: false,
        events: [matching, duplicate]
      })
    ).toEqual({ kind: 'conflict' });
    expect(
      planCalendarPilotReconciliation({
        ...snapshot(),
        events: [matching, { ...duplicate, id: 'unknown' }]
      })
    ).toEqual({ kind: 'conflict' });
    expect(
      planCalendarPilotReconciliation({
        ...snapshot(),
        inventoryComplete: false
      })
    ).toEqual({ kind: 'conflict' });
    expect(
      planCalendarPilotReconciliation({ ...snapshot(), blockedByOwner: true })
    ).toEqual({ kind: 'blocked' });
  });

  it('treats equivalent provider timestamp representations as a no-op', () => {
    const event = {
      ...current,
      title: desired.title,
      startsAt: '2026-11-06T09:00:00+08:00',
      endsAt: '2026-11-06T09:30:00+08:00'
    };
    expect(
      planCalendarPilotReconciliation({ ...snapshot(), events: [event] })
    ).toEqual({ kind: 'no-op' });
  });

  it('patches in the first round and only settles after the second round is a no-op', async () => {
    let state: ReconcileSnapshot = {
      ...snapshot(),
      events: [{ ...current, status: 'cancelled' as const }]
    };
    let failed = true;
    const fetchImpl = vi.fn<typeof fetch>(
      (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(init?.method).toBe('PATCH');
        expect(new Headers(init?.headers).get('If-Match')).toBe('"v1"');
        expect(
          JSON.parse(typeof init?.body === 'string' ? init.body : '')
        ).toMatchObject({
          status: 'confirmed',
          summary: desired.title
        });
        state = {
          ...snapshot(),
          events: [{ ...current, title: desired.title, etag: '"v2"' }]
        };
        return Promise.resolve(new Response(null, { status: 200 }));
      }
    );
    const writer = new GoogleCalendarEventWriter(
      'synthetic-calendar',
      () => Promise.resolve('synthetic-token'),
      fetchImpl
    );
    const apply = vi.fn<CalendarPilotReconciliationPort['apply']>(
      async (_linkId, action) => {
        if (action.kind !== 'patch') throw new Error('unexpected action');
        await writer.update(action.event, action.etag, true);
      }
    );
    const port: CalendarPilotReconciliationPort = {
      scan: () => Promise.resolve(['link_a']),
      read: () => Promise.resolve(state),
      apply,
      settleIfUnchanged: () => {
        failed = false;
        return Promise.resolve(true);
      },
      recordConflict: () => Promise.reject(new Error('unexpected conflict')),
      hasCompletedCleanFullScan: () => true
    };
    const bounds = { maxItems: 1, deadline: 100, now: () => 0 };
    expect(await runCalendarPilotReconciliation(port, bounds)).toEqual({
      processed: 1,
      converged: 0,
      conflicts: 0,
      blocked: 0
    });
    expect(failed).toBe(true);
    expect(await runCalendarPilotReconciliation(port, bounds)).toEqual({
      processed: 1,
      converged: 1,
      conflicts: 0,
      blocked: 0
    });
    expect(failed).toBe(false);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('does not count a no-op as convergence while the full scan is incomplete', async () => {
    const port: CalendarPilotReconciliationPort = {
      scan: () => Promise.resolve(['link_a']),
      read: () =>
        Promise.resolve({
          ...snapshot(),
          events: [{ ...current, title: desired.title }]
        }),
      apply: () => Promise.reject(new Error('unexpected mutation')),
      settleIfUnchanged: () => Promise.resolve(true),
      recordConflict: () => Promise.reject(new Error('unexpected conflict')),
      hasCompletedCleanFullScan: () => false
    };
    expect(
      await runCalendarPilotReconciliation(port, {
        maxItems: 1,
        deadline: 10,
        now: () => 0
      })
    ).toEqual({ processed: 1, converged: 0, conflicts: 0, blocked: 0 });
  });

  it('does not mutate or settle blocked and conflicted links', async () => {
    const apply = vi.fn<CalendarPilotReconciliationPort['apply']>();
    const settleIfUnchanged =
      vi.fn<CalendarPilotReconciliationPort['settleIfUnchanged']>();
    const recordConflict =
      vi.fn<CalendarPilotReconciliationPort['recordConflict']>();
    const port: CalendarPilotReconciliationPort = {
      scan: () => Promise.resolve(['blocked', 'conflict']),
      read: (id) =>
        Promise.resolve({
          ...snapshot(),
          linkId: id,
          blockedByOwner: id === 'blocked'
        }),
      apply,
      settleIfUnchanged,
      recordConflict
    };
    expect(
      await runCalendarPilotReconciliation(port, {
        maxItems: 2,
        deadline: 10,
        now: () => 0
      })
    ).toEqual({
      processed: 2,
      converged: 0,
      conflicts: 1,
      blocked: 1
    });
    expect(apply).not.toHaveBeenCalled();
    expect(settleIfUnchanged).not.toHaveBeenCalled();
    expect(recordConflict).toHaveBeenCalledTimes(1);
  });

  it('fails closed when its monotonic clock is invalid or the deadline passes', async () => {
    const apply = vi.fn<CalendarPilotReconciliationPort['apply']>();
    const settleIfUnchanged =
      vi.fn<CalendarPilotReconciliationPort['settleIfUnchanged']>();
    const recordConflict =
      vi.fn<CalendarPilotReconciliationPort['recordConflict']>();
    const port: CalendarPilotReconciliationPort = {
      scan: () => Promise.resolve(['link_a']),
      read: () => Promise.resolve(snapshot()),
      apply,
      settleIfUnchanged,
      recordConflict
    };
    await expect(
      runCalendarPilotReconciliation(port, {
        maxItems: 1,
        deadline: 10,
        now: () => Number.NaN
      })
    ).rejects.toThrow('Invalid calendar reconciliation clock.');
    const now = vi
      .fn()
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(10);
    await expect(
      runCalendarPilotReconciliation(port, { maxItems: 1, deadline: 10, now })
    ).resolves.toEqual({
      processed: 1,
      converged: 0,
      conflicts: 0,
      blocked: 0
    });
    expect(apply).not.toHaveBeenCalled();
    expect(settleIfUnchanged).not.toHaveBeenCalled();
    expect(recordConflict).not.toHaveBeenCalled();
  });

  it('does not retry or settle an uncertain transport write', async () => {
    const apply = vi
      .fn<CalendarPilotReconciliationPort['apply']>()
      .mockRejectedValue(new Error('synthetic lost response'));
    const settleIfUnchanged =
      vi.fn<CalendarPilotReconciliationPort['settleIfUnchanged']>();
    const port: CalendarPilotReconciliationPort = {
      scan: () => Promise.resolve(['link_a']),
      read: () => Promise.resolve(snapshot()),
      apply,
      settleIfUnchanged,
      recordConflict: () => Promise.reject(new Error('unexpected conflict'))
    };
    await expect(
      runCalendarPilotReconciliation(port, {
        maxItems: 1,
        deadline: 10,
        now: () => 0
      })
    ).rejects.toThrow('synthetic lost response');
    expect(apply).toHaveBeenCalledTimes(1);
    expect(settleIfUnchanged).not.toHaveBeenCalled();
  });

  it('sends an If-Match delete only for a fully proven duplicate', async () => {
    const matching = { ...current, title: desired.title };
    const duplicate = {
      ...matching,
      id: projectionId,
      etag: '"v2"',
      linkMarker: 'link_a',
      creatorEmail: 'worker@synthetic.invalid'
    };
    const fetchImpl = vi.fn<typeof fetch>(
      (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(init?.method).toBe('DELETE');
        expect(new Headers(init?.headers).get('If-Match')).toBe('"v2"');
        return Promise.resolve(new Response(null, { status: 204 }));
      }
    );
    const writer = new GoogleCalendarEventWriter(
      'synthetic-calendar',
      () => Promise.resolve('synthetic-token'),
      fetchImpl
    );
    const denied = planCalendarPilotReconciliation({
      ...snapshot(),
      events: [matching, { ...duplicate, creatorEmail: '' }]
    });
    expect(denied).toEqual({ kind: 'conflict' });
    expect(fetchImpl).not.toHaveBeenCalled();
    const permitted = planCalendarPilotReconciliation({
      ...snapshot(),
      events: [matching, duplicate]
    });
    if (permitted.kind !== 'delete')
      throw new Error('Expected conditional delete.');
    await writer.removeWithEtag(permitted.id, permitted.etag);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('uses the planned version for a duplicate delete without a replacement GET', async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(init?.method).toBe('DELETE');
        expect(new Headers(init?.headers).get('If-Match')).toBe('"v2"');
        return Promise.resolve(new Response(null, { status: 412 }));
      }
    );
    const writer = new GoogleCalendarEventWriter(
      'synthetic-calendar',
      () => Promise.resolve('synthetic-token'),
      fetchImpl
    );
    await expect(writer.removeWithEtag(projectionId, '"v2"')).rejects.toThrow(
      'Google Calendar write failed (412).'
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
