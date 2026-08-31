import { describe, expect, it, vi } from 'vitest';

import {
  GoogleCalendarEventReader,
  GoogleCalendarEventWriter,
  GoogleCalendarSyncError
} from './google-sync-client.js';
import { CalendarSyncTokenExpiredError } from './sync-engine.js';

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('GoogleCalendarEventReader', () => {
  it('uses bounded filters only for full sync and never logs raw error bodies', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(response({ items: [], nextSyncToken: 'next-token' }))
    );
    const reader = new GoogleCalendarEventReader(
      'calendar@example.invalid',
      () => Promise.resolve('access-token'),
      fetchImpl
    );
    await reader.listEvents({
      timeMin: '2026-07-29T00:00:00.000Z',
      timeMax: '2026-10-27T00:00:00.000Z'
    });
    const fullUrl = new URL(String(fetchImpl.mock.calls[0]?.[0]));
    expect(fullUrl.searchParams.get('timeMin')).toBe(
      '2026-07-29T00:00:00.000Z'
    );
    expect(fullUrl.searchParams.get('showDeleted')).toBe('true');

    await reader.listEvents({ syncToken: 'sync-token' });
    const incrementalUrl = new URL(String(fetchImpl.mock.calls[1]?.[0]));
    expect(incrementalUrl.searchParams.get('syncToken')).toBe('sync-token');
    expect(incrementalUrl.searchParams.has('timeMin')).toBe(false);
    expect(incrementalUrl.searchParams.has('timeMax')).toBe(false);
  });

  it('converts 410 into the dedicated rebuild signal', async () => {
    const reader = new GoogleCalendarEventReader(
      'calendar@example.invalid',
      () => Promise.resolve('access-token'),
      () =>
        Promise.resolve(
          response({ error: { message: 'sensitive event title' } }, 410)
        )
    );
    await expect(
      reader.listEvents({ syncToken: 'expired' })
    ).rejects.toBeInstanceOf(CalendarSyncTokenExpiredError);
  });

  it('returns a safe status-only error', async () => {
    const reader = new GoogleCalendarEventReader(
      'calendar@example.invalid',
      () => Promise.resolve('access-token'),
      () =>
        Promise.resolve(
          response({ error: { message: 'patient-like content' } }, 403)
        )
    );
    await expect(reader.listEvents({ syncToken: 'token' })).rejects.toEqual(
      expect.objectContaining<Partial<GoogleCalendarSyncError>>({
        message: 'Google Calendar list failed (403).',
        retryable: false
      })
    );
  });
});

describe('GoogleCalendarEventWriter', () => {
  it('writes only the normalized title, time and private opaque link', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(response({ id: 'event-id' }, 200))
    );
    const writer = new GoogleCalendarEventWriter(
      'calendar@example.invalid',
      () => Promise.resolve('access-token'),
      fetchImpl
    );
    await writer.upsert({
      eventId: 'calpilotevent001',
      title: '[預約] A17｜初診｜止鼾',
      startsAt: '2026-09-02T06:00:00.000Z',
      endsAt: '2026-09-02T06:30:00.000Z',
      linkId: 'appointment_001'
    });
    const request = fetchImpl.mock.calls[0]?.[1];
    expect(JSON.parse(String(request?.body))).toEqual({
      id: 'calpilotevent001',
      summary: '[預約] A17｜初診｜止鼾',
      start: {
        dateTime: '2026-09-02T06:00:00.000Z',
        timeZone: 'Asia/Taipei'
      },
      end: {
        dateTime: '2026-09-02T06:30:00.000Z',
        timeZone: 'Asia/Taipei'
      },
      extendedProperties: {
        private: { beauessenceLinkId: 'appointment_001' }
      }
    });
  });

  it('falls back to patch on an idempotent insert conflict', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response({}, 409))
      .mockResolvedValueOnce(response({}, 200));
    const writer = new GoogleCalendarEventWriter(
      'calendar@example.invalid',
      () => Promise.resolve('access-token'),
      fetchImpl
    );
    await writer.upsert({
      eventId: 'calpilotevent001',
      title: '[忙碌] 會議',
      startsAt: '2026-09-02T06:00:00.000Z',
      endsAt: '2026-09-02T07:00:00.000Z',
      linkId: 'block_001'
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1]?.[1]?.method).toBe('PATCH');
  });
});
