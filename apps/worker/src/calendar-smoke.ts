/* eslint-disable no-console -- 這是本機一次性 CLI 煙霧測試，進度須印到 stdout。 */
/**
 * 本機煙霧測試：對「真實」Google Calendar 做一次 upsert 再 cancel，確認服務帳戶
 * 金鑰與日曆 ID 接得起來。**只由專案負責人在本機執行**（需自行 env 注入憑證）。
 *
 * 安全界線：
 * - 只建立並「隨即刪除」一筆合成、無 PII 的事件（標題僅診所名＋掛號別）。
 * - 未設定 Calendar 整合時，`createCalendarPort` 會回退假日曆——此時腳本直接
 *   中止，不會對外呼叫。半套設定則直接失敗，不偽裝成假日曆成功。
 * - 不印出金鑰內容；失敗只印錯誤訊息。
 *
 * 執行方式見 docs/runbooks/calendar-go-live.md 的「本機煙霧測試」。
 */
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { calendarEventIdForAppointment } from '@beauessence/domain';
import {
  CLINIC_EVENT_COLOR_ID,
  InMemoryCalendar,
  clinicEventEnd,
  type CalendarPort,
  type CalendarProjectionRequest
} from './calendar-port.js';
import { createCalendarPort } from './google-calendar.js';

export interface CalendarSmokeOptions {
  readonly env?: Record<string, string | undefined>;
  readonly port?: CalendarPort;
  readonly runId?: string;
  readonly now?: () => number;
  readonly log?: (line: string) => void;
}

export interface CalendarSmokeResult {
  readonly appointmentId: string;
  readonly eventId: string;
}

export async function runCalendarSmoke(
  options: CalendarSmokeOptions = {}
): Promise<CalendarSmokeResult> {
  const log = options.log ?? ((line: string) => console.log(line));
  const port = options.port ?? createCalendarPort(options.env ?? process.env);
  if (port instanceof InMemoryCalendar) {
    throw new Error(
      '未偵測到 Google Calendar 測試整合（CLOUD_ADC 或服務帳號 JSON），' +
        '已回退假日曆。請先設定 GOOGLE_CALENDAR_INTEGRATION_MODE=test ' +
        '並注入憑證；未對外呼叫。'
    );
  }

  const rawRunId = (options.runId ?? randomUUID()).replace(
    /[^a-zA-Z0-9_-]/gu,
    ''
  );
  if (rawRunId.length === 0) {
    throw new Error('Smoke run identifier must not be empty.');
  }
  const appointmentId = `smoke-test-${rawRunId}`;
  const eventId = calendarEventIdForAppointment(appointmentId);
  const nowMs = (options.now ?? Date.now)();
  const startsAt = new Date(nowMs + 24 * 60 * 60 * 1000).toISOString();
  const base: CalendarProjectionRequest = {
    idempotencyKey: eventId,
    correlationId: `corr_calendar_smoke_${rawRunId}`,
    causationId: `audit_calendar_smoke_${rawRunId}`,
    action: 'upsert',
    appointmentId,
    appointmentStatus: 'confirmed',
    startsAt,
    endsAt: clinicEventEnd(startsAt),
    bookingKind: 'initial',
    colorId: CLINIC_EVENT_COLOR_ID
  };

  log('1/2 upsert 一筆全新合成事件（不允許 409 回退）…');
  await port.project(base, { allowConflictFallback: false });
  log('    ✓ 已建立全新合成事件。');

  log('2/2 cancel 同一事件…');
  await port.project({
    ...base,
    action: 'cancel',
    appointmentStatus: 'cancelled'
  });
  log('    ✓ 已刪除。寫入與刪除權限皆正常。');

  log(
    '煙霧測試完成：僅一筆合成、無 PII 的事件被建立並隨即刪除。' +
      '此測試不代表 D-009 核准，也不允許連正式／私人日曆或真實病患資料。'
  );
  return { appointmentId, eventId };
}

const entryPath = process.argv[1];
if (
  entryPath !== undefined &&
  import.meta.url === pathToFileURL(resolve(entryPath)).href
) {
  runCalendarSmoke().catch((error: unknown) => {
    console.error(
      '煙霧測試失敗：',
      error instanceof Error ? error.message : String(error)
    );
    process.exitCode = 1;
  });
}
