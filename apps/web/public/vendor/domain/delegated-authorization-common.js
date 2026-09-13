import { DomainError } from './errors.js';
const MINIMUM_SECRET_LENGTH = 6;
const MAXIMUM_LABEL_LENGTH = 30;
/**
 * Validates the one-time input before a server adapter hashes it or the
 * synthetic browser stores it. The returned secret is an in-memory input, not
 * a persistence shape.
 */
export function assertAuthorizationShape(label, secret) {
    const trimmedLabel = typeof label === 'string' ? label.trim() : '';
    if (trimmedLabel === '' || trimmedLabel.length > MAXIMUM_LABEL_LENGTH)
        throw new DomainError('INVALID_VALUE', `authorization label must be 1-${MAXIMUM_LABEL_LENGTH} characters`);
    const trimmedSecret = typeof secret === 'string' ? secret.trim() : '';
    if (trimmedSecret.length < MINIMUM_SECRET_LENGTH)
        throw new DomainError('INVALID_VALUE', `authorization secret must be at least ${MINIMUM_SECRET_LENGTH} characters`);
    return { label: trimmedLabel, secret: trimmedSecret };
}
export function planDelegationRecord(policy, decision) {
    if (!decision.authorised)
        throw new DomainError('DELEGATION_NOT_AUTHORIZED', 'a delegation record requires an authorised decision');
    return {
        delegated: true,
        permission: policy.permission,
        authorizationId: decision.authorizationId,
        authorizationLabel: decision.authorizationLabel
    };
}
