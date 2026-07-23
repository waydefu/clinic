import { assertReschedulable, assertTransitionAllowed } from './appointment-rules.js';
import { planAuditEvent } from './audit.js';
import { calendarEventIdForAppointment } from './calendar-event-id.js';
import { DomainError } from './errors.js';
import { assertIdempotencyContext, planIdempotencyRecord } from './idempotency.js';
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
function outboxFor(appointmentId, status, at, correlationId, causationId) {
    return {
        id: `outbox_${appointmentId}_${status}`,
        type: 'calendar_projection_requested',
        appointmentId,
        correlationId,
        causationId,
        appointmentStatus: status,
        // 一筆預約一個日曆事件：每次狀態變化都是更新或刪除同一個事件，而不是
        // 再開一格。鍵的組成與編碼集中在 calendar-event-id.ts。
        idempotencyKey: calendarEventIdForAppointment(appointmentId),
        status: 'pending',
        attempts: 0,
        createdAt: at
    };
}
function assertPatientBookingGuardOwnedBy(appointment, guard) {
    if (guard === undefined || guard.activeAppointmentId !== appointment.id) {
        throw new DomainError('PATIENT_BOOKING_GUARD_MISMATCH', 'The patient booking guard does not belong to the appointment.');
    }
}
export function planTransition(request, appointment, patientBookingGuard) {
    assertUtcTimestamp(request.requestedAt, 'requestedAt');
    assertIdempotencyContext(request.idempotency, request.audit.actorId);
    if (appointment === undefined) {
        throw new DomainError('APPOINTMENT_NOT_FOUND', 'The appointment does not exist.');
    }
    assertTransitionAllowed(request.transition, appointment.status);
    assertPatientBookingGuardOwnedBy(appointment, patientBookingGuard);
    const nextStatus = NEXT_STATUS[request.transition];
    // 取消與未到會把時段還給其他患者；提出取消只是等櫃台確認，完成到診則是
    // 已經發生的事實，兩者都不釋出時段。
    const releasesSlot = request.transition === 'cancel' || request.transition === 'no_show';
    const auditEvent = planAuditEvent({
        eventId: `audit_${appointment.id}_${nextStatus}`,
        occurredAt: request.requestedAt,
        action: AUDIT_ACTIONS[request.transition],
        resourceId: appointment.id,
        before: {
            status: appointment.status,
            slotId: appointment.slotId
        },
        after: {
            status: nextStatus,
            slotId: appointment.slotId
        },
        context: request.audit
    });
    return {
        appointmentId: appointment.id,
        nextStatus,
        updatedAt: request.requestedAt,
        ...(request.transition === 'complete'
            ? { completedAt: request.requestedAt }
            : {}),
        ...(releasesSlot ? { releaseSlotId: appointment.slotId } : {}),
        patientBookingGuard: request.transition === 'request_cancellation'
            ? {
                action: 'retain',
                guard: {
                    activeAppointmentId: appointment.id,
                    status: 'cancellation_requested',
                    updatedAt: request.requestedAt
                }
            }
            : {
                action: 'release',
                activeAppointmentId: appointment.id
            },
        auditEvent,
        outboxJob: outboxFor(appointment.id, nextStatus, request.requestedAt, request.audit.correlationId, auditEvent.eventId),
        idempotencyRecord: planIdempotencyRecord(request.idempotency, appointment.id, request.requestedAt)
    };
}
export function planReschedule(request, appointment, targetSlot, patientBookingGuard) {
    assertUtcTimestamp(request.requestedAt, 'requestedAt');
    assertIdempotencyContext(request.idempotency, request.audit.actorId);
    if (appointment === undefined) {
        throw new DomainError('APPOINTMENT_NOT_FOUND', 'The appointment does not exist.');
    }
    // assertReschedulable 是 assertion 函式，通過後 targetSlot 已窄化為 SlotSnapshot。
    assertReschedulable(appointment.status, appointment.slotId, targetSlot, appointment.bookingKind);
    assertPatientBookingGuardOwnedBy(appointment, patientBookingGuard);
    const auditEvent = planAuditEvent({
        eventId: `audit_${appointment.id}_rescheduled_${targetSlot.id}`,
        occurredAt: request.requestedAt,
        action: 'appointment_rescheduled',
        resourceId: appointment.id,
        before: {
            status: appointment.status,
            slotId: appointment.slotId
        },
        after: {
            status: 'confirmed',
            slotId: targetSlot.id
        },
        context: request.audit
    });
    return {
        appointmentId: appointment.id,
        releaseSlotId: appointment.slotId,
        reserveSlotId: targetSlot.id,
        startsAt: targetSlot.startsAt,
        nextStatus: 'confirmed',
        updatedAt: request.requestedAt,
        patientBookingGuard: {
            action: 'retain',
            guard: {
                activeAppointmentId: appointment.id,
                status: 'confirmed',
                updatedAt: request.requestedAt
            }
        },
        auditEvent,
        outboxJob: {
            ...outboxFor(appointment.id, 'confirmed', request.requestedAt, request.audit.correlationId, auditEvent.eventId),
            // 工作本身要能與原本的成立工作區分（否則會被視為同一筆而覆蓋），但
            // 日曆事件仍是同一個——改期是把事件搬到新時間，不是再開一格。
            id: `outbox_${appointment.id}_rescheduled_${targetSlot.id}`
        },
        idempotencyRecord: planIdempotencyRecord(request.idempotency, appointment.id, request.requestedAt)
    };
}
