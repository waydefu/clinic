import {
  authoriseDelegatedAction,
  planDeniedDelegationAudit,
  recordDelegationAttempt,
  type DelegatedSecretVerifier,
  type DelegationDecision,
  type DelegationPolicy,
  type DelegationVerificationState,
  type Role
} from '@beauessence/domain';

import {
  InMemoryDelegatedAuthorizationAttemptStore,
  delegatedAttemptKey
} from './delegated-authorization-attempt-store.js';
import { InMemoryDeniedAuthorizationAuditSink } from './denied-authorization-audit-sink.js';

export interface EvaluateDelegatedAuthorizationInput {
  readonly policy: DelegationPolicy;
  readonly actorId: string;
  readonly actorRole: Role;
  readonly presentedSecret: unknown;
  readonly correlationId: string;
  readonly eventId: string;
  readonly occurredAt: string;
  readonly maximumFailures: number;
}

export interface EvaluateDelegatedAuthorizationResult {
  readonly decision: DelegationDecision;
  readonly attemptState: DelegationVerificationState;
}

/**
 * Unrouted application service: hashed verification, atomic lockout, and a
 * denied-event audit sink. AppModule must not import this until D-001–D-005
 * are approved and a booking/deletion route is separately authorised.
 */
export class DelegatedAuthorizationService {
  public constructor(
    private readonly store: InMemoryDelegatedAuthorizationAttemptStore,
    private readonly audit: InMemoryDeniedAuthorizationAuditSink,
    private readonly verifySecret: DelegatedSecretVerifier
  ) {}

  public async evaluate(
    input: EvaluateDelegatedAuthorizationInput
  ): Promise<EvaluateDelegatedAuthorizationResult> {
    const key = delegatedAttemptKey(input.actorId, input.policy.permission);
    return this.store.runExclusive(key, (state) => {
      if (state.locked) {
        const decision: DelegationDecision = {
          authorised: false,
          reason: 'secret_not_recognised'
        };
        this.audit.append(
          planDeniedDelegationAudit({
            eventId: input.eventId,
            occurredAt: input.occurredAt,
            actorId: input.actorId,
            actorRole: input.actorRole,
            permission: input.policy.permission,
            reasonCode: 'verification_locked',
            locked: true,
            failedAttempts: state.failedAttempts,
            correlationId: input.correlationId
          })
        );
        return { decision, attemptState: state };
      }

      const decision = authoriseDelegatedAction(
        input.policy,
        input.actorRole,
        input.presentedSecret,
        this.verifySecret
      );

      if (decision.authorised) {
        const next = recordDelegationAttempt(
          state,
          'success',
          input.maximumFailures
        );
        this.store.replace(key, next);
        return { decision, attemptState: next };
      }

      const countsAsSecretFailure = decision.reason === 'secret_not_recognised';
      const next = countsAsSecretFailure
        ? recordDelegationAttempt(state, 'failure', input.maximumFailures)
        : state;
      if (countsAsSecretFailure) this.store.replace(key, next);

      this.audit.append(
        planDeniedDelegationAudit({
          eventId: input.eventId,
          occurredAt: input.occurredAt,
          actorId: input.actorId,
          actorRole: input.actorRole,
          permission: input.policy.permission,
          reasonCode: next.locked ? 'verification_locked' : decision.reason,
          locked: next.locked,
          failedAttempts: next.failedAttempts,
          correlationId: input.correlationId
        })
      );

      return { decision, attemptState: next };
    });
  }
}
