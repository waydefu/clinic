import { pathToFileURL } from 'node:url';

/**
 * 產生「假的來源日曆」內容，給 CAL-PILOT 演練用（D-32 可設定參數與邊界測試）。
 *
 * 姓名與項目預設用「測試一」等明顯假值；若傳入自訂清單或日期與時長參數，
 * 一律 fail closed 檢查格式與範圍，並拒絕任何疑似手機、Email 或身分證字號。
 *
 * 執行：`node apps/worker/dist/pilot/make-source-fixture.js > 假來源.ics`
 */

const DEFAULT_FAKE_NAMES = [
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
] as const;

const DEFAULT_FAKE_ITEMS = [
  '初診諮詢',
  '回診追蹤',
  '術後檢查',
  '睡眠評估'
] as const;

const DEFAULT_DURATION_MINUTES = 30;
const MIN_DURATION_MINUTES = 15;
const MAX_DURATION_MINUTES = 240;
const MAX_DAILY_COUNT = 32;
const DEFAULT_WEEKDAY_COUNTS: readonly [number, number, number] = [6, 9, 4];
const DEFAULT_SATURDAY_COUNT = 5;
const PII_LIKE_PATTERN = /(?:09\d{8}|@|[A-Z][12]\d{8})/iu;
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const UTC_ISO_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z$/;

export interface SourceFixtureConfig {
  readonly anchorDate?: string;
  readonly defaultDurationMinutes?: number;
  readonly weekdayCounts?: readonly [number, number, number];
  readonly saturdayCount?: number;
  readonly syntheticNames?: readonly string[];
  readonly syntheticItems?: readonly string[];
  readonly generatedAt?: string;
  readonly includeEdgeCases?: boolean;
}

export interface SourceFixtureEvent {
  readonly uid: string;
  readonly summary: string;
  readonly start: Date;
  readonly end?: Date;
  readonly allDayStart?: Date;
  readonly allDayEnd?: Date;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function parseExactUtcDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  label: string
): Date {
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second
  ) {
    throw new Error(`Invalid calendar date or time for ${label}.`);
  }
  return date;
}

function parseExactDecimal(raw: string | undefined, label: string): number {
  if (raw === undefined) {
    throw new Error(`Missing date segment for ${label}.`);
  }
  return Number.parseInt(raw, 10);
}

function parseCalendarDateOrUtcIso(value: string, label: string): Date {
  const dateOnly = DATE_ONLY_PATTERN.exec(value);
  if (dateOnly !== null) {
    return parseExactUtcDate(
      parseExactDecimal(dateOnly[1], label),
      parseExactDecimal(dateOnly[2], label),
      parseExactDecimal(dateOnly[3], label),
      0,
      0,
      0,
      label
    );
  }
  const isoMatch = UTC_ISO_PATTERN.exec(value);
  if (isoMatch === null) {
    throw new Error(`Expected YYYY-MM-DD or UTC ISO timestamp for ${label}.`);
  }
  parseExactUtcDate(
    parseExactDecimal(isoMatch[1], label),
    parseExactDecimal(isoMatch[2], label),
    parseExactDecimal(isoMatch[3], label),
    parseExactDecimal(isoMatch[4], label),
    parseExactDecimal(isoMatch[5], label),
    parseExactDecimal(isoMatch[6], label),
    label
  );
  const parsedMs = Date.parse(value);
  if (!Number.isFinite(parsedMs)) {
    throw new Error(`Invalid timestamp for ${label}.`);
  }
  return new Date(parsedMs);
}

function validateBoundedInt(
  value: number,
  min: number,
  max: number,
  label: string
): number {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${label} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

function validateSyntheticList(
  values: readonly string[] | undefined,
  fallback: readonly string[],
  label: string
): readonly string[] {
  if (values === undefined) return fallback;
  if (values.length === 0) {
    throw new Error(`${label} must not be empty.`);
  }
  for (const item of values) {
    if (typeof item !== 'string' || item.trim() === '') {
      throw new Error(`${label} entries must be non-empty strings.`);
    }
    if (PII_LIKE_PATTERN.test(item)) {
      throw new Error(`${label} must not contain PII-like values.`);
    }
  }
  return values;
}

function nextWednesdayUtc(): Date {
  const today = new Date();
  const start = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  );
  while (start.getUTCDay() !== 3) start.setUTCDate(start.getUTCDate() + 1);
  return start;
}

/** iCalendar 的 UTC 時間格式：20300102T040000Z */
function icsStamp(date: Date): string {
  const yyyy = date.getUTCFullYear();
  const mm = pad(date.getUTCMonth() + 1);
  const dd = pad(date.getUTCDate());
  const hh = pad(date.getUTCHours());
  const min = pad(date.getUTCMinutes());
  return `${yyyy}${mm}${dd}T${hh}${min}00Z`;
}

/** 整天事件用的日期格式：20300102 */
function icsDate(date: Date): string {
  const yyyy = date.getUTCFullYear();
  const mm = pad(date.getUTCMonth() + 1);
  const dd = pad(date.getUTCDate());
  return `${yyyy}${mm}${dd}`;
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

function validatedConfig(config: SourceFixtureConfig = {}): {
  readonly anchor: Date;
  readonly durationMinutes: number;
  readonly weekdayCounts: readonly [number, number, number];
  readonly saturdayCount: number;
  readonly names: readonly string[];
  readonly items: readonly string[];
  readonly generatedAt: Date;
  readonly includeEdgeCases: boolean;
} {
  const anchor =
    config.anchorDate === undefined
      ? nextWednesdayUtc()
      : parseCalendarDateOrUtcIso(config.anchorDate, 'anchorDate');
  const durationMinutes = validateBoundedInt(
    config.defaultDurationMinutes ?? DEFAULT_DURATION_MINUTES,
    MIN_DURATION_MINUTES,
    MAX_DURATION_MINUTES,
    'defaultDurationMinutes'
  );
  const counts = config.weekdayCounts ?? DEFAULT_WEEKDAY_COUNTS;
  if (!Array.isArray(counts) || counts.length !== 3) {
    throw new Error('weekdayCounts must have exactly 3 entries.');
  }
  const weekdayCounts: readonly [number, number, number] = [
    validateBoundedInt(counts[0], 0, MAX_DAILY_COUNT, 'weekdayCounts[0]'),
    validateBoundedInt(counts[1], 0, MAX_DAILY_COUNT, 'weekdayCounts[1]'),
    validateBoundedInt(counts[2], 0, MAX_DAILY_COUNT, 'weekdayCounts[2]')
  ];
  const saturdayCount = validateBoundedInt(
    config.saturdayCount ?? DEFAULT_SATURDAY_COUNT,
    0,
    MAX_DAILY_COUNT,
    'saturdayCount'
  );
  const names = validateSyntheticList(
    config.syntheticNames,
    DEFAULT_FAKE_NAMES,
    'syntheticNames'
  );
  const items = validateSyntheticList(
    config.syntheticItems,
    DEFAULT_FAKE_ITEMS,
    'syntheticItems'
  );
  const generatedAt =
    config.generatedAt !== undefined
      ? parseCalendarDateOrUtcIso(config.generatedAt, 'generatedAt')
      : config.anchorDate !== undefined
        ? anchor
        : new Date();
  return {
    anchor,
    durationMinutes,
    weekdayCounts,
    saturdayCount,
    names,
    items,
    generatedAt,
    includeEdgeCases: config.includeEdgeCases ?? true
  };
}

export function buildSourceFixtureEvents(
  config: SourceFixtureConfig = {}
): SourceFixtureEvent[] {
  const resolved = validatedConfig(config);
  const durationMs = resolved.durationMinutes * 60_000;
  const events: SourceFixtureEvent[] = [];
  let seq = 0;
  const push = (event: Omit<SourceFixtureEvent, 'uid'>) => {
    seq += 1;
    events.push({
      ...event,
      uid: `calpilot-fixture-${seq}@synthetic.invalid`
    });
  };
  const labelFor = (nameIndex: number, itemIndex: number): string => {
    const name = resolved.names[nameIndex % resolved.names.length] ?? '測試';
    const item = resolved.items[itemIndex % resolved.items.length] ?? '合成';
    return `${name} ${item}`;
  };

  for (let offset = 0; offset < 3; offset += 1) {
    const count = resolved.weekdayCounts[offset] ?? 0;
    const day = new Date(resolved.anchor);
    day.setUTCDate(day.getUTCDate() + offset);
    for (let i = 0; i < count; i += 1) {
      const hour = 12 + Math.floor(i / 2);
      const minute = i % 2 === 0 ? 0 : 30;
      const startsAt = taipeiTime(day, hour, minute);
      push({
        summary: labelFor(seq + i, i),
        start: startsAt,
        end: new Date(startsAt.getTime() + durationMs)
      });
    }
  }

  const saturday = new Date(resolved.anchor);
  saturday.setUTCDate(saturday.getUTCDate() + 3);
  for (let i = 0; i < resolved.saturdayCount; i += 1) {
    const startsAt = taipeiTime(saturday, 10 + i, 0);
    push({
      summary: labelFor(i, i),
      start: startsAt,
      end: new Date(startsAt.getTime() + durationMs)
    });
  }

  if (!resolved.includeEdgeCases) return events;

  const wed = new Date(resolved.anchor);
  const concurrentStart = taipeiTime(wed, 15, 0);
  push({
    summary: `${labelFor(8, 0)}（同時段測試）`,
    start: concurrentStart,
    end: new Date(concurrentStart.getTime() + durationMs)
  });

  const thu = new Date(resolved.anchor);
  thu.setUTCDate(thu.getUTCDate() + 1);
  const longStart = taipeiTime(thu, 16, 0);
  const longName = resolved.names[9 % resolved.names.length] ?? '測試';
  push({
    summary: `${longName} 長時間療程`,
    start: longStart,
    end: new Date(longStart.getTime() + 120 * 60_000)
  });

  const offHoursStart = taipeiTime(thu, 21, 0);
  push({
    summary: '內部會議（營業時間外測試）',
    start: offHoursStart,
    end: new Date(offHoursStart.getTime() + 60 * 60_000)
  });

  const friday = new Date(resolved.anchor);
  friday.setUTCDate(friday.getUTCDate() + 2);
  const fridayNext = new Date(friday);
  fridayNext.setUTCDate(fridayNext.getUTCDate() + 1);
  push({
    summary: '休診公告（整天事件測試）',
    start: friday,
    allDayStart: friday,
    allDayEnd: fridayNext
  });

  push({
    summary: '設備維護（跨日測試）',
    start: taipeiTime(friday, 22, 0),
    end: taipeiTime(fridayNext, 2, 0)
  });

  return events;
}

export function toIcs(
  events: readonly SourceFixtureEvent[],
  generatedAt: Date = new Date()
): string {
  const now = icsStamp(generatedAt);
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
    lines.push('DESCRIPTION:CAL-PILOT 合成測試資料（非真實預約）。');
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}

export function renderSourceFixtureIcs(
  config: SourceFixtureConfig = {}
): string {
  const resolved = validatedConfig(config);
  return toIcs(buildSourceFixtureEvents(config), resolved.generatedAt);
}

export function parseSourceFixtureCliArgs(
  argv: readonly string[]
): SourceFixtureConfig {
  let anchorDate: string | undefined;
  let defaultDurationMinutes: number | undefined;
  let saturdayCount: number | undefined;
  let generatedAt: string | undefined;
  let includeEdgeCases: boolean | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === undefined) continue;
    const readNext = (): string => {
      const next = argv[i + 1];
      if (next === undefined) {
        throw new Error(`Missing value for ${flag}.`);
      }
      i += 1;
      return next;
    };
    const parseIntFlag = (): number => {
      const raw = readNext();
      if (!/^-?\d+$/.test(raw)) {
        throw new Error(`Invalid integer for ${flag}: ${raw}`);
      }
      return Number.parseInt(raw, 10);
    };
    if (flag === '--anchor-date') anchorDate = readNext();
    else if (flag === '--duration-minutes') {
      defaultDurationMinutes = parseIntFlag();
    } else if (flag === '--saturday-count') {
      saturdayCount = parseIntFlag();
    } else if (flag === '--generated-at') generatedAt = readNext();
    else if (flag === '--no-edge-cases') includeEdgeCases = false;
    else throw new Error(`Unknown argument: ${flag}`);
  }

  return {
    ...(anchorDate === undefined ? {} : { anchorDate }),
    ...(defaultDurationMinutes === undefined
      ? {}
      : { defaultDurationMinutes }),
    ...(saturdayCount === undefined ? {} : { saturdayCount }),
    ...(generatedAt === undefined ? {} : { generatedAt }),
    ...(includeEdgeCases === undefined ? {} : { includeEdgeCases })
  };
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const config = parseSourceFixtureCliArgs(process.argv.slice(2));
  const events = buildSourceFixtureEvents(config);
  process.stdout.write(renderSourceFixtureIcs(config));
  console.error(
    `已產生 ${events.length} 筆合成事件（僅供 CAL-PILOT 合成演練）。`
  );
}
