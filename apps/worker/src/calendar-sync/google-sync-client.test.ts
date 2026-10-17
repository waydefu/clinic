import { describe, expect, it, vi } from 'vitest';

import {
  GoogleCalendarEventReader,
  GoogleCalendarEventWriter,
  GoogleCalendarSyncError,
  GoogleCalendarWatchClient
} from './google-sync-client.js';
import {
  CalendarSyncEngine,
  CalendarSyncTokenExpiredError,
  type CalendarSyncRepository
} from './sync-engine.js';

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
    expect(fullUrl.searchParams.get('maxResults')).toBe('100');

    await reader.listEvents({ syncToken: 'sync-token' });
    const incrementalUrl = new URL(String(fetchImpl.mock.calls[1]?.[0]));
    expect(incrementalUrl.searchParams.get('syncToken')).toBe('sync-token');
    expect(incrementalUrl.searchParams.get('maxResults')).toBe('100');
    expect(incrementalUrl.searchParams.has('timeMin')).toBe(false);
    expect(incrementalUrl.searchParams.has('timeMax')).toBe(false);
  });

  it.each(
    ['nextPageToken', 'nextSyncToken'].flatMap((field) =>
      [null, 0, {}, [], '', ' '].map((value) => ({ field, value }))
    )
  )(
    'rejects present malformed $field without silently treating it as absent: $value',
    async ({ field, value }) => {
      const body = {
        items: [],
        ...(field === 'nextPageToken'
          ? { nextSyncToken: 'would-be-final' }
          : { nextPageToken: 'next' }),
        [field]: value,
        debug: 'SYNTHETIC_PRIVATE_CANARY'
      };
      const reader = new GoogleCalendarEventReader(
        'calendar@example.invalid',
        () => Promise.resolve('synthetic-token'),
        () => Promise.resolve(response(body))
      );
      await expect(reader.listEvents({})).rejects.toMatchObject({
        name: 'GoogleCalendarSyncError',
        status: 200,
        retryable: false,
        message: 'Google Calendar returned an invalid response.'
      });
    }
  );
  it.each([null, {}, 3].map((items) => ({ items })))(
    'rejects an explicitly malformed items container rather than checkpointing an empty page: $items',
    async ({ items }) => {
      const reader = new GoogleCalendarEventReader(
        'calendar@example.invalid',
        () => Promise.resolve('synthetic-token'),
        () =>
          Promise.resolve(response({ items, nextSyncToken: 'would-be-final' }))
      );
      await expect(reader.listEvents({})).rejects.toBeInstanceOf(
        GoogleCalendarSyncError
      );
    }
  );
  it('keeps an omitted items property valid for a genuine empty final page', async () => {
    const reader = new GoogleCalendarEventReader(
      'calendar@example.invalid',
      () => Promise.resolve('synthetic-token'),
      () => Promise.resolve(response({ nextSyncToken: 'empty-final' }))
    );
    await expect(reader.listEvents({})).resolves.toEqual({
      events: [],
      nextSyncToken: 'empty-final'
    });
  });
  it('does not let a malformed nextPageToken reach an engine commit or healthy checkpoint', async () => {
    const commitSync = vi.fn(() => Promise.resolve());
    const repository: CalendarSyncRepository = {
      loadConfiguration: () =>
        Promise.resolve({
          activeSourceId: 'synthetic-source',
          sourceVersion: 0,
          expiresAt: '2027-01-01T00:00:00Z',
          pseudonymKey: 'synthetic-pseudonym-key',
          knownPatientCodes: new Set()
        }),
      loadSyncState: () => Promise.resolve({ sourceId: 'synthetic-source' }),
      findMirror: () => Promise.resolve(undefined),
      matchesManagedProjection: () => Promise.resolve(false),
      loadAuthoritativeAppointment: () => Promise.resolve(undefined),
      commitSync,
      clearSyncToken: () => Promise.resolve()
    };
    const reader = new GoogleCalendarEventReader(
      'calendar@example.invalid',
      () => Promise.resolve('synthetic-token'),
      () =>
        Promise.resolve(
          response({
            items: [],
            nextPageToken: { malformed: true },
            nextSyncToken: 'must-not-commit'
          })
        )
    );
    await expect(
      new CalendarSyncEngine(reader, repository).run('2026-09-01T00:00:00Z')
    ).rejects.toBeInstanceOf(GoogleCalendarSyncError);
    expect(commitSync).not.toHaveBeenCalled();
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
    expect(
      JSON.parse(String(fetchImpl.mock.calls[1]?.[1]?.body))
    ).not.toHaveProperty('id');
  });

  it('updates the existing event with If-Match and never sends insert-only id', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(response({}, 200)));
    const writer = new GoogleCalendarEventWriter(
      'calendar@example.invalid',
      () => Promise.resolve('access-token'),
      fetchImpl
    );
    await writer.update(
      {
        eventId: 'originalevent001',
        title: '[忙碌] 會議',
        startsAt: '2026-09-02T06:00:00.000Z',
        endsAt: '2026-09-02T07:00:00.000Z',
        linkId: 'block_001'
      },
      '"etag-001"'
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const request = fetchImpl.mock.calls[0]?.[1];
    expect(request?.method).toBe('PATCH');
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain(
      '/events/originalevent001'
    );
    expect(new Headers(request?.headers).get('If-Match')).toBe('"etag-001"');
    expect(JSON.parse(String(request?.body))).toEqual({
      summary: '[忙碌] 會議',
      start: {
        dateTime: '2026-09-02T06:00:00.000Z',
        timeZone: 'Asia/Taipei'
      },
      end: {
        dateTime: '2026-09-02T07:00:00.000Z',
        timeZone: 'Asia/Taipei'
      },
      extendedProperties: {
        private: { beauessenceLinkId: 'block_001' }
      }
    });
  });

  it('treats a rejected If-Match precondition as a non-retryable conflict', async () => {
    const writer = new GoogleCalendarEventWriter(
      'calendar@example.invalid',
      () => Promise.resolve('access-token'),
      () => Promise.resolve(response({}, 412))
    );
    await expect(
      writer.update(
        {
          eventId: 'originalevent001',
          title: '[忙碌] 會議',
          startsAt: '2026-09-02T06:00:00.000Z',
          endsAt: '2026-09-02T07:00:00.000Z',
          linkId: 'block_001'
        },
        '"etag-001"'
      )
    ).rejects.toEqual(
      expect.objectContaining<Partial<GoogleCalendarSyncError>>({
        status: 412,
        retryable: false,
        message: 'Google Calendar write failed (412).'
      })
    );
  });

  it('preserves an all-day cross-day range with exclusive Google end date', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(response({}, 200)));
    const writer = new GoogleCalendarEventWriter(
      'calendar@example.invalid',
      () => Promise.resolve('access-token'),
      fetchImpl
    );
    await writer.upsert({
      eventId: 'existingevent001',
      title: '[忙碌] 休假',
      allDay: true,
      startDate: '2026-09-02',
      endDate: '2026-09-04',
      linkId: 'block_001'
    });
    expect(
      JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body))
    ).toMatchObject({
      id: 'existingevent001',
      start: { date: '2026-09-02' },
      end: { date: '2026-09-04' }
    });
  });
});

describe('GoogleCalendarWatchClient (unwired)', () => {
  it('opens a webhook channel and stops it without echoing event bodies', async () => {
    const fetchImpl = vi.fn((url: string) => {
      if (String(url).endsWith('/events/watch')) {
        return Promise.resolve(
          response({
            id: 'chan-1',
            resourceId: 'res-9',
            expiration: '1780000000000'
          })
        );
      }
      return Promise.resolve(response({}, 200));
    });
    const client = new GoogleCalendarWatchClient(
      'calendar@example.invalid',
      () => Promise.resolve('access-token'),
      fetchImpl
    );
    await expect(
      client.watch({
        channelId: 'chan-1',
        address: 'https://example.invalid/calendar-watch',
        token: 'channel-token',
        expirationMs: 1_780_000_000_000
      })
    ).resolves.toEqual({
      channelId: 'chan-1',
      resourceId: 'res-9',
      expirationMs: 1_780_000_000_000
    });
    const watchUrl = new URL(String(fetchImpl.mock.calls[0]?.[0]));
    expect(watchUrl.pathname).toContain('/events/watch');
    expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body))).toEqual({
      id: 'chan-1',
      type: 'web_hook',
      address: 'https://example.invalid/calendar-watch',
      token: 'channel-token',
      expiration: 1_780_000_000_000
    });
    await client.stop({ channelId: 'chan-1', resourceId: 'res-9' });
    expect(String(fetchImpl.mock.calls[1]?.[0])).toBe(
      'https://www.googleapis.com/calendar/v3/channels/stop'
    );
  });

  it('treats stop 404 as idempotent success', async () => {
    const client = new GoogleCalendarWatchClient(
      'calendar@example.invalid',
      () => Promise.resolve('access-token'),
      () => Promise.resolve(response({}, 404))
    );
    await expect(
      client.stop({ channelId: 'chan-1', resourceId: 'res-9' })
    ).resolves.toBeUndefined();
  });
});
