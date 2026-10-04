import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { COLLECTIONS } from '../../apps/api/src/firestore/booking.repository.js';
import { FirestorePatientDirectory } from '../../apps/api/src/patients/patient-directory.js';
import {
  LOCAL_FIREBASE_PROJECT_ID,
  requireLocalFirestoreEmulatorTarget
} from '../../packages/config/src/index.js';

// AUD-07 (partial): the staff lists used to apply `.limit(limit)` and only then
// drop archived rows in memory, so archived rows that sort earlier consumed the
// page and a page could return fewer rows than `limit` (in the worst case no
// active row at all).
requireLocalFirestoreEmulatorTarget(process.env['FIRESTORE_EMULATOR_HOST']);

const PATIENT_ID = 'patient_list_active';
const ARCHIVED_PATIENT_ID = 'patient_list_archived';

let app: App;
let db: Firestore;
let directory: FirestorePatientDirectory;

function startsAtOf(index: number): string {
  return new Date(
    Date.parse('2030-03-01T01:00:00.000Z') + index * 30 * 60_000
  ).toISOString();
}

async function seedAppointment(
  id: string,
  index: number,
  options: {
    readonly archived?: boolean | 'false';
    readonly patientId?: string;
  }
): Promise<void> {
  await db
    .collection(COLLECTIONS.appointments)
    .doc(id)
    .set({
      patientId: options.patientId ?? PATIENT_ID,
      slotId: `slot_${id}`,
      bookingKind: 'initial',
      status: 'confirmed',
      startsAt: startsAtOf(index),
      ...(options.archived === true ? { patientArchived: true } : {}),
      ...(options.archived === 'false' ? { patientArchived: false } : {})
    });
}

/** `archivedCount` archived rows sort first, then `activeCount` active rows. */
async function seedArchivedThenActive(
  archivedCount: number,
  activeCount: number
): Promise<void> {
  for (let index = 0; index < archivedCount; index += 1) {
    await seedAppointment(`appt_arch_${index}`, index, {
      archived: true,
      patientId: PATIENT_ID
    });
  }
  for (let index = 0; index < activeCount; index += 1) {
    await seedAppointment(`appt_live_${index}`, archivedCount + index, {});
  }
}

async function wipe(): Promise<void> {
  const documents = await db
    .collection(COLLECTIONS.appointments)
    .listDocuments();
  await Promise.all(documents.map((document) => document.delete()));
}

beforeAll(() => {
  app = initializeApp(
    { projectId: LOCAL_FIREBASE_PROJECT_ID },
    `patient-directory-list-${Date.now()}`
  );
  db = getFirestore(app);
  directory = new FirestorePatientDirectory(db);
});

afterAll(async () => {
  await wipe();
  await deleteApp(app);
});

beforeEach(wipe);

describe('staff appointment lists and archived rows (AUD-07, partial)', () => {
  it('listClinic still returns `limit` active rows when archived rows sort earlier', async () => {
    await seedArchivedThenActive(7, 5);

    const rows = await directory.listClinic(3);

    expect(rows.map((row) => row.appointmentId)).toEqual([
      'appt_live_0',
      'appt_live_1',
      'appt_live_2'
    ]);
  });

  it('listByPatient still returns `limit` active rows when archived rows sort earlier', async () => {
    await seedArchivedThenActive(7, 5);
    // Another patient's rows must not leak into this patient's list.
    await seedAppointment('appt_other_0', 20, {
      patientId: 'patient_list_other'
    });

    const rows = await directory.listByPatient(PATIENT_ID, 3);

    expect(rows.map((row) => row.appointmentId)).toEqual([
      'appt_live_0',
      'appt_live_1',
      'appt_live_2'
    ]);
  });

  it('returns every active row, in startsAt order, when fewer than `limit` exist', async () => {
    await seedArchivedThenActive(7, 5);

    const clinic = await directory.listClinic(50);
    const mine = await directory.listByPatient(PATIENT_ID, 50);

    const expected = [0, 1, 2, 3, 4].map((index) => `appt_live_${index}`);
    expect(clinic.map((row) => row.appointmentId)).toEqual(expected);
    expect(mine.map((row) => row.appointmentId)).toEqual(expected);
  });

  it('keeps order across archived rows interleaved with active ones', async () => {
    await seedAppointment('appt_a', 0, {});
    await seedAppointment('appt_b', 1, { archived: true });
    await seedAppointment('appt_c', 2, { archived: true });
    await seedAppointment('appt_d', 3, {});
    await seedAppointment('appt_e', 4, { archived: true });
    await seedAppointment('appt_f', 5, {});

    const rows = await directory.listClinic(2);

    expect(rows.map((row) => row.appointmentId)).toEqual(['appt_a', 'appt_d']);
  });

  it('treats a row without the flag, or with the flag false, as active', async () => {
    await seedAppointment('appt_missing', 0, {});
    await seedAppointment('appt_false', 1, { archived: 'false' });
    await seedAppointment('appt_hidden', 2, {
      archived: true,
      patientId: ARCHIVED_PATIENT_ID
    });

    const rows = await directory.listClinic(50);

    expect(rows.map((row) => row.appointmentId)).toEqual([
      'appt_missing',
      'appt_false'
    ]);
  });

  it('returns nothing, without looping, when every row is archived', async () => {
    await seedArchivedThenActive(9, 0);

    await expect(directory.listClinic(3)).resolves.toEqual([]);
    await expect(directory.listByPatient(PATIENT_ID, 3)).resolves.toEqual([]);
  });

  it('is unchanged when no row is archived and the page is exactly full', async () => {
    await seedArchivedThenActive(0, 3);

    const rows = await directory.listClinic(3);

    expect(rows.map((row) => row.appointmentId)).toEqual([
      'appt_live_0',
      'appt_live_1',
      'appt_live_2'
    ]);
  });
});

// The staff list used to read the OLDEST rows first with no lower time bound
// and let the caller drop the rows outside its window afterwards, so with
// enough old appointments the page held only rows that were then discarded.
describe('staff appointment lists bounded by the caller window', () => {
  const WINDOW = { from: startsAtOf(100), to: startsAtOf(110) };

  /** `before` rows sort ahead of the window, then rows at the given indexes. */
  async function seedAroundWindow(input: {
    readonly before: number;
    readonly inside: readonly number[];
    readonly after?: readonly number[];
    readonly archivedInside?: readonly number[];
  }): Promise<void> {
    for (let index = 0; index < input.before; index += 1)
      await seedAppointment(`appt_old_${index}`, index, {});
    for (const index of input.inside)
      await seedAppointment(`appt_in_${index}`, index, {});
    for (const index of input.archivedInside ?? [])
      await seedAppointment(`appt_in_arch_${index}`, index, {
        archived: true
      });
    for (const index of input.after ?? [])
      await seedAppointment(`appt_after_${index}`, index, {});
  }

  it('returns the in-window rows when more than `limit` older rows sort first', async () => {
    await seedAroundWindow({ before: 12, inside: [100, 103, 105] });

    const rows = await directory.listClinic(5, WINDOW);

    expect(rows.map((row) => row.appointmentId)).toEqual([
      'appt_in_100',
      'appt_in_103',
      'appt_in_105'
    ]);
  });

  it('does not return older rows to fill the page', async () => {
    await seedAroundWindow({ before: 12, inside: [100] });

    const rows = await directory.listClinic(5, WINDOW);

    expect(rows.map((row) => row.appointmentId)).toEqual(['appt_in_100']);
  });

  it('stops at the upper bound and keeps both bounds inclusive', async () => {
    await seedAroundWindow({
      before: 3,
      inside: [99, 100, 110, 111],
      after: [300, 301]
    });

    const rows = await directory.listClinic(50, WINDOW);

    expect(rows.map((row) => row.appointmentId)).toEqual([
      'appt_in_100',
      'appt_in_110'
    ]);
  });

  it('pages through the window and still skips archived rows inside it', async () => {
    await seedAroundWindow({
      before: 12,
      inside: [100, 104, 106, 108],
      archivedInside: [101, 102, 103]
    });

    const rows = await directory.listClinic(3, WINDOW);

    expect(rows.map((row) => row.appointmentId)).toEqual([
      'appt_in_100',
      'appt_in_104',
      'appt_in_106'
    ]);
  });

  it('bounds the patient list the same way', async () => {
    await seedAroundWindow({ before: 12, inside: [100, 103] });
    await seedAppointment('appt_other_101', 101, {
      patientId: 'patient_list_other'
    });

    const rows = await directory.listByPatient(PATIENT_ID, 5, WINDOW);

    expect(rows.map((row) => row.appointmentId)).toEqual([
      'appt_in_100',
      'appt_in_103'
    ]);
  });

  it('is unchanged when no window is given', async () => {
    await seedAroundWindow({ before: 4, inside: [100] });

    const rows = await directory.listClinic(3);

    expect(rows.map((row) => row.appointmentId)).toEqual([
      'appt_old_0',
      'appt_old_1',
      'appt_old_2'
    ]);
  });
});
