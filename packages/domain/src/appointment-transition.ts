import {
  assertReschedulable,
  assertTransitionAllowed,
  type AppointmentStatusValue,
  type AppointmentTransition
} from './appointment-rules.js';
import type { BookingKind, SlotSnapshot } from './booking-transaction.js';
import { calendarEventIdForAppointment } from './calendar-event-id.js';
import { DomainError } from './errors.js';

export type { AppointmentStatusValue, AppointmentTransition };

/**
 * The I/O-free core of every appointment state change after the initial
 * reservation, mirroring `planBooking`. The rules themselves live in
 * `appointment-rules.ts` and are shared with the browser (ADR-0004); this
 * module only turns an allowed transition into the set of writes to apply.
 */

export interface AppointmentSnapshot {
  readonly id: string;
  readonly slotId: string;
  readonly patientId: string;
  readonly bookingKind: BookingKind;
  readonly status: AppointmentStatusValue;
}

export interface TransitionRequest {
  readonly appointmentId: string;
  readonly transition: AppointmentTransition;
  readonly actorId: string;
  readonly requestedAt: string;
  readonly idempotencyKey: string;
}

export interface RescheduleRequest {
  readonly appointmentId: string;
  readonly targetSlotId: string;
  readonly actorId: string;
  readonly requestedAt: string;
  readonly idempotencyKey: string;
}

export interface PlannedAuditEntry {
  readonly id: string;
  readonly action: string;
  readonly appointmentId: string;
  readonly actorId: string;
  readonly occurredAt: string;
}

export interface PlannedOutboxEntry {
  readonly id: string;
  readonly type: 'calendar_projection_requested';
  readonly appointmentId: string;
  readonly appointmentStatus: AppointmentStatusValue;
  readonly idempotencyKey: string;
  readonly status: 'pending';
  readonly attempts: 0;
  readonly createdAt: string;
}

export interface TransitionPlan {
  readonly appointmentId: string;
  readonly nextStatus: AppointmentStatusValue;
  readonly updatedAt: string;
  readonly completedAt?: string;
  /** 需要釋出的時段；undefined 表示時段維持佔用。 */
  readonly releaseSlotId?: string;
  readonly auditEvent: PlannedAuditEntry;
  readonly outboxJob: PlannedOutboxEntry;
  readonly idempotencyRecord: {
    readonly key: string;
    readonly appointmentId: string;
    readonly recordedAt: string;
  };
}

export interface ReschedulePlan {
  readonly appointmentId: string;
  readonly releaseSlotId: string;
  readonly reserveSlotId: string;
  readonly startsAt: string;
  readonly nextStatus: 'confirmed';
  readonly updatedAt: string;
  readonly auditEvent: PlannedAuditEntry;
  readonly outboxJob: PlannedOutboxEntry;
  readonly idempotencyRecord: {
    readonly key: string;
    readonly appointmentId: string;
    readonly recordedAt: string;
  };
}

const AUDIT_ACTIONS: Record<AppointmentTransition, string> = {
  request_cancellation: 'cancellation_requested',
  cancel: 'appointment_cancelled',
  complete: 'appointment_completed',
  no_show: 'appointment_no_show'
};

const NEXT_STATUS: Record<AppointmentTransition, AppointmentStatusValue> = {
  request_cancellation: 'cancellation_requested',
  cancel: 'cancelled',
  complete: 'completed',
  no_show: 'no_show'
};

function assertUtcTimestamp(value: string, fieldName: string): void {
  if (!value.endsWith('Z') || Number.isNaN(Date.parse(value))) {
    throw new DomainError(
      'INVALID_TIMESTAMP',
      `${fieldName} must be a valid UTC ISO-8601 timestamp.`
    );
  }
}

function outboxFor(
  appointmentId: string,
  status: AppointmentStatusValue,
  at: string
): PlannedOutboxEntry {
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

export function planTransition(
  request: TransitionRequest,
  appointment: AppointmentSnapshot | undefined
): TransitionPlan {
  assertUtcTimestamp(request.requestedAt, 'requestedAt');

  if (appointment === undefined) {
    throw new DomainError(
      'APPOINTMENT_NOT_FOUND',
      'The appointment does not exist.'
    );
  }
  assertTransitionAllowed(request.transition, appointment.status);

  const nextStatus = NEXT_STATUS[request.transition];
  // 取消與未到會把時段還給其他患者；提出取消只是等櫃台確認，完成到診則是
  // 已經發生的事實，兩者都不釋出時段。
  const releasesSlot =
    request.transition === 'cancel' || request.transition === 'no_show';

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

export function planReschedule(
  request: RescheduleRequest,
  appointment: AppointmentSnapshot | undefined,
  targetSlot: SlotSnapshot | undefined
): ReschedulePlan {
  assertUtcTimestamp(request.requestedAt, 'requestedAt');

  if (appointment === undefined) {
    throw new DomainError(
      'APPOINTMENT_NOT_FOUND',
      'The appointment does not exist.'
    );
  }
  // assertReschedulable 是 assertion 函式，通過後 targetSlot 已窄化為 SlotSnapshot。
  assertReschedulable(
    appointment.status,
    appointment.slotId,
    targetSlot,
    appointment.bookingKind
  );

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
