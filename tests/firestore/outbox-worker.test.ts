import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  calendarEventIdForAppointment,
  MAX_ATTEMPTS
} from '@beauessence/domain';
import {
  CLINIC_EVENT_COLOR_ID,
  InMemoryCalendar
} from '../../apps/worker/src/calendar-port.js';
import {
  APPOINTMENTS_COLLECTION,
  OUTBOX_COLLECTION,
  OutboxProcessor
} from '../../apps/worker/src/outbox-processor.js';

const emulatorHost = process.env['FIRESTORE_EMULATOR_HOST'];
const projectId = 'beauessence-appointment-local';

let app: App;
let db: Firestore;
let calendar: InMemoryCalendar;
let processor: OutboxProcessor;

const NOW = '2026-07-21T09:00:00.000Z';
const later = (seconds: number) =>
  new Date(Date.parse(NOW) + seconds * 1000).toISOString();

async function wipe(): Promise<void> {
  for (const collection of [OUTBOX_COLLECTION, APPOINTMENTS_COLLECTION]) {
    const documents = await db.collection(collection).listDocuments();
    await Promise.all(documents.map((document) => document.delete()));
  }
}

// 種子鍵一律走與正式路徑相同的產生器：手寫字串會悄悄退回舊格式。
// 一筆預約一個事件，因此整條生命週期的工作都用這一把鑰匙。
const CONFIRMED_KEY = calendarEventIdForAppointment('appointment_001');

async function seedJob(id = 'outbox_001'): Promise<void> {
  await db.collection(APPOINTMENTS_COLLECTION).doc('appointment_001').set({
    status: 'confirmed',
    startsAt: '2030-01-02T04:00:00.000Z',
    bookingKind: 'initial',
    patientId: 'patient_001',
    // 以下欄位刻意存在，用來證明它們不會外洩到日曆。
    patientName: '王測試',
    nationalId: 'A123456789',
    itemLabel: '鼻中膈彎曲'
  });
  await db.collection(OUTBOX_COLLECTION).doc(id).set({
    appointmentId: 'appointment_001',
    idempotencyKey: CONFIRMED_KEY,
    type: 'calendar_projection_requested',
    status: 'pending',
    attempts: 0
  });
}

const jobState = async (id = 'outbox_001') =>
  (await db.collection(OUTBOX_COLLECTION).doc(id).get()).data();

beforeAll(() => {
  if (emulatorHost === undefined)
    throw new Error(
      'FIRESTORE_EMULATOR_HOST is not set. Run this suite through pnpm test:rules.'
    );
  app = initializeApp({ projectId }, `worker-${Date.now()}`);
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

describe('outbox worker', () => {
  it('projects a pending job and marks it completed', async () => {
    await seedJob();
    const summary = await processor.processDue(NOW);

    expect(summary).toMatchObject({ claimed: 1, completed: 1 });
    expect(calendar.events.size).toBe(1);
    expect((await jobState())?.['status']).toBe('completed');
  });

  // 診所端的事件是一小時的看診區塊，與患者端「只標記開始時間」不同。
  it('gives the clinic a one-hour block with the clinic colour', async () => {
    await seedJob();
    await processor.processDue(NOW);

    const [event] = [...calendar.events.values()];
    expect(event?.startsAt).toBe('2030-01-02T04:00:00.000Z');
    expect(event?.endsAt).toBe('2030-01-02T05:00:00.000Z');
    expect(event?.colorId).toBe(CLINIC_EVENT_COLOR_ID);
  });

  it('uses the projected job key as a valid Calendar event ID', async () => {
    await seedJob();
    await processor.processDue(NOW);

    // 送到日曆的鍵就是 event ID，必須是 base32hex；舊格式含底線會被退件。
    const [eventId] = [...calendar.events.keys()];
    expect(eventId).toMatch(/^[0-9a-v]+$/);
    expect(eventId).toBe(CONFIRMED_KEY);
  });

  it('dead-letters a malformed event ID instead of retrying it forever', async () => {
    await seedJob();
    // 模擬舊格式殘留（例如手動補的工作）：重試一百次格式還是錯的。
    await db
      .collection(OUTBOX_COLLECTION)
      .doc('outbox_001')
      .update({ idempotencyKey: 'calendar_confirmed_appointment_001' });

    const summary = await processor.processDue(NOW);
    expect(summary).toMatchObject({ deadLettered: 1 });

    const state = await jobState();
    expect(state?.['status']).toBe('dead_letter');
    expect(state?.['attempts']).toBe(1);
    expect(state?.['lastError']).toMatch(/not a valid Calendar event ID/);
    expect(calendar.events.size).toBe(0);
  });

  it('treats an existing event as an idempotent success (Google 409 path)', async () => {
    await seedJob();
    await processor.processDue(NOW);
    // 同一把鑰匙再送一次：插入變成命中既有事件並更新，仍然只有一個事件。
    await db
      .collection(OUTBOX_COLLECTION)
      .doc('outbox_001')
      .update({ status: 'pending', attempts: 0 });
    const summary = await processor.processDue(later(1));

    expect(summary).toMatchObject({ completed: 1 });
    expect(calendar.events.size).toBe(1);
    expect(calendar.insertCount).toBe(1);
    expect(calendar.conflictUpdateCount).toBe(1);
  });

  // 走完整流程：取消會產生**另一筆**工作（不同的 job id），但兩筆工作指向
  // 同一個日曆事件，所以取消真的刪得掉建立時寫進去的那一格。
  // 舊的「每狀態一個 event ID」設計在這裡會失敗——它去刪一個從未建立過的
  // ID，然後回報成功（見 docs/architecture/calendar-event-id.md）。
  it('cancels the very event the booking created, through the real two-job flow', async () => {
    for (const status of ['cancelled', 'no_show']) {
      await wipe();
      calendar = new InMemoryCalendar();
      processor = new OutboxProcessor(db, calendar);

      await seedJob();
      await processor.processDue(NOW);
      expect(calendar.events.size).toBe(1);

      await db
        .collection(APPOINTMENTS_COLLECTION)
        .doc('appointment_001')
        .update({ status });
      // 這才是實際流程：狀態轉換排入一筆新工作，鍵仍是同一個事件。
      await db.collection(OUTBOX_COLLECTION).doc(`outbox_002_${status}`).set({
        appointmentId: 'appointment_001',
        idempotencyKey: CONFIRMED_KEY,
        type: 'calendar_projection_requested',
        status: 'pending',
        attempts: 0
      });
      const summary = await processor.processDue(later(1));

      expect(summary).toMatchObject({ completed: 1 });
      expect(calendar.events.size).toBe(0);
      expect(calendar.cancelCount).toBe(1);
      expect(calendar.cancelMissCount).toBe(0);
    }
  });

  // 整條生命週期跑完，日曆上不該留下任何殘影。
  it('leaves no ghost events after book, reschedule, complete and cancel', async () => {
    await seedJob();
    await processor.processDue(NOW);

    let clock = 1;
    const queue = async (jobId: string, status: string) => {
      await db
        .collection(APPOINTMENTS_COLLECTION)
        .doc('appointment_001')
        .update({ status });
      await db.collection(OUTBOX_COLLECTION).doc(jobId).set({
        appointmentId: 'appointment_001',
        idempotencyKey: CONFIRMED_KEY,
        type: 'calendar_projection_requested',
        status: 'pending',
        attempts: 0
      });
      await processor.processDue(later(clock));
      clock += 1;
    };

    await queue('outbox_rescheduled', 'confirmed');
    expect(calendar.events.size).toBe(1);
    await queue('outbox_completed', 'completed');
    expect(calendar.events.size).toBe(1);
    await queue('outbox_cancelled', 'cancelled');
    expect(calendar.events.size).toBe(0);
  });

  it('treats cancelling an already-missing event as a success (410/404 path)', async () => {
    await seedJob();
    await db
      .collection(APPOINTMENTS_COLLECTION)
      .doc('appointment_001')
      .update({ status: 'cancelled' });

    // 事件從未建立過就先被取消：目標狀態已達成，不該重試也不該死信。
    const summary = await processor.processDue(NOW);
    expect(summary).toMatchObject({ completed: 1 });
    expect(calendar.cancelMissCount).toBe(1);
    expect(calendar.events.size).toBe(0);
  });

  it('uses the appointment status at run time, not when the job was queued', async () => {
    await seedJob();
    // 工作排入時預約仍成立，但退避期間被取消——恢復後不該把事件寫回日曆。
    calendar.failNext(1);
    await processor.processDue(NOW);
    await db
      .collection(APPOINTMENTS_COLLECTION)
      .doc('appointment_001')
      .update({ status: 'cancelled' });

    await processor.processDue(later(60));
    expect(calendar.events.size).toBe(0);
    expect(calendar.insertCount).toBe(0);
  });

  it('never sends patient identifiers to the calendar', async () => {
    await seedJob();
    await processor.processDue(NOW);

    const projected = JSON.stringify([...calendar.events.values()]);
    for (const secret of ['王測試', 'A123456789', '鼻中膈彎曲', 'patient_001'])
      expect(projected).not.toContain(secret);
  });

  it('backs off after a retryable failure instead of giving up', async () => {
    await seedJob();
    calendar.failNext(1);

    const summary = await processor.processDue(NOW);
    expect(summary).toMatchObject({ claimed: 1, retried: 1, completed: 0 });

    const state = await jobState();
    expect(state?.['status']).toBe('pending');
    expect(state?.['attempts']).toBe(1);
    expect(state?.['lastError']).toMatch(/Synthetic calendar failure/);
    expect(Date.parse(state?.['nextAttemptAt'] as string)).toBeGreaterThan(
      Date.parse(NOW)
    );
  });

  it('does not pick the job up again before its backoff has elapsed', async () => {
    await seedJob();
    calendar.failNext(1);
    await processor.processDue(NOW);

    const immediate = await processor.processDue(later(1));
    expect(immediate.claimed).toBe(0);

    calendar.failNext(0);
    const afterBackoff = await processor.processDue(later(60));
    expect(afterBackoff).toMatchObject({ claimed: 1, completed: 1 });
  });

  it('dead-letters after the attempt ceiling and flags it for an operator', async () => {
    await seedJob();
    calendar.failNext(MAX_ATTEMPTS);

    let clock = NOW;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      await processor.processDue(clock);
      clock = later(3600 * (attempt + 1) * 2);
    }

    const state = await jobState();
    expect(state?.['status']).toBe('dead_letter');
    expect(state?.['attempts']).toBe(MAX_ATTEMPTS);
    expect(state?.['needsOperator']).toBe(true);

    const pending = await processor.deadLetters();
    expect(pending).toHaveLength(1);
  });

  it('dead-letters a non-retryable failure without burning the retry budget', async () => {
    await seedJob();
    calendar.failNext(1, false);

    const summary = await processor.processDue(NOW);
    expect(summary).toMatchObject({ deadLettered: 1 });

    const state = await jobState();
    expect(state?.['attempts']).toBe(1);
    expect(state?.['status']).toBe('dead_letter');
  });

  it('creates exactly one calendar event no matter how often it retries', async () => {
    await seedJob();
    // 每次都先失敗一次再成功，重複 5 輪：日曆被呼叫多次，但事件只有一個。
    let clock = NOW;
    for (let round = 0; round < 5; round += 1) {
      calendar.failNext(1);
      await processor.processDue(clock);
      clock = later(3600 * (round + 1) * 2);
    }
    calendar.failNext(0);
    await processor.processDue(clock);

    expect(calendar.callCount).toBeGreaterThan(5);
    expect(calendar.events.size).toBe(1);
  });

  it('leaves finished work alone on later runs', async () => {
    await seedJob();
    await processor.processDue(NOW);
    const second = await processor.processDue(later(7200));

    expect(second.claimed).toBe(0);
    expect(calendar.events.size).toBe(1);
  });

  it('lets a second worker take over a job whose lease expired', async () => {
    await seedJob();
    await db
      .collection(OUTBOX_COLLECTION)
      .doc('outbox_001')
      .update({
        status: 'in_progress',
        leaseExpiresAt: later(-60)
      });

    const summary = await processor.processDue(NOW);
    expect(summary).toMatchObject({ claimed: 1, completed: 1 });
  });

  it('will not touch a job another worker still holds', async () => {
    await seedJob();
    await db
      .collection(OUTBOX_COLLECTION)
      .doc('outbox_001')
      .update({
        status: 'in_progress',
        leaseExpiresAt: later(300)
      });

    const summary = await processor.processDue(NOW);
    expect(summary.claimed).toBe(0);
    expect(calendar.events.size).toBe(0);
  });
});
