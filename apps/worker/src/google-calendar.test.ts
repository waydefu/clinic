import { generateKeyPairSync } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { calendarEventIdForAppointment } from '@beauessence/domain';
import {
  CalendarError,
  InMemoryCalendar,
  type CalendarProjectionRequest
} from './calendar-port.js';
import {
  CALENDAR_SCOPE,
  GoogleCalendarClient,
  createCalendarPort,
  createServiceAccountTokenProvider
} from './google-calendar.js';

const KEY = calendarEventIdForAppointment('appointment_001');
const TEST_PRIVATE_KEY = generateKeyPairSync('rsa', {
  modulusLength: 2048
}).privateKey.export({ type: 'pkcs8', format: 'pem' });
const SERVICE_ACCOUNT = {
  type: 'service_account',
  client_email: 'svc@example.iam.gserviceaccount.com',
  private_key: TEST_PRIVATE_KEY,
  token_uri: 'https://oauth2.googleapis.com/token'
};

const request = (
  overrides: Partial<CalendarProjectionRequest> = {}
): CalendarProjectionRequest => ({
  idempotencyKey: KEY,
  correlationId: 'corr_calendar_001',
  causationId: 'audit_appointment_001_confirmed',
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
  signal: AbortSignal | undefined;
}

/** 依序回應預先排好的狀態碼，並記錄每次呼叫。 */
function fakeFetch(statuses: number[], bodies: string[] = []) {
  const calls: Call[] = [];
  let index = 0;
  const impl = (
    url: string,
    init: {
      method: string;
      headers: Record<string, string>;
      body?: string;
      signal?: AbortSignal;
    }
  ) => {
    calls.push({
      url,
      method: init.method,
      body: init.body,
      signal: init.signal
    });
    const status = statuses[index] ?? 200;
    const body = bodies[index] ?? '{}';
    index += 1;
    return Promise.resolve({ status, text: () => Promise.resolve(body) });
  };
  return { impl, calls };
}

function calendarErrorBody(reason: string): string {
  return JSON.stringify({
    error: {
      errors: [{ domain: 'usageLimits', reason }],
      code: 403,
      message: 'Synthetic Calendar API error'
    }
  });
}

function abortingFetch(
  _url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  }
): Promise<{ status: number; text: () => Promise<string> }> {
  return new Promise((_resolve, reject) => {
    const signal = init.signal;
    if (signal === undefined) {
      reject(new Error('missing timeout signal'));
      return;
    }
    const rejectOnAbort = () =>
      reject(
        signal.reason instanceof Error ? signal.reason : new Error('aborted')
      );
    if (signal.aborted) rejectOnAbort();
    else signal.addEventListener('abort', rejectOnAbort, { once: true });
  });
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
    expect(body).not.toHaveProperty('correlationId');
    expect(body).not.toHaveProperty('causationId');
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

  it('408／429／5xx 可重試；一般 401／403／400 不可重試', async () => {
    const retryableOf = async (status: number, action: 'upsert' | 'cancel') =>
      (
        await codeOf(() =>
          client(fakeFetch([status]).impl).project(request({ action }))
        )
      ).retryable;

    expect(await retryableOf(408, 'upsert')).toBe(true);
    expect(await retryableOf(500, 'upsert')).toBe(true);
    expect(await retryableOf(503, 'cancel')).toBe(true);
    expect(await retryableOf(429, 'upsert')).toBe(true);
    expect(await retryableOf(403, 'upsert')).toBe(false);
    expect(await retryableOf(401, 'cancel')).toBe(false);
    expect(await retryableOf(400, 'upsert')).toBe(false);
  });

  it.each(['userRateLimitExceeded', 'rateLimitExceeded', 'quotaExceeded'])(
    '403 %s 依官方語意套用退避重試',
    async (reason) => {
      const result = await codeOf(() =>
        client(fakeFetch([403], [calendarErrorBody(reason)]).impl).project(
          request()
        )
      );
      expect(result.retryable).toBe(true);
    }
  );

  it('403 非配額錯誤與無效本文維持不可重試', async () => {
    const forbidden = await codeOf(() =>
      client(
        fakeFetch([403], [calendarErrorBody('forbiddenForNonOrganizer')]).impl
      ).project(request())
    );
    const malformed = await codeOf(() =>
      client(fakeFetch([403], ['not-json']).impl).project(request())
    );
    expect(forbidden.retryable).toBe(false);
    expect(malformed.retryable).toBe(false);
  });

  it('網路層錯誤可重試', async () => {
    const throwing = (
      _url: string,
      _init: {
        method: string;
        headers: Record<string, string>;
        body?: string;
        signal?: AbortSignal;
      }
    ): Promise<{ status: number; text: () => Promise<string> }> =>
      Promise.reject(new Error('ECONNRESET'));
    const result = await codeOf(() => client(throwing).project(request()));
    expect(result.retryable).toBe(true);
  });

  it('Calendar HTTP 超時會中止並歸為可重試', async () => {
    const timedClient = new GoogleCalendarClient({
      calendarId: 'test-calendar@group.calendar.google.com',
      getAccessToken: () => Promise.resolve('fake-token'),
      fetchImpl: abortingFetch,
      requestTimeoutMs: 5
    });
    await expect(timedClient.project(request())).rejects.toMatchObject({
      message: 'Calendar request failed.',
      retryable: true
    });
  });

  it('cold token、insert 409 與 patch 共用一個短於租約的總 deadline', async () => {
    const calls: Call[] = [];
    const stagedFetch = (
      url: string,
      init: {
        method: string;
        headers: Record<string, string>;
        body?: string;
        signal?: AbortSignal;
      }
    ): Promise<{ status: number; text: () => Promise<string> }> => {
      calls.push({
        url,
        method: init.method,
        body: init.body,
        signal: init.signal
      });
      if (url === 'https://oauth2.googleapis.com/token')
        return Promise.resolve({
          status: 200,
          text: () =>
            Promise.resolve(
              JSON.stringify({ access_token: 'cold-token', expires_in: 3600 })
            )
        });
      if (init.method === 'POST')
        return Promise.resolve({
          status: 409,
          text: () => Promise.resolve('{}')
        });
      return abortingFetch(url, init);
    };
    const provider = createServiceAccountTokenProvider(
      JSON.stringify(SERVICE_ACCOUNT),
      stagedFetch,
      Date.now,
      60_000
    );
    const deadlineClient = new GoogleCalendarClient({
      calendarId: 'test-calendar@group.calendar.google.com',
      getAccessToken: provider,
      fetchImpl: stagedFetch,
      requestTimeoutMs: 60_000,
      projectionTimeoutMs: 60_000
    });

    await expect(
      deadlineClient.project(request(), { timeoutMs: 250 })
    ).rejects.toMatchObject({
      message: 'Calendar request failed.',
      retryable: true
    });
    expect(
      calls.map(({ url, method }) => ({
        target: url.includes('oauth2') ? 'token' : 'calendar',
        method
      }))
    ).toEqual([
      { target: 'token', method: 'POST' },
      { target: 'calendar', method: 'POST' },
      { target: 'calendar', method: 'PATCH' }
    ]);
    expect(calls.every((call) => call.signal?.aborted === true)).toBe(true);
  });

  it('租約訊號已過期時不取得 token、也不發 Calendar HTTP', async () => {
    let tokenCalls = 0;
    const { impl, calls } = fakeFetch([200]);
    const deadlineClient = new GoogleCalendarClient({
      calendarId: 'test-calendar@group.calendar.google.com',
      getAccessToken: () => {
        tokenCalls += 1;
        return Promise.resolve('fake-token');
      },
      fetchImpl: impl
    });
    const expired = new AbortController();
    expired.abort();

    await expect(
      deadlineClient.project(request(), {
        timeoutMs: 30_000,
        signal: expired.signal
      })
    ).rejects.toMatchObject({
      message: 'Calendar projection deadline exceeded.',
      retryable: true
    });
    expect(tokenCalls).toBe(0);
    expect(calls).toEqual([]);
  });

  it('拒絕會吃掉 worker 租約安全餘裕的總 deadline', () => {
    expect(
      () =>
        new GoogleCalendarClient({
          calendarId: 'test-calendar@group.calendar.google.com',
          getAccessToken: () => Promise.resolve('fake-token'),
          fetchImpl: fakeFetch([200]).impl,
          projectionTimeoutMs: 110_001
        })
    ).toThrow(/stays below the worker lease/u);
  });
});

describe('createCalendarPort', () => {
  it('沒有憑證時回退到假日曆，不會意外對外呼叫', () => {
    expect(createCalendarPort({})).toBeInstanceOf(InMemoryCalendar);
    expect(
      createCalendarPort({ GOOGLE_CALENDAR_INTEGRATION_MODE: 'disabled' })
    ).toBeInstanceOf(InMemoryCalendar);
  });

  it('半套憑證或停用模式夾帶憑證時直接失敗', () => {
    expect(() =>
      createCalendarPort({
        GOOGLE_CALENDAR_INTEGRATION_MODE: 'test',
        GOOGLE_CALENDAR_ID: 'only-id'
      })
    ).toThrow(/requires both/u);
    expect(() =>
      createCalendarPort({
        GOOGLE_CALENDAR_INTEGRATION_MODE: 'test',
        GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify(SERVICE_ACCOUNT)
      })
    ).toThrow(/requires both/u);
    expect(() =>
      createCalendarPort({
        GOOGLE_CALENDAR_ID: 'test-calendar',
        GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify(SERVICE_ACCOUNT)
      })
    ).toThrow(/INTEGRATION_MODE is disabled/u);
  });

  it('只有明確 test 模式且兩個 env 齊備時回傳真實用戶端', () => {
    const port = createCalendarPort({
      GOOGLE_CALENDAR_INTEGRATION_MODE: 'test',
      GOOGLE_CALENDAR_ID: 'test-calendar',
      GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify(SERVICE_ACCOUNT)
    });
    expect(port).toBeInstanceOf(GoogleCalendarClient);
  });

  it('未知整合模式直接失敗', () => {
    expect(() =>
      createCalendarPort({ GOOGLE_CALENDAR_INTEGRATION_MODE: 'production' })
    ).toThrow(/must be disabled or test/u);
  });
});

describe('createServiceAccountTokenProvider', () => {
  it('拒絕非服務帳號、無效金鑰與非官方 token_uri', () => {
    expect(() =>
      createServiceAccountTokenProvider(
        JSON.stringify({ ...SERVICE_ACCOUNT, type: 'authorized_user' })
      )
    ).toThrow(/type must be service_account/u);
    expect(() =>
      createServiceAccountTokenProvider(
        JSON.stringify({ ...SERVICE_ACCOUNT, private_key: 'not-a-key' })
      )
    ).toThrow(/PKCS#8 private_key/u);
    expect(() =>
      createServiceAccountTokenProvider(
        JSON.stringify({
          ...SERVICE_ACCOUNT,
          private_key:
            '-----BEGIN PRIVATE KEY-----\nMIIfake\n-----END PRIVATE KEY-----'
        })
      )
    ).toThrow(/valid RSA private key/u);
    expect(() =>
      createServiceAccountTokenProvider(
        JSON.stringify({
          ...SERVICE_ACCOUNT,
          token_uri: 'https://example.invalid/token'
        })
      )
    ).toThrow(/official Google OAuth endpoint/u);
  });

  it('只呼叫官方 token endpoint，JWT audience 亦固定為官方 endpoint', async () => {
    const { impl, calls } = fakeFetch(
      [200],
      [JSON.stringify({ access_token: 'token-123', expires_in: 3600 })]
    );
    const provider = createServiceAccountTokenProvider(
      JSON.stringify(SERVICE_ACCOUNT),
      impl,
      () => Date.UTC(2030, 0, 1)
    );

    await expect(provider()).resolves.toBe('token-123');
    expect(calls[0]?.url).toBe('https://oauth2.googleapis.com/token');
    const body = new URLSearchParams(calls[0]?.body);
    const assertion = body.get('assertion') ?? '';
    const encodedClaims = assertion.split('.')[1] ?? '';
    const claims = JSON.parse(
      Buffer.from(encodedClaims, 'base64url').toString('utf8')
    );
    expect(claims.aud).toBe('https://oauth2.googleapis.com/token');
  });

  // scope 先前只存在於一個常數裡，沒有任何測試看著它——改寬了不會有人發現。
  // 這裡刻意用字面值而非匯入 CALENDAR_SCOPE 比對：匯入的話，把常數改成
  // `auth/calendar` 兩邊會一起變，測試照樣綠，等於沒有守住任何東西。
  it('JWT 只請求 calendar.events，不得放寬成整本日曆的 calendar scope', async () => {
    const { impl, calls } = fakeFetch(
      [200],
      [JSON.stringify({ access_token: 'token-123', expires_in: 3600 })]
    );
    const provider = createServiceAccountTokenProvider(
      JSON.stringify(SERVICE_ACCOUNT),
      impl,
      () => Date.UTC(2030, 0, 1)
    );

    await expect(provider()).resolves.toBe('token-123');
    const assertion =
      new URLSearchParams(calls[0]?.body).get('assertion') ?? '';
    const claims = JSON.parse(
      Buffer.from(assertion.split('.')[1] ?? '', 'base64url').toString('utf8')
    );

    expect(claims.scope).toBe(
      'https://www.googleapis.com/auth/calendar.events'
    );
    // 這個用戶端只 insert／patch／delete 事件，永遠不需要分享或永久刪除整本日曆。
    expect(claims.scope).not.toBe('https://www.googleapis.com/auth/calendar');
    expect(CALENDAR_SCOPE).toBe(claims.scope);
  });

  it.each([
    ['non-JSON', 'not-json'],
    ['missing token', JSON.stringify({ expires_in: 3600 })],
    ['empty token', JSON.stringify({ access_token: '', expires_in: 3600 })],
    [
      'missing expiry',
      JSON.stringify({ access_token: 'token-without-expiry' })
    ],
    ['short expiry', JSON.stringify({ access_token: 'token', expires_in: 60 })],
    [
      'non-integer expiry',
      JSON.stringify({ access_token: 'token', expires_in: 3600.5 })
    ]
  ])('拒絕異常 token 回應：%s', async (_label, body) => {
    const provider = createServiceAccountTokenProvider(
      JSON.stringify(SERVICE_ACCOUNT),
      fakeFetch([200], [body]).impl
    );
    await expect(provider()).rejects.toBeInstanceOf(CalendarError);
  });

  it('把 token endpoint 的網路失敗歸為可重試且不洩漏底層訊息', async () => {
    const provider = createServiceAccountTokenProvider(
      JSON.stringify(SERVICE_ACCOUNT),
      () => Promise.reject(new Error('secret upstream detail'))
    );
    await expect(provider()).rejects.toMatchObject({
      message: 'Token exchange request failed.',
      retryable: true
    });
  });

  it.each([408, 429, 500, 503])(
    '把 token endpoint 暫時性 HTTP %s 歸為可重試',
    async (status) => {
      const provider = createServiceAccountTokenProvider(
        JSON.stringify(SERVICE_ACCOUNT),
        fakeFetch([status]).impl
      );
      await expect(provider()).rejects.toMatchObject({ retryable: true });
    }
  );

  it.each([400, 401, 403])(
    '把 token endpoint 永久性 HTTP %s 歸為不可重試',
    async (status) => {
      const provider = createServiceAccountTokenProvider(
        JSON.stringify(SERVICE_ACCOUNT),
        fakeFetch([status]).impl
      );
      await expect(provider()).rejects.toMatchObject({ retryable: false });
    }
  );

  it('token HTTP 超時會中止並歸為可重試', async () => {
    const provider = createServiceAccountTokenProvider(
      JSON.stringify(SERVICE_ACCOUNT),
      abortingFetch,
      Date.now,
      5
    );
    await expect(provider()).rejects.toMatchObject({
      message: 'Token exchange request failed.',
      retryable: true
    });
  });

  it('拒絕可能跨過 worker 租約的 HTTP timeout', () => {
    expect(() =>
      createServiceAccountTokenProvider(
        JSON.stringify(SERVICE_ACCOUNT),
        fakeFetch([200]).impl,
        Date.now,
        60_001
      )
    ).toThrow(/between 1 and 60000 milliseconds/u);
  });
});
