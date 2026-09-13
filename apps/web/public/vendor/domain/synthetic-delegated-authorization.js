import { DomainError } from './errors.js';
const MINIMUM_SECRET_LENGTH = 6;
const MAXIMUM_LABEL_LENGTH = 30;
/**
 * Synthetic browser input validation. The returned secret stays in the
 * current browser state only; production code must use the server adapter.
 */
export function assertSyntheticAuthorizationShape(label, secret) {
    const trimmedLabel = typeof label === 'string' ? label.trim() : '';
    if (trimmedLabel === '' || trimmedLabel.length > MAXIMUM_LABEL_LENGTH)
        throw new DomainError('INVALID_VALUE', `authorization label must be 1-${MAXIMUM_LABEL_LENGTH} characters`);
    const trimmedSecret = typeof secret === 'string' ? secret.trim() : '';
    if (trimmedSecret.length < MINIMUM_SECRET_LENGTH)
        throw new DomainError('INVALID_VALUE', `authorization secret must be at least ${MINIMUM_SECRET_LENGTH} characters`);
    return { label: trimmedLabel, secret: trimmedSecret };
}
export function authoriseSyntheticDelegatedAction(policy, actorRole, presentedSecret) {
    if (policy.delegatedToRole !== actorRole)
        return { authorised: false, reason: 'not_delegated_to_role' };
    if (!policy.enabled)
        return { authorised: false, reason: 'delegation_disabled' };
    const usable = policy.authorizations.filter((authorization) => authorization.enabled);
    if (usable.length === 0)
        return { authorised: false, reason: 'no_authorization_configured' };
    const secret = typeof presentedSecret === 'string' ? presentedSecret : '';
    if (secret === '')
        return { authorised: false, reason: 'secret_required' };
    const match = usable.find((authorization) => authorization.secret === secret);
    if (match === undefined)
        return { authorised: false, reason: 'secret_not_recognised' };
    return {
        authorised: true,
        authorizationId: match.id,
        authorizationLabel: match.label
    };
}
export function planSyntheticDelegationRecord(policy, decision) {
    if (!decision.authorised)
        throw new DomainError('DELEGATION_NOT_AUTHORIZED', 'a delegation record requires an authorised decision');
    return {
        delegated: true,
        permission: policy.permission,
        authorizationId: decision.authorizationId,
        authorizationLabel: decision.authorizationLabel
    };
}
