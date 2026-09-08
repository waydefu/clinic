import {
  assertReschedulable,
  assertTransitionAllowed,
  OPEN_STATUSES,
  type AppointmentStatusValue,
  type AppointmentTransition
} from './appointment-rules.js';
import {
  planAuditEvent,
  type AuditAction,
  type AuditContext,
  type AuditEventV2
} from './audit.js';
import {
  patientBookingGuardHolds,
  type BookingKind,
  type PatientBookingGuardSnapshot,
  type SlotSnapshot
} from './booking-transaction.js';
import { calendarEventIdForAppointment } from './calendar-event-id.js';
import { DomainError } from './errors.js';
import {
  assertIdempotencyContext,
  planIdempotencyRecord,
  type IdempotencyContext,
  type PlannedIdempotencyRecord
} from './idempotency.js';
import { assertUtcTimestamp } from './timestamp.js';

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
  readonly audit: AuditContext;
  readonly requestedAt: string;
  readonly idempotency: IdempotencyContext;
}

export interface RescheduleRequest {
  readonly appointmentId: string;
  readonly targetSlotId: string;
  /**
   * When set, the appointment must belong to this patient. Callers that have
   * a verified patient identity pass it so a BOLA attempt is the same
   * `APPOINTMENT_NOT_FOUND` as a missing row — never an ownership oracle.
   */
  readonly expectedPatientId?: string;
  readonly audit: AuditContext;
  readonly requestedAt: string;
  readonly idempotency: IdempotencyContext;
}

/**
 * Deleting an appointment is record hygiene, not a lifecycle step: it is for
 * rows that should never have existed (duplicate entry, wrong patient, test
 * data). Cancelling is the opposite — it records that a real booking will not
 * happen and must stay visible.
 *
 * Because the row disappears, `audit.reasonCode` is mandatory here while it is
 * nullable everywhere else: the audit event is the only surviving explanation.
 * Who may delete is an authorization question and stays outside the domain
 * (D-006).
 */
export interface DeleteAppointmentRequest {
  readonly appointmentId: string;
  readonly audit: AuditContext;
  readonly requestedAt: string;
  readonly idempotency: IdempotencyContext;
}

/**
 * 投影工作攜帶的狀態。多數情況就是預約狀態，但刪除後預約已不存在，因此多一個
 * `deleted`：worker 的 `actionForStatus` 對已知的非 upsert 狀態（含 `deleted`）
 * 回 `cancel`，所以刪除走的就是 `events.delete`，且刪除不存在的事件視為成功。
 * 無法辨識的狀態不得當成 cancel。
 */
export type CalendarProjectionStatus = AppointmentStatusValue | 'deleted';

export interface PlannedOutboxEntry {
  readonly id: string;
  readonly type: 'calendar_projection_requested';
  readonly appointmentId: string;
  readonly correlationId: string;
  readonly causationId: string;
  readonly appointmentStatus: CalendarProjectionStatus;
  readonly idempotencyKey: string;
  readonly status: 'pending';
  readonly attempts: 0;
  readonly createdAt: string;
  /** 立即到期。worker 以 nextAttemptAt <= now 查詢，缺欄位的工作查不到。 */
  readonly nextAttemptAt: string;
}

export type PlannedPatientBookingGuardMutation =
  | {
      readonly action: 'release';
      readonly activeAppointmentId: string;
      /** Present when another unfinished appointment must keep the guard. */
      readonly remainingGuard?: PatientBookingGuardSnapshot;
    }
  | {
      readonly action: 'retain';
      readonly guard: PatientBookingGuardSnapshot;
    };

export interface TransitionPlan {
  readonly appointmentId: string;
  readonly nextStatus: AppointmentStatusValue;
  readonly updatedAt: string;
  readonly completedAt?: string;
  /** 需要釋出的時段；undefined 表示時段維持佔用。 */
  readonly releaseSlotId?: string;
  readonly patientBookingGuard: PlannedPatientBookingGuardMutation;
  readonly auditEvent: AuditEventV2;
  readonly outboxJob: PlannedOutboxEntry;
  readonly idempotencyRecord: PlannedIdempotencyRecord;
}

export interface DeletionPlan {
  readonly appointmentId: string;
  readonly deletedAt: string;
  /** 需要釋出的時段；已結束的預約早就釋出過，因此是 undefined。 */
  readonly releaseSlotId?: string;
  readonly patientBookingGuard: PlannedPatientBookingGuardMutation;
  readonly auditEvent: AuditEventV2;
  readonly outboxJob: PlannedOutboxEntry;
  readonly idempotencyRecord: PlannedIdempotencyRecord;
}

export interface ReschedulePlan {
  readonly appointmentId: string;
  readonly releaseSlotId: string;
  readonly reserveSlotId: string;
  readonly startsAt: string;
  readonly nextStatus: 'confirmed';
  readonly updatedAt: string;
  readonly patientBookingGuard: PlannedPatientBookingGuardMutation;
  readonly auditEvent: AuditEventV2;
  readonly outboxJob: PlannedOutboxEntry;
  readonly idempotencyRecord: PlannedIdempotencyRecord;
}

const AUDIT_ACTIONS: Record<AppointmentTransition, AuditAction> = {
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

function assertIdentifier(value: string, fieldName: string): void {
  if (!/^[A-Za-z0-9_:-]{1,128}$/.test(value)) {
    throw new DomainError(
      'INVALID_VALUE',
      `${fieldName} must be an opaque identifier.`
    );
  }
}

export function parseAppointmentSnapshot(
  id: string,
  data: unknown
): AppointmentSnapshot {
  assertIdentifier(id, 'id');

  try {
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error();
    }
    const record = data as Record<string, unknown>;
    if (
      Object.prototype.hasOwnProperty.call(record, 'schemaVersion') &&
      record['schemaVersion'] !== 1
    ) {
      throw new Error();
    }

    const slotId = record['slotId'];
    const patientId = record['patientId'];
    if (typeof slotId !== 'string' || slotId === '') {
      throw new Error();
    }
    if (typeof patientId !== 'string' || patientId === '') {
      throw new Error();
    }
    assertIdentifier(slotId, 'slotId');
    assertIdentifier(patientId, 'patientId');

    const bookingKind = record['bookingKind'];
    if (bookingKind !== 'initial' && bookingKind !== 'follow_up') {
      throw new Error();
    }

    const status = record['status'];
    if (
      status !== 'confirmed' &&
      status !== 'cancellation_requested' &&
      status !== 'cancelled' &&
      status !== 'completed' &&
      status !== 'no_show'
    ) {
      throw new Error();
    }

    return { id, slotId, patientId, bookingKind, status };
  } catch {
    throw new DomainError('INVALID_VALUE', 'The appointment is unreadable.');
  }
}

function outboxFor(
  appointmentId: string,
  status: CalendarProjectionStatus,
  at: string,
  correlationId: string,
  causationId: string,
  recordId: string
): PlannedOutboxEntry {
  return {
    id: `outbox_${appointmentId}_${status}_${recordId}`,
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
    createdAt: at,
    nextAttemptAt: at
  };
}

function assertPatientBookingGuardOwnedBy(
  appointment: AppointmentSnapshot,
  guard: PatientBookingGuardSnapshot | undefined
): asserts guard is PatientBookingGuardSnapshot {
  if (!patientBookingGuardHolds(guard, appointment.id)) {
    throw new DomainError(
      'PATIENT_BOOKING_GUARD_MISMATCH',
      'The patient booking guard does not belong to the appointment.'
    );
  }
}

function normalizedGuard(
  guard: PatientBookingGuardSnapshot,
  updatedAt: string
): PatientBookingGuardSnapshot {
  return {
    activeAppointmentIds: guard.activeAppointmentIds,
    updatedAt
  };
}

function releaseGuardMutation(
  guard: PatientBookingGuardSnapshot,
  appointmentId: string,
  updatedAt: string
): PlannedPatientBookingGuardMutation {
  const remaining = guard.activeAppointmentIds.filter(
    (id) => id !== appointmentId
  );
  if (remaining.length === 0) {
    return { action: 'release', activeAppointmentId: appointmentId };
  }
  return {
    action: 'release',
    activeAppointmentId: appointmentId,
    remainingGuard: {
      activeAppointmentIds: remaining,
      updatedAt
    }
  };
}

export function planTransition(
  request: TransitionRequest,
  appointment: AppointmentSnapshot | undefined,
  patientBookingGuard: PatientBookingGuardSnapshot | undefined
): TransitionPlan {
  assertUtcTimestamp(request.requestedAt, 'requestedAt');
  assertIdempotencyContext(request.idempotency, request.audit.actorId);

  if (appointment === undefined) {
    throw new DomainError(
      'APPOINTMENT_NOT_FOUND',
      'The appointment does not exist.'
    );
  }
  assertTransitionAllowed(request.transition, appointment.status);
  assertPatientBookingGuardOwnedBy(appointment, patientBookingGuard);

  const nextStatus = NEXT_STATUS[request.transition];
  // 取消與未到會把時段還給其他患者；提出取消只是等櫃台確認，完成到診則是
  // 已經發生的事實，兩者都不釋出時段。
  const releasesSlot =
    request.transition === 'cancel' || request.transition === 'no_show';
  const auditEvent = planAuditEvent({
    eventId: `audit_${appointment.id}_${nextStatus}_${request.idempotency.recordId}`,
    occurredAt: request.requestedAt,
    action: AUDIT_ACTIONS[request.transition],
    resourceType: 'appointment',
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
    patientBookingGuard:
      request.transition === 'request_cancellation'
        ? {
            action: 'retain',
            guard: normalizedGuard(patientBookingGuard, request.requestedAt)
          }
        : releaseGuardMutation(
            patientBookingGuard,
            appointment.id,
            request.requestedAt
          ),
    auditEvent,
    outboxJob: outboxFor(
      appointment.id,
      nextStatus,
      request.requestedAt,
      request.audit.correlationId,
      auditEvent.eventId,
      request.idempotency.recordId
    ),
    idempotencyRecord: planIdempotencyRecord(
      request.idempotency,
      appointment.id,
      request.requestedAt
    )
  };
}

/**
 * Plans the removal of an appointment record.
 *
 * There is deliberately no status guard: unlike a transition, deletion is not a
 * step in the lifecycle, so every status is deletable. What the plan must get
 * right instead is that nothing the row was holding is silently leaked — the
 * slot and the patient booking guard are both released, and the Calendar event
 * is cancelled rather than left orphaned on a doctor's calendar.
 */
export function planDeletion(
  request: DeleteAppointmentRequest,
  appointment: AppointmentSnapshot | undefined,
  patientBookingGuard: PatientBookingGuardSnapshot | undefined
): DeletionPlan {
  assertUtcTimestamp(request.requestedAt, 'requestedAt');
  assertIdempotencyContext(request.idempotency, request.audit.actorId);

  if (appointment === undefined) {
    throw new DomainError(
      'APPOINTMENT_NOT_FOUND',
      'The appointment does not exist.'
    );
  }
  if (request.audit.reasonCode === null) {
    throw new DomainError(
      'INVALID_VALUE',
      'Deleting an appointment requires a reason code.'
    );
  }
  // 只有尚未結束的預約還佔著時段；取消／未到／完成到診早已釋出，再釋出一次
  // 會把後來訂走這格的人擠掉。
  const holdsSlot = OPEN_STATUSES.includes(appointment.status);
  // 開放中的預約必須仍列在病患 guard 的未完成集合裡；終局狀態在生命週期
  // 轉換時已釋出，所以刪除 cancelled/completed/no_show 時不能再要求它存在。
  // 回傳的 release mutation 仍指向被刪預約，repository 會確認該 ID 仍在集合
  // 裡才寫入，因此也不會誤刪病患其他未完成預約的 guard。
  let patientGuardMutation: PlannedPatientBookingGuardMutation = {
    action: 'release',
    activeAppointmentId: appointment.id
  };
  if (holdsSlot) {
    assertPatientBookingGuardOwnedBy(appointment, patientBookingGuard);
    patientGuardMutation = releaseGuardMutation(
      patientBookingGuard,
      appointment.id,
      request.requestedAt
    );
  }
  const auditEvent = planAuditEvent({
    eventId: `audit_${appointment.id}_deleted_${request.idempotency.recordId}`,
    occurredAt: request.requestedAt,
    action: 'appointment_deleted',
    resourceType: 'appointment',
    resourceId: appointment.id,
    before: {
      status: appointment.status,
      slotId: appointment.slotId
    },
    // 刪除之後沒有後狀態可記；`before` 與 reasonCode 就是這筆紀錄存在過的
    // 全部證據。
    after: null,
    context: request.audit
  });

  return {
    appointmentId: appointment.id,
    deletedAt: request.requestedAt,
    ...(holdsSlot ? { releaseSlotId: appointment.slotId } : {}),
    patientBookingGuard: patientGuardMutation,
    auditEvent,
    outboxJob: outboxFor(
      appointment.id,
      'deleted',
      request.requestedAt,
      request.audit.correlationId,
      auditEvent.eventId,
      request.idempotency.recordId
    ),
    idempotencyRecord: planIdempotencyRecord(
      request.idempotency,
      appointment.id,
      request.requestedAt
    )
  };
}

export function planReschedule(
  request: RescheduleRequest,
  appointment: AppointmentSnapshot | undefined,
  targetSlot: SlotSnapshot | undefined,
  patientBookingGuard: PatientBookingGuardSnapshot | undefined
): ReschedulePlan {
  assertUtcTimestamp(request.requestedAt, 'requestedAt');
  assertIdempotencyContext(request.idempotency, request.audit.actorId);

  if (
    appointment === undefined ||
    (request.expectedPatientId !== undefined &&
      appointment.patientId !== request.expectedPatientId)
  ) {
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
  assertPatientBookingGuardOwnedBy(appointment, patientBookingGuard);
  const auditEvent = planAuditEvent({
    eventId: `audit_${appointment.id}_rescheduled_${targetSlot.id}_${request.idempotency.recordId}`,
    occurredAt: request.requestedAt,
    action: 'appointment_rescheduled',
    resourceType: 'appointment',
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
      guard: normalizedGuard(patientBookingGuard, request.requestedAt)
    },
    auditEvent,
    outboxJob: {
      ...outboxFor(
        appointment.id,
        'confirmed',
        request.requestedAt,
        request.audit.correlationId,
        auditEvent.eventId,
        request.idempotency.recordId
      ),
      // 工作本身要能與原本的成立工作區分（否則會被視為同一筆而覆蓋），但
      // 日曆事件仍是同一個——改期是把事件搬到新時間，不是再開一格。
      id: `outbox_${appointment.id}_rescheduled_${targetSlot.id}_${request.idempotency.recordId}`
    },
    idempotencyRecord: planIdempotencyRecord(
      request.idempotency,
      appointment.id,
      request.requestedAt
    )
  };
}
