/* eslint-disable no-console -- 這是本機一次性 CLI，進度必須印到 stdout。 */
/**
 * CAL-PILOT-001 匯入 CLI —— **由診所負責人在自己的電腦上執行**。
 *
 * 它做的事，一句話：把真實日曆在指定期間內的預約，消毒成「只有時間與代號」的
 * 假事件，寫進另一本專用測試日曆。
 *
 * ```text
 * 真實日曆 ──唯讀──> 消毒（丟掉姓名／電話／病症／地點）──> 測試日曆
 * ```
 *
 * ## 這支程式保證的事
 *
 * - **不寫來源日曆。** 讀取用戶端沒有任何寫入方法，型別上就辦不到。
 * - **不外傳。** 只連 Google，沒有其他網路目的地，不寫任何檔案。
 * - **不印出個資。** 畫面上只有數字與 reason code；連來源事件 ID 都不印。
 * - **重跑安全。** 同一筆事件重跑會撞到既有事件而被視為成功，不會變兩筆。
 *
 * 使用教學見 `docs/runbooks/cal-pilot-import.md`。
 */
import { readFileSync } from 'node:fs';

import { createServiceAccountTokenProvider } from '../google-calendar.js';
import {
  SOURCE_READONLY_SCOPE,
  SourceCalendarReader,
  TEST_WRITER_SCOPE,
  TestCalendarWriter
} from './pilot-calendar-clients.js';
import { sanitizeSourceEvent, summarize } from './pilot-sanitizer.js';

interface Config {
  readonly sourceCalendarId: string;
  readonly testCalendarId: string;
  readonly pseudonymKey: string;
  readonly windowDays: number;
  readonly maxEvents: number;
  /** 服務帳號金鑰檔的內容（不是路徑，也不是會過期的 access token）。 */
  readonly sourceKeyJson: string;
  readonly writerKeyJson: string;
}

/**
 * 讀金鑰檔。
 *
 * 收**檔案路徑**而不是金鑰內容本身：金鑰貼在指令列會進到 PowerShell 的歷史紀錄，
 * 檔案路徑不會。讀進來之後只留在記憶體裡，不寫出去也不印出來。
 */
function readKeyFile(path: string, label: string): string {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    throw new Error(`讀不到${label}金鑰檔：${path}——請確認路徑正確。`);
  }
  if (raw.trim() === '') throw new Error(`${label}金鑰檔是空的：${path}`);
  return raw;
}

function readConfig(env: NodeJS.ProcessEnv): Config {
  const required = (name: string): string => {
    const value = env[name]?.trim();
    if (value === undefined || value === '')
      throw new Error(`缺少環境變數 ${name}——請看 runbook 的「設定」那一節。`);
    return value;
  };

  const windowDays = Number(env['CAL_PILOT_WINDOW_DAYS'] ?? '14');
  if (!Number.isInteger(windowDays) || windowDays < 1 || windowDays > 60)
    throw new Error('CAL_PILOT_WINDOW_DAYS 必須是 1 到 60 之間的整數。');

  const maxEvents = Number(env['CAL_PILOT_MAX_EVENTS'] ?? '50');
  if (!Number.isInteger(maxEvents) || maxEvents < 1 || maxEvents > 500)
    throw new Error('CAL_PILOT_MAX_EVENTS 必須是 1 到 500 之間的整數。');

  const sourceCalendarId = required('CAL_PILOT_SOURCE_CALENDAR_ID');
  const testCalendarId = required('CAL_PILOT_TEST_CALENDAR_ID');
  if (sourceCalendarId === testCalendarId)
    throw new Error(
      '來源日曆與測試日曆不能是同一本。這是防呆：寫回來源會破壞營運資料。'
    );

  const pseudonymKey = required('CAL_PILOT_PSEUDONYM_KEY');
  if (pseudonymKey.length < 16)
    throw new Error('CAL_PILOT_PSEUDONYM_KEY 至少要 16 個字元才有意義。');

  const sourceKeyPath = required('CAL_PILOT_SOURCE_KEY_FILE');
  const writerKeyPath = required('CAL_PILOT_WRITER_KEY_FILE');
  if (sourceKeyPath === writerKeyPath)
    throw new Error(
      '讀取與寫入用的金鑰檔是同一個。必須是兩個不同的服務帳號，' +
        '否則同一把鑰匙既能讀真實日曆又能寫測試日曆，讀寫分離形同虛設。'
    );

  return {
    sourceCalendarId,
    testCalendarId,
    pseudonymKey,
    windowDays,
    maxEvents,
    sourceKeyJson: readKeyFile(sourceKeyPath, '讀取用'),
    writerKeyJson: readKeyFile(writerKeyPath, '寫入用')
  };
}

async function main(): Promise<void> {
  const config = readConfig(process.env);

  if (config.sourceKeyJson === config.writerKeyJson)
    throw new Error('兩個金鑰檔的內容一模一樣。必須是兩個不同的服務帳號。');

  const windowStart = new Date();
  const windowEnd = new Date(
    windowStart.getTime() + config.windowDays * 24 * 60 * 60 * 1000
  );
  const batchId = `b${Date.now().toString(36)}`;

  console.log(`批次 ${batchId}`);
  console.log(
    `期間：今天起 ${config.windowDays} 天；最多處理 ${config.maxEvents} 筆`
  );

  // 讀取端只換到唯讀 scope 的 token——就算金鑰檔被拿去別的地方用，它也寫不了。
  const reader = new SourceCalendarReader({
    calendarId: config.sourceCalendarId,
    getAccessToken: createServiceAccountTokenProvider(
      config.sourceKeyJson,
      undefined,
      undefined,
      undefined,
      SOURCE_READONLY_SCOPE
    )
  });

  console.log('1/3 讀取來源日曆（唯讀）…');
  const sourceEvents = await reader.listEvents(windowStart, windowEnd);
  console.log(`    讀到 ${sourceEvents.length} 筆`);

  if (sourceEvents.length > config.maxEvents)
    throw new Error(
      `讀到 ${sourceEvents.length} 筆，超過上限 ${config.maxEvents}。` +
        '請縮短期間或調高上限後重跑——這是刻意的煞車，避免一次搬太多。'
    );

  console.log('2/3 消毒（丟掉姓名、電話、病症、地點）…');
  const results = sourceEvents.map((event) =>
    sanitizeSourceEvent(event, {
      pseudonymKey: config.pseudonymKey,
      windowStart,
      windowEnd
    })
  );
  const summary = summarize(results);
  console.log(
    `    可複製 ${summary.copied} 筆，略過 ${summary.skipped} 筆` +
      (summary.skipped > 0
        ? `（原因：${JSON.stringify(summary.reasons)}）`
        : '')
  );

  console.log('3/3 寫入測試日曆…');
  const writer = new TestCalendarWriter({
    calendarId: config.testCalendarId,
    getAccessToken: createServiceAccountTokenProvider(
      config.writerKeyJson,
      undefined,
      undefined,
      undefined,
      TEST_WRITER_SCOPE
    ),
    batchId
  });

  let written = 0;
  for (const result of results) {
    if (!result.ok) continue;
    await writer.insert(result.event);
    written += 1;
  }

  console.log(`    已寫入 ${written} 筆`);
  console.log('');
  console.log(`完成。批次 ID：${batchId}`);
  console.log('要清除這批資料，把測試日曆裡描述含這個批次 ID 的事件刪掉即可。');
  console.log('來源日曆全程未被修改——讀取用戶端沒有任何寫入方法。');
}

main().catch((error: unknown) => {
  // 只印訊息，不印堆疊：堆疊可能夾帶參數內容。
  console.error('失敗：', error instanceof Error ? error.message : '未知錯誤');
  process.exitCode = 1;
});
