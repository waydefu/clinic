/**
 * 外部日曆的邊界。
 *
 * worker 只認識這個介面，不認識 Google。階段 C 接上真實 Calendar 時只換實作，
 * 重試、退避、死信與冪等的行為完全不動——那些已在本機用假實作驗證過。
 */

export interface CalendarProjectionRequest {
  /** 固定的冪等鍵；同一鍵重送不得產生第二個事件。 */
  readonly idempotencyKey: string;
  readonly appointmentId: string;
  readonly appointmentStatus: string;
  readonly startsAt: string;
  readonly bookingKind: string;
}

export interface CalendarPort {
  /**
   * 建立或更新投影。實作必須以 idempotencyKey 去重，重試 N 次仍只有一個事件。
   *
   * 丟出的錯誤若帶 `retryable === false`，worker 會直接送進死信而不重試。
   */
  project(request: CalendarProjectionRequest): Promise<void>;
}

export class CalendarError extends Error {
  public readonly name = 'CalendarError';

  public constructor(
    message: string,
    public readonly retryable: boolean
  ) {
    super(message);
  }
}

/**
 * 供本機驗證用的假日曆：以 idempotencyKey 去重，可設定連續失敗次數。
 * 事件內容刻意只保留識別碼與掛號別，與正式投影的欄位限制一致。
 */
export class InMemoryCalendar implements CalendarPort {
  public readonly events = new Map<string, CalendarProjectionRequest>();
  public callCount = 0;
  private failuresRemaining = 0;
  private failureRetryable = true;

  public failNext(times: number, retryable = true): void {
    this.failuresRemaining = times;
    this.failureRetryable = retryable;
  }

  // 這個假實作沒有真正的 I/O，因此不是 async function；回傳 Promise 是為了
  // 符合 CalendarPort 介面，讓 worker 的呼叫路徑與真實實作完全一致。
  public project(request: CalendarProjectionRequest): Promise<void> {
    this.callCount += 1;
    if (this.failuresRemaining > 0) {
      this.failuresRemaining -= 1;
      return Promise.reject(
        new CalendarError('Synthetic calendar failure.', this.failureRetryable)
      );
    }
    // 冪等：同一把鑰匙只留一個事件。
    this.events.set(request.idempotencyKey, request);
    return Promise.resolve();
  }
}
