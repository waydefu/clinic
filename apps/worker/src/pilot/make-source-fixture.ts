/**
 * 產生「假的來源日曆」內容，給 CAL-PILOT 演練用。
 *
 * ## 為什麼需要這支
 *
 * 要驗證匯入工具真的能用，最安全的做法是**開兩本全新的 Google 日曆**：一本當
 * 假的來源、一本當目的地。整條管線照跑，但**完全沒有任何真實病患資料**。
 *
 * 這支程式產生一個 `.ics` 檔，你把它匯入那本假來源日曆，就有一整週看起來像
 * 真的的預約可以測。
 *
 * ## 裡面的資料全部是假的
 *
 * 姓名用「測試一」「測試二」這種明顯不是真人的字樣。時間照診所的實際營業時間
 * （週三～五 12:00–20:00、週六 10:00–18:00）產生，所以密度與分布像真的，但
 * **沒有任何一筆對應到真實的人或真實的預約**。
 *
 * ## 刻意包含的邊界情況
 *
 * 平順的資料測不出問題。這裡刻意混入匯入工具應該要正確處理或正確擋下的狀況：
 *
 * - 整天事件（休診公告）→ 應被擋下並計為 `all_day_unsupported`
 * - 跨日事件 → 應被擋下並計為 `multi_day_unsupported`
 * - 同時段兩筆（初診／回診兩條人力線）→ 應該都能通過
 * - 營業時間外的行政事項 → 會通過消毒，但工作臺可能不顯示（那本身是個發現）
 * - 長診（跨越午間）→ 應該通過
 *
 * 執行：`node apps/worker/dist/pilot/make-source-fixture.js > 假來源.ics`
 */

/** 明顯是假的姓名。刻意不用任何像真名的字串。 */
const FAKE_NAMES = [
  '測試一',
  '測試二',
  '測試三',
  '測試四',
  '測試五',
  '測試六',
  '測試七',
  '測試八',
  '測試九',
  '測試十'
];

const FAKE_ITEMS = ['初診諮詢', '回診追蹤', '術後檢查', '睡眠評估'];

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** iCalendar 的 UTC 時間格式：20300102T040000Z */
function icsStamp(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}00Z`
  );
}

/** 整天事件用的日期格式：20300102 */
function icsDate(date: Date): string {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
}

/** 台北固定 UTC+8、無日光節約。 */
function taipeiTime(day: Date, hour: number, minute: number): Date {
  return new Date(
    Date.UTC(
      day.getUTCFullYear(),
      day.getUTCMonth(),
      day.getUTCDate(),
      hour - 8,
      minute
    )
  );
}

interface Event {
  readonly uid: string;
  readonly summary: string;
  readonly start: Date;
  readonly end?: Date;
  readonly allDayStart?: Date;
  readonly allDayEnd?: Date;
}

function buildEvents(): Event[] {
  const events: Event[] = [];
  const today = new Date();
  // 從下一個週三開始，產出一整週。
  const start = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  );
  while (start.getUTCDay() !== 3) start.setUTCDate(start.getUTCDate() + 1);

  let seq = 0;
  const push = (event: Omit<Event, 'uid'>) => {
    seq += 1;
    events.push({ ...event, uid: `calpilot-fixture-${seq}@synthetic.invalid` });
  };

  // 週三～週五：12:00–20:00。每天密度不同，比較像真的。
  const weekdayPlan = [
    { offset: 0, count: 6 },
    { offset: 1, count: 9 },
    { offset: 2, count: 4 }
  ];
  for (const { offset, count } of weekdayPlan) {
    const day = new Date(start);
    day.setUTCDate(day.getUTCDate() + offset);
    for (let i = 0; i < count; i += 1) {
      const hour = 12 + Math.floor(i / 2);
      const minute = i % 2 === 0 ? 0 : 30;
      const startsAt = taipeiTime(day, hour, minute);
      push({
        summary: `${FAKE_NAMES[(seq + i) % FAKE_NAMES.length]} ${FAKE_ITEMS[i % FAKE_ITEMS.length]}`,
        start: startsAt,
        end: new Date(startsAt.getTime() + 30 * 60_000)
      });
    }
  }

  // 週六：10:00–18:00。
  const saturday = new Date(start);
  saturday.setUTCDate(saturday.getUTCDate() + 3);
  for (let i = 0; i < 5; i += 1) {
    const startsAt = taipeiTime(saturday, 10 + i, 0);
    push({
      summary: `${FAKE_NAMES[i % FAKE_NAMES.length]} ${FAKE_ITEMS[i % FAKE_ITEMS.length]}`,
      start: startsAt,
      end: new Date(startsAt.getTime() + 30 * 60_000)
    });
  }

  // ── 以下是刻意放進來的邊界情況 ──

  // 同時段兩筆：初診與回診是兩條人力線，兩筆都該通過。
  const wed = new Date(start);
  push({
    summary: `${FAKE_NAMES[8]} 初診諮詢（同時段測試）`,
    start: taipeiTime(wed, 15, 0),
    end: new Date(taipeiTime(wed, 15, 0).getTime() + 30 * 60_000)
  });

  // 長診：跨越兩個時段，應該通過。
  const thu = new Date(start);
  thu.setUTCDate(thu.getUTCDate() + 1);
  push({
    summary: `${FAKE_NAMES[9]} 長時間療程（跨時段測試）`,
    start: taipeiTime(thu, 16, 0),
    end: new Date(taipeiTime(thu, 16, 0).getTime() + 120 * 60_000)
  });

  // 營業時間外的行政事項：會通過消毒，但工作臺可能不顯示——那本身是個發現。
  push({
    summary: '內部會議（營業時間外測試）',
    start: taipeiTime(thu, 21, 0),
    end: new Date(taipeiTime(thu, 21, 0).getTime() + 60 * 60_000)
  });

  // 整天事件：應被擋下，計為 all_day_unsupported。
  const friday = new Date(start);
  friday.setUTCDate(friday.getUTCDate() + 2);
  const fridayNext = new Date(friday);
  fridayNext.setUTCDate(fridayNext.getUTCDate() + 1);
  push({
    summary: '休診公告（整天事件測試）',
    start: friday,
    allDayStart: friday,
    allDayEnd: fridayNext
  });

  // 跨日事件：應被擋下，計為 multi_day_unsupported。
  push({
    summary: '設備維護（跨日測試）',
    start: taipeiTime(friday, 22, 0),
    end: taipeiTime(fridayNext, 2, 0)
  });

  return events;
}

function toIcs(events: readonly Event[]): string {
  const now = icsStamp(new Date());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CAL-PILOT//synthetic fixture//ZH-TW',
    'CALSCALE:GREGORIAN'
  ];

  for (const event of events) {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${event.uid}`);
    lines.push(`DTSTAMP:${now}`);
    lines.push(`SUMMARY:${event.summary}`);
    if (event.allDayStart !== undefined && event.allDayEnd !== undefined) {
      lines.push(`DTSTART;VALUE=DATE:${icsDate(event.allDayStart)}`);
      lines.push(`DTEND;VALUE=DATE:${icsDate(event.allDayEnd)}`);
    } else {
      lines.push(`DTSTART:${icsStamp(event.start)}`);
      if (event.end !== undefined) lines.push(`DTEND:${icsStamp(event.end)}`);
    }
    lines.push(
      'DESCRIPTION:CAL-PILOT 合成測試資料。這不是真實預約，也沒有對應任何真實的人。'
    );
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}

const events = buildEvents();
process.stdout.write(toIcs(events));
console.error(
  `已產生 ${events.length} 筆合成事件（含刻意的邊界情況：整天、跨日、同時段、營業時間外）。`
);
