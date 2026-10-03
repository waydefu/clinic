import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { calendarEventIdForAppointment } from '@beauessence/domain';
import { ClinicCalendarReviewApplicationService } from '../../apps/api/src/calendar/clinic-calendar-review.application-service.js';
import {
  COLLECTIONS,
  FirestoreBookingRepository
} from '../../apps/api/src/firestore/booking.repository.js';
import { FirestoreCalendarPilotRepository } from '../../apps/api/src/firestore/calendar-pilot.repository.js';
import { FirestoreClinicCalendarCandidateStore } from '../../apps/api/src/firestore/clinic-calendar-review.repository.js';
import { FirestoreCalendarSyncRepository } from '../../apps/worker/src/calendar-sync/firestore-calendar-sync.repository.js';
import {
  CalendarSyncEngine,
  type ExternalCalendarEvent
} from '../../apps/worker/src/calendar-sync/sync-engine.js';
import { GoogleCalendarClient } from '../../apps/worker/src/google-calendar.js';
import {
  APPOINTMENTS_COLLECTION,
  OUTBOX_COLLECTION,
  OutboxProcessor
} from '../../apps/worker/src/outbox-processor.js';
import {
  LOCAL_FIREBASE_PROJECT_ID,
  requireLocalFirestoreEmulatorTarget
} from '../../packages/config/src/index.js';

requireLocalFirestoreEmulatorTarget(process.env['FIRESTORE_EMULATOR_HOST']);

/**
 * AUD-04: a clinic Calendar reschedule must reach review with its target time.
 *
 * Cross-layer on purpose: the outbound projection is the real
 * OutboxProcessor + GoogleCalendarClient (only the HTTP transport is faked),
 * the inbound step is the real CalendarSyncEngine + Firestore repository, and
 * review is the real ClinicCalendarReviewApplicationService over the real
 * booking repository. A unit test on any one layer cannot see the defect: the
 * clinic title is not a CAL-PILOT title, so the persisted candidate used to
 * lose the event's moved range.
 */
const OUTBOUND_AT = '2026-07-21T09:00:00.000Z';
const SYNC_AT = '2026-08-28T08:00:00.000Z';
const SYNC_AGAIN_AT = '2026-08-28T08:05:00.000Z';
const REVIEW_AT = '2029-12-15T09:00:00.000Z';
const SOURCE = 'calendar_source_primary';
const APPOINTMENT = 'appointment_001';
const SLOT_A = 'slot_20300102_1200';
const SLOT_B = 'slot_20300102_1230';
const SLOT_C = 'slot_20300102_1300';
const EVENT_ID = calendarEventIdForAppointment(APPOINTMENT);

let app: App;
let db: Firestore;

async function wipe(): Promise<void> {
  const names = [
    ...Object.values(COLLECTIONS),
    OUTBOX_COLLECTION,
    APPOINTMENTS_COLLECTION,
    'calendar_pilot_configuration',
    'calendar_pilot_sources',
    'calendar_pilot_candidates',
    'calendar_pilot_mirrors',
    'calendar_pilot_patients',
    'calendar_pilot_audit_events',
    'calendar_pilot_appointments'
  ];
  for (const collection of new Set(names)) {
    const documents = await db.collection(collection).listDocuments();
    await Promise.all(documents.map((document) => document.delete()));
  }
}

async function seed(): Promise<void> {
  await db.collection(COLLECTIONS.slots).doc(SLOT_A).set({
    kind: 'initial',
    startsAt: '2030-01-02T04:00:00.000Z',
    reservationId: APPOINTMENT
  });
  await db
    .collection(COLLECTIONS.slots)
    .doc(SLOT_B)
    .set({ kind: 'initial', startsAt: '2030-01-02T04:30:00.000Z' });
  await db
    .collection(COLLECTIONS.slots)
    .doc(SLOT_C)
    .set({ kind: 'initial', startsAt: '2030-01-02T05:00:00.000Z' });
  await db.collection(COLLECTIONS.appointments).doc(APPOINTMENT).set({
    slotId: SLOT_A,
    startsAt: '2030-01-02T04:00:00.000Z',
    patientId: 'patient_001',
    bookingKind: 'initial',
    status: 'confirmed'
  });
  await db.collection(COLLECTIONS.patientBookingGuards).doc('patient_001').set({
    activeAppointmentId: APPOINTMENT,
    status: 'confirmed',
    updatedAt: '2026-07-21T08:00:00.000Z'
  });
  await db.collection(OUTBOX_COLLECTION).doc('outbox_001').set({
    appointmentId: APPOINTMENT,
    correlationId: 'corr_outbox_001',
    causationId: 'audit_appointment_001_confirmed',
    idempotencyKey: EVENT_ID,
    type: 'calendar_projection_requested',
    status: 'pending',
    attempts: 0,
    nextAttemptAt: OUTBOUND_AT
  });
  await db.collection('calendar_pilot_configuration').doc('active').set({
    activeSourceId: SOURCE,
    version: 1,
    expiresAt: '2026-11-28T04:51:37Z',
    health: 'healthy',
    inboundEnabled: true,
    outboundEnabled: true
  });
  await db
    .collection('calendar_pilot_sources')
    .doc(SOURCE)
    .set({ displayName: 'synthetic source' });
  await db.collection('calendar_pilot_patients').doc('A17').set({
    enabled: true
  });
}

/** What the real outbound path puts on the wire for the confirmed appointment. */
async function projectOutbound(): Promise<ExternalCalendarEvent> {
  const posted: string[] = [];
  const calendar = new GoogleCalendarClient({
    calendarId: 'synthetic-calendar',
    getAccessToken: () => Promise.resolve('synthetic-token'),
    fetchImpl: (_url, init) => {
      if (init.method === 'POST' && init.body !== undefined)
        posted.push(init.body);
      return Promise.resolve({
        status: 200,
        text: () => Promise.resolve('{}')
      });
    }
  });
  const summary = await new OutboxProcessor(db, calendar).processDue(
    OUTBOUND_AT
  );
  expect(summary).toMatchObject({ claimed: 1, completed: 1 });
  expect(posted).toHaveLength(1);
  const body = JSON.parse(posted[0]!) as Pick<
    ExternalCalendarEvent,
    'id' | 'summary' | 'start' | 'end' | 'extendedProperties'
  >;
  return {
    id: body.id,
    etag: 'etag-projected',
    status: 'confirmed',
    summary: body.summary,
    start: body.start,
    end: body.end,
    extendedProperties: body.extendedProperties
  };
}

async function runInbound(
  event: ExternalCalendarEvent,
  at: string
): Promise<void> {
  const engine = new CalendarSyncEngine(
    {
      listEvents: () =>
        Promise.resolve({ events: [event], nextSyncToken: `sync-${at}` })
    },
    new FirestoreCalendarSyncRepository(
      db,
      'synthetic-pseudonym-key-32-characters-min'
    )
  );
  await engine.run(at);
}

const candidateDocuments = async () =>
  (await db.collection('calendar_pilot_candidates').get()).docs;

function reviewService(): ClinicCalendarReviewApplicationService {
  return new ClinicCalendarReviewApplicationService(
    new FirestoreClinicCalendarCandidateStore(
      db,
      new FirestoreBookingRepository(db)
    ),
    () => REVIEW_AT
  );
}

const manager = { actorId: 'manager_001', actorRole: 'manager' as const };

beforeAll(() => {
  app = initializeApp(
    { projectId: LOCAL_FIREBASE_PROJECT_ID },
    `calendar-reschedule-cross-layer-${Date.now()}`
  );
  db = getFirestore(app);
});

afterAll(async () => {
  await wipe();
  await deleteApp(app);
});

beforeEach(async () => {
  await wipe();
  await seed();
});

describe('clinic Calendar reschedule: outbound projection -> inbound candidate -> review', () => {
  it('carries the moved start and end into the candidate and applies them on approval', async () => {
    const projected = await projectOutbound();
    // The projection's own echo is not a candidate.
    await runInbound(projected, SYNC_AT);
    expect(await candidateDocuments()).toHaveLength(0);

    // The clinic drags the event to 12:30 in Google Calendar. Google keeps the
    // title and private markers and issues a new ETag.
    await runInbound(
      {
        ...projected,
        etag: 'etag-moved',
        start: { dateTime: '2030-01-02T12:30:00+08:00' },
        end: { dateTime: '2030-01-02T13:30:00+08:00' }
      },
      SYNC_AGAIN_AT
    );

    const candidates = await candidateDocuments();
    expect(candidates).toHaveLength(1);
    const stored = candidates[0]!.data();
    expect(stored).toMatchObject({
      kind: 'update_appointment',
      status: 'pending',
      appointmentId: APPOINTMENT,
      changedFields: ['startsAt', 'endsAt'],
      startsAt: '2030-01-02T04:30:00.000Z',
      endsAt: '2030-01-02T05:30:00.000Z'
    });

    // What the review screen receives.
    const listed = await new FirestoreCalendarPilotRepository(
      db
    ).listCandidates();
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      candidateId: candidates[0]!.id,
      kind: 'update_appointment',
      startsAt: '2030-01-02T04:30:00.000Z',
      endsAt: '2030-01-02T05:30:00.000Z'
    });

    // Approving it reschedules through the booking repository to that slot.
    const reviewed = await reviewService().tryReview({
      candidateId: candidates[0]!.id,
      action: 'accept',
      command: {
        idempotencyKey: 'calendar_candidate_cross_layer_01',
        expectedVersion: 1
      },
      authentication: manager
    });
    expect(reviewed?.candidate).toMatchObject({
      status: 'accepted',
      startsAt: '2030-01-02T04:30:00.000Z',
      endsAt: '2030-01-02T05:30:00.000Z'
    });
    const appointment = (
      await db.collection(COLLECTIONS.appointments).doc(APPOINTMENT).get()
    ).data();
    expect(appointment).toMatchObject({
      slotId: SLOT_B,
      startsAt: '2030-01-02T04:30:00.000Z',
      status: 'confirmed'
    });
    const slotA = (
      await db.collection(COLLECTIONS.slots).doc(SLOT_A).get()
    ).data();
    expect(slotA?.['reservationId']).toBeUndefined();
  });

  it('never stores contact fields or the Calendar title on a reschedule candidate', async () => {
    const projected = await projectOutbound();
    await runInbound(projected, SYNC_AT);
    await runInbound(
      {
        ...projected,
        etag: 'etag-moved',
        start: { dateTime: '2030-01-02T13:00:00+08:00' },
        end: { dateTime: '2030-01-02T14:00:00+08:00' }
      },
      SYNC_AGAIN_AT
    );

    const [candidate] = await candidateDocuments();
    expect(candidate?.data()).toMatchObject({
      startsAt: '2030-01-02T05:00:00.000Z',
      endsAt: '2030-01-02T06:00:00.000Z'
    });
    const serialized = JSON.stringify(candidate?.data());
    expect(serialized).not.toContain('suggestedPatientId');
    expect(serialized).not.toContain('phoneDigits');
    expect(serialized).not.toContain('birthMonthDay');
  });

  it('keeps a Calendar delete of the projected event a cancel candidate without a target time', async () => {
    const projected = await projectOutbound();
    await runInbound(projected, SYNC_AT);
    await runInbound(
      { id: projected.id, etag: 'etag-deleted', status: 'cancelled' },
      SYNC_AGAIN_AT
    );

    const [candidate] = await candidateDocuments();
    expect(candidate?.data()).toMatchObject({
      kind: 'cancel_appointment',
      status: 'pending',
      startsAt: null,
      endsAt: null
    });
  });
});
