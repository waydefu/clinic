import type { BookingKind, SlotSnapshot } from './booking-transaction.js';
import { ACTIVE_BOOKING_LIMIT } from './booking-transaction.js';
import { DomainError } from './errors.js';

/**
 * The single source of truth for what a booking, transition or reschedule is
 * allowed to do. Both the server planners (planBooking / planTransition /
 * planReschedule) and the browser modules call these assertions, so the rules
 * cannot drift between the two runtimes (ADR-0004).
 *
 * Each assertion is a pure guard: it throws a DomainError with a code, or
 * returns. The DomainError code is the stable contract; the browser maps each
 * code to a localized message for the UI, so wording lives at the edge while
 * the rule lives here.
 */

export type AppointmentTransition =
  'request_cancellation' | 'cancel' | 'complete' | 'no_show';

export type AppointmentStatusValue =
  | 'confirmed'
  | 'cancellation_requested'
  | 'cancelled'
  | 'completed'
  | 'no_show';

/** 尚未結束、仍佔用時段的狀態。 */
export const OPEN_STATUSES: readonly AppointmentStatusValue[] = [
  'confirmed',
  'cancellation_requested'
];

/** 每個轉換可以從哪些狀態進入。 */
const ALLOWED_FROM: Record<
  AppointmentTransition,
  readonly AppointmentStatusValue[]
> = {
  // 提出取消與標記到診都只能從「預約成立」進入。
  request_cancellation: ['confirmed'],
  complete: ['confirmed'],
  // 取消與未到可從「預約成立」或「取消待確認」進入。
  cancel: OPEN_STATUSES,
  no_show: OPEN_STATUSES
};

export function assertSlotBookable(
  slot: SlotSnapshot | undefined,
  bookingKind: BookingKind
): asserts slot is SlotSnapshot {
  if (slot === undefined || slot.reservationId !== undefined) {
    throw new DomainError(
      'SLOT_UNAVAILABLE',
      'The slot does not exist or is already reserved.'
    );
  }
  if (slot.kind !== bookingKind) {
    throw new DomainError(
      'BOOKING_KIND_MISMATCH',
      'The slot belongs to a different booking kind.'
    );
  }
}

export function assertWithinActiveBookingLimit(activeCount: number): void {
  if (activeCount >= ACTIVE_BOOKING_LIMIT) {
    throw new DomainError(
      'DUPLICATE_ACTIVE_BOOKING',
      'The patient already has an active booking.'
    );
  }
}

export function assertTransitionAllowed(
  transition: AppointmentTransition,
  status: AppointmentStatusValue
): void {
  if (!ALLOWED_FROM[transition].includes(status)) {
    throw new DomainError(
      'TRANSITION_NOT_ALLOWED',
      `An appointment in status "${status}" cannot be ${transition}.`
    );
  }
}

export function assertReschedulable(
  currentStatus: AppointmentStatusValue,
  currentSlotId: string,
  targetSlot: SlotSnapshot | undefined,
  bookingKind: BookingKind
): asserts targetSlot is SlotSnapshot {
  if (!OPEN_STATUSES.includes(currentStatus)) {
    throw new DomainError(
      'TRANSITION_NOT_ALLOWED',
      'Only an appointment that has not finished can be rescheduled.'
    );
  }
  if (targetSlot === undefined || targetSlot.reservationId !== undefined) {
    throw new DomainError(
      'SLOT_UNAVAILABLE',
      'The target slot is not available.'
    );
  }
  if (targetSlot.id === currentSlotId) {
    throw new DomainError(
      'INVALID_VALUE',
      'The target slot is the appointment’s current slot.'
    );
  }
  if (targetSlot.kind !== bookingKind) {
    throw new DomainError(
      'BOOKING_KIND_MISMATCH',
      'A rescheduled slot must keep the original booking kind.'
    );
  }
}
