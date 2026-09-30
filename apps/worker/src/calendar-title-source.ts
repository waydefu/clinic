import type { Firestore } from 'firebase-admin/firestore';

import { formatClinicAppointmentTitle } from '@beauessence/domain';

function documentFields(
  value: unknown
): Readonly<Record<string, unknown>> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    return undefined;
  return value as Readonly<Record<string, unknown>>;
}

export interface CalendarTitleSource {
  titleFor(
    appointmentId: string,
    bookingKind?: string
  ): Promise<string | undefined>;
}

/**
 * Read-only title lookup used only by the isolated C1 appointment test
 * calendar. Patient fields are formatted in memory and never stored in the
 * outbox or logged by this adapter.
 */
export class FirestoreCalendarTitleSource implements CalendarTitleSource {
  public constructor(private readonly db: Firestore) {}

  public async titleFor(
    appointmentId: string,
    bookingKindOverride?: string
  ): Promise<string | undefined> {
    try {
      const appointment = await this.db
        .collection('appointments')
        .doc(appointmentId)
        .get();
      const appointmentData = documentFields(appointment.data());
      if (!appointment.exists || appointmentData === undefined)
        return undefined;

      const patientId = appointmentData['patientId'];
      if (typeof patientId !== 'string' || patientId.trim() === '')
        return undefined;

      const patient = await this.db.collection('patients').doc(patientId).get();
      const patientData = documentFields(patient.data());
      if (
        !patient.exists ||
        patientData === undefined ||
        (patientData['archivedAt'] !== undefined &&
          patientData['archivedAt'] !== null)
      )
        return undefined;

      const bookingKind = bookingKindOverride ?? appointmentData['bookingKind'];
      if (typeof bookingKind !== 'string') return undefined;
      const itemId = appointmentData['itemId'];
      const name = patientData['name'];
      const phoneDigits = patientData['phoneDigits'];
      const birthMonthDay = patientData['birthMonthDay'];
      const patientNote = appointmentData['patientNote'];
      return formatClinicAppointmentTitle({
        bookingKind,
        ...(typeof itemId === 'string' ? { itemId } : {}),
        ...(typeof name === 'string' ? { name } : {}),
        ...(typeof phoneDigits === 'string' ? { phoneDigits } : {}),
        ...(typeof birthMonthDay === 'string' ? { birthMonthDay } : {}),
        ...(typeof patientNote === 'string' ? { patientNote } : {})
      });
    } catch {
      // Title enrichment is best-effort; a read failure must preserve the
      // ordinary minimal Calendar projection.
      return undefined;
    }
  }
}

export const NO_CALENDAR_TITLE: CalendarTitleSource = Object.freeze({
  titleFor: () => Promise.resolve(undefined)
});
