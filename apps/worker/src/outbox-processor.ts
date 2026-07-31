import {
  assertOutboxTraceContext,
  fullJitterBackoffMilliseconds,
  isDue,
  planOutboxAttempt,
  DomainError,
  type AttemptOutcome,
  type OutboxJob
} from '@beauessence/domain';
import {
  FieldValue,
  type DocumentSnapshot,
  type Firestore
} from 'firebase-admin/firestore';
import { performance } from 'node:perf_hooks';

import {
  CalendarError,
  CLINIC_EVENT_COLOR_ID,
  clinicEventEnd,
  type CalendarAction,
  type CalendarProjectionOptions,
  type CalendarPort
} from './calendar-port.js';
import {
  NOOP_WORKER_METRICS,
  type WorkerMetricsPort
} from './worker-observability.js';
import {
  OUTBOX_LEASE_SECONDS,
  OUTBOX_SETTLE_SAFETY_MARGIN_MS
} from './worker-timing.js';

export const OUTBOX_COLLECTION = 'outbox_jobs';
export const APPOINTMENTS_COLLECTION = 'appointments';

/**
 * 日曆只留「尚未發生」的預約。已完成到診、已取消、未到都是已成事實，事件應該
 * 消失（`cancel`）；confirmed／cancellation_requested 與待安排回診提醒是
 * upsert。
 *
 * 用預約的**目前**狀態而不是工作建立時的狀態：工作可能等到退避結束才執行，
 * 期間預約已被取消或完成——這時再把事件寫回日曆就是錯的。
 *
 * 到診刪除的是「就診」事件；若需要回診，另有一筆回診提醒事件（不同 event id、
 * 落在回診目標日），由回診投影負責，不受這裡影響。
 */
function actionForStatus(status: string): CalendarAction {
  return status === 'confirmed' ||
    status === 'cancellation_requested' ||
    status === 'follow_up_required'
    ? 'upsert'
    : 'cancel';
}

/** 租約時間：領走的工作若超過此秒數未回報，視為 worker 已死，可被重新領取。 */
export const LEASE_SECONDS = OUTBOX_LEASE_SECONDS;

/**
 * 每一輪查詢各取幾筆候選。查詢已依到期時間排序，所以這是「一次看多少」的
 * 批量參數，不再像先前那樣決定「哪些工作永遠看不到」。
 */
const CANDIDATE_LIMIT = 20;

export interface ProcessSummary {
  readonly claimed: number;
  readonly completed: number;
  readonly retried: number;
  readonly deadLettered: number;
}

interface ClaimedOutboxJob extends OutboxJob {
  readonly leaseExpiresAt: string;
}

/**
 * 消費 outbox，把預約投影到外部日曆。
 *
 * 三件事分開：
 *   1. 領取（交易內，帶租約）——兩個 worker 不會同時處理同一筆。
 *   2. 外部呼叫（交易外）——ADR-0002 禁止在交易內呼叫外部服務。
 *   3. 結算（交易外的單筆更新，依 planOutboxAttempt 的純決策）。
 *
 * 外部呼叫刻意放在交易之外：Firestore 會重試交易，若把呼叫放進去，重試就會
 * 重複建立日曆事件或重複寄送通知。
 */
export class OutboxProcessor {
  public constructor(
    private readonly db: Firestore,
    private readonly calendar: CalendarPort,
    private readonly metrics: WorkerMetricsPort = NOOP_WORKER_METRICS,
    private readonly random: () => number = Math.random,
    private readonly monotonicNow: () => number = () => performance.now()
  ) {}

  /**
   * Observability must never change job delivery semantics. A metrics backend
   * outage is handled by that adapter/platform, not by replaying an external
   * Calendar effect.
   */
  private recordMetric(record: () => void): void {
    try {
      record();
    } catch {
      // Intentionally isolated from the outbox state machine.
    }
  }

  /**
   * 這一輪要考慮的候選工作。
   *
   * 分成兩個**各自排序**的查詢，而不是一個 `status in [...]`：
   *
   *   1. 已到期的 pending —— 依 `nextAttemptAt` 由早到晚。
   *   2. 租約已過期的 in_progress —— 依 `leaseExpiresAt` 由早到晚，這是
   *      worker 死掉之後的回收路徑。
   *
   * 先前是 `where('status','in',['pending','in_progress']).limit(20)`，**沒有
   * orderBy**，所以 Firestore 回的是文件 ID 順序的前 20 筆。只要那 20 筆都還在
   * 退避中，`claim` 就回 undefined、`processDue` 直接收工——文件 ID 排在後面、
   * 其實早就到期的工作整輪碰不到。退避上限是一小時（MAX_BACKOFF_SECONDS），
   * 所以最壞情況是一筆該立刻送出的日曆同步被前面 20 筆卡一小時。
   *
   * 現在的查詢把「到期」放進查詢條件本身，排序又保證最早到期的先被看到，
   * 因此不存在「前面幾筆擋住後面」的情況。
   */
  private async dueCandidates(
    now: string,
    alreadyAttempted: ReadonlySet<string>
  ): Promise<DocumentSnapshot[]> {
    const collection = this.db.collection(OUTBOX_COLLECTION);
    // Full jitter can legitimately produce a very short delay. Over-fetch by
    // the number already attempted so those rows cannot hide later due work.
    const queryLimit = CANDIDATE_LIMIT + alreadyAttempted.size;
    const [pending, expiredLease] = await Promise.all([
      collection
        .where('status', '==', 'pending')
        .where('nextAttemptAt', '<=', now)
        .orderBy('nextAttemptAt')
        .limit(queryLimit)
        .get(),
      collection
        .where('status', '==', 'in_progress')
        .where('leaseExpiresAt', '<=', now)
        .orderBy('leaseExpiresAt')
        .limit(queryLimit)
        .get()
    ]);
    return [...pending.docs, ...expiredLease.docs].filter(
      (candidate) => !alreadyAttempted.has(candidate.id)
    );
  }

  /**
   * 以交易領取一筆到期工作並加上租約，回傳 undefined 表示沒有可做的事。
   *
   * `at` 回傳的是**呼叫當下**的時刻，不是批次起始時刻。租約必須從真正領取的
   * 那一刻起算：一批最多 50 筆、每筆都要打一次外部日曆，整批很可能跑得比
   * LEASE_SECONDS（120 秒）還久。若沿用批次起始時間，後段領到的工作在領到的
   * 當下租約就已經過期，另一個 worker 可以同時領走同一筆——租約這個唯一的
   * 互斥手段就形同虛設。
   */
  private async claim(
    at: () => string,
    alreadyAttempted: ReadonlySet<string>
  ): Promise<ClaimedOutboxJob | undefined> {
    const now = at();
    const candidates = await this.dueCandidates(now, alreadyAttempted);

    for (const candidate of candidates) {
      const claimed = await this.db.runTransaction(async (transaction) => {
        const reference = this.db
          .collection(OUTBOX_COLLECTION)
          .doc(candidate.id);
        const snapshot = await transaction.get(reference);
        if (!snapshot.exists) return undefined;
        const job = { id: snapshot.id, ...snapshot.data() } as OutboxJob & {
          leaseExpiresAt?: string;
        };

        const claimedAt = at();
        const leaseExpired =
          job.leaseExpiresAt === undefined ||
          Date.parse(job.leaseExpiresAt) <= Date.parse(claimedAt);

        if (job.status === 'in_progress' && !leaseExpired) return undefined;
        if (job.status === 'pending' && !isDue(job, claimedAt))
          return undefined;
        if (job.status === 'completed' || job.status === 'dead_letter')
          return undefined;

        const leaseExpiresAt = new Date(
          Date.parse(claimedAt) + LEASE_SECONDS * 1000
        ).toISOString();
        transaction.update(reference, {
          status: 'in_progress',
          leaseExpiresAt
        });
        return { ...job, leaseExpiresAt };
      });

      if (claimed !== undefined) return claimed;
    }
    return undefined;
  }

  private async settle(
    job: OutboxJob,
    outcome: AttemptOutcome,
    now: string
  ): Promise<'completed' | 'retried' | 'deadLettered'> {
    // 結算時把 status 還原成領取前的樣子再交給純決策，避免 in_progress
    // 這個純技術狀態洩漏進領域規則。
    const decision = planOutboxAttempt(
      { ...job, status: 'pending' },
      outcome,
      now
    );
    const jitteredNextAttemptAt =
      decision.status === 'pending' && decision.nextAttemptAt !== undefined
        ? new Date(
            Date.parse(now) +
              fullJitterBackoffMilliseconds(decision.attempts, this.random())
          ).toISOString()
        : undefined;

    await this.db
      .collection(OUTBOX_COLLECTION)
      .doc(job.id)
      .update({
        status: decision.status,
        attempts: decision.attempts,
        needsOperator: decision.needsOperator,
        leaseExpiresAt: null,
        ...(jitteredNextAttemptAt === undefined
          ? {}
          : { nextAttemptAt: jitteredNextAttemptAt }),
        ...(decision.lastError === undefined
          ? {}
          : { lastError: decision.lastError }),
        settledAt: now
      });

    if (decision.status === 'completed') return 'completed';
    if (decision.status === 'dead_letter') return 'deadLettered';
    return 'retried';
  }

  /**
   * 處理到沒有到期工作為止，或到達 maxJobs 上限。
   *
   * `now` 是**批次起點**，不是整批共用的「現在」。先前每一次租約計算與每一筆
   * 結算都直接用這個參數，等於假裝整批不花時間：50 筆工作、每筆一次外部呼叫，
   * 批次跑上幾分鐘是常態，租約卻仍從批次起點起算，而 `settledAt` 會讓 50 筆
   * 工作看起來在同一瞬間完成——稽核時間因此失真。
   *
   * `at()` 以批次起點加上實際經過的時間推得「此刻」。注入的 `now` 仍然決定
   * 這一批以哪個時間點判斷到期，所以測試維持可決定性；而在正式環境裡，
   * 批次進行中取得的每一個時刻都是真的往前走的。
   */
  public async processDue(
    now = new Date().toISOString(),
    maxJobs = 50
  ): Promise<ProcessSummary> {
    const batchStartedAt = this.monotonicNow();
    const batchInstantMs = Date.parse(now);
    const at = (): string =>
      new Date(
        batchInstantMs + Math.max(0, this.monotonicNow() - batchStartedAt)
      ).toISOString();
    let claimed = 0;
    let completed = 0;
    let retried = 0;
    let deadLettered = 0;
    const alreadyAttempted = new Set<string>();

    while (claimed < maxJobs) {
      const job = await this.claim(at, alreadyAttempted);
      if (job === undefined) break;
      alreadyAttempted.add(job.id);
      claimed += 1;

      const appointment = await this.db
        .collection(APPOINTMENTS_COLLECTION)
        .doc(job.appointmentId)
        .get();

      const appointmentStatus =
        (appointment.data()?.['status'] as string) ?? 'unknown';
      // 一般預約必須看執行當下的來源狀態，避免重試把已完成／取消的事件寫回。
      // 回診提醒則是另一個 event ID，動作由該投影自己的狀態決定；來源預約本來
      // 就必須是 completed，若誤用來源狀態會把新提醒當成 cancel。
      const isFollowUpProjection = job.followUpSourceId !== undefined;
      const projectionStatus = isFollowUpProjection
        ? (job.appointmentStatus ?? 'unknown')
        : appointmentStatus;
      // 事件自己的時間優先（回診提醒落在回診目標日期，不是原就診時間）；
      // 一般預約投影沒有 job.startsAt，退回讀來源預約的時間。
      const startsAt =
        job.startsAt ?? (appointment.data()?.['startsAt'] as string) ?? '';
      const action = actionForStatus(projectionStatus);
      const attemptStartedAt = this.monotonicNow();
      let outcome: AttemptOutcome;
      try {
        assertOutboxTraceContext(job);
        const projectionStartedAt = at();
        const projectionTimeoutMs =
          Date.parse(job.leaseExpiresAt) -
          Date.parse(projectionStartedAt) -
          OUTBOX_SETTLE_SAFETY_MARGIN_MS;
        if (projectionTimeoutMs <= 0)
          throw new CalendarError(
            'Calendar projection skipped because the worker lease has no safe time remaining.',
            true
          );
        const projectionOptions: CalendarProjectionOptions = {
          timeoutMs: projectionTimeoutMs,
          signal: AbortSignal.timeout(projectionTimeoutMs)
        };
        // 投影內容只有識別碼、狀態、時間與掛號別。姓名、電話、身分證、
        // 手術種類與備註一律不得離開本系統（ADR-0002）。
        await this.calendar.project(
          {
            idempotencyKey: job.idempotencyKey,
            action,
            appointmentId: job.appointmentId,
            correlationId: job.correlationId,
            causationId: job.causationId,
            appointmentStatus: projectionStatus,
            startsAt,
            endsAt: startsAt === '' ? '' : clinicEventEnd(startsAt),
            colorId: CLINIC_EVENT_COLOR_ID,
            bookingKind: isFollowUpProjection
              ? 'follow_up'
              : ((appointment.data()?.['bookingKind'] as string) ?? '')
          },
          projectionOptions
        );
        outcome = { kind: 'succeeded' };
      } catch (error) {
        outcome = {
          kind: 'failed',
          reason: error instanceof Error ? error.message : 'Unknown failure.',
          retryable:
            error instanceof CalendarError
              ? error.retryable
              : !(error instanceof DomainError)
        };
      }

      // 結算用結算當下的時刻：退避的起點是「這次嘗試何時失敗」，不是「這批
      // 何時開始」，settledAt 也才不會讓整批看起來同時完成。
      const result = await this.settle(job, outcome, at());
      this.recordMetric(() =>
        this.metrics.recordCalendarAttempt({
          destination: 'calendar',
          action,
          result:
            result === 'deadLettered'
              ? 'dead_lettered'
              : result === 'retried'
                ? 'retried'
                : 'completed',
          retryable: outcome.kind === 'failed' ? outcome.retryable : null,
          attempt: job.attempts + 1,
          latencyMs: Math.max(0, this.monotonicNow() - attemptStartedAt)
        })
      );
      if (result === 'completed') completed += 1;
      else if (result === 'retried') retried += 1;
      else deadLettered += 1;
    }

    const summary = { claimed, completed, retried, deadLettered };
    this.recordMetric(() =>
      this.metrics.recordBatch({
        ...summary,
        durationMs: Math.max(0, this.monotonicNow() - batchStartedAt)
      })
    );
    return summary;
  }

  /** 後台的待處理清單：需要人工補救的死信。 */
  public async deadLetters(): Promise<OutboxJob[]> {
    const snapshot = await this.db
      .collection(OUTBOX_COLLECTION)
      .where('status', '==', 'dead_letter')
      .get();
    return snapshot.docs.map(
      (document) => ({ id: document.id, ...document.data() }) as OutboxJob
    );
  }

  /**
   * 操作者在排除根因後，把一筆死信重新排入（runbook 步驟 3）。
   *
   * 刻意**只作用於死信**：正在重試或已完成的工作不該被人工插手，否則會與
   * worker 的租約打架。重新排入沿用**同一個 idempotencyKey**——這是冪等的
   * 關鍵，若日曆上其實已有事件（回應遺失的情境），重送只會 upsert 而不會
   * 產生第二筆。attempts 歸零給予全新的重試額度，並留下 requeuedAt／
   * requeuedBy 供稽核（runbook 步驟 5）。
   *
   * 回傳是否真的重新排入：對非死信的工作回傳 false，讓呼叫端知道沒動作，
   * 而不是靜默假成功。
   *
   * `now` 可注入，與 `processDue` 一致。重新排入之後，這筆工作要不要被領取，
   * 是拿它的 `nextAttemptAt` 和 worker 的 now 比對出來的——兩邊若各自取時間，
   * 補救動作就會依賴「系統時鐘剛好同步」這個沒人保證的前提。
   */
  public async requeue(
    jobId: string,
    operatorId: string,
    now = new Date().toISOString()
  ): Promise<boolean> {
    return this.db.runTransaction(async (transaction) => {
      const reference = this.db.collection(OUTBOX_COLLECTION).doc(jobId);
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists) return false;
      if (snapshot.data()?.['status'] !== 'dead_letter') return false;

      // nextAttemptAt 設成「現在」而不是刪除欄位。
      //
      // 先前這裡刪掉欄位，靠 isDue 的 `=== undefined` 分支代表「立即到期」。
      // 那個約定在領取改成 `nextAttemptAt <= now` 的範圍查詢之後會變成陷阱：
      // Firestore 的範圍查詢不回傳缺少該欄位的文件，所以重新排入的工作會從
      // 佇列裡整個消失——正是操作者最不希望在補救死信時發生的事。
      transaction.update(reference, {
        status: 'pending',
        attempts: 0,
        needsOperator: false,
        leaseExpiresAt: FieldValue.delete(),
        nextAttemptAt: now,
        requeuedAt: now,
        requeuedBy: operatorId
      });
      return true;
    });
  }
}
