import { createHmac } from 'node:crypto';

/**
 * CAL-PILOT-001 的消毒層——這支檔案就是整個試辦的保護機制本身。
 *
 * ## 它在整條流程的哪個位置
 *
 * ```text
 * 真實診所日曆 ──唯讀──> [ 本檔案 ] ──> 專用測試日曆 ──> 工作臺
 *                          ↑
 *                    真實個資到這裡為止
 * ```
 *
 * 上游拿到的是完整的 Google Event：標題、描述、與會者、地點，全都在裡面。
 * **下游只會拿到本檔案明確允許的欄位**，其餘一律不通過——不是「盡量不複製」，
 * 是預設拒絕。
 *
 * ## 三個不可妥協的設計選擇
 *
 * 1. **白名單，不是黑名單。** `sanitizeSourceEvent` 只讀它認得的欄位，其他一概
 *    不看。黑名單會在 Google 新增欄位那天默默漏掉；白名單不會。
 * 2. **fail closed。** 看不懂就拒絕並計數，不猜、不盡力而為。整天事件、跨日
 *    事件、時間格式不對、缺 ID——全部擋下並回報 reason code。
 * 3. **假名用 HMAC，不用雜湊。** 純 `sha256(姓名)` 或 `sha256(電話)` 擋不住字典
 *    攻擊：台灣手機號碼只有十位數、常見姓名就那些，全部枚舉一遍是幾秒鐘的事。
 *    加了金鑰才有意義，而金鑰只存在執行者的環境變數裡。
 *
 * ## 這支檔案不做的事
 *
 * 不連網、不讀憑證、不寫檔。它是純函式，因此可以完全用合成 fixture 測到滿，
 * 不需要任何真實日曆資料——這正是它能被信任的原因。
 */

/** 允許複製的目的地事件。欄位就這些，沒有其他。 */
export interface PilotEvent {
  /** HMAC 導出的不透明 ID；不可還原回來源 event ID。 */
  readonly pilotId: string;
  /** 畫面上顯示的假名，例如「患者 A17」。 */
  readonly displayLabel: string;
  /** RFC3339，已正規化。 */
  readonly startsAt: string;
}

/**
 * 拒絕原因。**固定列舉，不是自由文字**——自由文字是個資最後偷渡出去的路徑
 * （資料分類文件：free text 會把紀錄升級成 P3）。
 */
export type PilotRejectionReason =
  | 'missing_source_id'
  | 'all_day_unsupported'
  | 'multi_day_unsupported'
  | 'malformed_time'
  | 'outside_window'
  | 'cancelled_event'
  | 'recurring_master';

export type SanitizeResult =
  | { readonly ok: true; readonly event: PilotEvent }
  | { readonly ok: false; readonly reason: PilotRejectionReason };

/**
 * 來源事件裡**本檔案唯一會讀的欄位**。
 *
 * 刻意不宣告 summary／description／attendees／location——型別上就讀不到，
 * 未來有人想「順手帶一個欄位過去」會先撞到型別錯誤，而不是默默通過。
 */
export interface SourceEventShape {
  readonly id?: unknown;
  readonly status?: unknown;
  readonly start?: { readonly dateTime?: unknown; readonly date?: unknown };
  readonly end?: { readonly dateTime?: unknown; readonly date?: unknown };
  /** 只用來判斷是不是 recurrence master，不會被複製。 */
  readonly recurrence?: unknown;
}

export interface SanitizeOptions {
  /** HMAC 金鑰。只從執行者的環境注入，絕不進版控。 */
  readonly pseudonymKey: string;
  /** 允許的時間窗（含）。超出範圍的事件擋下並計為 outside_window。 */
  readonly windowStart: Date;
  readonly windowEnd: Date;
}

const DISPLAY_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * 由來源 ID 導出穩定的不透明 ID。
 *
 * 同一把金鑰＋同一個來源 ID 永遠得到同一個結果（冪等重跑靠這個去重），
 * 換一把金鑰就全部不同（所以銷毀金鑰本身就是一種消滅連結性的手段）。
 */
export function pilotIdFor(sourceId: string, key: string): string {
  return createHmac('sha256', key).update(sourceId).digest('hex').slice(0, 32);
}

/**
 * 由不透明 ID 導出人看得懂的假名，例如「患者 A17」。
 *
 * 只從 HMAC 輸出取值，**不碰姓名、電話或任何來源明文**——所以它不是「遮蔽過的
 * 姓名」，而是與姓名完全無關的代號。工作臺需要區分「這兩格是不是同一個人」，
 * 這個標籤剛好夠用，也僅止於此。
 */
export function displayLabelFor(pilotId: string): string {
  const letter = DISPLAY_LETTERS[parseInt(pilotId.slice(0, 2), 16) % 24] ?? 'A';
  const number = parseInt(pilotId.slice(2, 6), 16) % 100;
  return `患者 ${letter}${String(number).padStart(2, '0')}`;
}

/** 台北是 UTC+8 且無日光節約，所以固定偏移是安全的。 */
const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;

function taipeiDayKey(iso: string): string {
  return new Date(Date.parse(iso) + TAIPEI_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
}

/**
 * 把一筆來源事件消毒成可寫入測試日曆的最小事件，或說明為什麼拒絕。
 *
 * 呼叫端**不得**在拒絕時回頭去讀原始事件補救——拒絕就是拒絕，計數就好。
 */
export function sanitizeSourceEvent(
  source: SourceEventShape,
  options: SanitizeOptions
): SanitizeResult {
  if (!isNonEmptyString(source.id))
    return { ok: false, reason: 'missing_source_id' };

  // 已取消的事件不進試辦：它在營運上已經不存在，複製過去只會製造幻影。
  if (source.status === 'cancelled')
    return { ok: false, reason: 'cancelled_event' };

  // recurrence master 不是一個真的時段，是一條規則。只收展開後的 instance
  // （呼叫端應以 singleEvents=true 取得），master 一律擋下。
  if (source.recurrence !== undefined && source.recurrence !== null)
    return { ok: false, reason: 'recurring_master' };

  // 整天事件用 `date` 而非 `dateTime`。工作臺以時鐘時間定位事件，硬轉會讓它
  // 顯示成「00:00 的預約」——那是畫面上憑空捏造的事實，寧可不顯示。
  if (source.start?.date !== undefined || source.end?.date !== undefined)
    return { ok: false, reason: 'all_day_unsupported' };

  const startsAtRaw = source.start?.dateTime;
  if (!isNonEmptyString(startsAtRaw))
    return { ok: false, reason: 'malformed_time' };

  const startMs = Date.parse(startsAtRaw);
  if (Number.isNaN(startMs)) return { ok: false, reason: 'malformed_time' };

  // 跨日事件在單日欄的週檢視裡無法正確表達，同樣擋下而不是硬塞。
  const endsAtRaw = source.end?.dateTime;
  if (isNonEmptyString(endsAtRaw)) {
    const endMs = Date.parse(endsAtRaw);
    if (Number.isNaN(endMs)) return { ok: false, reason: 'malformed_time' };
    if (endMs < startMs) return { ok: false, reason: 'malformed_time' };
    if (taipeiDayKey(endsAtRaw) !== taipeiDayKey(startsAtRaw))
      return { ok: false, reason: 'multi_day_unsupported' };
  }

  if (startMs < options.windowStart.getTime()) {
    return { ok: false, reason: 'outside_window' };
  }
  if (startMs > options.windowEnd.getTime()) {
    return { ok: false, reason: 'outside_window' };
  }

  const pilotId = pilotIdFor(source.id, options.pseudonymKey);
  return {
    ok: true,
    event: {
      pilotId,
      displayLabel: displayLabelFor(pilotId),
      // 一律輸出正規化的 UTC ISO；顯示端才轉台北時間（既有的 taipei-time.js）。
      startsAt: new Date(startMs).toISOString()
    }
  };
}

/** 一批消毒結果的安全統計。**只有數字與 reason code，沒有任何來源內容。** */
export interface PilotBatchSummary {
  readonly total: number;
  readonly copied: number;
  readonly skipped: number;
  readonly reasons: Readonly<Record<string, number>>;
}

export function summarize(
  results: readonly SanitizeResult[]
): PilotBatchSummary {
  const reasons: Record<string, number> = {};
  let copied = 0;
  for (const result of results) {
    if (result.ok) {
      copied += 1;
      continue;
    }
    reasons[result.reason] = (reasons[result.reason] ?? 0) + 1;
  }
  return {
    total: results.length,
    copied,
    skipped: results.length - copied,
    reasons
  };
}
