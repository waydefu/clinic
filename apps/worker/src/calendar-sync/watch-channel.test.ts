import { describe, expect, it } from 'vitest';

import {
  COMPENSATION_SYNC_MAX_MS,
  COMPENSATION_SYNC_MIN_MS,
  eventDedupeKey,
  googleChannelsStopBody,
  googleEventsWatchBody,
  inboundRequiresHumanReview,
  isCompensatingIntervalMs,
  nextWatchChannelId,
  notificationDedupeKey,
  parseWatchChannelRecord,
  planInboundNotificationWork,
  planWatchChannelReplacement,
  reviewReasonForInboundCandidate,
  shouldRunCompensationPoll,
  shouldRenewWatchChannel,
  tokensMatch,
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

  it('plans incremental sync from push headers and never reads a body', () => {
    const headers = {
      'x-goog-channel-id': 'chan-1',
      'x-goog-resource-id': 'res-1',
      'x-goog-resource-state': 'exists',
      'x-goog-message-number': '12',
      'x-goog-channel-token': 'token-hash'
    };
    expect(tokensMatch('token-hash', 'token-hash')).toBe(true);
    expect(tokensMatch('token-hash', 'other')).toBe(false);
    expect(
      planInboundNotificationWork({
        headers,
        expectedToken: 'token-hash',
        compensationIntervalMs: COMPENSATION_SYNC_MIN_MS
      })
    ).toEqual({
      action: 'incremental_sync',
      channelId: 'chan-1',
      resourceId: 'res-1',
      messageNumber: '12',
      compensationIntervalMs: COMPENSATION_SYNC_MIN_MS
    });
    expect(
      planInboundNotificationWork({
        headers: { ...headers, 'x-goog-resource-state': 'sync' },
        expectedToken: 'token-hash'
      })
    ).toEqual({ action: 'ack_only', channelId: 'chan-1' });
    expect(
      planInboundNotificationWork({
        headers,
        expectedToken: 'wrong'
      })
    ).toEqual({
      action: 'reject',
      httpStatus: 404,
      reason: 'token_mismatch'
    });
    expect(
      planInboundNotificationWork({
        headers: { body: '{"summary":"must-not-be-read"}' },
        expectedToken: 'token-hash'
      })
    ).toEqual({
      action: 'reject',
      httpStatus: 400,
      reason: 'unrecognized_headers'
    });
  });

  it('classifies inbound candidates without guessing unmatched or illegal schema', () => {
    expect(
      reviewReasonForInboundCandidate({
        kind: 'create_appointment',
        uniquelyMatched: false
      })
    ).toBe('unmatched');
    expect(
      reviewReasonForInboundCandidate({
        kind: 'cancel_appointment',
        uniquelyMatched: false
      })
    ).toBe('ambiguous_delete');
    expect(
      reviewReasonForInboundCandidate({
        kind: 'invalid_format',
        uniquelyMatched: false
      })
    ).toBe('illegal_schema');
    expect(
      reviewReasonForInboundCandidate({
        kind: 'conflict',
        uniquelyMatched: true
      })
    ).toBe('simultaneous_edit');
    expect(
      reviewReasonForInboundCandidate({
        kind: 'update_appointment',
        uniquelyMatched: true
      })
    ).toBe('unique_match_only');
  });

  it('builds watch and stop bodies with a new channel id', () => {
    expect(
      googleEventsWatchBody({
        channelId: 'chan-2',
        address: 'https://example.invalid/calendar-watch',
        token: 'token-hash',
        expirationMs: CHANNEL.expirationMs
      })
    ).toEqual({
      id: 'chan-2',
      type: 'web_hook',
      address: 'https://example.invalid/calendar-watch',
      token: 'token-hash',
      expiration: CHANNEL.expirationMs
    });
    expect(
      googleChannelsStopBody({ channelId: 'chan-1', resourceId: 'res-1' })
    ).toEqual({ id: 'chan-1', resourceId: 'res-1' });
  });

  it('runs compensating polls only inside the 1–5 minute window', () => {
    const now = Date.parse('2026-09-10T00:05:00.000Z');
    expect(shouldRunCompensationPoll(now, undefined)).toBe(true);
    expect(shouldRunCompensationPoll(now, now - COMPENSATION_SYNC_MIN_MS)).toBe(
      true
    );
    expect(
      shouldRunCompensationPoll(now, now - 30_000, COMPENSATION_SYNC_MIN_MS)
    ).toBe(false);
    expect(() => shouldRunCompensationPoll(now, undefined, 30_000)).toThrow(
      /1 and 5 minutes/
    );
  });

  it('requires schemaVersion 1 and fails closed on corrupt watch documents', () => {
    expect(parseWatchChannelRecord({ ...CHANNEL, schemaVersion: 1 })).toEqual(
      CHANNEL
    );
    expect(() => parseWatchChannelRecord({ ...CHANNEL })).toThrow(/unreadable/);
    expect(() =>
      parseWatchChannelRecord({ ...CHANNEL, schemaVersion: 2 })
    ).toThrow(/unreadable/);
    expect(() => parseWatchChannelRecord(null)).toThrow(/unreadable/);
  });
});
