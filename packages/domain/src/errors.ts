export type DomainErrorCode =
  | 'APPOINTMENT_NOT_CONFIRMABLE'
  | 'APPOINTMENT_NOT_CANCELLABLE'
  | 'BOOKING_KIND_MISMATCH'
  | 'CANCELLATION_WINDOW_CLOSED'
  | 'COMPLETION_NOT_AUTHORIZED'
  | 'DUPLICATE_ACTIVE_BOOKING'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'INVALID_ASSIGNMENT'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_VALUE'
  | 'PAYROLL_DUPLICATE_CREDIT'
  | 'PAYROLL_NOT_ELIGIBLE'
  | 'SLOT_NOT_FOUND'
  | 'SLOT_UNAVAILABLE';

export class DomainError extends Error {
  public readonly name = 'DomainError';

  public constructor(
    public readonly code: DomainErrorCode,
    message: string
  ) {
    super(message);
  }
}
