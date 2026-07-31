import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  calendarEventIdForAppointment,
  MAX_ATTEMPTS
} from '@beauessence/domain';
import { InMemoryCalendar } from '../../apps/worker/src/calendar-port.js';
import {
  APPOINTMENTS_COLLECTION,
  OUTBOX_COLLECTION,
  OutboxProcessor
} from '../../apps/worker/src/outbox-processor.js';
import {
  LOCAL_FIREBASE_PROJECT_ID,
  requireLocalFirestoreEmulatorTarget
} from '../../packages/config/src/index.js';

/**
 * Runbook 演練：Google Calendar 同步失敗 → 死信 → 補回。
 *
 * 這不是又一組單元測試，而是把
 * [calendar-sync-failure runbook](../../docs/runbooks/calendar-sync-failure.md)
 * 的每一步跑成可版本控管、可回歸的證據。逐步對應 runbook：
 *
 *   步驟 1：確認預約狀態、時段鎖定與 idempotency key（不重建預約）
 *   步驟 2：檢查錯誤碼（此處以假日曆的可重試錯誤代表 5xx／逾時）
 *   步驟 3：以相同 idempotency key 重送；事件已存在須轉為成功，不建第二筆
 *   步驟 5：確認死信已清除、稽核欄位留存
 *
 * 刻意選最危險的情境：**日曆已建立事件、但回應遺失**（Google 官方警告的重複
 * 風險）。工作因此不斷「失敗」直到死信，但事件其實一直都在。補回時必須維持
 * 一個事件，而非兩個。
 */

requireLocalFirestoreEmulatorTarget(process.env['FIRESTORE_EMULATOR_HOST']);
const projectId = LOCAL_FIREBASE_PROJECT_ID;

let app: App;
let db: Firestore;
let calendar: InMemoryCalendar;
let processor: OutboxProcessor;

const NOW = '2026-07-21T09:00:00.000Z';
const later = (seconds: number) =>
  new Date(Date.parse(NOW) + seconds * 1000).toISOString();

const KEY = calendarEventIdForAppointment('appointment_001');
const jobState = async () =>
  (await db.collection(OUTBOX_COLLECTION).doc('outbox_001').get()).data();

async function wipe(): Promise<void> {
  for (const collection of [OUTBOX_COLLECTION, APPOINTMENTS_COLLECTION]) {
    const documents = await db.collection(collection).listDocuments();
    await Promise.all(documents.map((document) => document.delete()));
  }
}

async function seed(): Promise<void> {
  await db.collection(APPOINTMENTS_COLLECTION).doc('appointment_001').set({
    status: 'confirmed',
    startsAt: '2030-01-02T04:00:00.000Z',
    bookingKind: 'initial',
    patientId: 'patient_001'
  });
  await db.collection(OUTBOX_COLLECTION).doc('outbox_001').set({
    appointmentId: 'appointment_001',
    correlationId: 'corr_runbook_001',
    causationId: 'audit_appointment_001_confirmed',
    idempotencyKey: KEY,
    type: 'calendar_projection_requested',
    status: 'pending',
    attempts: 0,
    // 領取是 nextAttemptAt <= now 的範圍查詢；缺欄位的文件查不到。
    nextAttemptAt: NOW
  });
}

beforeAll(() => {
  app = initializeApp({ projectId }, `runbook-${Date.now()}`);
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

beforeEach(async () => {
  await wipe();
  calendar = new InMemoryCalendar();
  processor = new OutboxProcessor(db, calendar);
});

describe('runbook 演練：日曆同步失敗 → 死信 → 補回', () => {
  it('lost-ack 情境：事件已建立卻不斷失敗，補回後仍只有一個事件', async () => {
    await seed();

    // ---- 觸發條件：死信所需的每一次嘗試都「寫入成功但回應遺失」 ----
    // 剛好 MAX_ATTEMPTS 次：耗盡重試額度後日曆即恢復，對應「排除根因」。
    // 每次都把事件寫進去，因此死信時日曆上其實已有一個事件。
    calendar.failNextAfterWrite(MAX_ATTEMPTS);

    let clock = NOW;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      await processor.processDue(clock);
      clock = later(3600 * (attempt + 1) * 2); // 跨過指數退避
    }

    // ---- 步驟 1＋2：確認狀態。工作已死信，但日曆上其實已有一個事件 ----
    const dead = await jobState();
    expect(dead?.['status']).toBe('dead_letter');
    expect(dead?.['needsOperator']).toBe(true);
    expect(dead?.['idempotencyKey']).toBe(KEY); // 補回要靠這把鑰匙
    expect(calendar.events.size).toBe(1); // 事件一直都在（回應遺失）

    const worklist = await processor.deadLetters();
    expect(worklist).toHaveLength(1);
    expect(worklist[0]?.appointmentId).toBe('appointment_001');

    // ---- 步驟 3：排除根因（日曆恢復），操作者以相同鍵重送 ----
    // 不呼叫 failNextAfterWrite → 日曆恢復正常。
    // 操作者的動作時間與 worker 用的是同一個邏輯時鐘，補救才不依賴系統時鐘同步。
    const requeued = await processor.requeue(
      'outbox_001',
      'operator_admin_001',
      clock
    );
    expect(requeued).toBe(true);

    const summary = await processor.processDue(later(3600 * 100));
    expect(summary).toMatchObject({ completed: 1, deadLettered: 0 });

    // 冪等的關鍵斷言：重送撞到既有事件（409 路徑），仍是一個事件而非兩個。
    expect(calendar.events.size).toBe(1);
    expect(calendar.conflictUpdateCount).toBeGreaterThan(0);

    // ---- 步驟 5：死信已清除，且留下可稽核的補回紀錄 ----
    const recovered = await jobState();
    expect(recovered?.['status']).toBe('completed');
    expect(recovered?.['requeuedBy']).toBe('operator_admin_001');
    expect(await processor.deadLetters()).toHaveLength(0);
  });

  it('補回沿用同一把鑰匙：重跑一百次仍只有一個事件', async () => {
    await seed();
    calendar.failNext(MAX_ATTEMPTS); // 一路可重試失敗 → 死信
    let clock = NOW;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      await processor.processDue(clock);
      clock = later(3600 * (attempt + 1) * 2);
    }
    expect((await jobState())?.['status']).toBe('dead_letter');

    await processor.requeue('outbox_001', 'operator_admin_001', clock);
    // 日曆已恢復；即使把工作重跑很多輪，也只會有一個事件。
    for (let round = 0; round < 100; round += 1)
      await processor.processDue(later(3600 * (200 + round)));

    expect(calendar.events.size).toBe(1);
    expect(calendar.insertCount).toBe(1); // 只建立過一次
  });

  it('requeue 只作用於死信：不碰仍在重試或已完成的工作', async () => {
    await seed();

    // 尚在 pending 的工作不可被人工重排（會與 worker 租約打架）。
    expect(await processor.requeue('outbox_001', 'op')).toBe(false);

    // 完成後也不可重排（會憑空再送一次投影）。
    await processor.processDue(NOW);
    expect((await jobState())?.['status']).toBe('completed');
    expect(await processor.requeue('outbox_001', 'op')).toBe(false);

    // 不存在的工作回傳 false，不丟例外。
    expect(await processor.requeue('outbox_nope', 'op')).toBe(false);
  });
});
