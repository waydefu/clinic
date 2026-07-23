import type { BookingRequest } from '@beauessence/domain';

export interface ReservationResult {
  readonly appointmentId: string;
  /** True when the request replayed an idempotency key instead of writing. */
  readonly replayed: boolean;
}

/**
 * Application-owned persistence boundary. Adapters may use Firestore, but
 * application services and future controllers depend only on this port.
 */
export interface AppointmentRepositoryPort {
  reserve(request: BookingRequest): Promise<ReservationResult>;
}
