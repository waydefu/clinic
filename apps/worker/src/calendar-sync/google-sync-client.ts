import { OpaqueIdentifierSchema } from '@beauessence/contracts';

import type { ReconcileEvent } from './calendar-pilot-reconciler.js';
import {
  CalendarSyncTokenExpiredError,
  type CalendarEventPage,
  type CalendarEventReader,
  type CalendarListRequest,
  type ExternalCalendarEvent
} from './sync-engine.js';

const API_BASE = 'https://www.googleapis.com/calendar/v3';
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_SYNC_EVENTS_PER_PAGE = 100;

type FetchLike = typeof fetch;

export class GoogleCalendarSyncError extends Error {
  public readonly name = 'GoogleCalendarSyncError';

  public constructor(
    message: string,
    public readonly status: number,
    public readonly retryable: boolean
  ) {
    super(message);
  }
}

function retryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function safeEvent(value: unknown): ExternalCalendarEvent | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const raw = value as Record<string, unknown>;
  if (
    typeof raw['id'] !== 'string' ||
    raw['id'].trim() === '' ||
    typeof raw['etag'] !== 'string' ||
    raw['etag'].trim() === '' ||
    typeof raw['status'] !== 'string' ||
    !['confirmed', 'tentative', 'cancelled'].includes(raw['status'])
  )
    return undefined;

  const status = raw['status'] as ExternalCalendarEvent['status'];
  const start =
    typeof raw['start'] === 'object' && raw['start'] !== null
      ? (raw['start'] as ExternalCalendarEvent['start'])
      : undefined;
  const end =
    typeof raw['end'] === 'object' && raw['end'] !== null
      ? (raw['end'] as ExternalCalendarEvent['end'])
      : undefined;
  const extendedProperties =
    typeof raw['extendedProperties'] === 'object' &&
    raw['extendedProperties'] !== null
      ? (raw[
          'extendedProperties'
        ] as ExternalCalendarEvent['extendedProperties'])
      : undefined;
  return {
    id: raw['id'],
    etag: raw['etag'],
    status,
    ...(raw['summary'] === undefined ? {} : { summary: raw['summary'] }),
    ...(start === undefined ? {} : { start }),
    ...(end === undefined ? {} : { end }),
    ...(extendedProperties === undefined ? {} : { extendedProperties })
  };
}

function parseReconcileEvent(
  value: unknown,
  linkId: string,
  requireLink: boolean
): ReconcileEvent {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Calendar reconciliation event is invalid.');
  const event = value as Record<string, unknown>;
  const extended = event['extendedProperties'];
  if (
    extended !== undefined &&
    (typeof extended !== 'object' ||
      extended === null ||
      Array.isArray(extended))
  )
    throw new Error('Calendar reconciliation event identity is invalid.');
  const privateFields =
    typeof extended === 'object' && extended !== null
      ? (extended as Record<string, unknown>)['private']
      : undefined;
  if (
    privateFields !== undefined &&
    (typeof privateFields !== 'object' ||
      privateFields === null ||
      Array.isArray(privateFields))
  )
    throw new Error('Calendar reconciliation event identity is invalid.');
  const storedLink =
    typeof privateFields === 'object' && privateFields !== null
      ? (privateFields as Record<string, unknown>)['beauessenceLinkId']
      : undefined;
  if (
    typeof event['id'] !== 'string' ||
    event['id'] === '' ||
    typeof event['etag'] !== 'string' ||
    !/^"[\x21\x23-\x7e]*"$/u.test(event['etag']) ||
    (event['status'] !== 'confirmed' && event['status'] !== 'cancelled') ||
    (requireLink
      ? storedLink !== linkId
      : storedLink !== undefined && storedLink !== linkId)
  )
    throw new Error('Calendar reconciliation event identity is invalid.');
  const creator = event['creator'];
  const organizer = event['organizer'];
  const creatorEmail =
    typeof creator === 'object' && creator !== null
      ? (creator as Record<string, unknown>)['email']
      : undefined;
  const organizerEmail =
    typeof organizer === 'object' && organizer !== null
      ? (organizer as Record<string, unknown>)['email']
      : undefined;
  const proof = {
    ...(typeof storedLink === 'string' ? { linkMarker: storedLink } : {}),
    ...(typeof creatorEmail === 'string' ? { creatorEmail } : {}),
    ...(typeof organizerEmail === 'string' ? { organizerEmail } : {})
  };
  if (event['status'] === 'cancelled')
    return {
      id: event['id'],
      etag: event['etag'],
      linkId,
      status: 'cancelled',
      ...proof
    };
  const start = event['start'];
  const end = event['end'];
  const startsAt =
    typeof start === 'object' && start !== null
      ? (start as Record<string, unknown>)['dateTime']
      : undefined;
  const endsAt =
    typeof end === 'object' && end !== null
      ? (end as Record<string, unknown>)['dateTime']
      : undefined;
  if (
    typeof event['summary'] !== 'string' ||
    typeof startsAt !== 'string' ||
    typeof endsAt !== 'string'
  )
    throw new Error('Calendar reconciliation event fields are invalid.');
  return {
    id: event['id'],
    etag: event['etag'],
    linkId,
    status: 'confirmed',
    title: event['summary'],
    startsAt,
    endsAt,
    ...proof
  };
}

async function responseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === '') return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new GoogleCalendarSyncError(
      'Google Calendar returned an invalid response.',
      response.status,
      retryableStatus(response.status)
    );
  }
}

export class GoogleCalendarEventReader implements CalendarEventReader {
  public constructor(
    private readonly calendarId: string,
    private readonly getAccessToken: () => Promise<string>,
    private readonly fetchImpl: FetchLike = fetch
  ) {}

  public async listEvents(
    request: CalendarListRequest
  ): Promise<CalendarEventPage> {
    const url = new URL(
      `${API_BASE}/calendars/${encodeURIComponent(this.calendarId)}/events`
    );
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('showDeleted', 'true');
    url.searchParams.set('maxResults', String(MAX_SYNC_EVENTS_PER_PAGE));
    if (request.syncToken !== undefined)
      url.searchParams.set('syncToken', request.syncToken);
    else {
      if (request.timeMin !== undefined)
        url.searchParams.set('timeMin', request.timeMin);
      if (request.timeMax !== undefined)
        url.searchParams.set('timeMax', request.timeMax);
    }
    if (request.pageToken !== undefined)
      url.searchParams.set('pageToken', request.pageToken);

    const token = await this.getAccessToken();
    const response = await this.fetchImpl(url.toString(), {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
    });
    if (response.status === 410)
      throw new CalendarSyncTokenExpiredError(
        'Google Calendar sync token expired.'
      );
    if (!response.ok)
      throw new GoogleCalendarSyncError(
        `Google Calendar list failed (${response.status}).`,
        response.status,
        retryableStatus(response.status)
      );

    const raw = await responseJson(response);
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
      throw new GoogleCalendarSyncError(
        'Google Calendar returned an invalid response.',
        response.status,
        false
      );
    const body = raw as Record<string, unknown>;
    const invalidToken = ['nextPageToken', 'nextSyncToken'].some((field) => {
      const value = body[field];
      return (
        Object.hasOwn(body, field) &&
        (typeof value !== 'string' || value.trim() === '')
      );
    });
    if (
      invalidToken ||
      (Object.hasOwn(body, 'items') && !Array.isArray(body['items'])) ||
      (Array.isArray(body['items']) &&
        body['items'].length > MAX_SYNC_EVENTS_PER_PAGE)
    )
      throw new GoogleCalendarSyncError(
        'Google Calendar returned an invalid response.',
        response.status,
        false
      );
    const events: ExternalCalendarEvent[] = [];
    let malformedEvents = 0;
    for (const item of (body['items'] ?? []) as unknown[]) {
      const event = safeEvent(item);
      if (event === undefined) malformedEvents += 1;
      else events.push(event);
    }
    if (malformedEvents > 0)
      throw new GoogleCalendarSyncError(
        `Google Calendar returned ${malformedEvents} malformed event(s).`,
        response.status,
        false
      );
    const nextPageToken =
      typeof body['nextPageToken'] === 'string'
        ? body['nextPageToken']
        : undefined;
    const nextSyncToken =
      typeof body['nextSyncToken'] === 'string'
        ? body['nextSyncToken']
        : undefined;
    return {
      events,
      ...(nextPageToken === undefined ? {} : { nextPageToken }),
      ...(nextSyncToken === undefined ? {} : { nextSyncToken })
    };
  }

  public async listReconciliationEvents(
    linkId: string,
    pageToken?: string
  ): Promise<{
    readonly events: readonly ReconcileEvent[];
    readonly nextPageToken?: string;
  }> {
    OpaqueIdentifierSchema.parse(linkId);
    if (pageToken !== undefined && pageToken.trim() === '')
      throw new Error('Calendar reconciliation page token is invalid.');
    const url = new URL(
      `${API_BASE}/calendars/${encodeURIComponent(this.calendarId)}/events`
    );
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('showDeleted', 'true');
    url.searchParams.set('maxResults', '100');
    url.searchParams.set(
      'privateExtendedProperty',
      `beauessenceLinkId=${linkId}`
    );
    if (pageToken !== undefined) url.searchParams.set('pageToken', pageToken);
    const token = await this.getAccessToken();
    const response = await this.fetchImpl(url.toString(), {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
    });
    if (!response.ok)
      throw new GoogleCalendarSyncError(
        `Google Calendar list failed (${response.status}).`,
        response.status,
        retryableStatus(response.status)
      );
    const raw = await responseJson(response);
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
      throw new Error('Calendar reconciliation inventory is invalid.');
    const body = raw as Record<string, unknown>;
    const next = body['nextPageToken'];
    if (
      (next !== undefined &&
        (typeof next !== 'string' || next.trim() === '')) ||
      (body['items'] !== undefined && !Array.isArray(body['items']))
    )
      throw new Error('Calendar reconciliation inventory is invalid.');
    const events = ((body['items'] ?? []) as unknown[]).map((item) =>
      parseReconcileEvent(item, linkId, true)
    );
    return {
      events,
      ...(typeof next === 'string' ? { nextPageToken: next } : {})
    };
  }

  public async listWholeCalendarInventory(
    maxItems: number,
    pageToken?: string
  ): Promise<{
    readonly events: readonly {
      readonly id: string;
      readonly linkId?: string;
      readonly recurring: boolean;
    }[];
    readonly nextPageToken?: string;
  }> {
    if (
      !Number.isSafeInteger(maxItems) ||
      maxItems < 1 ||
      maxItems > 100 ||
      (pageToken !== undefined && pageToken.trim() === '')
    )
      throw new Error('Calendar reconciliation inventory bounds are invalid.');
    const url = new URL(
      `${API_BASE}/calendars/${encodeURIComponent(this.calendarId)}/events`
    );
    url.searchParams.set('singleEvents', 'false');
    url.searchParams.set('showDeleted', 'true');
    url.searchParams.set('maxResults', String(maxItems));
    if (pageToken !== undefined) url.searchParams.set('pageToken', pageToken);
    const token = await this.getAccessToken();
    const response = await this.fetchImpl(url.toString(), {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
    });
    if (!response.ok)
      throw new GoogleCalendarSyncError(
        `Google Calendar list failed (${response.status}).`,
        response.status,
        retryableStatus(response.status)
      );
    const raw = await responseJson(response);
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
      throw new Error('Calendar reconciliation inventory is invalid.');
    const body = raw as Record<string, unknown>;
    const next = body['nextPageToken'];
    if (
      (next !== undefined &&
        (typeof next !== 'string' || next.trim() === '')) ||
      (body['items'] !== undefined && !Array.isArray(body['items']))
    )
      throw new Error('Calendar reconciliation inventory is invalid.');
    const items = (body['items'] ?? []) as unknown[];
    if (items.length > maxItems)
      throw new Error('Calendar reconciliation inventory exceeded its bound.');
    const events = items.map((item) => {
      if (typeof item !== 'object' || item === null || Array.isArray(item))
        throw new Error('Calendar reconciliation inventory event is invalid.');
      const event = item as Record<string, unknown>;
      if (typeof event['id'] !== 'string' || event['id'].trim() === '')
        throw new Error('Calendar reconciliation inventory event is invalid.');
      const extended = event['extendedProperties'];
      if (
        extended !== undefined &&
        (typeof extended !== 'object' ||
          extended === null ||
          Array.isArray(extended))
      )
        throw new Error('Calendar reconciliation inventory event is invalid.');
      const privateFields =
        typeof extended === 'object' && extended !== null
          ? (extended as Record<string, unknown>)['private']
          : undefined;
      if (
        privateFields !== undefined &&
        (typeof privateFields !== 'object' ||
          privateFields === null ||
          Array.isArray(privateFields))
      )
        throw new Error('Calendar reconciliation inventory event is invalid.');
      const link =
        typeof privateFields === 'object' && privateFields !== null
          ? (privateFields as Record<string, unknown>)['beauessenceLinkId']
          : undefined;
      if (link !== undefined && !OpaqueIdentifierSchema.safeParse(link).success)
        throw new Error('Calendar reconciliation inventory event is invalid.');
      return {
        id: event['id'],
        recurring:
          event['recurrence'] !== undefined ||
          event['recurringEventId'] !== undefined,
        ...(typeof link === 'string' ? { linkId: link } : {})
      };
    });
    return {
      events,
      ...(typeof next === 'string' ? { nextPageToken: next } : {})
    };
  }

  public async getReconciliationOriginal(
    eventId: string,
    linkId: string
  ): Promise<ReconcileEvent | undefined> {
    OpaqueIdentifierSchema.parse(linkId);
    if (eventId.trim() === '')
      throw new Error('Calendar original event ID is invalid.');
    const token = await this.getAccessToken();
    const response = await this.fetchImpl(
      `${API_BASE}/calendars/${encodeURIComponent(this.calendarId)}/events/${encodeURIComponent(eventId)}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
      }
    );
    if (response.status === 404 || response.status === 410) return undefined;
    if (!response.ok)
      throw new GoogleCalendarSyncError(
        `Google Calendar get failed (${response.status}).`,
        response.status,
        retryableStatus(response.status)
      );
    const event = parseReconcileEvent(
      await responseJson(response),
      linkId,
      false
    );
    if (event.id !== eventId)
      throw new Error('Calendar original event ID changed.');
    return event;
  }
}

interface CalendarWriteEventBase {
  readonly eventId: string;
  readonly title: string;
  readonly linkId: string;
}

export type CalendarWriteEvent = CalendarWriteEventBase &
  (
    | {
        readonly allDay?: false;
        readonly startsAt: string;
        readonly endsAt: string;
      }
    | {
        readonly allDay: true;
        readonly startDate: string;
        readonly endDate: string;
      }
  );

export class GoogleCalendarEventWriter {
  public constructor(
    private readonly calendarId: string,
    private readonly getAccessToken: () => Promise<string>,
    private readonly fetchImpl: FetchLike = fetch
  ) {}

  private async request(
    path: string,
    init: RequestInit,
    idempotentStatuses: ReadonlySet<number> = new Set()
  ): Promise<Response> {
    const token = await this.getAccessToken();
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    if (init.body !== undefined)
      headers.set('Content-Type', 'application/json');
    const response = await this.fetchImpl(
      `${API_BASE}/calendars/${encodeURIComponent(this.calendarId)}${path}`,
      {
        ...init,
        headers,
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
      }
    );
    if (!response.ok && !idempotentStatuses.has(response.status))
      throw new GoogleCalendarSyncError(
        `Google Calendar write failed (${response.status}).`,
        response.status,
        retryableStatus(response.status)
      );
    return response;
  }

  public async upsert(event: CalendarWriteEvent): Promise<void> {
    const body = this.insertBody(event);
    const inserted = await this.request(
      '/events',
      { method: 'POST', body },
      new Set([409])
    );
    if (inserted.status !== 409) return;
    const etag = await this.readEtag(event.eventId, event.linkId);
    if (etag === undefined)
      throw new GoogleCalendarSyncError(
        'Google Calendar event is missing.',
        404,
        false
      );
    await this.update(event, etag);
  }

  public async update(
    event: CalendarWriteEvent,
    expectedEtag: string,
    restore = false
  ): Promise<void> {
    if (!/^"[\x21\x23-\x7e]*"$/u.test(expectedEtag))
      throw new Error('Calendar event version is unavailable.');
    await this.request(`/events/${encodeURIComponent(event.eventId)}`, {
      method: 'PATCH',
      body: restore
        ? JSON.stringify({ ...this.mutationBody(event), status: 'confirmed' })
        : this.patchBody(event),
      headers: { 'If-Match': expectedEtag }
    });
  }

  private mutationBody(event: CalendarWriteEvent): Record<string, unknown> {
    return {
      summary: event.title,
      start:
        event.allDay === true
          ? { date: event.startDate }
          : { dateTime: event.startsAt, timeZone: 'Asia/Taipei' },
      end:
        event.allDay === true
          ? { date: event.endDate }
          : { dateTime: event.endsAt, timeZone: 'Asia/Taipei' },
      extendedProperties: {
        private: { beauessenceLinkId: event.linkId }
      }
    };
  }

  private insertBody(event: CalendarWriteEvent): string {
    return JSON.stringify({ id: event.eventId, ...this.mutationBody(event) });
  }

  private patchBody(event: CalendarWriteEvent): string {
    return JSON.stringify(this.mutationBody(event));
  }

  private async readEtag(
    eventId: string,
    linkId: string
  ): Promise<string | undefined> {
    const response = await this.request(
      `/events/${encodeURIComponent(eventId)}`,
      { method: 'GET' },
      new Set([404, 410])
    );
    if (response.status === 404 || response.status === 410) return undefined;
    const data: unknown = await response.json();
    if (typeof data !== 'object' || data === null)
      throw new Error('Calendar event version is unavailable.');
    const record = data as Record<string, unknown>;
    const extended = record['extendedProperties'];
    const privateProperties =
      typeof extended === 'object' && extended !== null
        ? (extended as Record<string, unknown>)['private']
        : undefined;
    if (
      record['id'] !== eventId ||
      typeof record['etag'] !== 'string' ||
      !/^"[\x21\x23-\x7e]*"$/u.test(record['etag']) ||
      typeof privateProperties !== 'object' ||
      privateProperties === null ||
      (privateProperties as Record<string, unknown>)['beauessenceLinkId'] !==
        linkId
    )
      throw new Error('Calendar event identity or version is unavailable.');
    return record['etag'];
  }

  public async remove(eventId: string, linkId: string): Promise<void> {
    const etag = await this.readEtag(eventId, linkId);
    if (etag === undefined) return;
    await this.removeWithEtag(eventId, etag);
  }

  public async removeWithEtag(eventId: string, etag: string): Promise<void> {
    if (!/^"[\x21\x23-\x7e]*"$/u.test(etag))
      throw new Error('Calendar event version is unavailable.');
    await this.request(
      `/events/${encodeURIComponent(eventId)}`,
      { method: 'DELETE', headers: { 'If-Match': etag } },
      new Set([404, 410])
    );
  }

  /**
   * Dedicated synthetic calendars have no dry-run write API. The activation
   * preflight therefore creates and immediately removes a deterministic event
   * in the year 2000, outside the synchronization window.
   */
  public async verifyWriteAccess(probeId: string): Promise<void> {
    const eventId = `calpilotpreflight${probeId}`;
    const linkId = `preflight_${probeId}`;
    await this.upsert({
      eventId,
      title: '[忙碌] 其他',
      startsAt: '2000-01-01T00:00:00.000Z',
      endsAt: '2000-01-01T00:01:00.000Z',
      linkId
    });
    await this.remove(eventId, linkId);
  }
}

export interface GoogleWatchChannel {
  readonly channelId: string;
  readonly resourceId: string;
  readonly expirationMs: number;
}

/**
 * Unwired. Calendar-pilot runtime must not construct this client. Product
 * direction is CAL-SYNC-DIR-2026-09-11; production D-009/D-016 stay pending.
 */
export class GoogleCalendarWatchClient {
  public constructor(
    private readonly calendarId: string,
    private readonly getAccessToken: () => Promise<string>,
    private readonly fetchImpl: FetchLike = fetch
  ) {}

  public async watch(input: {
    readonly channelId: string;
    readonly address: string;
    readonly token: string;
    readonly expirationMs: number;
  }): Promise<GoogleWatchChannel> {
    const token = await this.getAccessToken();
    const url = `${API_BASE}/calendars/${encodeURIComponent(this.calendarId)}/events/watch`;
    const response = await this.fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        id: input.channelId,
        type: 'web_hook',
        address: input.address,
        token: input.token,
        expiration: input.expirationMs
      }),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
    });
    if (!response.ok)
      throw new GoogleCalendarSyncError(
        `Google Calendar watch failed (${response.status}).`,
        response.status,
        retryableStatus(response.status)
      );
    const raw = await responseJson(response);
    if (typeof raw !== 'object' || raw === null)
      throw new GoogleCalendarSyncError(
        'Google Calendar returned an invalid response.',
        response.status,
        false
      );
    const body = raw as Record<string, unknown>;
    if (
      typeof body['id'] !== 'string' ||
      body['id'].trim() === '' ||
      typeof body['resourceId'] !== 'string' ||
      body['resourceId'].trim() === ''
    ) {
      throw new GoogleCalendarSyncError(
        'Google Calendar returned an invalid watch channel.',
        response.status,
        false
      );
    }
    const expiration =
      typeof body['expiration'] === 'string'
        ? Number(body['expiration'])
        : typeof body['expiration'] === 'number'
          ? body['expiration']
          : Number.NaN;
    if (!Number.isFinite(expiration))
      throw new GoogleCalendarSyncError(
        'Google Calendar returned an invalid watch channel.',
        response.status,
        false
      );
    return {
      channelId: body['id'],
      resourceId: body['resourceId'],
      expirationMs: expiration
    };
  }

  public async stop(input: {
    readonly channelId: string;
    readonly resourceId: string;
  }): Promise<void> {
    const token = await this.getAccessToken();
    const response = await this.fetchImpl(`${API_BASE}/channels/stop`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        id: input.channelId,
        resourceId: input.resourceId
      }),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
    });
    if (!response.ok && response.status !== 404)
      throw new GoogleCalendarSyncError(
        `Google Calendar channel stop failed (${response.status}).`,
        response.status,
        retryableStatus(response.status)
      );
  }
}
