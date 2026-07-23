/* eslint-disable no-console -- 這是本機一次性 CLI 煙霧測試，進度須印到 stdout。 */
/**
 * 本機煙霧測試：對「真實」Google Calendar 做一次 upsert 再 cancel，確認服務帳戶
 * 金鑰與日曆 ID 接得起來。**只由專案負責人在本機執行**（需自行 env 注入憑證）。
 *
 * 安全界線：
 * - 只建立並「隨即刪除」一筆合成、無 PII 的事件（標題僅診所名＋掛號別）。
 * - 未設定 `GOOGLE_CALENDAR_ID` / `GOOGLE_SERVICE_ACCOUNT_JSON` 時，
 *   `createCalendarPort` 會回退假日曆——此時腳本直接中止，不會對外呼叫。
 * - 不印出金鑰內容；失敗只印錯誤訊息。
 *
 * 執行方式見 docs/runbooks/calendar-go-live.md 的「本機煙霧測試」。
 */
import { calendarEventIdForAppointment } from '@beauessence/domain';
import {
  CLINIC_EVENT_COLOR_ID,
  InMemoryCalendar,
  clinicEventEnd,
  type CalendarProjectionRequest
} from './calendar-port.js';
import { createCalendarPort } from './google-calendar.js';

async function main(): Promise<void> {
  const port = createCalendarPort(process.env);
  if (port instanceof InMemoryCalendar) {
    console.error(
      '未偵測到 GOOGLE_CALENDAR_ID / GOOGLE_SERVICE_ACCOUNT_JSON，已回退假日曆。' +
        '請先注入憑證再執行；未對外呼叫。'
    );
    process.exitCode = 1;
    return;
  }

  const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const base: CalendarProjectionRequest = {
    idempotencyKey: calendarEventIdForAppointment('smoke-test'),
    correlationId: 'corr_calendar_smoke_test',
    causationId: 'audit_calendar_smoke_test',
    action: 'upsert',
    appointmentId: 'smoke-test',
    appointmentStatus: 'confirmed',
    startsAt,
    endsAt: clinicEventEnd(startsAt),
    bookingKind: 'initial',
    colorId: CLINIC_EVENT_COLOR_ID
  };

  console.log('1/2 upsert 一筆合成事件…');
  await port.project(base);
  console.log('    ✓ 已建立（或命中既有事件，冪等）。');

  console.log('2/2 cancel 同一事件…');
  await port.project({
    ...base,
    action: 'cancel',
    appointmentStatus: 'cancelled'
  });
  console.log('    ✓ 已刪除。寫入與刪除權限皆正常。');

  console.log(
    '煙霧測試完成：僅一筆合成、無 PII 的事件被建立並隨即刪除。' +
      '此測試不代表 D-009 核准，也不允許連正式／私人日曆或真實病患資料。'
  );
}

main().catch((error: unknown) => {
  console.error(
    '煙霧測試失敗：',
    error instanceof Error ? error.message : String(error)
  );
  process.exitCode = 1;
});
