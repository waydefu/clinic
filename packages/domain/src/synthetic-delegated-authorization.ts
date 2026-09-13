import { DomainError } from './errors.js';
import type { Role } from './roles.js';

/**
 * Browser-local synthetic shape. This is deliberately separate from the
 * server's hashed `DelegatedAuthorization`; it is never a production auth
 * boundary and must remain behind the synthetic-only UI switch.
 */
export interface SyntheticDelegatedAuthorization {
  readonly id: string;
  readonly label: string;
  readonly secret: string;
  readonly enabled: boolean;
}

export interface SyntheticDelegationPolicy {
  readonly permission: string;
  readonly delegatedToRole: Role;
  readonly enabled: boolean;
  readonly authorizations: readonly SyntheticDelegatedAuthorization[];
}

export type SyntheticDelegationDecision =
  | {
      readonly authorised: true;
      readonly authorizationId: string;
      readonly authorizationLabel: string;
    }
  | {
      readonly authorised: false;
      readonly reason:
        | 'not_delegated_to_role'
        | 'delegation_disabled'
        | 'no_authorization_configured'
        | 'secret_required'
        | 'secret_not_recognised';
    };

const MINIMUM_SECRET_LENGTH = 6;
const MAXIMUM_LABEL_LENGTH = 30;

/**
 * Synthetic browser input validation. The returned secret stays in the
 * current browser state only; production code must use the server adapter.
 */
export function assertSyntheticAuthorizationShape(
  label: unknown,
  secret: unknown
): { label: string; secret: string } {
  const trimmedLabel = typeof label === 'string' ? label.trim() : '';
  if (trimmedLabel === '' || trimmedLabel.length > MAXIMUM_LABEL_LENGTH)
    throw new DomainError(
      'INVALID_VALUE',
      `authorization label must be 1-${MAXIMUM_LABEL_LENGTH} characters`
    );

  const trimmedSecret = typeof secret === 'string' ? secret.trim() : '';
  if (trimmedSecret.length < MINIMUM_SECRET_LENGTH)
    throw new DomainError(
      'INVALID_VALUE',
      `authorization secret must be at least ${MINIMUM_SECRET_LENGTH} characters`
    );

  return { label: trimmedLabel, secret: trimmedSecret };
}

export function authoriseSyntheticDelegatedAction(
  policy: SyntheticDelegationPolicy,
  actorRole: Role,
  presentedSecret: unknown
): SyntheticDelegationDecision {
  if (policy.delegatedToRole !== actorRole)
    return { authorised: false, reason: 'not_delegated_to_role' };
  if (!policy.enabled)
    return { authorised: false, reason: 'delegation_disabled' };

  const usable = policy.authorizations.filter(
    (authorization) => authorization.enabled
  );
  if (usable.length === 0)
    return { authorised: false, reason: 'no_authorization_configured' };

  const secret = typeof presentedSecret === 'string' ? presentedSecret : '';
  if (secret === '') return { authorised: false, reason: 'secret_required' };

  const match = usable.find((authorization) => authorization.secret === secret);
  if (match === undefined)
    return { authorised: false, reason: 'secret_not_recognised' };

  return {
    authorised: true,
    authorizationId: match.id,
    authorizationLabel: match.label
  };
}

export function planSyntheticDelegationRecord(
  policy: Pick<SyntheticDelegationPolicy, 'permission'>,
  decision: SyntheticDelegationDecision
) {
  if (!decision.authorised)
    throw new DomainError(
      'DELEGATION_NOT_AUTHORIZED',
      'a delegation record requires an authorised decision'
    );
  return {
    delegated: true as const,
    permission: policy.permission,
    authorizationId: decision.authorizationId,
    authorizationLabel: decision.authorizationLabel
  };
}
