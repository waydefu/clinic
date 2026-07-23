import {
  isDue,
  planOutboxAttempt,
  type AttemptOutcome,
  type OutboxJob
} from '@beauessence/domain';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';

import {
  CalendarError,
  CLINIC_EVENT_COLOR_ID,
  clinicEventEnd,
  type CalendarAction,
  type CalendarPort
} from './calendar-port.js';

export const OUTBOX_COLLECTION = 'outbox_jobs';
export const APPOINTMENTS_COLLECTION = 'appointments';

/**
 * 已結束且不再佔用時段的預約，其日曆事件應該消失；其餘狀態都是 upsert。
 *
 * 用預約的**目前**狀態而不是工作建立時的狀態：工作可能等到退避結束才執行，
 * 期間預約已被取消——這時再把事件寫回日曆就是錯的。
 */
function actionForStatus(status: string): CalendarAction {
  return status === 'cancelled' || status === 'no_show' ? 'cancel' : 'upsert';
}

/** 租約時間：領走的工作若超過此秒數未回報，視為 worker 已死，可被重新領取。 */
export const LEASE_SECONDS = 120;

export interface ProcessSummary {
  readonly claimed: number;
  readonly completed: number;
  readonly retried: number;
  readonly deadLettered: number;
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
    private readonly calendar: CalendarPort
  ) {}

  /** 以交易領取一筆到期工作並加上租約，回傳 undefined 表示沒有可做的事。 */
  private async claim(now: string): Promise<OutboxJob | undefined> {
    const candidates = await this.db
      .collection(OUTBOX_COLLECTION)
      .where('status', 'in', ['pending', 'in_progress'])
      .limit(20)
      .get();

    for (const candidate of candidates.docs) {
      const claimed = await this.db.runTransaction(async (transaction) => {
        const reference = this.db
          .collection(OUTBOX_COLLECTION)
          .doc(candidate.id);
        const snapshot = await transaction.get(reference);
        if (!snapshot.exists) return undefined;
        const job = { id: snapshot.id, ...snapshot.data() } as OutboxJob & {
          leaseExpiresAt?: string;
        };

        const leaseExpired =
          job.leaseExpiresAt === undefined ||
          Date.parse(job.leaseExpiresAt) <= Date.parse(now);

        if (job.status === 'in_progress' && !leaseExpired) return undefined;
        if (job.status === 'pending' && !isDue(job, now)) return undefined;
        if (job.status === 'completed' || job.status === 'dead_letter')
          return undefined;

        transaction.update(reference, {
          status: 'in_progress',
          leaseExpiresAt: new Date(
            Date.parse(now) + LEASE_SECONDS * 1000
          ).toISOString()
        });
        return job;
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

    await this.db
      .collection(OUTBOX_COLLECTION)
      .doc(job.id)
      .update({
        status: decision.status,
        attempts: decision.attempts,
        needsOperator: decision.needsOperator,
        leaseExpiresAt: null,
        ...(decision.nextAttemptAt === undefined
          ? {}
          : { nextAttemptAt: decision.nextAttemptAt }),
        ...(decision.lastError === undefined
          ? {}
          : { lastError: decision.lastError }),
        settledAt: now
      });

    if (decision.status === 'completed') return 'completed';
    if (decision.status === 'dead_letter') return 'deadLettered';
    return 'retried';
  }

  /** 處理到沒有到期工作為止，或到達 maxJobs 上限。 */
  public async processDue(
    now = new Date().toISOString(),
    maxJobs = 50
  ): Promise<ProcessSummary> {
    let claimed = 0;
    let completed = 0;
    let retried = 0;
    let deadLettered = 0;

    while (claimed < maxJobs) {
      const job = await this.claim(now);
      if (job === undefined) break;
      claimed += 1;

      const appointment = await this.db
        .collection(APPOINTMENTS_COLLECTION)
        .doc(job.appointmentId)
        .get();

      const status = (appointment.data()?.['status'] as string) ?? 'unknown';
      // 事件自己的時間優先（回診提醒落在回診目標日期，不是原就診時間）；
      // 一般預約投影沒有 job.startsAt，退回讀來源預約的時間。
      const startsAt =
        job.startsAt ?? (appointment.data()?.['startsAt'] as string) ?? '';
      let outcome: AttemptOutcome;
      try {
        // 投影內容只有識別碼、狀態、時間與掛號別。姓名、電話、身分證、
        // 手術種類與備註一律不得離開本系統（ADR-0002）。
        await this.calendar.project({
          idempotencyKey: job.idempotencyKey,
          action: actionForStatus(status),
          appointmentId: job.appointmentId,
          appointmentStatus: status,
          startsAt,
          endsAt: startsAt === '' ? '' : clinicEventEnd(startsAt),
          colorId: CLINIC_EVENT_COLOR_ID,
          bookingKind: (appointment.data()?.['bookingKind'] as string) ?? ''
        });
        outcome = { kind: 'succeeded' };
      } catch (error) {
        outcome = {
          kind: 'failed',
          reason: error instanceof Error ? error.message : 'Unknown failure.',
          retryable: error instanceof CalendarError ? error.retryable : true
        };
      }

      const result = await this.settle(job, outcome, now);
      if (result === 'completed') completed += 1;
      else if (result === 'retried') retried += 1;
      else deadLettered += 1;
    }

    return { claimed, completed, retried, deadLettered };
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
   */
  public async requeue(jobId: string, operatorId: string): Promise<boolean> {
    return this.db.runTransaction(async (transaction) => {
      const reference = this.db.collection(OUTBOX_COLLECTION).doc(jobId);
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists) return false;
      if (snapshot.data()?.['status'] !== 'dead_letter') return false;

      // 刪除 nextAttemptAt（而非設 null）：isDue 以 `=== undefined` 判斷「立即
      // 到期」，設 null 會讓 Date.parse(null) 變 NaN，工作反而永遠領不到。
      transaction.update(reference, {
        status: 'pending',
        attempts: 0,
        needsOperator: false,
        leaseExpiresAt: FieldValue.delete(),
        nextAttemptAt: FieldValue.delete(),
        requeuedAt: new Date().toISOString(),
        requeuedBy: operatorId
      });
      return true;
    });
  }
}
