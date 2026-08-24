import { describe, expect, it } from 'vitest';

import {
  SOURCE_READONLY_SCOPE,
  SourceCalendarReader,
  TEST_WRITER_SCOPE,
  TestCalendarWriter
} from './pilot-calendar-clients.js';

function fakeFetch(responses: { status: number; body: string }[]): {
  impl: (
    url: string,
    init: { method: string; headers: Record<string, string>; body?: string }
  ) => Promise<{ status: number; text: () => Promise<string> }>;
  calls: { url: string; method: string; body?: string }[];
} {
  const calls: { url: string; method: string; body?: string }[] = [];
  let index = 0;
  const impl = (
    url: string,
    init: { method: string; headers: Record<string, string>; body?: string }
  ) => {
    calls.push({ url, method: init.method, body: init.body });
    const response = responses[index] ?? { status: 200, body: '{}' };
    index += 1;
    return Promise.resolve({
      status: response.status,
      text: () => Promise.resolve(response.body)
    });
  };
  return { impl, calls };
}

const token = () => Promise.resolve('fake-token');

describe('SourceCalendarReader — 結構上就寫不了', () => {
  // 這是本檔案最重要的斷言：來源用戶端**沒有**任何寫入方法。
  // 不是「有但不呼叫」，是根本不存在。
  it('沒有 insert／patch／delete／update／move 之類的方法', () => {
    const reader = new SourceCalendarReader({
      calendarId: 'source@group.calendar.google.com',
      getAccessToken: token
    });
    const names = [
      ...Object.getOwnPropertyNames(SourceCalendarReader.prototype),
      ...Object.keys(reader)
    ];
    for (const name of names)
      expect(name).not.toMatch(
        /insert|patch|update|delete|remove|move|write|create/iu
      );
  });

  it('公開介面只有 listEvents', () => {
    const methods = Object.getOwnPropertyNames(
      SourceCalendarReader.prototype
    ).filter((name) => name !== 'constructor');
    expect(methods).toEqual(['listEvents']);
  });

  it('只發 GET，且帶 singleEvents=true、showDeleted=false，不帶 syncToken', async () => {
    const { impl, calls } = fakeFetch([
      { status: 200, body: JSON.stringify({ items: [] }) }
    ]);
    const reader = new SourceCalendarReader({
      calendarId: 'source@group.calendar.google.com',
      getAccessToken: token,
      fetchImpl: impl
    });

    await reader.listEvents(
      new Date('2030-01-01T00:00:00.000Z'),
      new Date('2030-01-31T00:00:00.000Z')
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('GET');
    const url = new URL(calls[0]?.url ?? '');
    expect(url.searchParams.get('singleEvents')).toBe('true');
    expect(url.searchParams.get('showDeleted')).toBe('false');
    // Google 不允許 timeMin/timeMax 與 syncToken 併用；第一輪選有界時間窗。
    expect(url.searchParams.get('syncToken')).toBeNull();
    expect(url.searchParams.get('timeMin')).toBe('2030-01-01T00:00:00.000Z');
  });

  it('會跟著 nextPageToken 翻頁', async () => {
    const { impl, calls } = fakeFetch([
      {
        status: 200,
        body: JSON.stringify({ items: [{ id: 'a' }], nextPageToken: 'p2' })
      },
      { status: 200, body: JSON.stringify({ items: [{ id: 'b' }] }) }
    ]);
    const reader = new SourceCalendarReader({
      calendarId: 'source@group.calendar.google.com',
      getAccessToken: token,
      fetchImpl: impl
    });

    const events = await reader.listEvents(
      new Date('2030-01-01T00:00:00.000Z'),
      new Date('2030-01-31T00:00:00.000Z')
    );

    expect(events).toHaveLength(2);
    expect(calls).toHaveLength(2);
    expect(new URL(calls[1]?.url ?? '').searchParams.get('pageToken')).toBe(
      'p2'
    );
  });

  it('讀取失敗時不把 Google 的錯誤本文往外丟', async () => {
    const { impl } = fakeFetch([
      { status: 403, body: '{"error":{"message":"王測試 的日曆"}}' }
    ]);
    const reader = new SourceCalendarReader({
      calendarId: 'source@group.calendar.google.com',
      getAccessToken: token,
      fetchImpl: impl
    });

    // 只呼叫一次，然後直接檢查錯誤本身：呼叫兩次的話第二次會拿到假 fetch 的
    // 預設 200，測到的就不是這件事了。
    const error = await reader
      .listEvents(
        new Date('2030-01-01T00:00:00.000Z'),
        new Date('2030-01-31T00:00:00.000Z')
      )
      .then(
        () => undefined,
        (caught: unknown) => caught
      );

    expect(error).toBeInstanceOf(Error);
    const message = error instanceof Error ? error.message : '';
    expect(message).toMatch(/Source calendar read failed \(403\)/u);
    // Google 的錯誤本文可能夾帶事件標題等來源內容，不得往外傳。
    expect(message).not.toContain('王測試');
  });
});

describe('TestCalendarWriter', () => {
  it('寫出去的事件只有假名與批次 ID，沒有來源內容', async () => {
    const { impl, calls } = fakeFetch([{ status: 200, body: '{}' }]);
    const writer = new TestCalendarWriter({
      calendarId: 'test@group.calendar.google.com',
      getAccessToken: token,
      batchId: 'batch_0001',
      fetchImpl: impl
    });

    await writer.insert({
      pilotId: 'abcdef0123456789abcdef0123456789',
      displayLabel: '患者 A17',
      startsAt: '2030-01-10T02:00:00.000Z'
    });

    const body = JSON.parse(calls[0]?.body ?? '{}');
    expect(body.summary).toBe('患者 A17');
    expect(body.description).toBe('CAL-PILOT batch batch_0001');
    expect(body.start.timeZone).toBe('Asia/Taipei');
    // 不得有任何來源欄位被夾帶過去。
    for (const forbidden of [
      'attendees',
      'location',
      'organizer',
      'recurrence',
      'reminders'
    ])
      expect(body).not.toHaveProperty(forbidden);
  });

  it('409 視為冪等成功——重跑不會產生第二筆', async () => {
    const { impl } = fakeFetch([{ status: 409, body: '{}' }]);
    const writer = new TestCalendarWriter({
      calendarId: 'test@group.calendar.google.com',
      getAccessToken: token,
      batchId: 'batch_0001',
      fetchImpl: impl
    });

    await expect(
      writer.insert({
        pilotId: 'abcdef0123456789abcdef0123456789',
        displayLabel: '患者 A17',
        startsAt: '2030-01-10T02:00:00.000Z'
      })
    ).resolves.toBeUndefined();
  });
});

describe('scope 常數', () => {
  it('來源是唯讀 scope，目的地是事件寫入 scope，兩者不同', () => {
    expect(SOURCE_READONLY_SCOPE).toBe(
      'https://www.googleapis.com/auth/calendar.events.readonly'
    );
    expect(TEST_WRITER_SCOPE).toBe(
      'https://www.googleapis.com/auth/calendar.events'
    );
    expect(SOURCE_READONLY_SCOPE).not.toBe(TEST_WRITER_SCOPE);
    // 兩者都不得是最寬的整本日曆 scope。
    for (const scope of [SOURCE_READONLY_SCOPE, TEST_WRITER_SCOPE])
      expect(scope).not.toBe('https://www.googleapis.com/auth/calendar');
  });
});
