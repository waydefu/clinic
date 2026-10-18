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

describe('bounded synthetic watch channel IDs, still unwired', () => {
  it('keeps a 256-renewal chain within64 and distinct from every prior sample', () => {
    let previous = 'chan-start';
    const seen = new Set([previous]);
    for (let round = 0; round < 256; round += 1) {
      const next = nextWatchChannelId(previous);
      expect(next.length).toBeLessThanOrEqual(64);
      expect(seen.has(next)).toBe(false);
      seen.add(next);
      previous = next;
    }
    expect(seen.size).toBe(257);
  });

  it('keeps short legacy output exact and hashes the entire overlong predecessor', () => {
    expect(nextWatchChannelId('chan-1')).toBe('chan-1:next');
    const left = nextWatchChannelId('a'.repeat(100) + 'left');
    const right = nextWatchChannelId('a'.repeat(100) + 'right');
    expect(left).toMatch(/^[a-f0-9]{64}$/);
    expect(right).toMatch(/^[a-f0-9]{64}$/);
    expect(left).not.toBe(right);
    expect(nextWatchChannelId('a'.repeat(100) + 'left')).toBe(left);
  });

  it.each(['', '   '])('continues rejecting the empty predecessor %j', (id) => {
    expect(() => nextWatchChannelId(id)).toThrow(/non-empty/);
  });

  it.each(['', '   ', 'a'.repeat(65)])(
    'rejects invalid replacement ID before planning a renewal: %j',
    (id) => {
      expect(() =>
        planWatchChannelReplacement(CHANNEL, id, CHANNEL.expirationMs)
      ).toThrow(/channel id/i);
    }
  );

  it.each(['', '   ', 'a'.repeat(65)])(
    'rejects invalid new-channel watch body: %j',
    (id) => {
      expect(() =>
        googleEventsWatchBody({
          channelId: id,
          address: 'https://example.invalid/watch',
          token: 'opaque',
          expirationMs: CHANNEL.expirationMs
        })
      ).toThrow(/channel id/i);
    }
  );

  it('accepts exact64 as supplied and does not normalize identifiers', () => {
    const id = 'a'.repeat(64);
    expect(
      planWatchChannelReplacement(CHANNEL, id, CHANNEL.expirationMs)
        .nextChannelId
    ).toBe(id);
    expect(
      googleEventsWatchBody({
        channelId: id,
        address: 'https://example.invalid/watch',
        token: 'opaque',
        expirationMs: CHANNEL.expirationMs
      }).id
    ).toBe(id);
    expect(
      planWatchChannelReplacement(
        CHANNEL,
        '  chan-exact  ',
        CHANNEL.expirationMs
      ).nextChannelId
    ).toBe('  chan-exact  ');
  });

  it('can still read and retire a legacy overlong channel without fabricating a migration', () => {
    const id = 'a'.repeat(65);
    expect(
      parseWatchChannelRecord({ ...CHANNEL, channelId: id, schemaVersion: 1 })
        .channelId
    ).toBe(id);
    expect(
      googleChannelsStopBody({ channelId: id, resourceId: 'opaque' }).id
    ).toBe(id);
  });

  it('keeps an unused replacement untouched when renewal is not needed', () => {
    expect(
      planWatchChannelReplacement(
        CHANNEL,
        '',
        CHANNEL.expirationMs - 2 * 24 * 60 * 60 * 1000
      )
    ).toEqual({ renew: false, stopAfterOverlap: false, nextChannelId: '' });
  });

  it('pins the full predecessor UTF-8 SHA-256 to an independent known vector', () => {
    expect(nextWatchChannelId('a'.repeat(100))).toBe(
      '2816597888e4a0d3a36b82b83316ab32680eb8f00f8cd3b904d681246d285a0e'
    );
  });

  it.each(['\uD800', '\uD801', '\uDC00', 'x\uD800y'])(
    'rejects malformed UTF-16 instead of hashing a replacement character: %j',
    (fragment) => {
      const prior = parseWatchChannelRecord({
        ...CHANNEL,
        channelId: 'a'.repeat(100) + fragment,
        schemaVersion: 1
      });
      expect(() => nextWatchChannelId(prior.channelId)).toThrow(
        /well-formed UTF-16/
      );
      expect(() => nextWatchChannelId(fragment)).toThrow(/well-formed UTF-16/);
    }
  );

  it.each(['\uD800', '\uDC00'])(
    'rejects malformed UTF-16 at both new-request boundaries: %j',
    (id) => {
      expect(() =>
        planWatchChannelReplacement(CHANNEL, id, CHANNEL.expirationMs)
      ).toThrow(/well-formed UTF-16/);
      expect(() =>
        googleEventsWatchBody({
          channelId: id,
          address: 'https://example.invalid/watch',
          token: 'opaque',
          expirationMs: CHANNEL.expirationMs
        })
      ).toThrow(/well-formed UTF-16/);
    }
  );

  it('preserves well-formed surrogate pairs and literal replacement characters exactly', () => {
    for (const id of ['\uD800\uDC00', '\uD801\uDC00', '\uFFFD']) {
      expect(nextWatchChannelId(id)).toBe(`${id}:next`);
      expect(
        planWatchChannelReplacement(CHANNEL, id, CHANNEL.expirationMs)
          .nextChannelId
      ).toBe(id);
    }
    const left = nextWatchChannelId('a'.repeat(100) + '\uD800\uDC00');
    const right = nextWatchChannelId('a'.repeat(100) + '\uD801\uDC00');
    expect(left).not.toBe(right);
    expect([...left]).toHaveLength(64);
    expect([...right]).toHaveLength(64);
  });

  it.each([
    ['64 ASCII codepoints', 'a'.repeat(59), `${'a'.repeat(59)}:next`],
    [
      '65 ASCII codepoints',
      'a'.repeat(60),
      '11ee391211c6256460b6ed375957fadd8061cafbb31daf967db875aebd5aaad4'
    ],
    [
      '64 including a surrogate pair',
      'a'.repeat(58) + '\uD800\uDC00',
      `${'a'.repeat(58)}\uD800\uDC00:next`
    ]
  ])(
    'pins the suffix/hash generation boundary: %s',
    (_name, previous, expected) => {
      const next = nextWatchChannelId(previous);
      expect(next).toBe(expected);
      expect([...next]).toHaveLength(64);
    }
  );
});
