import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { CalendarChangeCandidateSchema } from '../../packages/contracts/src/calendar-sync.js';
import { calendarEventIdForAppointment } from '@beauessence/domain';
import { opaqueLookupIdentity } from '@beauessence/domain/patient-lookup-identity.node';
import {
  CalendarSyncEngine,
  CalendarSyncTokenExpiredError
} from '../../apps/worker/src/calendar-sync/sync-engine.js';
import { FirestoreCalendarSyncRepository } from '../../apps/worker/src/calendar-sync/firestore-calendar-sync.repository.js';
import { FirestoreCalendarPilotRepository } from '../../apps/api/src/firestore/calendar-pilot.repository.js';
import {
  LOCAL_FIREBASE_PROJECT_ID,
  requireLocalFirestoreEmulatorTarget
} from '../../packages/config/src/index.js';

requireLocalFirestoreEmulatorTarget(process.env['FIRESTORE_EMULATOR_HOST']);

const NOW = '2026-08-28T08:00:00.000Z';
const SOURCE = 'calendar_source_primary';

let app: App;
let db: Firestore;

async function wipe(names: readonly string[]): Promise<void> {
  for (const collection of names) {
    const documents = await db.collection(collection).listDocuments();
    await Promise.all(documents.map((document) => document.delete()));
  }
}

const SUGGESTION_PHONE = '0987654321';
const SUGGESTION_BIRTHDAY = '--11-23';
const SUGGESTION_INDEX_ID = opaqueLookupIdentity(
  SUGGESTION_PHONE,
  SUGGESTION_BIRTHDAY
);
const SUGGESTION_PATIENT_IDS = [
  'l2b_suggestion_patient_001',
  'l2b_suggestion_patient_002',
  'l2b_suggestion_patient_archived_001'
] as const;

async function clearSuggestionFixtures(): Promise<void> {
  await Promise.all([
    db.collection('patient_lookup_index_v2').doc(SUGGESTION_INDEX_ID).delete(),
    ...SUGGESTION_PATIENT_IDS.map((patientId) =>
      db.collection('patients').doc(patientId).delete()
    )
  ]);
}

async function seedSuggestionPatients(
  patientIds: readonly string[],
  archivedPatientIds: readonly string[] = []
): Promise<void> {
  await db
    .collection('patient_lookup_index_v2')
    .doc(SUGGESTION_INDEX_ID)
    .set({
      patientIds: [...patientIds]
    });
  await Promise.all(
    patientIds.map((patientId, index) =>
      db
        .collection('patients')
        .doc(patientId)
        .set({
          patientId,
          name: index === 0 ? '合成患者甲' : '合成患者乙',
          ...(archivedPatientIds.includes(patientId)
            ? { archivedAt: '2030-10-01T00:00:00.000Z' }
            : {})
        })
    )
  );
}

async function runManualEvent(summary: string): Promise<void> {
  const repository = new FirestoreCalendarSyncRepository(
    db,
    'synthetic-pseudonym-key-32-characters-min'
  );
  const engine = new CalendarSyncEngine(
    {
      listEvents: () =>
        Promise.resolve({
          events: [
            {
              id: 'manual_event_001',
              etag: 'manual_etag_001',
              status: 'confirmed',
              summary,
              start: { dateTime: '2026-09-02T14:00:00+08:00' },
              end: { dateTime: '2026-09-02T14:30:00+08:00' }
            }
          ],
          nextSyncToken: 'sync-manual-suggestion'
        })
    },
    repository
  );
  await engine.run(NOW);
}

describe('Stage D Calendar inbound emulator', () => {
  beforeAll(() => {
    app = initializeApp(
      { projectId: LOCAL_FIREBASE_PROJECT_ID },
      'calendar-stage-d-inbound'
    );
    db = getFirestore(app);
  });

  afterAll(async () => {
    await clearSuggestionFixtures();
    await deleteApp(app);
  });

  beforeEach(async () => {
    await clearSuggestionFixtures();
    await wipe([
      'calendar_pilot_configuration',
      'calendar_pilot_sources',
      'calendar_pilot_candidates',
      'calendar_pilot_mirrors',
      'calendar_pilot_patients',
      'calendar_pilot_audit_events',
      'appointments'
    ]);
    await db.collection('calendar_pilot_configuration').doc('active').set({
      activeSourceId: SOURCE,
      version: 1,
      expiresAt: '2026-11-28T04:51:37Z',
      health: 'healthy',
      inboundEnabled: true,
      outboundEnabled: true
    });
    await db.collection('calendar_pilot_sources').doc(SOURCE).set({
      displayName: 'synthetic source'
    });
    await db.collection('calendar_pilot_patients').doc('A17').set({
      enabled: true
    });
  });

  it('creates a pending candidate without mutating the clinic appointment', async () => {
    const appointmentId = 'appointment_001';
    await db.collection('appointments').doc(appointmentId).set({
      appointmentId,
      status: 'confirmed',
      startsAt: '2030-01-02T06:15:00.000Z',
      bookingKind: 'follow_up'
    });
    const eventId = calendarEventIdForAppointment(appointmentId);
    const repository = new FirestoreCalendarSyncRepository(
      db,
      'synthetic-pseudonym-key-32-characters-min'
    );
    const engine = new CalendarSyncEngine(
      {
        listEvents: () =>
          Promise.resolve({
            events: [
              {
                id: eventId,
                etag: 'etag-moved',
                status: 'confirmed',
                summary: 'manual move',
                start: { dateTime: '2030-01-02T06:45:00.000Z' },
                end: { dateTime: '2030-01-02T07:15:00.000Z' }
              }
            ],
            nextSyncToken: 'sync-pending'
          })
      },
      repository
    );

    const summary = await engine.run(NOW);
    expect(summary.candidates).toBe(1);
    const live = await db.collection('appointments').doc(appointmentId).get();
    expect(live.data()?.['startsAt']).toBe('2030-01-02T06:15:00.000Z');
    expect(live.data()?.['status']).toBe('confirmed');
  });

  it('stores the status and the start the appointment had on its candidate and keeps both out of the staff candidate list', async () => {
    const appointmentId = 'appointment_001';
    await db.collection('appointments').doc(appointmentId).set({
      appointmentId,
      status: 'confirmed',
      startsAt: '2030-01-02T06:15:00.000Z',
      bookingKind: 'follow_up'
    });
    const repository = new FirestoreCalendarSyncRepository(
      db,
      'synthetic-pseudonym-key-32-characters-min'
    );
    await new CalendarSyncEngine(
      {
        listEvents: () =>
          Promise.resolve({
            events: [
              {
                id: calendarEventIdForAppointment(appointmentId),
                etag: 'etag-moved-status',
                status: 'confirmed',
                summary: 'manual move',
                start: { dateTime: '2030-01-02T06:45:00.000Z' },
                end: { dateTime: '2030-01-02T07:15:00.000Z' }
              }
            ],
            nextSyncToken: 'sync-pending-status'
          })
      },
      repository
    ).run(NOW);

    const stored = (
      await db.collection('calendar_pilot_candidates').get()
    ).docs[0]?.data();
    expect(stored).toMatchObject({
      kind: 'update_appointment',
      appointmentStatusAtDetection: 'confirmed',
      appointmentStartsAtAtDetection: '2030-01-02T06:15:00.000Z'
    });
    const listed = await new FirestoreCalendarPilotRepository(
      db
    ).listCandidates();
    expect(listed).toHaveLength(1);
    // The staff-facing shape is a strict contract; the internal field is not in it.
    expect(listed[0]).not.toHaveProperty('appointmentStatusAtDetection');
    expect(listed[0]).not.toHaveProperty('appointmentStartsAtAtDetection');
    expect(CalendarChangeCandidateSchema.safeParse(listed[0]).success).toBe(
      true
    );
  });

  it('does not auto-create a patient or appointment for an unmatched event', async () => {
    const repository = new FirestoreCalendarSyncRepository(
      db,
      'synthetic-pseudonym-key-32-characters-min'
    );
    const engine = new CalendarSyncEngine(
      {
        listEvents: () =>
          Promise.resolve({
            events: [
              {
                id: 'manual-unmatched',
                etag: 'etag-unmatched',
                status: 'confirmed',
                summary: 'Birthday party',
                start: { dateTime: '2026-09-02T14:00:00+08:00' },
                end: { dateTime: '2026-09-02T15:00:00+08:00' }
              }
            ],
            nextSyncToken: 'sync-unmatched'
          })
      },
      repository
    );
    await engine.run(NOW);
    const appointments = await db.collection('appointments').listDocuments();
    const patients = await db.collection('patients').listDocuments();
    expect(appointments).toHaveLength(0);
    expect(patients).toHaveLength(0);
    const candidates = await db.collection('calendar_pilot_candidates').get();
    expect(candidates.docs[0]?.data()?.['kind']).toBe('unmatched');
    expect(candidates.docs[0]?.data()?.['status']).toBe('unmatched');
  });

  it('suggests the sole active phone + month-day match without storing contact values', async () => {
    const patientId = SUGGESTION_PATIENT_IDS[0];
    await seedSuggestionPatients([patientId]);
    await runManualEvent('合成患者甲 0987-654-321　801123');

    const candidates = await db.collection('calendar_pilot_candidates').get();
    expect(candidates.docs).toHaveLength(1);
    const candidate = candidates.docs[0]?.data();
    expect(candidate).toMatchObject({
      kind: 'unmatched',
      status: 'unmatched',
      suggestedPatientId: patientId,
      suggestionMethod: 'phone_month_day',
      startsAt: '2026-09-02T06:00:00.000Z',
      endsAt: '2026-09-02T06:30:00.000Z'
    });
    const serialized = JSON.stringify(candidate);
    expect(serialized).not.toContain(SUGGESTION_PHONE);
    expect(serialized).not.toContain(SUGGESTION_BIRTHDAY);
    expect(serialized).not.toContain(SUGGESTION_INDEX_ID);
    const apiCandidates = await new FirestoreCalendarPilotRepository(
      db
    ).listCandidates();
    expect(apiCandidates[0]).toMatchObject({
      suggestedPatientId: patientId,
      suggestedPatientName: '合成患者甲',
      suggestionMethod: 'phone_month_day'
    });
    await db
      .collection('patients')
      .doc(patientId)
      .update({ archivedAt: '2030-10-01T00:00:00.000Z' });
    const candidatesAfterArchive = await new FirestoreCalendarPilotRepository(
      db
    ).listCandidates();
    expect(candidatesAfterArchive).toMatchObject([{ kind: 'unmatched' }]);
    expect(candidatesAfterArchive).not.toContainEqual(
      expect.objectContaining({ suggestedPatientId: patientId })
    );
    expect((await db.collection('appointments').get()).docs).toHaveLength(0);
  });

  it('does not suggest when the lookup index is ambiguous', async () => {
    await seedSuggestionPatients(SUGGESTION_PATIENT_IDS.slice(0, 2));
    await runManualEvent('合成患者甲0987654321 801123');

    const candidate = (
      await db.collection('calendar_pilot_candidates').get()
    ).docs[0]?.data();
    expect(candidate).not.toHaveProperty('suggestedPatientId');
    expect(candidate).not.toHaveProperty('suggestionMethod');
  });

  it('does not suggest when the lookup index has no patient', async () => {
    await runManualEvent('合成患者甲0987654321 801123');

    const candidate = (
      await db.collection('calendar_pilot_candidates').get()
    ).docs[0]?.data();
    expect(candidate).not.toHaveProperty('suggestedPatientId');
    expect(candidate).not.toHaveProperty('suggestionMethod');
  });

  it('does not suggest an archived patient', async () => {
    await seedSuggestionPatients(
      [SUGGESTION_PATIENT_IDS[2]],
      [SUGGESTION_PATIENT_IDS[2]]
    );
    await runManualEvent('合成患者甲0987654321 801123');

    const candidate = (
      await db.collection('calendar_pilot_candidates').get()
    ).docs[0]?.data();
    expect(candidate).not.toHaveProperty('suggestedPatientId');
    expect(candidate).not.toHaveProperty('suggestionMethod');
  });

  it('suggests the sole active patient when an archived patient shares the lookup key', async () => {
    const activeId = SUGGESTION_PATIENT_IDS[0];
    const archivedId = SUGGESTION_PATIENT_IDS[2];
    // PR #208 keeps archived patients' IDs in the index, so a new patient with
    // the same phone + month-day yields two indexed IDs but one active patient.
    await seedSuggestionPatients([archivedId, activeId], [archivedId]);
    await runManualEvent('合成患者甲0987654321 801123');

    const candidate = (
      await db.collection('calendar_pilot_candidates').get()
    ).docs[0]?.data();
    expect(candidate).toMatchObject({
      kind: 'unmatched',
      suggestedPatientId: activeId,
      suggestionMethod: 'phone_month_day'
    });
    const serialized = JSON.stringify(candidate);
    expect(serialized).not.toContain(archivedId);
    expect(serialized).not.toContain(SUGGESTION_PHONE);
    expect(serialized).not.toContain(SUGGESTION_BIRTHDAY);
    expect(serialized).not.toContain(SUGGESTION_INDEX_ID);
    const apiCandidates = await new FirestoreCalendarPilotRepository(
      db
    ).listCandidates();
    expect(apiCandidates[0]).toMatchObject({
      suggestedPatientId: activeId,
      suggestedPatientName: '合成患者乙',
      suggestionMethod: 'phone_month_day'
    });
  });

  it('does not suggest when two active patients share the lookup key, archived or not', async () => {
    await seedSuggestionPatients(
      [
        SUGGESTION_PATIENT_IDS[2],
        SUGGESTION_PATIENT_IDS[0],
        SUGGESTION_PATIENT_IDS[1]
      ],
      [SUGGESTION_PATIENT_IDS[2]]
    );
    await runManualEvent('合成患者甲0987654321 801123');

    const candidate = (
      await db.collection('calendar_pilot_candidates').get()
    ).docs[0]?.data();
    expect(candidate).toMatchObject({ kind: 'unmatched' });
    expect(candidate).not.toHaveProperty('suggestedPatientId');
    expect(candidate).not.toHaveProperty('suggestionMethod');
  });

  it('does not suggest when every indexed patient is archived or missing', async () => {
    await seedSuggestionPatients(
      [SUGGESTION_PATIENT_IDS[2]],
      [SUGGESTION_PATIENT_IDS[2]]
    );
    // An index entry whose patient document no longer exists is not a patient.
    await db
      .collection('patient_lookup_index_v2')
      .doc(SUGGESTION_INDEX_ID)
      .set({
        patientIds: [SUGGESTION_PATIENT_IDS[2], 'l2b_suggestion_patient_gone']
      });
    await runManualEvent('合成患者甲0987654321 801123');

    const candidate = (
      await db.collection('calendar_pilot_candidates').get()
    ).docs[0]?.data();
    expect(candidate).not.toHaveProperty('suggestedPatientId');
    expect(candidate).not.toHaveProperty('suggestionMethod');
  });

  it('does not suggest from a malformed lookup index entry', async () => {
    await seedSuggestionPatients([SUGGESTION_PATIENT_IDS[0]]);
    await db
      .collection('patient_lookup_index_v2')
      .doc(SUGGESTION_INDEX_ID)
      .set({ patientIds: [SUGGESTION_PATIENT_IDS[0], 'not/a-valid-id'] });
    await runManualEvent('合成患者甲0987654321 801123');

    const candidate = (
      await db.collection('calendar_pilot_candidates').get()
    ).docs[0]?.data();
    expect(candidate).not.toHaveProperty('suggestedPatientId');
    expect(candidate).not.toHaveProperty('suggestionMethod');
  });

  it('keeps the clinic appointment when Calendar deletes the projected event', async () => {
    const appointmentId = 'appointment_001';
    await db.collection('appointments').doc(appointmentId).set({
      appointmentId,
      status: 'confirmed',
      startsAt: '2030-01-02T06:15:00.000Z',
      bookingKind: 'follow_up'
    });
    const eventId = calendarEventIdForAppointment(appointmentId);
    const repository = new FirestoreCalendarSyncRepository(
      db,
      'synthetic-pseudonym-key-32-characters-min'
    );
    const engine = new CalendarSyncEngine(
      {
        listEvents: () =>
          Promise.resolve({
            events: [
              {
                id: eventId,
                etag: 'etag-deleted',
                status: 'cancelled'
              }
            ],
            nextSyncToken: 'sync-deleted'
          })
      },
      repository
    );
    const summary = await engine.run(NOW);
    expect(summary.candidates).toBe(1);
    const live = await db.collection('appointments').doc(appointmentId).get();
    expect(live.exists).toBe(true);
    expect(live.data()?.['status']).toBe('confirmed');
    const candidates = await db.collection('calendar_pilot_candidates').get();
    expect(candidates.docs[0]?.data()?.['kind']).toBe('cancel_appointment');
    expect(candidates.docs[0]?.data()?.['status']).toBe('pending');
  });

  it('recovers from a 410 without overwriting clinic appointments', async () => {
    const appointmentId = 'appointment_001';
    await db.collection('appointments').doc(appointmentId).set({
      appointmentId,
      status: 'confirmed',
      startsAt: '2030-01-02T06:15:00.000Z',
      bookingKind: 'follow_up'
    });
    await db.collection('calendar_pilot_sources').doc(SOURCE).set({
      displayName: 'synthetic source',
      syncToken: 'expired-token',
      lastFullSyncAt: '2026-08-28T07:00:00.000Z'
    });
    let calls = 0;
    const repository = new FirestoreCalendarSyncRepository(
      db,
      'synthetic-pseudonym-key-32-characters-min'
    );
    const engine = new CalendarSyncEngine(
      {
        listEvents: (request) => {
          calls += 1;
          if (calls === 1) {
            expect(request.syncToken).toBe('expired-token');
            return Promise.reject(new CalendarSyncTokenExpiredError('gone'));
          }
          expect(request.syncToken).toBeUndefined();
          return Promise.resolve({
            events: [],
            nextSyncToken: 'fresh-token'
          });
        }
      },
      repository
    );
    const summary = await engine.run(NOW);
    expect(summary.rebuiltAfterExpiredToken).toBe(true);
    const live = await db.collection('appointments').doc(appointmentId).get();
    expect(live.data()?.['startsAt']).toBe('2030-01-02T06:15:00.000Z');
    const source = await db
      .collection('calendar_pilot_sources')
      .doc(SOURCE)
      .get();
    expect(source.data()?.['syncToken']).toBe('fresh-token');
    const audits = await db.collection('calendar_pilot_audit_events').get();
    expect(
      audits.docs.some(
        (document) =>
          document.data()?.['action'] === 'calendar_sync_token_410_recovered'
      )
    ).toBe(true);
  });
});
