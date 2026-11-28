import type { AppointmentNoteTag } from '@beauessence/contracts';
import type { PreparedPatientIntake } from '../patients/patient-directory.js';
import type {
  AppointmentStatusValue,
  AuditContext,
  BookingKind,
  BookingRequest,
  DeleteAppointmentRequest,
  FollowUpDecisionRequest,
  FollowUpDecisionValue,
  IdempotencyContext,
  PatientNationality,
  RescheduleRequest,
  TransitionRequest
} from '@beauessence/domain';

export interface ReservationResult {
  readonly appointmentId: string;
  /** True when the request replayed an idempotency key instead of writing. */
  readonly replayed: boolean;
  /** Authoritative slot start from the plan or the replayed row. */
  readonly startsAt?: string;
}

export interface AppointmentRecord {
  readonly appointmentId: string;
  readonly patientId: string;
  readonly slotId: string;
  readonly bookingKind: BookingKind;
  readonly status: AppointmentStatusValue;
  readonly startsAt?: string;
  /** Staff-only visit fact (ADR-0007); absent on follow-ups and older rows. */
  readonly intakeNationality?: PatientNationality;
  /** Staff-only booking note (BOOKING-NOTE-STORAGE-2026-09-29). */
  readonly patientNote?: string;
  /** Staff-only counter note (STAFF-NOTE-2026-11-28). */
  readonly noteTags?: readonly AppointmentNoteTag[];
  readonly noteText?: string;
  /** Staff-only: the visit was completed without the NHI card. */
  readonly nhiCardMissing?: true;
  /** Attention only: no archive identity or history is disclosed. */
  readonly identityReviewRequired?: true;
}

export interface NotesUpdateRequest {
  readonly appointmentId: string;
  readonly noteTags: readonly AppointmentNoteTag[];
  readonly noteText: string;
  readonly audit: AuditContext;
  readonly requestedAt: string;
  readonly idempotency: IdempotencyContext;
}

export interface NotesUpdateResult {
  readonly appointmentId: string;
  readonly replayed: boolean;
  readonly noteTags: readonly AppointmentNoteTag[];
  readonly noteText: string;
}

export interface TransitionResult {
  readonly appointmentId: string;
  readonly replayed: boolean;
  readonly status: AppointmentStatusValue;
}

export interface FollowUpResult {
  readonly appointmentId: string;
  readonly replayed: boolean;
  readonly decision: FollowUpDecisionValue;
  readonly dueAt: string | null;
}

export interface DeletionResult {
  readonly appointmentId: string;
  readonly replayed: boolean;
  readonly auditEventId: string;
}

/**
 * Application-owned persistence boundary. Adapters may use Firestore, but
 * application services and future controllers depend only on this port.
 */
export interface AppointmentRepositoryPort {
  reserve(
    request: BookingRequest,
    intake?: PreparedPatientIntake
  ): Promise<ReservationResult>;
  reschedule(request: RescheduleRequest): Promise<ReservationResult>;
  transition(request: TransitionRequest): Promise<TransitionResult>;
  updateNotes(request: NotesUpdateRequest): Promise<NotesUpdateResult>;
  recordFollowUp(request: FollowUpDecisionRequest): Promise<FollowUpResult>;
  deleteAppointment(request: DeleteAppointmentRequest): Promise<DeletionResult>;
  read(appointmentId: string): Promise<AppointmentRecord | undefined>;
  /** Owner of the appointment, or `undefined` when the row is missing. */
  patientIdOf(appointmentId: string): Promise<string | undefined>;
}
