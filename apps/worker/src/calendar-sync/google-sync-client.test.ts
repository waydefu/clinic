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
  it('pages the whole calendar without hiding events without our marker', async () => {
    const fetchImpl = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(
        response({
          items: [
            {
              id: 'owned',
              extendedProperties: { private: { beauessenceLinkId: 'link_a' } }
            },
            { id: 'unmarked', recurrence: ['RRULE:FREQ=DAILY'] }
          ],
          nextPageToken: 'next-page'
        })
      )
    );
    const reader = new GoogleCalendarEventReader(
      'synthetic',
      () => Promise.resolve('synthetic-token'),
      fetchImpl
    );
    await expect(
      reader.listWholeCalendarInventory(2, 'page-a')
    ).resolves.toEqual({
      events: [
        { id: 'owned', linkId: 'link_a', recurring: false },
        { id: 'unmarked', recurring: true }
      ],
      nextPageToken: 'next-page'
    });
    const request = fetchImpl.mock.calls[0]?.[0];
    if (typeof request !== 'string') throw new Error('Expected URL string.');
    const url = new URL(request);
    expect(url.searchParams.get('maxResults')).toBe('2');
    expect(url.searchParams.get('pageToken')).toBe('page-a');
    expect(url.searchParams.get('singleEvents')).toBe('false');
    expect(url.searchParams.get('showDeleted')).toBe('true');
    expect(url.searchParams.has('privateExtendedProperty')).toBe(false);
    expect(url.searchParams.has('timeMin')).toBe(false);
    expect(url.searchParams.has('timeMax')).toBe(false);
  });

  it('fails closed on an oversized full-calendar page', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(response({ items: [{ id: 'a' }, { id: 'b' }] }))
    );
    const reader = new GoogleCalendarEventReader(
      'synthetic',
      () => Promise.resolve('synthetic-token'),
      fetchImpl
    );
    await expect(reader.listWholeCalendarInventory(1)).rejects.toThrow(
      'exceeded its bound'
    );
  });

  it('reads a Firestore-designated original even without link metadata', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(
        response({
          id: 'original',
          etag: '"v1"',
          status: 'confirmed',
          summary: 'synthetic',
          start: { dateTime: '2026-11-06T01:00:00Z' },
          end: { dateTime: '2026-11-06T01:30:00Z' }
        })
      )
    );
    const reader = new GoogleCalendarEventReader(
      'synthetic',
      () => Promise.resolve('synthetic-token'),
      fetchImpl
    );
    await expect(
      reader.getReconciliationOriginal('original', 'link_a')
    ).resolves.toMatchObject({
      id: 'original',
      linkId: 'link_a',
      etag: '"v1"'
    });
  });

  it.each([
    { id: 'other', etag: '"v1"', status: 'cancelled' },
    {
      id: 'original',
      etag: '"v1"',
      status: 'cancelled',
      extendedProperties: { private: { beauessenceLinkId: 'other_link' } }
    }
  ])(
    'rejects a returned original with a different ID or link',
    async (body: unknown) => {
      const fetchImpl = vi.fn(() => Promise.resolve(response(body)));
      const reader = new GoogleCalendarEventReader(
        'synthetic',
        () => Promise.resolve('synthetic-token'),
        fetchImpl
      );
      await expect(
        reader.getReconciliationOriginal('original', 'link_a')
      ).rejects.toThrow();
    }
  );

  it('reads a strict paginated reconciliation inventory by link', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(
        response({
          items: [
            {
              id: 'event-a',
              etag: '"v1"',
              status: 'confirmed',
              summary: 'synthetic',
              start: { dateTime: '2026-11-06T01:00:00Z' },
              end: { dateTime: '2026-11-06T01:30:00Z' },
              creator: { email: 'worker@synthetic.invalid' },
              extendedProperties: { private: { beauessenceLinkId: 'link_a' } }
            }
          ],
          nextPageToken: 'next-page'
        })
      )
    );
    const reader = new GoogleCalendarEventReader(
      'synthetic',
      () => Promise.resolve('synthetic-token'),
      fetchImpl
    );
    await expect(
      reader.listReconciliationEvents('link_a', 'page-a')
    ).resolves.toEqual({
      events: [
        {
          id: 'event-a',
          etag: '"v1"',
          status: 'confirmed',
          title: 'synthetic',
          linkId: 'link_a',
          linkMarker: 'link_a',
          creatorEmail: 'worker@synthetic.invalid',
          startsAt: '2026-11-06T01:00:00Z',
          endsAt: '2026-11-06T01:30:00Z'
        }
      ],
      nextPageToken: 'next-page'
    });
    const url = new URL(String(fetchImpl.mock.calls[0]?.[0]));
    expect(url.searchParams.get('privateExtendedProperty')).toBe(
      'beauessenceLinkId=link_a'
    );
    expect(url.searchParams.get('pageToken')).toBe('page-a');
    expect(url.searchParams.get('showDeleted')).toBe('true');
    expect(url.searchParams.has('timeMin')).toBe(false);
    expect(url.searchParams.has('timeMax')).toBe(false);
  });

  it.each([
    { items: [{ id: 'event-a', etag: '"v1"', status: 'cancelled' }] },
    {
      items: [
        {
          id: 'event-a',
          etag: 'W/"v1"',
          status: 'cancelled',
          extendedProperties: { private: { beauessenceLinkId: 'link_a' } }
        }
      ]
    },
    { items: [], nextPageToken: '' },
    { items: 'invalid' }
  ])(
    'fails closed on malformed reconciliation inventory',
    async (body: unknown) => {
      const reader = new GoogleCalendarEventReader(
        'synthetic',
        () => Promise.resolve('synthetic-token'),
        vi.fn(() => Promise.resolve(response(body)))
      );
      await expect(reader.listReconciliationEvents('link_a')).rejects.toThrow();
    }
  );

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
  it.each([
    null,
    {},
    { id: 'synthetic', status: 'confirmed' },
    { id: 'synthetic', etag: 'v1', status: 'unknown' },
    { id: ' ', etag: 'v1', status: 'confirmed' }
  ])(
    'rejects malformed event %j without returning a checkpoint',
    async (item) => {
      const reader = new GoogleCalendarEventReader(
        'synthetic',
        () => Promise.resolve('synthetic-token'),
        () =>
          Promise.resolve(
            response({
              items: [{ id: 'valid', etag: 'v1', status: 'confirmed' }, item],
              nextSyncToken: 'must-not-commit'
            })
          )
      );
      await expect(reader.listEvents({})).rejects.toMatchObject({
        name: 'GoogleCalendarSyncError',
        status: 200,
        retryable: false,
        message: 'Google Calendar returned 1 malformed event(s).'
      });
    }
  );

  it('reports only the count when several malformed events carry private fields', async () => {
    const reader = new GoogleCalendarEventReader(
      'synthetic',
      () => Promise.resolve('synthetic-token'),
      () =>
        Promise.resolve(
          response({
            items: [{ summary: 'SYNTHETIC_PRIVATE_CANARY' }, null],
            nextSyncToken: 'must-not-commit'
          })
        )
    );
    await expect(reader.listEvents({})).rejects.toThrow(
      'Google Calendar returned 2 malformed event(s).'
    );
  });

  it.each([100, 101])(
    'enforces the requested page bound for %i synthetic events',
    async (count) => {
      const items = Array.from({ length: count }, (_, index) => ({
        id: `event_${index}`,
        etag: 'v1',
        status: 'confirmed'
      }));
      const reader = new GoogleCalendarEventReader(
        'synthetic',
        () => Promise.resolve('synthetic-token'),
        () => Promise.resolve(response({ items, nextSyncToken: 'next-token' }))
      );
      if (count === 100) {
        await expect(reader.listEvents({})).resolves.toMatchObject({
          events: items,
          nextSyncToken: 'next-token'
        });
      } else {
        await expect(reader.listEvents({})).rejects.toMatchObject({
          name: 'GoogleCalendarSyncError',
          retryable: false,
          message: 'Google Calendar returned an invalid response.'
        });
      }
    }
  );

  it('keeps valid confirmed and cancelled events on a terminal page', async () => {
    const items = [
      { id: 'first', etag: 'v1', status: 'confirmed' },
      { id: 'second', etag: 'v2', status: 'cancelled' }
    ];
    const reader = new GoogleCalendarEventReader(
      'synthetic',
      () => Promise.resolve('synthetic-token'),
      () => Promise.resolve(response({ items, nextSyncToken: 'next-token' }))
    );
    await expect(reader.listEvents({})).resolves.toEqual({
      events: items,
      nextSyncToken: 'next-token'
    });
  });

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
  it.each([
    {
      items: [],
      nextPageToken: { malformed: true },
      nextSyncToken: 'must-not-commit'
    },
    {
      items: [{ id: 'synthetic', status: 'confirmed' }],
      nextSyncToken: 'must-not-commit'
    }
  ])('rejects malformed pages before any commit', async (body) => {
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
      () => Promise.resolve(response(body))
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
      .mockResolvedValueOnce(
        response(
          {
            id: 'calpilotevent001',
            etag: '"etag-001"',
            extendedProperties: { private: { beauessenceLinkId: 'block_001' } }
          },
          200
        )
      )
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
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls[1]?.[1]?.method).toBe('GET');
    expect(fetchImpl.mock.calls[2]?.[1]?.method).toBe('PATCH');
    expect(
      new Headers(fetchImpl.mock.calls[2]?.[1]?.headers).get('If-Match')
    ).toBe('"etag-001"');
    expect(
      JSON.parse(String(fetchImpl.mock.calls[2]?.[1]?.body))
    ).not.toHaveProperty('id');
  });

  it('does not patch a conflicting event owned by another link', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response({}, 409))
      .mockResolvedValueOnce(
        response({
          id: 'calpilotevent001',
          etag: '"etag-001"',
          extendedProperties: { private: { beauessenceLinkId: 'other_link' } }
        })
      );
    const writer = new GoogleCalendarEventWriter(
      'calendar@example.invalid',
      () => Promise.resolve('token'),
      fetchImpl
    );
    await expect(
      writer.upsert({
        eventId: 'calpilotevent001',
        title: '[忙碌] 合成',
        startsAt: '2026-09-02T06:00:00.000Z',
        endsAt: '2026-09-02T07:00:00.000Z',
        linkId: 'block_001'
      })
    ).rejects.toThrow(/identity/iu);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0]?.[1]?.method).toBe('POST');
    expect(fetchImpl.mock.calls[1]?.[1]?.method).toBe('GET');
  });

  it('deletes only with the etag of the matching link and stops on 412', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        response(
          {
            id: 'calpilotevent001',
            etag: '"etag-001"',
            extendedProperties: { private: { beauessenceLinkId: 'block_001' } }
          },
          200
        )
      )
      .mockResolvedValueOnce(response({}, 412));
    const writer = new GoogleCalendarEventWriter(
      'calendar@example.invalid',
      () => Promise.resolve('token'),
      fetchImpl
    );
    await expect(
      writer.remove('calpilotevent001', 'block_001')
    ).rejects.toEqual(
      expect.objectContaining({ status: 412, retryable: false })
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1]?.[1]?.method).toBe('DELETE');
    expect(
      new Headers(fetchImpl.mock.calls[1]?.[1]?.headers).get('If-Match')
    ).toBe('"etag-001"');
  });

  it('does not delete when the stored link differs', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      response(
        {
          id: 'calpilotevent001',
          etag: '"etag-001"',
          extendedProperties: { private: { beauessenceLinkId: 'another_link' } }
        },
        200
      )
    );
    const writer = new GoogleCalendarEventWriter(
      'calendar@example.invalid',
      () => Promise.resolve('token'),
      fetchImpl
    );
    await expect(
      writer.remove('calpilotevent001', 'block_001')
    ).rejects.toThrow(/identity/iu);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('does not fetch a new etag or retry after a patch precondition failure', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response({}, 409))
      .mockResolvedValueOnce(
        response(
          {
            id: 'calpilotevent001',
            etag: '"etag-001"',
            extendedProperties: { private: { beauessenceLinkId: 'block_001' } }
          },
          200
        )
      )
      .mockResolvedValueOnce(response({}, 412));
    const writer = new GoogleCalendarEventWriter(
      'calendar@example.invalid',
      () => Promise.resolve('token'),
      fetchImpl
    );
    await expect(
      writer.upsert({
        eventId: 'calpilotevent001',
        title: '[忙碌] 會議',
        startsAt: '2026-09-02T06:00:00.000Z',
        endsAt: '2026-09-02T07:00:00.000Z',
        linkId: 'block_001'
      })
    ).rejects.toEqual(
      expect.objectContaining({ status: 412, retryable: false })
    );
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(
      new Headers(fetchImpl.mock.calls[2]?.[1]?.headers).get('If-Match')
    ).toBe('"etag-001"');
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
