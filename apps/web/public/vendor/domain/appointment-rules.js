import { DomainError } from './errors.js';
/** 尚未結束、仍佔用時段的狀態。到診不是完成；完成才是終局。 */
export const OPEN_STATUSES = [
    'confirmed',
    'arrived',
    'cancellation_requested'
];
/** 同一人同時最多兩筆未結束的預約。 */
export const ACTIVE_BOOKING_LIMIT = 2;
export const ACTIVE_BOOKING_STATUSES = OPEN_STATUSES;
/** 每個轉換可以從哪些狀態進入。 */
const ALLOWED_FROM = {
    // 提出取消與標記到診都只能從「預約成立」進入。
    request_cancellation: ['confirmed'],
    arrive: ['confirmed'],
    complete: ['arrived'],
    // 取消與未到可從尚未終局的狀態進入。
    cancel: OPEN_STATUSES,
    no_show: OPEN_STATUSES
};
/**
 * A slot is occupied only when it names a reservation. Legacy documents may
 * carry `reservationId: null` from before releases deleted the field; null
 * reads as unoccupied so those documents need no migration.
 */
export function isSlotOccupied(reservationId) {
    return reservationId !== undefined && reservationId !== null;
}
export function assertSlotBookable(slot, bookingKind) {
    if (slot === undefined || isSlotOccupied(slot.reservationId)) {
        throw new DomainError('SLOT_UNAVAILABLE', 'The slot does not exist or is already reserved.');
    }
    if (slot.kind !== bookingKind) {
        throw new DomainError('BOOKING_KIND_MISMATCH', 'The slot belongs to a different booking kind.');
    }
}
export function assertWithinActiveBookingLimit(activeCount) {
    if (activeCount >= ACTIVE_BOOKING_LIMIT) {
        throw new DomainError('DUPLICATE_ACTIVE_BOOKING', 'The patient already has the maximum number of active bookings.');
    }
}
/**
 * Patient self-cancellation cutoff, single source (Q6 / D-005 direction:
 * 10:00 Asia/Taipei on the appointment day; afterwards call the clinic).
 * Returns the cutoff instant: the appointment's Taipei calendar date at
 * 10:00 local, i.e. 02:00 UTC. Throws INVALID_VALUE for an unparseable
 * appointment start; callers fail closed.
 */
export function selfCancelCutoffAt(appointmentStartsAt) {
    const startsAtMs = Date.parse(appointmentStartsAt);
    if (!Number.isFinite(startsAtMs)) {
        throw new DomainError('INVALID_VALUE', 'The appointment start must be a parseable timestamp.');
    }
    const day = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Taipei',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date(startsAtMs));
    return `${day}T02:00:00.000Z`;
}
/**
 * Self-cancellation is allowed strictly before the day-10:00 cutoff:
 * 09:59 allowed, 10:00 denied. Non-finite now fails closed (false).
 */
export function isWithinSelfCancelWindow(appointmentStartsAt, nowMs) {
    if (!Number.isFinite(nowMs))
        return false;
    return nowMs < Date.parse(selfCancelCutoffAt(appointmentStartsAt));
}
export const EARLIEST_BOOKING_LEAD_MS = 7_200_000;
export function assertSlotMeetsEarliestLead(slotStartsAt, requestedAt) {
    const startMs = Date.parse(slotStartsAt);
    const requestedMs = Date.parse(requestedAt);
    if (!Number.isFinite(startMs) || !Number.isFinite(requestedMs)) {
        throw new DomainError('INVALID_VALUE', 'The appointment start must be a parseable timestamp.');
    }
    if (startMs < requestedMs + EARLIEST_BOOKING_LEAD_MS) {
        throw new DomainError('SLOT_UNAVAILABLE', 'The slot does not exist or is already reserved.');
    }
}
export function assertTransitionAllowed(transition, status) {
    if (!ALLOWED_FROM[transition].includes(status)) {
        throw new DomainError('TRANSITION_NOT_ALLOWED', `An appointment in status "${status}" cannot be ${transition}.`);
    }
}
export function assertReschedulable(currentStatus, currentSlotId, targetSlot, bookingKind) {
    if (!OPEN_STATUSES.includes(currentStatus)) {
        throw new DomainError('TRANSITION_NOT_ALLOWED', 'Only an appointment that has not finished can be rescheduled.');
    }
    if (targetSlot === undefined || isSlotOccupied(targetSlot.reservationId)) {
        throw new DomainError('SLOT_UNAVAILABLE', 'The target slot is not available.');
    }
    if (targetSlot.id === currentSlotId) {
        throw new DomainError('INVALID_VALUE', 'The target slot is the appointment’s current slot.');
    }
    if (targetSlot.kind !== bookingKind) {
        throw new DomainError('BOOKING_KIND_MISMATCH', 'A rescheduled slot must keep the original booking kind.');
    }
}
