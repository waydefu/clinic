import { DomainError } from './errors.js';
import type { TestOnlyActor } from './test-only-booking.js';

export type TestOnlyFollowUpStatus = 'unknown' | 'not_required' | 'required';

export interface TestOnlyFollowUpDecision {
  readonly status: TestOnlyFollowUpStatus;
  readonly dueDate?: string;
  readonly decidedBy?: string;
  readonly decidedAt?: string;
}

export interface SetTestOnlyFollowUpCommand {
  readonly status: Exclude<TestOnlyFollowUpStatus, 'unknown'>;
  readonly dueDate?: string;
  readonly actor: TestOnlyActor;
  readonly decidedAt: string;
}

export interface TestOnlyFollowUpAuditEvent {
  readonly action: 'follow_up_decision_recorded';
  readonly actorId: string;
  readonly occurredAt: string;
  readonly previousStatus: TestOnlyFollowUpStatus;
  readonly nextStatus: Exclude<TestOnlyFollowUpStatus, 'unknown'>;
}

/**
 * Records an explicit synthetic staff decision. It deliberately has no
 * inference input: scheduling history and service type can never decide
 * whether a patient needs follow-up.
 */
export function setTestOnlyFollowUpDecision(
  current: TestOnlyFollowUpDecision,
  command: SetTestOnlyFollowUpCommand
): { readonly decision: TestOnlyFollowUpDecision; readonly auditEvent: TestOnlyFollowUpAuditEvent } {
  if (!isFollowUpDecisionRole(command.actor.role)) {
    throw new DomainError(
      'COMPLETION_NOT_AUTHORIZED',
      'The synthetic actor cannot record a follow-up decision.'
    );
  }
  assertUtcTimestamp(command.decidedAt, 'decidedAt');

  if (command.status === 'required') {
    if (command.dueDate === undefined) {
      throw new DomainError('INVALID_VALUE', 'A required follow-up needs a target date.');
    }
    assertLocalDate(command.dueDate);
  } else if (command.dueDate !== undefined) {
    throw new DomainError(
      'INVALID_VALUE',
      'A follow-up target date is only allowed when follow-up is required.'
    );
  }

  return {
    decision: {
      status: command.status,
      ...(command.status === 'required' ? { dueDate: command.dueDate } : {}),
      decidedBy: command.actor.id,
      decidedAt: command.decidedAt
    },
    auditEvent: {
      action: 'follow_up_decision_recorded',
      actorId: command.actor.id,
      occurredAt: command.decidedAt,
      previousStatus: current.status,
      nextStatus: command.status
    }
  };
}

export function initialTestOnlyFollowUpDecision(): TestOnlyFollowUpDecision {
  return { status: 'unknown' };
}

function isFollowUpDecisionRole(role: TestOnlyActor['role']): boolean {
  return role === 'test_front_desk' || role === 'test_clinic_admin';
}

function assertLocalDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new DomainError('INVALID_VALUE', 'dueDate must use YYYY-MM-DD format.');
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new DomainError('INVALID_VALUE', 'dueDate must be a valid local date.');
  }
}

function assertUtcTimestamp(value: string, fieldName: string): void {
  if (!value.endsWith('Z') || Number.isNaN(Date.parse(value))) {
    throw new DomainError('INVALID_TIMESTAMP', `${fieldName} must be a valid UTC ISO-8601 timestamp.`);
  }
}
