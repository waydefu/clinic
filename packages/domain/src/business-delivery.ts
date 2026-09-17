import { DomainError } from './errors.js';
import { assertUtcTimestamp, isUtcIsoTimestamp } from './timestamp.js';

/**
 * BD-01's time contract is deliberately policy-driven. The values 20/10/1
 * belong to the business-delivery plan, not to a production route or a
 * payment decision. Callers must provide the approved policy for their scope.
 */
export const BUSINESS_DELIVERY_TIME_ZONE = 'Asia/Taipei' as const;

export type UsageActorKind = 'real_staff' | 'maintenance' | 'test';

export interface EligibleUsageEvent {
  readonly occurredAt: string;
  readonly actorKind: UsageActorKind;
}

export interface BusinessDeliveryPolicy {
  /** Number of Taipei calendar dates in the trial, including its start date. */
  readonly trialCalendarDays: number;
  /** Maximum manually approved extension in Taipei calendar dates. */
  readonly maxAdjustmentDays: number;
  /** Calendar months from first eligible use to the formal-operation checkpoint. */
  readonly formalOperationCalendarMonths: number;
}

export interface EarlyEndConfirmation {
  readonly endedAt: string;
  readonly confirmedByRole:
    'clinic_owner' | 'technical_owner' | 'operations_owner';
  /** Opaque audit reference; never a person's name, email, or free text. */
  readonly confirmationReference: string;
}

export interface BusinessDeliveryMilestones {
  readonly timeZone: typeof BUSINESS_DELIVERY_TIME_ZONE;
  readonly firstEligibleUseAt: string;
  readonly firstEligibleUseDate: string;
  readonly trialEndExclusiveDate: string;
  readonly trialEndExclusiveAt: string;
  readonly adjustmentDays: number;
  readonly adjustedTrialEndExclusiveDate: string;
  readonly adjustedTrialEndExclusiveAt: string;
  readonly formalOperationCheckpointDate: string;
  readonly formalOperationCheckpointAt: string;
  readonly earlyEnd: EarlyEndConfirmation | null;
}

const TAIPEI_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const OPAQUE_REFERENCE = /^[A-Za-z0-9_-]{1,128}$/;

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function parseTaipeiDate(value: string): {
  readonly year: number;
  readonly month: number;
  readonly day: number;
} {
  const match = TAIPEI_DATE_PATTERN.exec(value);
  if (!match) {
    throw new DomainError('INVALID_VALUE', 'must be a Taipei calendar date.');
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new DomainError(
      'INVALID_VALUE',
      'must be a real Taipei calendar date.'
    );
  }
  return { year, month, day };
}

function formatTaipeiDate(year: number, month: number, day: number): string {
  return [year, month, day]
    .map((part) => String(part).padStart(2, '0'))
    .join('-');
}

function addTaipeiCalendarDays(value: string, days: number): string {
  const date = parseTaipeiDate(value);
  const shifted = new Date(
    Date.UTC(date.year, date.month - 1, date.day + days)
  );
  return shifted.toISOString().slice(0, 10);
}

function addTaipeiCalendarMonthsClamped(value: string, months: number): string {
  const date = parseTaipeiDate(value);
  const absoluteMonth = date.year * 12 + (date.month - 1) + months;
  const year = Math.floor(absoluteMonth / 12);
  const month = (absoluteMonth % 12) + 1;
  const day = Math.min(date.day, daysInMonth(year, month));
  return formatTaipeiDate(year, month, day);
}

function taipeiCalendarDate(isoUtc: string): string {
  assertUtcTimestamp(isoUtc, 'timestamp');
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_DELIVERY_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(isoUtc));
}

function taipeiDateStartAt(date: string): string {
  parseTaipeiDate(date);
  return new Date(`${date}T00:00:00.000+08:00`).toISOString();
}

function assertPositiveInteger(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new DomainError(
      'INVALID_VALUE',
      `${fieldName} must be a positive integer.`
    );
  }
}

function assertNonNegativeInteger(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new DomainError(
      'INVALID_VALUE',
      `${fieldName} must be a non-negative integer.`
    );
  }
}

function assertChronological(at: string, startAt: string, endAt: string): void {
  assertUtcTimestamp(at, 'earlyEnd.endedAt');
  const atMs = Date.parse(at);
  if (atMs < Date.parse(startAt) || atMs >= Date.parse(endAt)) {
    throw new DomainError(
      'INVALID_VALUE',
      'earlyEnd.endedAt must be inside the scheduled trial period.'
    );
  }
}

/**
 * Selects the earliest real-staff use without allowing maintenance or test
 * accounts to start the business trial. Returned data contains no identity.
 */
export function selectFirstEligibleUsage(
  events: readonly EligibleUsageEvent[]
): EligibleUsageEvent {
  const eligible = events
    .filter((event) => event.actorKind === 'real_staff')
    .map((event) => {
      assertUtcTimestamp(event.occurredAt, 'occurredAt');
      return event;
    })
    .sort(
      (left, right) =>
        Date.parse(left.occurredAt) - Date.parse(right.occurredAt)
    );

  const first = eligible[0];
  if (!first) {
    throw new DomainError(
      'INVALID_VALUE',
      'A maintenance or test account cannot start the business trial.'
    );
  }
  return first;
}

/**
 * Calculates BD-01 milestones. This is a pure calculator: it does not persist
 * dates, decide a policy, emit a payment event, or start a production test.
 */
export function calculateBusinessDeliveryMilestones(input: {
  readonly firstEligibleUse: EligibleUsageEvent;
  readonly policy: BusinessDeliveryPolicy;
  readonly adjustmentDays?: number;
  readonly earlyEnd?: EarlyEndConfirmation;
}): BusinessDeliveryMilestones {
  const { firstEligibleUse, policy } = input;
  if (firstEligibleUse.actorKind !== 'real_staff') {
    throw new DomainError(
      'INVALID_VALUE',
      'Only a real staff use may start the business trial.'
    );
  }
  assertUtcTimestamp(
    firstEligibleUse.occurredAt,
    'firstEligibleUse.occurredAt'
  );
  assertPositiveInteger(policy.trialCalendarDays, 'trialCalendarDays');
  assertNonNegativeInteger(policy.maxAdjustmentDays, 'maxAdjustmentDays');
  assertPositiveInteger(
    policy.formalOperationCalendarMonths,
    'formalOperationCalendarMonths'
  );

  const adjustmentDays = input.adjustmentDays ?? 0;
  assertNonNegativeInteger(adjustmentDays, 'adjustmentDays');
  if (adjustmentDays > policy.maxAdjustmentDays) {
    throw new DomainError(
      'INVALID_VALUE',
      'adjustmentDays exceeds the approved maximum.'
    );
  }

  const firstEligibleUseDate = taipeiCalendarDate(firstEligibleUse.occurredAt);
  const trialEndExclusiveDate = addTaipeiCalendarDays(
    firstEligibleUseDate,
    policy.trialCalendarDays
  );
  const adjustedTrialEndExclusiveDate = addTaipeiCalendarDays(
    trialEndExclusiveDate,
    adjustmentDays
  );
  const formalOperationCheckpointDate = addTaipeiCalendarMonthsClamped(
    firstEligibleUseDate,
    policy.formalOperationCalendarMonths
  );
  const trialEndExclusiveAt = taipeiDateStartAt(trialEndExclusiveDate);
  const adjustedTrialEndExclusiveAt = taipeiDateStartAt(
    adjustedTrialEndExclusiveDate
  );
  const formalOperationCheckpointAt = taipeiDateStartAt(
    formalOperationCheckpointDate
  );

  if (input.earlyEnd) {
    assertChronological(
      input.earlyEnd.endedAt,
      firstEligibleUse.occurredAt,
      adjustedTrialEndExclusiveAt
    );
    if (!OPAQUE_REFERENCE.test(input.earlyEnd.confirmationReference)) {
      throw new DomainError(
        'INVALID_VALUE',
        'earlyEnd.confirmationReference must be an opaque audit reference.'
      );
    }
  }

  return {
    timeZone: BUSINESS_DELIVERY_TIME_ZONE,
    firstEligibleUseAt: firstEligibleUse.occurredAt,
    firstEligibleUseDate,
    trialEndExclusiveDate,
    trialEndExclusiveAt,
    adjustmentDays,
    adjustedTrialEndExclusiveDate,
    adjustedTrialEndExclusiveAt,
    formalOperationCheckpointDate,
    formalOperationCheckpointAt,
    earlyEnd: input.earlyEnd ?? null
  };
}

/**
 * Idempotent replay helper: a repeated event does not move an already-selected
 * start. It returns the earliest eligible event from the complete observation.
 */
export function selectFirstEligibleUsageFromReplay(
  events: readonly EligibleUsageEvent[]
): string {
  return selectFirstEligibleUsage(events).occurredAt;
}

export function isBusinessDeliveryMilestoneTimestamp(value: string): boolean {
  return isUtcIsoTimestamp(value);
}
