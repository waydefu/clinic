import { describe, expect, it } from 'vitest';

import {
  COMPENSATION_SYNC_MAX_MS,
  COMPENSATION_SYNC_MIN_MS,
  eventDedupeKey,
  inboundRequiresHumanReview,
  isCompensatingIntervalMs,
  nextWatchChannelId,
  notificationDedupeKey,
  planWatchChannelReplacement,
  shouldRenewWatchChannel,
  type WatchChannelRecord
} from './watch-channel.js';

const CHANNEL: WatchChannelRecord = {
  channelId: 'chan-1',
  resourceId: 'res-1',
  calendarId: 'cal-a',
  expirationMs: Date.parse('2026-09-20T00:00:00.000Z'),
  token: 'token-hash'
};

describe('watch-channel (unwired)', () => {
  it('accepts only 1–5 minute compensating intervals', () => {
    expect(isCompensatingIntervalMs(COMPENSATION_SYNC_MIN_MS)).toBe(true);
    expect(isCompensatingIntervalMs(3 * 60_000)).toBe(true);
    expect(isCompensatingIntervalMs(COMPENSATION_SYNC_MAX_MS)).toBe(true);
    expect(isCompensatingIntervalMs(30_000)).toBe(false);
    expect(isCompensatingIntervalMs(6 * 60_000)).toBe(false);
  });

  it('renews before expiry and forbids reusing the channel id', () => {
    const farFromExpiry = Date.parse('2026-09-01T00:00:00.000Z');
    expect(shouldRenewWatchChannel(CHANNEL, farFromExpiry)).toBe(false);
    expect(
      planWatchChannelReplacement(CHANNEL, 'chan-2', farFromExpiry)
    ).toEqual({
      renew: false,
      stopAfterOverlap: false,
      nextChannelId: 'chan-2'
    });
    const now = Date.parse('2026-09-19T01:00:00.000Z');
    expect(shouldRenewWatchChannel(CHANNEL, now)).toBe(true);
    expect(planWatchChannelReplacement(CHANNEL, 'chan-2', now)).toEqual({
      renew: true,
      stopAfterOverlap: true,
      nextChannelId: 'chan-2'
    });
    expect(() => planWatchChannelReplacement(CHANNEL, 'chan-1', now)).toThrow(
      /differ/
    );
    expect(nextWatchChannelId('chan-1')).toBe('chan-1:next');
  });

  it('dedupes overlap notifications by event etag and by channel message number', () => {
    const first = eventDedupeKey('cal-a', 'evt-9', 'etag-1');
    const overlap = eventDedupeKey('cal-a', 'evt-9', 'etag-1');
    const changed = eventDedupeKey('cal-a', 'evt-9', 'etag-2');
    expect(first).toBe(overlap);
    expect(changed).not.toBe(first);
    expect(notificationDedupeKey('chan-1', '10')).not.toBe(
      notificationDedupeKey('chan-2', '10')
    );
  });

  it('sends non-unique inbound cases to human review', () => {
    expect(inboundRequiresHumanReview('unique_match_only')).toBe(false);
    expect(inboundRequiresHumanReview('unmatched')).toBe(true);
    expect(inboundRequiresHumanReview('simultaneous_edit')).toBe(true);
    expect(inboundRequiresHumanReview('ambiguous_delete')).toBe(true);
    expect(inboundRequiresHumanReview('authorization_failed')).toBe(true);
  });
});
