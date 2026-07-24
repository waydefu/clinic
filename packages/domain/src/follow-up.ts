import {
  planAuditEvent,
  type AuditContext,
  type AuditEventV2
} from './audit.js';
import { calendarEventIdForFollowUp } from './calendar-event-id.js';
import { DomainError } from './errors.js';
import {
  assertIdempotencyContext,
  planIdempotencyRecord,
  type IdempotencyContext,
  type PlannedIdempotencyRecord
} from './idempotency.js';
import {
  followUpGridTimes,
  isValidLocalDate,
  type Schedule
} from './schedule.js';

/**
 * Whether a completed visit needs another one, as pure rules.
 *
 * The decision was previously browser-only (`recordFollowUp`), so the "is this
 * a bookable follow-up time" check existed only where the receptionist happened
 * to be standing. It is a clinic rule, not a form validation: the target time
 * has to sit on the same follow-up grid a patient could actually book, or the
 * reminder points at a moment the clinic is closed.
 *
 * The reminder is a calendar event of its own, separate from the visit that
 * produced it — see `calendarEventIdForFollowUp`. That is why a decision plans
 * its own projection instead of reusing the appointment's.
 */

export type FollowUpDecisionValue = 'required' | 'not_required';

export interface FollowUpDecisionRequest {
  readonly appointmentId: string;
  readonly decision: FollowUpDecisionValue;
  /** 目標日期（YYYY-MM-DD，台北時間）。`not_required` 時必須省略。 */
  readonly dueDate?: string;
  /** 目標時間（HH:MM，台北時間），必須落在該日的回診網格上。 */
  readonly dueTime?: string;
  readonly audit: AuditContext;
  readonly requestedAt: string;
  readonly idempotency: IdempotencyContext;
}

/** 決定所依據的就診。只有已完成到診可以決定回診。 */
export interface FollowUpSourceSnapshot {
  readonly id: string;
  readonly patientId: string;
  readonly status: string;
}

/** 這筆就診先前的回診決定；沒有則為 undefined。 */
export interface ExistingFollowUpSnapshot {
  readonly decision: FollowUpDecisionValue;
  readonly dueAt: string | null;
}

export interface PlannedFollowUpProjection {
  readonly id: string;
  readonly type: 'calendar_projection_requested';
  readonly appointmentId: string;
  /** 標示這是回診提醒的投影，而非就診本身的投影。 */
  readonly followUpSourceId: string;
  readonly correlationId: string;
  readonly causationId: string;
  readonly appointmentStatus: 'follow_up_required' | 'follow_up_not_required';
  readonly startsAt?: string;
  readonly idempotencyKey: string;
  readonly status: 'pending';
  readonly attempts: 0;
  readonly createdAt: string;
}

export interface FollowUpDecisionPlan {
  readonly appointmentId: string;
  readonly patientId: string;
  readonly decision: FollowUpDecisionValue;
  /** UTC 時間點；`not_required` 時為 null。 */
  readonly dueAt: string | null;
  readonly decidedAt: string;
  readonly auditEvent: AuditEventV2;
  /**
   * 需要回診就 upsert 提醒；改成不需要時，用同一個 event ID 排入取消——只刪掉
   * 本機紀錄不會讓日曆那一側的事件消失。
   */
  readonly outboxJob: PlannedFollowUpProjection;
  readonly idempotencyRecord: PlannedIdempotencyRecord;
}

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const CLINIC_UTC_OFFSET = '+08:00';

function assertUtcTimestamp(value: string, fieldName: string): void {
  if (!value.endsWith('Z') || Number.isNaN(Date.parse(value))) {
    throw new DomainError(
      'INVALID_TIMESTAMP',
      `${fieldName} must be a valid UTC ISO-8601 timestamp.`
    );
  }
}

/** 台北的日期時間轉成 UTC 時間點；台灣無日光節約時間，偏移全年固定。 */
export function taipeiInstant(date: string, time: string): string {
  if (!isValidLocalDate(date) || !TIME_PATTERN.test(time)) {
    throw new DomainError(
      'INVALID_VALUE',
      'Taipei wall-clock time must use a real date and HH:MM time.'
    );
  }
  return new Date(`${date}T${time}:00${CLINIC_UTC_OFFSET}`).toISOString();
}

export function planFollowUpDecision(
  request: FollowUpDecisionRequest,
  appointment: FollowUpSourceSnapshot | undefined,
  schedule: Schedule,
  existing?: ExistingFollowUpSnapshot
): FollowUpDecisionPlan {
  assertUtcTimestamp(request.requestedAt, 'requestedAt');
  assertIdempotencyContext(request.idempotency, request.audit.actorId);

  if (appointment === undefined) {
    throw new DomainError(
      'APPOINTMENT_NOT_FOUND',
      'The appointment does not exist.'
    );
  }
  // 回診是「這次看完之後」的決定。還沒到診就先決定，等於在結果出來前就寫下
  // 結論；取消或未到的就診更沒有可決定的內容。
  if (appointment.status !== 'completed') {
    throw new DomainError(
      'FOLLOW_UP_NOT_DECIDABLE',
      'Only a completed visit can carry a follow-up decision.'
    );
  }

  let dueAt: string | null = null;
  if (request.decision === 'required') {
    const { dueDate, dueTime } = request;
    if (dueDate === undefined || !isValidLocalDate(dueDate)) {
      throw new DomainError(
        'INVALID_VALUE',
        'A required follow-up needs a target date.'
      );
    }
    if (dueTime === undefined || !TIME_PATTERN.test(dueTime)) {
      throw new DomainError(
        'INVALID_VALUE',
        'A required follow-up needs a target time.'
      );
    }
    // 目標時間必須是患者真的約得到的一格，否則提醒會落在休診時間。
    const bookable = followUpGridTimes(schedule, dueDate);
    if (bookable.length === 0) {
      throw new DomainError(
        'FOLLOW_UP_DAY_CLOSED',
        `The clinic is closed on ${dueDate}.`
      );
    }
    if (!bookable.includes(dueTime)) {
      throw new DomainError(
        'FOLLOW_UP_TIME_OFF_GRID',
        `${dueTime} is not a bookable follow-up time on ${dueDate}.`
      );
    }
    dueAt = taipeiInstant(dueDate, dueTime);
  } else if (request.dueDate !== undefined || request.dueTime !== undefined) {
    // 不需要回診卻帶著目標時間，代表呼叫端狀態不一致；沉默丟掉會讓稽核與
    // UI 各說各話。
    throw new DomainError(
      'INVALID_VALUE',
      'A follow-up that is not required must not carry a target time.'
    );
  }

  const auditEvent = planAuditEvent({
    eventId: `audit_${appointment.id}_follow_up_${request.idempotency.recordId}`,
    occurredAt: request.requestedAt,
    action: 'follow_up_decided',
    resourceType: 'appointment',
    resourceId: appointment.id,
    before:
      existing === undefined
        ? null
        : { followUpStatus: existing.decision, dueAt: existing.dueAt },
    after: { followUpStatus: request.decision, dueAt },
    context: request.audit
  });

  return {
    appointmentId: appointment.id,
    patientId: appointment.patientId,
    decision: request.decision,
    dueAt,
    decidedAt: request.requestedAt,
    auditEvent,
    outboxJob: {
      id: `outbox_followup_${appointment.id}_${request.decision}_${request.idempotency.recordId}`,
      type: 'calendar_projection_requested',
      appointmentId: appointment.id,
      followUpSourceId: appointment.id,
      correlationId: request.audit.correlationId,
      causationId: auditEvent.eventId,
      appointmentStatus:
        request.decision === 'required'
          ? 'follow_up_required'
          : 'follow_up_not_required',
      ...(dueAt === null ? {} : { startsAt: dueAt }),
      // 回診提醒是與原就診分開的事件，因此是另一把鑰匙。
      idempotencyKey: calendarEventIdForFollowUp(appointment.id),
      status: 'pending',
      attempts: 0,
      createdAt: request.requestedAt
    },
    idempotencyRecord: planIdempotencyRecord(
      request.idempotency,
      appointment.id,
      request.requestedAt
    )
  };
}
