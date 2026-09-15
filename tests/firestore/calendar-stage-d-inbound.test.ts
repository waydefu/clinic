import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { calendarEventIdForAppointment } from '@beauessence/domain';
import {
  CalendarSyncEngine,
  CalendarSyncTokenExpiredError
} from '../../apps/worker/src/calendar-sync/sync-engine.js';
import { FirestoreCalendarSyncRepository } from '../../apps/worker/src/calendar-sync/firestore-calendar-sync.repository.js';
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

describe('Stage D Calendar inbound emulator', () => {
  beforeAll(() => {
    app = initializeApp(
      { projectId: LOCAL_FIREBASE_PROJECT_ID },
      'calendar-stage-d-inbound'
    );
    db = getFirestore(app);
  });

  afterAll(async () => {
    await deleteApp(app);
  });

  beforeEach(async () => {
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
