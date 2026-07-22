import { assertReschedulable, assertTransitionAllowed } from './appointment-rules.js';
import { calendarEventIdForAppointment } from './calendar-event-id.js';
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
        // 一筆預約一個日曆事件：每次狀態變化都是更新或刪除同一個事件，而不是
        // 再開一格。鍵的組成與編碼集中在 calendar-event-id.ts。
        idempotencyKey: calendarEventIdForAppointment(appointmentId),
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
            // 工作本身要能與原本的成立工作區分（否則會被視為同一筆而覆蓋），但
            // 日曆事件仍是同一個——改期是把事件搬到新時間，不是再開一格。
            id: `outbox_${appointment.id}_rescheduled_${targetSlot.id}`
        },
        idempotencyRecord: {
            key: request.idempotencyKey,
            appointmentId: appointment.id,
            recordedAt: request.requestedAt
        }
    };
}
