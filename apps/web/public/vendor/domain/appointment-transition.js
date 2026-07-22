import { assertReschedulable, assertTransitionAllowed } from './appointment-rules.js';
import { calendarEventIdForReschedule, calendarEventIdForStatus } from './calendar-event-id.js';
import { DomainError } from './errors.js';
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
function outboxFor(appointmentId, status, at) {
    return {
        id: `outbox_${appointmentId}_${status}`,
        type: 'calendar_projection_requested',
        appointmentId,
        appointmentStatus: status,
        // 每個狀態一把固定的鑰匙：重試不會產生第二個日曆事件，而不同狀態的
        // 投影仍各自送出一次。鍵的組成與編碼集中在 calendar-event-id.ts。
        idempotencyKey: calendarEventIdForStatus(appointmentId, status),
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
    assertTransitionAllowed(request.transition, appointment.status);
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
    // assertReschedulable 是 assertion 函式，通過後 targetSlot 已窄化為 SlotSnapshot。
    assertReschedulable(appointment.status, appointment.slotId, targetSlot, appointment.bookingKind);
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
            idempotencyKey: calendarEventIdForReschedule(appointment.id, targetSlot.id)
        },
        idempotencyRecord: {
            key: request.idempotencyKey,
            appointmentId: appointment.id,
            recordedAt: request.requestedAt
        }
    };
}
