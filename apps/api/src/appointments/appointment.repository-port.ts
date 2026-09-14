import type {
  AppointmentStatusValue,
  BookingKind,
  BookingRequest,
  DeleteAppointmentRequest,
  FollowUpDecisionRequest,
  FollowUpDecisionValue,
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
  reserve(request: BookingRequest): Promise<ReservationResult>;
  reschedule(request: RescheduleRequest): Promise<ReservationResult>;
  transition(request: TransitionRequest): Promise<TransitionResult>;
  recordFollowUp(request: FollowUpDecisionRequest): Promise<FollowUpResult>;
  deleteAppointment(request: DeleteAppointmentRequest): Promise<DeletionResult>;
  read(appointmentId: string): Promise<AppointmentRecord | undefined>;
  /** Owner of the appointment, or `undefined` when the row is missing. */
  patientIdOf(appointmentId: string): Promise<string | undefined>;
}
