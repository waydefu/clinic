import {
  assertTaipeiCalendarDate,
  calculateBusinessDeliveryMilestones,
  calculateFormalOperationCheckpoint,
  maintenanceStartDateAfter,
  taipeiCalendarDateOf,
  type BusinessDeliveryPolicy
} from './business-delivery.js';
import type {
  BusinessReportCompleteness,
  BusinessReportScope
} from './business-delivery-reporting.js';
import { DomainError } from './errors.js';
import { assertUtcTimestamp } from './timestamp.js';

/**
 * Owner-approved business-delivery policy values, keyed by the version recorded
 * in `docs/product/2026-09-29-business-delivery-policy-decisions.md`.
 *
 * Runtime selects a version by configuration; an unknown version, or a scope the
 * version was not approved for, fails closed. There is deliberately no default:
 * the fixture values in the contract tests are not approvals.
 */
export interface ApprovedBusinessDeliveryPolicy {
  readonly version: BusinessDeliveryPolicyVersion;
  readonly approvedOn: string;
  readonly applicableScopes: readonly BusinessReportScope[];
  readonly milestones: BusinessDeliveryPolicy;
  /** Events observed up to this many Taipei days after month end still count. */
  readonly lateEventCutoffDays: number;
  /** `COMMERCIAL-AUTHORITY-2026-09-22`; display only, never an invoice. */
  readonly maintenanceFeesTwd: {
    readonly normal: number;
    readonly unused: number;
  };
  /** Fresh Google + TOTP re-authentication window for milestone confirmation. */
  readonly reauthenticationMaxAgeSeconds: number;
  /** CP-04 export limits (`BD-POLICY-2026-09-29` §1, `OWNER-BATCH-2026-09-29B` item 2). */
  readonly export: {
    readonly formats: readonly ['csv'];
    readonly downloadWindowHours: number;
    readonly maxDownloads: number;
    readonly fileRetentionDays: number;
    readonly maxRangeDays: number;
  };
  /** CP-05 recoverable period (`BD-POLICY-2026-09-29` §2). */
  readonly retention: { readonly recoverableDays: number };
  /** CP-07 termination boundaries (`BD-POLICY-2026-09-29` §6). */
  readonly termination: {
    readonly minimumNoticeDays: number;
    readonly controlledCopyRetentionDays: number;
  };
}

export const BUSINESS_DELIVERY_POLICY_VERSIONS = [
  'BD-POLICY-2026-09-29'
] as const;
export type BusinessDeliveryPolicyVersion =
  (typeof BUSINESS_DELIVERY_POLICY_VERSIONS)[number];

const APPROVED_POLICIES: Readonly<
  Record<BusinessDeliveryPolicyVersion, ApprovedBusinessDeliveryPolicy>
> = Object.freeze({
  'BD-POLICY-2026-09-29': Object.freeze({
    version: 'BD-POLICY-2026-09-29',
    approvedOn: '2026-09-29',
    // Production use still needs professional privacy/legal review and
    // separate authority; the record approves the C1 synthetic scope only.
    applicableScopes: Object.freeze(['internal_synthetic'] as const),
    milestones: Object.freeze({
      trialCalendarDays: 20,
      maxAdjustmentDays: 10,
      formalOperationCalendarMonths: 1
    }),
    lateEventCutoffDays: 5,
    maintenanceFeesTwd: Object.freeze({ normal: 1800, unused: 500 }),
    reauthenticationMaxAgeSeconds: 600,
    export: Object.freeze({
      formats: Object.freeze(['csv'] as const),
      downloadWindowHours: 24,
      maxDownloads: 3,
      fileRetentionDays: 7,
      // Engineering bound, not a policy value: one year per file keeps each
      // export inside a single atomic write.
      maxRangeDays: 366
    }),
    retention: Object.freeze({ recoverableDays: 30 }),
    termination: Object.freeze({
      minimumNoticeDays: 30,
      controlledCopyRetentionDays: 30
    })
  })
});

export function resolveApprovedBusinessDeliveryPolicy(
  version: string | undefined,
  scope: string | undefined
): ApprovedBusinessDeliveryPolicy {
  const policy = (
    BUSINESS_DELIVERY_POLICY_VERSIONS as readonly string[]
  ).includes(version ?? '')
    ? APPROVED_POLICIES[version as BusinessDeliveryPolicyVersion]
    : undefined;
  if (policy === undefined) {
    throw new DomainError(
      'INVALID_VALUE',
      'business-delivery policy version is not approved.'
    );
  }
  if (!(policy.applicableScopes as readonly string[]).includes(scope ?? '')) {
    throw new DomainError(
      'INVALID_VALUE',
      'business-delivery policy is not approved for this scope.'
    );
  }
  return policy;
}

const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;

/** Half-open UTC range `[startAt, endAt)` of one Taipei calendar month. */
export function taipeiMonthRange(month: string): {
  readonly startAt: string;
  readonly endAt: string;
} {
  const match = MONTH_PATTERN.exec(month);
  const year = Number(match?.[1]);
  const monthNumber = Number(match?.[2]);
  if (!match || monthNumber < 1 || monthNumber > 12) {
    throw new DomainError('INVALID_VALUE', 'month must be YYYY-MM.');
  }
  const next =
    monthNumber === 12
      ? `${year + 1}-01`
      : `${year}-${String(monthNumber + 1).padStart(2, '0')}`;
  return {
    startAt: new Date(`${month}-01T00:00:00.000+08:00`).toISOString(),
    endAt: new Date(`${next}-01T00:00:00.000+08:00`).toISOString()
  };
}

/**
 * Decides whether a month's server-side usage events can be treated as the
 * whole truth. Ingress is written in the same transaction as the login or
 * booking it describes, so the only gaps are "observation had not started"
 * and "late events may still arrive". Anything else is a manual review, never
 * a silent zero (`BD-POLICY-2026-09-29` §3).
 */
export function assessMonthlyUsageCompleteness(input: {
  readonly month: string;
  readonly observedSince: string;
  readonly now: string;
  readonly lateEventCutoffDays: number;
}): {
  readonly completeness: BusinessReportCompleteness;
  readonly lockedAt: string;
} {
  assertUtcTimestamp(input.observedSince, 'observedSince');
  assertUtcTimestamp(input.now, 'now');
  if (
    !Number.isInteger(input.lateEventCutoffDays) ||
    input.lateEventCutoffDays < 0
  ) {
    throw new DomainError(
      'INVALID_VALUE',
      'lateEventCutoffDays must be a non-negative integer.'
    );
  }
  const range = taipeiMonthRange(input.month);
  const lockedAt = new Date(
    Date.parse(range.endAt) + input.lateEventCutoffDays * 86_400_000
  ).toISOString();
  const observedSinceMs = Date.parse(input.observedSince);
  let completeness: BusinessReportCompleteness;
  if (observedSinceMs >= Date.parse(range.endAt)) completeness = 'unknown';
  else if (observedSinceMs > Date.parse(range.startAt))
    completeness = 'partial';
  else if (Date.parse(input.now) < Date.parse(lockedAt))
    completeness = 'partial';
  else completeness = 'complete';
  return { completeness, lockedAt };
}

export type BusinessMilestoneId = 'formal_launch' | 'final_payment';

export interface BusinessMilestoneAcknowledgements {
  /** Taipei date the owner confirmed as the first real-data booking day. */
  readonly formalLaunch?: { readonly launchDate: string };
  /** Server time of the owner's final-payment confirmation. */
  readonly finalPayment?: { readonly acknowledgedAt: string };
}

export interface BusinessMilestoneStatus {
  readonly trial:
    | { readonly status: 'not_started' }
    | {
        readonly status: 'in_progress' | 'ended';
        readonly startDate: string;
        readonly endExclusiveDate: string;
      };
  readonly formalLaunch:
    | { readonly status: 'awaiting_acknowledgement' }
    | { readonly status: 'acknowledged'; readonly launchDate: string };
  readonly formalOperation:
    | { readonly status: 'not_started' }
    | {
        readonly status: 'in_progress' | 'reached';
        readonly checkpointDate: string;
      };
  readonly finalPayment:
    | { readonly status: 'blocked' | 'awaiting_acknowledgement' }
    | { readonly status: 'acknowledged'; readonly acknowledgedDate: string };
  readonly maintenance:
    | { readonly status: 'not_started' }
    | { readonly status: 'scheduled' | 'active'; readonly startDate: string };
}

/**
 * Pure milestone view. Elapsed time alone never satisfies a payment gate: the
 * final payment stays blocked until launch is acknowledged and one formal
 * operation month has passed, and then still needs the owner's confirmation.
 */
export function evaluateBusinessMilestones(input: {
  readonly policy: ApprovedBusinessDeliveryPolicy;
  readonly now: string;
  readonly firstEligibleUseAt?: string;
  readonly acknowledgements: BusinessMilestoneAcknowledgements;
}): BusinessMilestoneStatus {
  assertUtcTimestamp(input.now, 'now');
  const nowMs = Date.parse(input.now);
  const today = taipeiCalendarDateOf(input.now);

  let trial: BusinessMilestoneStatus['trial'] = { status: 'not_started' };
  if (input.firstEligibleUseAt !== undefined) {
    const calculated = calculateBusinessDeliveryMilestones({
      firstEligibleUse: {
        occurredAt: input.firstEligibleUseAt,
        actorKind: 'real_staff'
      },
      policy: input.policy.milestones
    });
    trial = {
      status:
        nowMs < Date.parse(calculated.trialEndExclusiveAt)
          ? 'in_progress'
          : 'ended',
      startDate: calculated.firstEligibleUseDate,
      endExclusiveDate: calculated.trialEndExclusiveDate
    };
  }

  const launch = input.acknowledgements.formalLaunch;
  if (launch === undefined) {
    return {
      trial,
      formalLaunch: { status: 'awaiting_acknowledgement' },
      formalOperation: { status: 'not_started' },
      finalPayment: { status: 'blocked' },
      maintenance: { status: 'not_started' }
    };
  }
  const checkpoint = calculateFormalOperationCheckpoint({
    launchDate: launch.launchDate,
    policy: input.policy.milestones
  });
  const reached = nowMs >= Date.parse(checkpoint.checkpointAt);
  const formalOperation: BusinessMilestoneStatus['formalOperation'] = {
    status: reached ? 'reached' : 'in_progress',
    checkpointDate: checkpoint.checkpointDate
  };

  const payment = input.acknowledgements.finalPayment;
  if (payment === undefined) {
    return {
      trial,
      formalLaunch: { status: 'acknowledged', launchDate: launch.launchDate },
      formalOperation,
      finalPayment: {
        status: reached ? 'awaiting_acknowledgement' : 'blocked'
      },
      maintenance: { status: 'not_started' }
    };
  }
  const startDate = maintenanceStartDateAfter(payment.acknowledgedAt);
  return {
    trial,
    formalLaunch: { status: 'acknowledged', launchDate: launch.launchDate },
    formalOperation,
    finalPayment: {
      status: 'acknowledged',
      acknowledgedDate: taipeiCalendarDateOf(payment.acknowledgedAt)
    },
    maintenance: {
      status: today >= startDate ? 'active' : 'scheduled',
      startDate
    }
  };
}

/**
 * Server-side precondition for a milestone confirmation. The client supplies
 * only the evidence reference (and the launch date); who and when come from
 * the server session and clock.
 */
export function assertMilestoneAcknowledgementAllowed(input: {
  readonly milestoneId: BusinessMilestoneId;
  readonly policy: ApprovedBusinessDeliveryPolicy;
  readonly now: string;
  readonly launchDate?: string;
  readonly acknowledgements: BusinessMilestoneAcknowledgements;
}): void {
  assertUtcTimestamp(input.now, 'now');
  if (input.milestoneId === 'formal_launch') {
    if (input.launchDate === undefined) {
      throw new DomainError('INVALID_VALUE', 'launchDate is required.');
    }
    assertTaipeiCalendarDate(input.launchDate);
    if (input.launchDate > taipeiCalendarDateOf(input.now)) {
      throw new DomainError(
        'INVALID_VALUE',
        'launchDate cannot be in the future.'
      );
    }
    return;
  }
  if (input.launchDate !== undefined) {
    throw new DomainError(
      'INVALID_VALUE',
      'launchDate belongs to the formal_launch milestone only.'
    );
  }
  const status = evaluateBusinessMilestones({
    policy: input.policy,
    now: input.now,
    acknowledgements: input.acknowledgements
  });
  if (status.finalPayment.status !== 'awaiting_acknowledgement') {
    throw new DomainError(
      'INVALID_VALUE',
      'final payment cannot be confirmed before one formal operation month.'
    );
  }
}

/**
 * Half-open UTC range `[startAt, endAt)` covering the inclusive Taipei dates
 * `from`..`to`. Rejects an inverted range or one longer than `maxDays`.
 */
export function taipeiDateRange(input: {
  readonly from: string;
  readonly to: string;
  readonly maxDays: number;
}): {
  readonly startAt: string;
  readonly endAt: string;
  readonly days: number;
} {
  assertTaipeiCalendarDate(input.from);
  assertTaipeiCalendarDate(input.to);
  const startMs = Date.parse(`${input.from}T00:00:00.000+08:00`);
  const lastMs = Date.parse(`${input.to}T00:00:00.000+08:00`);
  const days = Math.round((lastMs - startMs) / 86_400_000) + 1;
  if (days < 1) {
    throw new DomainError('INVALID_VALUE', 'from must not be after to.');
  }
  if (days > input.maxDays) {
    throw new DomainError('INVALID_VALUE', 'the export range is too long.');
  }
  return {
    startAt: new Date(startMs).toISOString(),
    endAt: new Date(lastMs + 86_400_000).toISOString(),
    days
  };
}
