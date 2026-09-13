import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { AuthenticationContext } from '../../apps/api/src/auth/authentication-context.js';
import { AppointmentApplicationService } from '../../apps/api/src/appointments/appointment.application-service.js';
import type { AppointmentAuthorizationPolicy } from '../../apps/api/src/appointments/appointment.policy.js';
import {
  COLLECTIONS,
  FirestoreBookingRepository
} from '../../apps/api/src/firestore/booking.repository.js';
import { FirestoreScheduleRepository } from '../../apps/api/src/firestore/schedule.repository.js';
import { ScheduleApplicationService } from '../../apps/api/src/schedule/schedule.application-service.js';
import type { ScheduleAuthorizationPolicy } from '../../apps/api/src/schedule/schedule.policy.js';
import {
  LOCAL_FIREBASE_PROJECT_ID,
  requireLocalFirestoreEmulatorTarget
} from '../../packages/config/src/index.js';

requireLocalFirestoreEmulatorTarget(process.env['FIRESTORE_EMULATOR_HOST']);
const projectId = LOCAL_FIREBASE_PROJECT_ID;
const NOW = '2029-12-15T09:00:00.000Z';
const SLOT_ID = 'slot_20300102_1200';

const PUBLISH_COMMAND = {
  idempotencyKey: 'schedule_publish_http_0001',
  expectedVersion: 0,
  schedule: {
    timeZone: 'Asia/Taipei' as const,
    weeklyAvailability: [
      {
        weekday: 3,
        intervals: [{ startLocalTime: '12:00', endLocalTime: '20:30' }]
      }
    ],
    dateExceptions: []
  }
};

const MANAGER: AuthenticationContext = {
  actorId: 'actor_manager_http_001',
  actorRole: 'manager'
};

const PATIENT: AuthenticationContext = {
  actorId: 'actor_patient_http_001',
  actorRole: 'patient',
  verifiedPatientId: 'patient_001'
};

const allowSchedule: ScheduleAuthorizationPolicy = {
  assertCanPublish: () => Promise.resolve(),
  assertCanReadGrid: () => Promise.resolve()
};

const allowAppointments: AppointmentAuthorizationPolicy = {
  assertCanCreate: () => Promise.resolve(),
  assertCanQuery: () => Promise.resolve(),
  assertCanCancel: () => Promise.resolve(),
  assertCanReschedule: () => Promise.resolve(),
  assertCanComplete: () => Promise.resolve(),
  assertCanDelete: () => Promise.resolve()
};

let app: App;
let db: Firestore;
let schedules: ScheduleApplicationService;
let appointments: AppointmentApplicationService;

describe('application publish then lazy slot reservation', () => {
  beforeAll(() => {
    app = initializeApp({ projectId }, 'schedule-http-occupancy');
    db = getFirestore(app);
    schedules = new ScheduleApplicationService(
      new FirestoreScheduleRepository(db),
      allowSchedule,
      { nowUtc: () => NOW },
      { next: () => 'corr_http_schedule_001' }
    );
    appointments = new AppointmentApplicationService(
      new FirestoreBookingRepository(db),
      allowAppointments,
      { next: () => 'appointment_http_occupancy_001' },
      { nowUtc: () => NOW },
      { next: () => 'corr_http_occupancy_001' }
    );
  });

  afterAll(async () => {
    await deleteApp(app);
  });

  beforeEach(async () => {
    for (const collection of Object.values(COLLECTIONS)) {
      const documents = await db.collection(collection).listDocuments();
      await Promise.all(documents.map((document) => document.delete()));
    }
  });

  it('lists a published grid slot and books it without a seeded slot document', async () => {
    const published = await schedules.publish(PUBLISH_COMMAND, MANAGER);
    expect(published.publishedVersion).toBe(1);
    expect(published.publishedAt).toBe(NOW);
    expect(published.slotCount).toBeGreaterThan(0);

    const listed = await schedules.listSlots(PATIENT, 'initial');
    expect(
      listed.slots.some((slot) => slot.slotId === SLOT_ID && slot.available)
    ).toBe(true);
    await expect(
      db.collection(COLLECTIONS.slots).doc(SLOT_ID).get()
    ).resolves.toMatchObject({ exists: false });

    await expect(
      appointments.create(
        {
          idempotencyKey: 'booking_http_occupancy_0001',
          slotId: SLOT_ID,
          serviceId: 'service_consult',
          bookingKind: 'initial'
        },
        PATIENT
      )
    ).resolves.toMatchObject({
      appointmentId: 'appointment_http_occupancy_001',
      status: 'confirmed',
      startsAt: '2030-01-02T04:00:00.000Z'
    });

    const slot = await db.collection(COLLECTIONS.slots).doc(SLOT_ID).get();
    expect(slot.data()?.['reservationId']).toBe(
      'appointment_http_occupancy_001'
    );
  });
});
