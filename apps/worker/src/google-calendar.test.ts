import { describe, expect, it } from 'vitest';

import { calendarEventIdForAppointment } from '@beauessence/domain';
import {
  CalendarError,
  InMemoryCalendar,
  type CalendarProjectionRequest
} from './calendar-port.js';
import { GoogleCalendarClient, createCalendarPort } from './google-calendar.js';

const KEY = calendarEventIdForAppointment('appointment_001');

const request = (
  overrides: Partial<CalendarProjectionRequest> = {}
): CalendarProjectionRequest => ({
  idempotencyKey: KEY,
  action: 'upsert',
  appointmentId: 'appointment_001',
  appointmentStatus: 'confirmed',
  startsAt: '2030-01-02T04:00:00.000Z',
  endsAt: '2030-01-02T05:00:00.000Z',
  colorId: '10',
  bookingKind: 'initial',
  ...overrides
});

interface Call {
  url: string;
  method: string;
  body?: string;
}

/** 依序回應預先排好的狀態碼，並記錄每次呼叫。 */
function fakeFetch(statuses: number[], bodies: string[] = []) {
  const calls: Call[] = [];
  let index = 0;
  const impl = (
    url: string,
    init: { method: string; headers: Record<string, string>; body?: string }
  ) => {
    calls.push({ url, method: init.method, body: init.body });
    const status = statuses[index] ?? 200;
    const body = bodies[index] ?? '{}';
    index += 1;
    return Promise.resolve({ status, text: () => Promise.resolve(body) });
  };
  return { impl, calls };
}

const client = (fetchImpl: ReturnType<typeof fakeFetch>['impl']) =>
  new GoogleCalendarClient({
    calendarId: 'test-calendar@group.calendar.google.com',
    getAccessToken: () => Promise.resolve('fake-token'),
    fetchImpl
  });

const codeOf = async (run: () => Promise<unknown>) => {
  try {
    await run();
    return { retryable: undefined as boolean | undefined };
  } catch (error) {
    return {
      retryable:
        error instanceof CalendarError ? error.retryable : 'not-calendar-error'
    };
  }
};

describe('GoogleCalendarClient', () => {
  it('upsert 走 events.insert，帶自訂 ID 與最小欄位', async () => {
    const { impl, calls } = fakeFetch([201]);
    await client(impl).project(request());

    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.url).toContain('/events');
    const body = JSON.parse(calls[0]?.body ?? '{}');
    expect(body.id).toBe(KEY);
    expect(body.summary).toBe('一森渼診所 初診');
    expect(body.start.dateTime).toBe('2030-01-02T04:00:00.000Z');
    expect(body.end.dateTime).toBe('2030-01-02T05:00:00.000Z');
    expect(body.colorId).toBe('10');
  });

  // ADR-0002：事件不得夾帶任何病患個資。
  it('事件內容不含姓名、電話、身分證、看診項目或備註', async () => {
    const { impl, calls } = fakeFetch([201]);
    await client(impl).project(request());
    const raw = calls[0]?.body ?? '';
    for (const secret of [
      '王測試',
      '0912345678',
      'A123456789',
      '止鼾',
      '鼻中膈'
    ])
      expect(raw).not.toContain(secret);
  });

  it('insert 回 409 時改 patch，維持一個事件（冪等）', async () => {
    const { impl, calls } = fakeFetch([409, 200]);
    await client(impl).project(request());

    expect(calls).toHaveLength(2);
    expect(calls[0]?.method).toBe('POST');
    expect(calls[1]?.method).toBe('PATCH');
    expect(calls[1]?.url).toContain(encodeURIComponent(KEY));
  });

  it('cancel 走 events.delete；404／410 視為成功', async () => {
    for (const status of [204, 404, 410]) {
      const { impl, calls } = fakeFetch([status]);
      await client(impl).project(request({ action: 'cancel' }));
      expect(calls[0]?.method).toBe('DELETE');
    }
  });

  it('5xx 與 429 可重試；401／403／400 不可重試', async () => {
    const retryableOf = async (status: number, action: 'upsert' | 'cancel') =>
      (
        await codeOf(() =>
          client(fakeFetch([status]).impl).project(request({ action }))
        )
      ).retryable;

    expect(await retryableOf(500, 'upsert')).toBe(true);
    expect(await retryableOf(503, 'cancel')).toBe(true);
    expect(await retryableOf(429, 'upsert')).toBe(true);
    expect(await retryableOf(403, 'upsert')).toBe(false);
    expect(await retryableOf(401, 'cancel')).toBe(false);
    expect(await retryableOf(400, 'upsert')).toBe(false);
  });

  it('網路層錯誤可重試', async () => {
    const throwing = (
      _url: string,
      _init: { method: string; headers: Record<string, string>; body?: string }
    ): Promise<{ status: number; text: () => Promise<string> }> =>
      Promise.reject(new Error('ECONNRESET'));
    const result = await codeOf(() => client(throwing).project(request()));
    expect(result.retryable).toBe(true);
  });
});

describe('createCalendarPort', () => {
  it('沒有憑證時回退到假日曆，不會意外對外呼叫', () => {
    expect(createCalendarPort({})).toBeInstanceOf(InMemoryCalendar);
    expect(
      createCalendarPort({ GOOGLE_CALENDAR_ID: 'only-id' })
    ).toBeInstanceOf(InMemoryCalendar);
  });

  it('兩個 env 齊備時回傳真實用戶端', () => {
    const port = createCalendarPort({
      GOOGLE_CALENDAR_ID: 'test-calendar',
      GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
        client_email: 'svc@example.iam.gserviceaccount.com',
        private_key:
          '-----BEGIN PRIVATE KEY-----\nMIIfake\n-----END PRIVATE KEY-----\n'
      })
    });
    expect(port).toBeInstanceOf(GoogleCalendarClient);
  });
});
