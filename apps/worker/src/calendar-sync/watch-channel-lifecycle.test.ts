import { describe, expect, it, vi } from 'vitest';

import {
  acceptWatchNotification,
  emptyWatchLifecycleState,
  InMemoryWatchAdapter,
  completeWatchEvent,
  renewWatchChannelWithOverlap,
  retireOverlappingWatchChannel,
  watchChannelNeedsRenewal,
  type SyntheticWatchRegistration
} from './watch-channel-lifecycle.js';
import type { WatchChannelRecord } from './watch-channel.js';

const CURRENT: WatchChannelRecord = {
  channelId: 'chan-old',
  resourceId: 'res-old',
  calendarId: 'cal-a',
  expirationMs: Date.parse('2026-09-20T00:00:00.000Z'),
  token: 'token-hash'
};

const NOW = CURRENT.expirationMs - 1;
const NEXT: SyntheticWatchRegistration = {
  channelId: 'chan-new',
  resourceId: 'res-new',
  expirationMs: CURRENT.expirationMs + 1,
  retired: false
};

function responseAdapter(overrides: Partial<SyntheticWatchRegistration>) {
  const record: SyntheticWatchRegistration = { ...NEXT, ...overrides };
  return {
    registrations: [record],
    watch: vi.fn(() => Promise.resolve(record)),
    stop: vi.fn(() => Promise.resolve())
  };
}

const UNUSABLE: ReadonlyArray<Partial<SyntheticWatchRegistration>> = [
  { channelId: 'chan-foreign' },
  { channelId: CURRENT.channelId },
  { resourceId: '' },
  { resourceId: '   ' },
  { expirationMs: NOW },
  { expirationMs: NOW + 0.5 },
  { expirationMs: Number.NaN },
  { expirationMs: Number.POSITIVE_INFINITY },
  { retired: true }
];

describe('synthetic watch channel lifecycle', () => {
  it.each(UNUSABLE)('rejects a bad response', async (overrides) => {
    const adapter = responseAdapter(overrides);
    const state = { ...emptyWatchLifecycleState(), current: CURRENT };
    await expect(
      renewWatchChannelWithOverlap({
        adapter,
        state,
        current: CURRENT,
        nextChannelId: NEXT.channelId,
        nowMs: NOW,
        nextExpirationMs: NEXT.expirationMs
      })
    ).rejects.toThrow();
    expect(adapter.watch).toHaveBeenCalledTimes(1);
    expect(adapter.stop).not.toHaveBeenCalled();
    expect(state.current).toBe(CURRENT);
    expect(state.seenEvents.size).toBe(0);
  });

  it('accepts a usable server-shortened future expiry', async () => {
    const adapter = responseAdapter({ expirationMs: CURRENT.expirationMs });
    const renewal = await renewWatchChannelWithOverlap({
      adapter,
      state: { ...emptyWatchLifecycleState(), current: CURRENT },
      current: CURRENT,
      nextChannelId: NEXT.channelId,
      nowMs: NOW,
      nextExpirationMs: NEXT.expirationMs
    });
    expect(renewal.renewed).toBe(true);
    expect(renewal.state.current?.channelId).toBe(NEXT.channelId);
    expect(renewal.state.current?.expirationMs).toBe(CURRENT.expirationMs);
    expect(renewal.state.overlapping).toBe(CURRENT);
    expect(adapter.stop).not.toHaveBeenCalled();
  });

  it('registers a new channel before retiring the old one and dedupes overlap', async () => {
    const adapter = new InMemoryWatchAdapter();
    adapter.registrations.push({
      channelId: CURRENT.channelId,
      resourceId: CURRENT.resourceId,
      expirationMs: CURRENT.expirationMs,
      retired: false
    });
    const now = Date.parse('2026-09-19T01:00:00.000Z');
    expect(watchChannelNeedsRenewal(CURRENT, now)).toBe(true);

    const renewal = await renewWatchChannelWithOverlap({
      adapter,
      current: CURRENT,
      state: emptyWatchLifecycleState({ maxEntries: 20, warningAtEntries: 16 }),
      nextChannelId: 'chan-new',
      nowMs: now,
      nextExpirationMs: Date.parse('2026-10-20T00:00:00.000Z')
    });
    expect(renewal.renewed).toBe(true);
    expect(adapter.watchCalls).toBe(1);
    expect(adapter.stopCalls).toBe(0);
    expect(renewal.state.overlapping?.channelId).toBe('chan-old');
    expect(renewal.state.current?.channelId).toBe('chan-new');

    const first = acceptWatchNotification({
      state: renewal.state,
      nowMs: now,
      channelId: 'chan-old',
      messageNumber: '1',
      calendarId: 'cal-a',
      eventId: 'evt-9',
      etag: 'etag-1'
    });
    const overlap = acceptWatchNotification({
      state: completeWatchEvent({
        state: first.state,
        calendarId: 'cal-a',
        eventId: 'evt-9',
        etag: 'etag-1'
      }),
      nowMs: now,
      channelId: 'chan-new',
      messageNumber: '2',
      calendarId: 'cal-a',
      eventId: 'evt-9',
      etag: 'etag-1'
    });
    expect(first.duplicate).toBe(false);
    expect(overlap.duplicate).toBe(true);
    expect(overlap.knownChannel).toBe(true);

    const retired = await retireOverlappingWatchChannel({
      adapter,
      state: overlap.state
    });
    expect(adapter.stopCalls).toBe(1);
    expect(retired.overlapping).toBeUndefined();
    expect(
      adapter.registrations.find((item) => item.channelId === 'chan-old')
        ?.retired
    ).toBe(true);
  });

  it('ignores notifications from unknown channels', () => {
    const accepted = acceptWatchNotification({
      state: emptyWatchLifecycleState(),
      nowMs: Date.parse('2026-09-19T01:00:00.000Z'),
      channelId: 'chan-stray',
      messageNumber: '1',
      calendarId: 'cal-a',
      eventId: 'evt-9',
      etag: 'etag-1'
    });
    expect(accepted.knownChannel).toBe(false);
    expect(accepted.duplicate).toBe(false);
  });
});
