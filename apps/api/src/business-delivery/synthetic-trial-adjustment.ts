import {
  assertUtcTimestamp,
  calculateBusinessDeliveryMilestones,
  DomainError,
  type ApprovedBusinessDeliveryPolicy
} from '@beauessence/domain';

import { ConflictError } from '../platform/errors/api-error.js';

/** Pure synthetic model only. No persistence, approval authority or route. */
export type SyntheticTrialAdjustmentCommand = {
  readonly commandId: string;
  readonly adjustmentId: string;
  readonly approvalRef: string;
  readonly expectedVersion: number;
  readonly actorRef: string;
  readonly approvedAt: string;
} & (
  | { readonly kind: 'approve'; readonly adjustmentDays: number }
  | { readonly kind: 'revoke'; readonly adjustmentDays?: never }
);

export interface SyntheticTrialAdjustmentState {
  readonly schemaVersion: 1;
  readonly firstEligibleUseAt: string;
  readonly policyVersion: string;
  readonly baseRevision: number;
  readonly revision: number;
  readonly log: readonly SyntheticTrialAdjustmentCommand[];
}

const OPAQUE = /^[A-Za-z0-9_-]{1,128}$/;

function invalid(): never {
  throw new DomainError('INVALID_VALUE', 'Invalid synthetic trial adjustment.');
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return invalid();
  return value as Record<string, unknown>;
}

function version(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) invalid();
}

function command(
  value: unknown
): asserts value is SyntheticTrialAdjustmentCommand {
  const row = object(value);
  const allowed = new Set([
    'commandId',
    'kind',
    'adjustmentId',
    'adjustmentDays',
    'approvalRef',
    'expectedVersion',
    'actorRef',
    'approvedAt'
  ]);
  if (Object.keys(row).some((key) => !allowed.has(key))) invalid();
  for (const key of ['commandId', 'adjustmentId', 'approvalRef']) {
    if (typeof row[key] !== 'string' || !OPAQUE.test(row[key])) invalid();
  }
  if (row.kind !== 'approve' && row.kind !== 'revoke') invalid();
  if (typeof row.actorRef !== 'string' || !/^[a-f0-9]{64}$/.test(row.actorRef))
    invalid();
  if (typeof row.approvedAt !== 'string') invalid();
  assertUtcTimestamp(row.approvedAt, 'approvedAt');
  version(row.expectedVersion);
  if (row.kind === 'approve' && typeof row.adjustmentDays !== 'number')
    invalid();
  if (row.kind === 'revoke' && row.adjustmentDays !== undefined) invalid();
}

function materialize(
  value: unknown,
  policy: ApprovedBusinessDeliveryPolicy
): {
  state: SyntheticTrialAdjustmentState;
  active?: SyntheticTrialAdjustmentCommand;
} {
  const row = object(value);
  const allowed = new Set([
    'schemaVersion',
    'firstEligibleUseAt',
    'policyVersion',
    'baseRevision',
    'revision',
    'log'
  ]);
  if (Object.keys(row).some((key) => !allowed.has(key))) invalid();
  if (row.schemaVersion !== 1 || row.policyVersion !== policy.version)
    invalid();
  if (typeof row.firstEligibleUseAt !== 'string') invalid();
  assertUtcTimestamp(row.firstEligibleUseAt, 'firstEligibleUseAt');
  version(row.baseRevision);
  version(row.revision);
  if (!Array.isArray(row.log)) invalid();
  const ids = new Set<string>();
  const refs = new Set<string>();
  const adjustments = new Set<string>();
  let active: SyntheticTrialAdjustmentCommand | undefined;
  let revision = row.baseRevision;
  for (const entry of row.log) {
    command(entry);
    if (entry.expectedVersion < revision) invalid();
    if (ids.has(entry.commandId) || refs.has(entry.approvalRef)) invalid();
    ids.add(entry.commandId);
    refs.add(entry.approvalRef);
    if (entry.kind === 'approve') {
      if (adjustments.has(entry.adjustmentId)) invalid();
      // The domain calculator alone owns legal day totals and calendar rules.
      calculateBusinessDeliveryMilestones({
        firstEligibleUse: {
          occurredAt: row.firstEligibleUseAt,
          actorKind: 'real_staff'
        },
        policy: policy.milestones,
        adjustmentDays: entry.adjustmentDays
      });
      adjustments.add(entry.adjustmentId);
      active = entry;
    } else {
      if (active?.adjustmentId !== entry.adjustmentId) invalid();
      active = undefined;
    }
    revision = entry.expectedVersion + 1;
  }
  if (row.revision !== revision) invalid();
  const state = value as SyntheticTrialAdjustmentState;
  return active === undefined ? { state } : { state, active };
}

export function initialSyntheticTrialAdjustment(input: {
  readonly firstEligibleUseAt: string;
  readonly policy: ApprovedBusinessDeliveryPolicy;
  readonly revision: number;
}): SyntheticTrialAdjustmentState {
  assertUtcTimestamp(input.firstEligibleUseAt, 'firstEligibleUseAt');
  version(input.revision);
  return Object.freeze({
    schemaVersion: 1,
    firstEligibleUseAt: input.firstEligibleUseAt,
    policyVersion: input.policy.version,
    baseRevision: input.revision,
    revision: input.revision,
    log: Object.freeze([])
  });
}

export function planSyntheticTrialAdjustment(
  state: SyntheticTrialAdjustmentState,
  input: SyntheticTrialAdjustmentCommand,
  policy: ApprovedBusinessDeliveryPolicy,
  currentMilestoneRevision = state.revision
): {
  readonly state: SyntheticTrialAdjustmentState;
  readonly revision: number;
  readonly replayed: boolean;
} {
  materialize(state, policy);
  command(input);
  version(currentMilestoneRevision);
  if (currentMilestoneRevision < state.revision) invalid();
  const previous = state.log.find(
    (entry) => entry.commandId === input.commandId
  );
  if (previous !== undefined) {
    const fields = [
      'commandId',
      'kind',
      'adjustmentId',
      'adjustmentDays',
      'approvalRef',
      'expectedVersion',
      'actorRef',
      'approvedAt'
    ] as const;
    if (
      fields.some((key) => previous[key] !== input[key]) ||
      (input.kind === 'approve' &&
        state.log.some(
          (entry) =>
            entry.kind === 'revoke' && entry.adjustmentId === input.adjustmentId
        ))
    )
      throw new ConflictError();
    return { state, revision: previous.expectedVersion + 1, replayed: true };
  }
  if (input.expectedVersion !== currentMilestoneRevision)
    throw new ConflictError();
  const next: SyntheticTrialAdjustmentState = Object.freeze({
    ...state,
    revision: currentMilestoneRevision + 1,
    log: Object.freeze([
      ...state.log.map((entry) => Object.freeze({ ...entry })),
      Object.freeze({ ...input })
    ])
  });
  materialize(next, policy);
  return { state: next, revision: next.revision, replayed: false };
}

/** Only the in-memory fixture port supplies this field; Firestore never does. */
export function resolveSyntheticTrialAdjustmentDays(input: {
  readonly snapshot: unknown;
  readonly firstEligibleUseAt?: string;
  readonly milestoneRevision: number;
  readonly policy: ApprovedBusinessDeliveryPolicy;
}): number | undefined {
  if (input.snapshot === undefined) return undefined;
  const { state, active } = materialize(input.snapshot, input.policy);
  version(input.milestoneRevision);
  // Acknowledgements share the global revision without changing this history.
  // The trusted fixture port must supply one coherent milestone snapshot.
  if (
    state.firstEligibleUseAt !== input.firstEligibleUseAt ||
    state.revision > input.milestoneRevision
  )
    invalid();
  return active?.adjustmentDays ?? 0;
}
