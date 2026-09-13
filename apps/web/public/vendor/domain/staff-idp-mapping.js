import { DomainError } from './errors.js';
import { normaliseRole } from './roles.js';
const D006_STAFF_ROLES = new Set(['manager', 'front_desk', 'physician']);
/**
 * Maps IdP claims onto a canonical staff identity. D-006 approved Google
 * federation plus clinic-managed local accounts; this helper does not talk to
 * Firebase. It only fail-closes unknown roles, hidden aliases, and claims
 * marked as the browser synthetic path.
 *
 * Browser synthetic credentials must never become a production actor. Routed
 * C2 still requires Identity Platform evidence and is not granted by this
 * function existing.
 */
const SYNTHETIC_CLAIM_SOURCES = new Set([
    'synthetic-browser',
    'synthetic-delegated-authorization',
    'browser-synthetic'
]);
function opaqueSubject(value) {
    if (typeof value !== 'string')
        return undefined;
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(value))
        return undefined;
    return value;
}
export function mapStaffIdpClaims(claims) {
    if (claims === null || typeof claims !== 'object')
        return undefined;
    if (typeof claims.source === 'string') {
        const source = claims.source.trim().toLowerCase();
        if (SYNTHETIC_CLAIM_SOURCES.has(source))
            return undefined;
    }
    const actorId = opaqueSubject(claims.subject) ?? opaqueSubject(claims.uid);
    if (actorId === undefined)
        return undefined;
    const actorRole = normaliseRole(claims.role);
    if (actorRole === undefined || !D006_STAFF_ROLES.has(actorRole)) {
        return undefined;
    }
    return { actorId, actorRole };
}
export function requireMappedStaffIdentity(claims) {
    const mapped = mapStaffIdpClaims(claims);
    if (mapped === undefined) {
        throw new DomainError('INVALID_VALUE', 'staff identity claims did not map to a canonical role');
    }
    return mapped;
}
