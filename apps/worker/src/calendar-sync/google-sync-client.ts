import {
  CalendarSyncTokenExpiredError,
  type CalendarEventPage,
  type CalendarEventReader,
  type CalendarListRequest,
  type ExternalCalendarEvent
} from './sync-engine.js';

const API_BASE = 'https://www.googleapis.com/calendar/v3';
const DEFAULT_TIMEOUT_MS = 10_000;

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
    !['confirmed', 'tentative', 'cancelled'].includes(String(raw['status']))
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
    url.searchParams.set('maxResults', '2500');
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
    if (typeof raw !== 'object' || raw === null)
      throw new GoogleCalendarSyncError(
        'Google Calendar returned an invalid response.',
        response.status,
        false
      );
    const body = raw as Record<string, unknown>;
    const events = Array.isArray(body['items'])
      ? body['items'].flatMap((item) => {
          const event = safeEvent(item);
          return event === undefined ? [] : [event];
        })
      : [];
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
    const response = await this.fetchImpl(
      `${API_BASE}/calendars/${encodeURIComponent(this.calendarId)}${path}`,
      {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(init.body === undefined
            ? {}
            : { 'Content-Type': 'application/json' })
        },
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
    const body = this.body(event);
    const inserted = await this.request(
      '/events',
      { method: 'POST', body },
      new Set([409])
    );
    if (inserted.status !== 409) return;
    await this.update(event);
  }

  public async update(event: CalendarWriteEvent): Promise<void> {
    await this.request(`/events/${encodeURIComponent(event.eventId)}`, {
      method: 'PATCH',
      body: this.body(event)
    });
  }

  private body(event: CalendarWriteEvent): string {
    return JSON.stringify({
      id: event.eventId,
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
    });
  }

  public async remove(eventId: string): Promise<void> {
    await this.request(
      `/events/${encodeURIComponent(eventId)}`,
      { method: 'DELETE' },
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
    try {
      await this.upsert({
        eventId,
        title: '[忙碌] 其他',
        startsAt: '2000-01-01T00:00:00.000Z',
        endsAt: '2000-01-01T00:01:00.000Z',
        linkId: `preflight_${probeId}`
      });
    } finally {
      await this.remove(eventId);
    }
  }
}
