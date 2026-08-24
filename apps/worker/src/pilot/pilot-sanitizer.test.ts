import { describe, expect, it } from 'vitest';

import {
  type SourceEventShape,
  displayLabelFor,
  pilotIdFor,
  sanitizeSourceEvent,
  summarize
} from './pilot-sanitizer.js';

const KEY = 'synthetic-pilot-key-not-a-real-secret';
const WINDOW = {
  pseudonymKey: KEY,
  windowStart: new Date('2030-01-01T00:00:00.000Z'),
  windowEnd: new Date('2030-01-31T23:59:59.000Z')
};

/**
 * 合成來源事件。
 *
 * 刻意帶著 summary／description／attendees／location——真實日曆一定有這些，
 * 測試就必須有，否則「這些欄位不會外流」根本沒被測到。值全部是明顯假的。
 */
const sourceEvent = (
  overrides: Partial<SourceEventShape> = {}
): SourceEventShape & Record<string, unknown> => ({
  id: 'synthetic_event_0001',
  status: 'confirmed',
  start: { dateTime: '2030-01-10T02:00:00.000Z' },
  end: { dateTime: '2030-01-10T03:00:00.000Z' },
  summary: '王測試 鼻中膈手術',
  description: '電話 0912345678，身分證 A123456789',
  location: '台北市某處',
  attendees: [{ email: 'patient@example.com', displayName: '王測試' }],
  ...overrides
});

describe('sanitizeSourceEvent — 允許通過的內容', () => {
  it('只輸出 pilotId、displayLabel 與 startsAt 三個欄位', () => {
    const result = sanitizeSourceEvent(sourceEvent(), WINDOW);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.event).sort()).toEqual([
      'displayLabel',
      'pilotId',
      'startsAt'
    ]);
  });

  // 這是整支檔案最重要的一個測試。
  it('姓名、電話、身分證、手術名稱、地點、與會者都不得出現在輸出裡', () => {
    const result = sanitizeSourceEvent(sourceEvent(), WINDOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const serialized = JSON.stringify(result.event);
    for (const secret of [
      '王測試',
      '0912345678',
      'A123456789',
      '鼻中膈',
      '台北市某處',
      'patient@example.com'
    ])
      expect(serialized).not.toContain(secret);
  });

  it('來源 event ID 本身也不得出現在輸出裡', () => {
    const result = sanitizeSourceEvent(sourceEvent(), WINDOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(JSON.stringify(result.event)).not.toContain('synthetic_event_0001');
  });

  it('輸出正規化的 UTC ISO 時間', () => {
    const result = sanitizeSourceEvent(
      sourceEvent({ start: { dateTime: '2030-01-10T10:00:00+08:00' } }),
      WINDOW
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.event.startsAt).toBe('2030-01-10T02:00:00.000Z');
  });
});

describe('sanitizeSourceEvent — fail closed', () => {
  it.each([
    ['缺 ID', { id: undefined }, 'missing_source_id'],
    ['已取消', { status: 'cancelled' }, 'cancelled_event'],
    [
      '整天事件',
      { start: { date: '2030-01-10' }, end: { date: '2030-01-11' } },
      'all_day_unsupported'
    ],
    ['時間格式錯誤', { start: { dateTime: 'not-a-time' } }, 'malformed_time'],
    ['缺開始時間', { start: undefined }, 'malformed_time'],
    [
      'recurrence master',
      { recurrence: ['RRULE:FREQ=WEEKLY'] },
      'recurring_master'
    ],
    [
      '跨日事件',
      {
        start: { dateTime: '2030-01-10T15:00:00.000Z' },
        end: { dateTime: '2030-01-11T02:00:00.000Z' }
      },
      'multi_day_unsupported'
    ],
    [
      '結束早於開始',
      {
        start: { dateTime: '2030-01-10T05:00:00.000Z' },
        end: { dateTime: '2030-01-10T04:00:00.000Z' }
      },
      'malformed_time'
    ],
    // 這兩個案例要連 end 一起覆寫。只改 start 的話會先撞上跨日／結束早於開始，
    // 那樣測到的是別的規則，不是時間窗。
    [
      '窗前',
      {
        start: { dateTime: '2029-12-31T00:00:00.000Z' },
        end: { dateTime: '2029-12-31T01:00:00.000Z' }
      },
      'outside_window'
    ],
    [
      '窗後',
      {
        start: { dateTime: '2030-02-05T00:00:00.000Z' },
        end: { dateTime: '2030-02-05T01:00:00.000Z' }
      },
      'outside_window'
    ]
  ])('%s → 拒絕並回報 %s', (_label, overrides, reason) => {
    const result = sanitizeSourceEvent(
      sourceEvent(overrides as Partial<SourceEventShape>),
      WINDOW
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe(reason);
  });

  // 整天事件若被硬轉，會在工作臺上顯示成憑空捏造的「00:00 預約」。
  it('整天事件絕不被轉成 00:00 的時段', () => {
    const result = sanitizeSourceEvent(
      sourceEvent({ start: { date: '2030-01-10' }, end: undefined }),
      WINDOW
    );
    expect(result.ok).toBe(false);
  });
});

describe('假名', () => {
  it('同一來源 ID ＋ 同一金鑰 → 永遠相同（冪等重跑靠這個）', () => {
    expect(pilotIdFor('event_a', KEY)).toBe(pilotIdFor('event_a', KEY));
    expect(displayLabelFor(pilotIdFor('event_a', KEY))).toBe(
      displayLabelFor(pilotIdFor('event_a', KEY))
    );
  });

  it('不同來源 ID → 不同假名', () => {
    expect(pilotIdFor('event_a', KEY)).not.toBe(pilotIdFor('event_b', KEY));
  });

  // 換金鑰就全部斷開，所以銷毀金鑰本身就是一種消滅連結性的手段。
  it('換一把金鑰 → 完全不同的結果', () => {
    expect(pilotIdFor('event_a', KEY)).not.toBe(
      pilotIdFor('event_a', 'another-synthetic-key')
    );
  });

  it('假名不含來源 ID 明文，且格式為「患者 X##」', () => {
    const pilotId = pilotIdFor('synthetic_event_0001', KEY);
    const label = displayLabelFor(pilotId);
    expect(label).not.toContain('synthetic_event_0001');
    expect(label).toMatch(/^患者 [A-Z]\d{2}$/u);
  });
});

describe('批次統計', () => {
  it('只產生數字與 reason code，不含任何來源內容', () => {
    const results = [
      sanitizeSourceEvent(sourceEvent(), WINDOW),
      sanitizeSourceEvent(sourceEvent({ status: 'cancelled' }), WINDOW),
      sanitizeSourceEvent(
        sourceEvent({ start: { date: '2030-01-10' } }),
        WINDOW
      )
    ];
    const summary = summarize(results);

    expect(summary).toEqual({
      total: 3,
      copied: 1,
      skipped: 2,
      reasons: { cancelled_event: 1, all_day_unsupported: 1 }
    });
    const serialized = JSON.stringify(summary);
    for (const secret of ['王測試', '0912345678', 'synthetic_event_0001'])
      expect(serialized).not.toContain(secret);
  });
});
