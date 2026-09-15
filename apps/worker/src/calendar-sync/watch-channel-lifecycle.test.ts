import { describe, expect, it } from 'vitest';

import {
  acceptWatchNotification,
  emptyWatchLifecycleState,
  InMemoryWatchAdapter,
  renewWatchChannelWithOverlap,
  retireOverlappingWatchChannel,
  watchChannelNeedsRenewal
} from './watch-channel-lifecycle.js';
import type { WatchChannelRecord } from './watch-channel.js';

const CURRENT: WatchChannelRecord = {
  channelId: 'chan-old',
  resourceId: 'res-old',
  calendarId: 'cal-a',
  expirationMs: Date.parse('2026-09-20T00:00:00.000Z'),
  token: 'token-hash'
};

describe('synthetic watch channel lifecycle', () => {
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
      channelId: 'chan-old',
      messageNumber: '1',
      calendarId: 'cal-a',
      eventId: 'evt-9',
      etag: 'etag-1'
    });
    const overlap = acceptWatchNotification({
      state: first.state,
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
