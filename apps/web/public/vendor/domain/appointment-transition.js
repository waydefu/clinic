import { DomainError } from './errors.js';
/** 尚未結束、仍佔用時段的狀態。 */
const OPEN_STATUSES = [
    'confirmed',
    'cancellation_requested'
];
const AUDIT_ACTIONS = {
    request_cancellation: 'cancellation_requested',
    cancel: 'appointment_cancelled',
    complete: 'appointment_completed',
    no_show: 'appointment_no_show'
};
const NEXT_STATUS = {
    request_cancellation: 'cancellation_requested',
    cancel: 'cancelled',
    complete: 'completed',
    no_show: 'no_show'
};
function assertUtcTimestamp(value, fieldName) {
    if (!value.endsWith('Z') || Number.isNaN(Date.parse(value))) {
        throw new DomainError('INVALID_TIMESTAMP', `${fieldName} must be a valid UTC ISO-8601 timestamp.`);
    }
}
function assertAllowed(transition, appointment) {
    // 只有「預約成立」可提出取消或標記到診；取消與未到則允許從取消待確認進入。
    const allowedFrom = transition === 'request_cancellation' || transition === 'complete'
        ? ['confirmed']
        : OPEN_STATUSES;
    if (!allowedFrom.includes(appointment.status)) {
        throw new DomainError('TRANSITION_NOT_ALLOWED', `An appointment in status "${appointment.status}" cannot be ${transition}.`);
    }
}
function outboxFor(appointmentId, status, at) {
    return {
        id: `outbox_${appointmentId}_${status}`,
        type: 'calendar_projection_requested',
        appointmentId,
        appointmentStatus: status,
        // 每個狀態一把固定的鑰匙：重試不會產生第二個日曆事件，而不同狀態的
        // 投影仍各自送出一次。
        idempotencyKey: `calendar_${status}_${appointmentId}`,
        status: 'pending',
        attempts: 0,
        createdAt: at
    };
}
export function planTransition(request, appointment) {
    assertUtcTimestamp(request.requestedAt, 'requestedAt');
    if (appointment === undefined) {
        throw new DomainError('APPOINTMENT_NOT_FOUND', 'The appointment does not exist.');
    }
    assertAllowed(request.transition, appointment);
    const nextStatus = NEXT_STATUS[request.transition];
    // 取消與未到會把時段還給其他患者；提出取消只是等櫃台確認，完成到診則是
    // 已經發生的事實，兩者都不釋出時段。
    const releasesSlot = request.transition === 'cancel' || request.transition === 'no_show';
    return {
        appointmentId: appointment.id,
        nextStatus,
        updatedAt: request.requestedAt,
        ...(request.transition === 'complete'
            ? { completedAt: request.requestedAt }
            : {}),
        ...(releasesSlot ? { releaseSlotId: appointment.slotId } : {}),
        auditEvent: {
            id: `audit_${appointment.id}_${nextStatus}`,
            action: AUDIT_ACTIONS[request.transition],
            appointmentId: appointment.id,
            actorId: request.actorId,
            occurredAt: request.requestedAt
        },
        outboxJob: outboxFor(appointment.id, nextStatus, request.requestedAt),
        idempotencyRecord: {
            key: request.idempotencyKey,
            appointmentId: appointment.id,
            recordedAt: request.requestedAt
        }
    };
}
export function planReschedule(request, appointment, targetSlot) {
    assertUtcTimestamp(request.requestedAt, 'requestedAt');
    if (appointment === undefined) {
        throw new DomainError('APPOINTMENT_NOT_FOUND', 'The appointment does not exist.');
    }
    if (!OPEN_STATUSES.includes(appointment.status)) {
        throw new DomainError('TRANSITION_NOT_ALLOWED', 'Only an appointment that has not finished can be rescheduled.');
    }
    if (targetSlot === undefined || targetSlot.reservationId !== undefined) {
        throw new DomainError('SLOT_UNAVAILABLE', 'The target slot is not available.');
    }
    if (targetSlot.id === appointment.slotId) {
        throw new DomainError('INVALID_VALUE', 'The target slot is the appointment’s current slot.');
    }
    // 改期不得跨掛號別：初診與回診走不同的時段格，混用會讓時段語意失效。
    if (targetSlot.kind !== appointment.bookingKind) {
        throw new DomainError('BOOKING_KIND_MISMATCH', 'A rescheduled slot must keep the original booking kind.');
    }
    return {
        appointmentId: appointment.id,
        releaseSlotId: appointment.slotId,
        reserveSlotId: targetSlot.id,
        startsAt: targetSlot.startsAt,
        nextStatus: 'confirmed',
        updatedAt: request.requestedAt,
        auditEvent: {
            id: `audit_${appointment.id}_rescheduled_${targetSlot.id}`,
            action: 'appointment_rescheduled',
            appointmentId: appointment.id,
            actorId: request.actorId,
            occurredAt: request.requestedAt
        },
        outboxJob: {
            ...outboxFor(appointment.id, 'confirmed', request.requestedAt),
            // 改期後的投影要能與原本的成立事件區分，否則 worker 會誤判為重送。
            id: `outbox_${appointment.id}_rescheduled_${targetSlot.id}`,
            idempotencyKey: `calendar_rescheduled_${appointment.id}_${targetSlot.id}`
        },
        idempotencyRecord: {
            key: request.idempotencyKey,
            appointmentId: appointment.id,
            recordedAt: request.requestedAt
        }
    };
}
