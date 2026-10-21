import { describe, expect, it } from 'vitest';

import {
  acceptWatchNotification,
  completeWatchEvent,
  emptyWatchLifecycleState,
  InMemoryWatchAdapter,
  pruneWatchDedupe,
  renewWatchChannelWithOverlap,
  retireOverlappingWatchChannel,
  type WatchLifecycleState
} from './watch-channel-lifecycle.js';
import type { WatchChannelRecord } from './watch-channel.js';

const CURRENT: WatchChannelRecord = {
  channelId: 'chan-old',
  resourceId: 'res-old',
  calendarId: 'cal-a',
  expirationMs: Date.parse('2026-09-20T00:00:00.000Z'),
  token: 'token-hash'
};
const NOW = Date.parse('2026-09-19T01:00:00.000Z');
// Test fixtures only: neither limits nor duration are approved live policy.
const LIMITS = { maxEntries: 4, warningAtEntries: 2 };
const RETRY = { maxRetryMs: 60_000, evidenceRef: 'synthetic_retry_bound' };

function initial(): WatchLifecycleState {
  return { ...emptyWatchLifecycleState(LIMITS), current: CURRENT };
}
function notification(
  state: WatchLifecycleState,
  message = '1',
  event = 'evt-9'
) {
  return {
    state,
    nowMs: NOW,
    channelId: CURRENT.channelId,
    messageNumber: message,
    calendarId: CURRENT.calendarId,
    eventId: event,
    etag: 'etag-1'
  };
}
function completed(state: WatchLifecycleState, eventId = 'evt-9') {
  return completeWatchEvent({
    state,
    calendarId: CURRENT.calendarId,
    eventId,
    etag: 'etag-1'
  });
}
function renewal(state: WatchLifecycleState, renew = true) {
  return renewWatchChannelWithOverlap({
    adapter: new InMemoryWatchAdapter(),
    state,
    current: CURRENT,
    nextChannelId: 'chan-new',
    nowMs: renew ? NOW : Date.parse('2026-09-01T00:00:00.000Z'),
    nextExpirationMs: Date.parse('2026-09-21T00:00:00.000Z')
  });
}

describe('synthetic watch retention and backpressure', () => {
  it('retains seen and in-flight records on both renewal paths', async () => {
    for (const renew of [true, false]) {
      const first = acceptWatchNotification(notification(initial()));
      const next = await renewal(first.state, renew);
      expect(next.renewed).toBe(renew);
      expect(next.state.seenNotifications).toEqual(first.state.seenNotifications);
      expect(next.state.seenEvents).toEqual(first.state.seenEvents);
      expect(next.state.inFlightEvents).toEqual(first.state.inFlightEvents);
      const replay = acceptWatchNotification({
        ...notification(next.state),
        channelId: renew ? 'chan-new' : CURRENT.channelId
      });
      expect(replay).toMatchObject({
        duplicate: true,
        accepted: false,
        httpStatus: 503
      });
    }
  });

  it('retains completed dedupe across retirement and another renewal', async () => {
    const first = completed(acceptWatchNotification(notification(initial())).state);
    const next = await renewal(first);
    const adapter = new InMemoryWatchAdapter();
    const retired = await retireOverlappingWatchChannel({
      adapter,
      state: next.state
    });
    const current = retired.current!;
    const again = await renewWatchChannelWithOverlap({
      adapter,
      state: retired,
      current,
      nextChannelId: 'chan-third',
      nowMs: Date.parse('2026-09-20T01:00:00.000Z'),
      nextExpirationMs: Date.parse('2026-09-22T00:00:00.000Z')
    });
    const replay = acceptWatchNotification({
      ...notification(again.state),
      channelId: 'chan-third',
      nowMs: Date.parse('2026-09-20T01:00:00.000Z')
    });
    expect(replay).toMatchObject({ duplicate: true, accepted: true });
  });

  it('does not overwrite an unretired overlap', async () => {
    const state = {
      ...initial(),
      overlapping: { ...CURRENT, channelId: 'chan-earlier' }
    };
    await expect(renewal(state)).rejects.toThrow(/overlap/iu);
  });

  it('warns before full and refuses new work without eviction at full', () => {
    const first = acceptWatchNotification(notification(initial()));
    expect(first).toMatchObject({ accepted: true, capacityWarning: true });
    const second = acceptWatchNotification(
      notification(first.state, '2', 'evt-10')
    );
    const overflow = acceptWatchNotification(
      notification(second.state, '3', 'evt-11')
    );
    expect(overflow).toMatchObject({
      accepted: false,
      httpStatus: 503,
      capacityWarning: true
    });
    expect(overflow.state).toBe(second.state);
    expect(
      overflow.state.seenNotifications.size + overflow.state.seenEvents.size
    ).toBe(4);
    const replay = acceptWatchNotification(
      notification(completed(overflow.state))
    );
    expect(replay).toMatchObject({
      duplicate: true,
      accepted: true,
      httpStatus: 200
    });
    expect(replay.state.seenEvents.size).toBe(2);
  });

  it('requires finite explicit capacity and an earlier warning threshold', () => {
    const state = { ...emptyWatchLifecycleState(), current: CURRENT };
    expect(acceptWatchNotification(notification(state))).toMatchObject({
      accepted: false,
      httpStatus: 503
    });
    for (const limits of [
      { maxEntries: -1, warningAtEntries: 0 },
      { maxEntries: Infinity, warningAtEntries: 1 },
      { maxEntries: 4, warningAtEntries: 4 },
      { maxEntries: 4, warningAtEntries: 0 }
    ]) {
      expect(() => emptyWatchLifecycleState(limits)).toThrow(/capacity/iu);
    }
  });

  it('requires expiry, elapsed proven retry horizon, and no in-flight work', () => {
    const active = acceptWatchNotification(notification(initial())).state;
    const settled = completed(active);
    const boundary = CURRENT.expirationMs + RETRY.maxRetryMs;
    const prune = (state: WatchLifecycleState, nowMs: number) =>
      pruneWatchDedupe({ state, nowMs, retryHorizon: RETRY });
    expect(prune(settled, NOW)).toBe(settled);
    expect(pruneWatchDedupe({ state: settled, nowMs: boundary + 1 })).toBe(settled);
    expect(prune(settled, boundary)).toBe(settled);
    expect(prune(active, boundary + 1)).toBe(active);
    const cleared = prune(settled, boundary + 1);
    expect(cleared.seenEvents.size).toBe(0);
    expect(cleared.seenNotifications.size).toBe(0);
    const late = acceptWatchNotification({
      ...notification(cleared),
      nowMs: boundary + 1
    });
    expect(late.accepted).toBe(false);
  });

  it('retains the latest expiry after overlap retirement', async () => {
    const first = completed(acceptWatchNotification(notification(initial())).state);
    const renewed = await renewal(first);
    const retired = await retireOverlappingWatchChannel({
      adapter: new InMemoryWatchAdapter(),
      state: renewed.state
    });
    const prune = (nowMs: number) =>
      pruneWatchDedupe({ state: retired, nowMs, retryHorizon: RETRY });
    expect(prune(CURRENT.expirationMs + RETRY.maxRetryMs + 1)).toBe(retired);
    const later = retired.current!.expirationMs + RETRY.maxRetryMs + 1;
    expect(prune(later).seenEvents.size).toBe(0);
  });

  it('does not acknowledge pending or mismatched replay', () => {
    const first = acceptWatchNotification(notification(initial()));
    expect(acceptWatchNotification(notification(first.state))).toMatchObject({
      duplicate: true,
      accepted: false,
      httpStatus: 503
    });
    expect(() => completed(initial())).toThrow(/admitted/iu);
    const state = completed(first.state);
    expect(completed(state)).toBe(state);
    expect(acceptWatchNotification(notification(state))).toMatchObject({
      duplicate: true,
      accepted: true,
      httpStatus: 200
    });
    const foreign = acceptWatchNotification({
      ...notification(state),
      calendarId: 'cal-other'
    });
    expect(foreign.accepted).toBe(false);
    const altered = acceptWatchNotification(notification(state, '1', 'evt-other'));
    expect(altered.accepted).toBe(false);
  });

  it('rejects invalid retry proof without clearing', () => {
    const state = completed(acceptWatchNotification(notification(initial())).state);
    for (const maxRetryMs of [-1, Infinity, Number.NaN]) {
      expect(() =>
        pruneWatchDedupe({
          state,
          nowMs: CURRENT.expirationMs + 120_000,
          retryHorizon: { ...RETRY, maxRetryMs }
        })
      ).toThrow(/retry/iu);
      expect(state.seenEvents.size).toBe(1);
    }
  });
});
