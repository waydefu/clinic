import { DomainError } from './errors.js';
import { assertUtcTimestamp } from './timestamp.js';
const OPAQUE_IDENTIFIER = /^[A-Za-z0-9_-]{1,128}$/;
function assertOpaque(value, fieldName) {
    if (!OPAQUE_IDENTIFIER.test(value)) {
        throw new DomainError('INVALID_VALUE', `${fieldName} must be opaque.`);
    }
}
function assertPolicy(policy) {
    if (!Number.isInteger(policy.recoverableDays) || policy.recoverableDays < 1) {
        throw new DomainError('INVALID_VALUE', 'recoverableDays must be a positive integer.');
    }
}
function addUtcDays(isoUtc, days) {
    return new Date(Date.parse(isoUtc) + days * 24 * 60 * 60 * 1000).toISOString();
}
function assertProof(proof) {
    if (!proof.authorized || !proof.reauthenticated) {
        throw new DomainError('DELEGATION_NOT_AUTHORIZED', 'retention authorization and re-authentication are required.');
    }
    assertOpaque(proof.scopeId, 'retention.scopeId');
    assertOpaque(proof.requestId, 'retention.requestId');
    assertOpaque(proof.authorizationReference, 'retention.authorizationReference');
    assertOpaque(proof.reauthenticationReference, 'retention.reauthenticationReference');
}
function archiveWindow(input) {
    assertUtcTimestamp(input.archivedAt, 'archivedAt');
    return addUtcDays(input.archivedAt, input.policy.recoverableDays);
}
function assertArchivedWindow(input) {
    if (input.archivedAt === null) {
        throw new DomainError('INVALID_VALUE', 'an archived resource must retain its original archivedAt.');
    }
    assertUtcTimestamp(input.archivedAt, 'archivedAt');
    const expectedUntil = archiveWindow({
        archivedAt: input.archivedAt,
        policy: input.policy
    });
    if (input.recoverableUntil !== expectedUntil) {
        throw new DomainError('INVALID_VALUE', 'recoverableUntil does not match the original archive boundary.');
    }
    assertUtcTimestamp(input.nowAt, 'nowAt');
}
/**
 * Plans one explicit retention operation. No operation is implicit: in
 * particular, an archive never schedules a permanent delete and a repeated
 * archive never extends the recovery window.
 */
export function planRetentionOperation(input) {
    assertOpaque(input.resourceId, 'retention.resourceId');
    assertOpaque(input.requestId, 'retention.requestId');
    assertUtcTimestamp(input.nowAt, 'nowAt');
    assertPolicy(input.policy);
    assertProof(input.proof);
    if (input.proof.requestId !== input.requestId) {
        throw new DomainError('INVALID_VALUE', 'retention request references must agree.');
    }
    const archivedAt = input.archivedAt ?? null;
    const recoverableUntil = input.recoverableUntil ?? null;
    const base = {
        resourceId: input.resourceId,
        requestId: input.requestId,
        auditRequired: true,
        backupTreatment: 'unchanged_separate_process'
    };
    if (input.operation === 'archive') {
        if (input.state === 'permanently_deleted') {
            throw new DomainError('INVALID_VALUE', 'a permanently deleted resource cannot be revived.');
        }
        if (input.state === 'archived') {
            assertArchivedWindow({
                archivedAt,
                recoverableUntil,
                nowAt: input.nowAt,
                policy: input.policy
            });
            return {
                ...base,
                operation: 'archive',
                resultingState: 'archived',
                archivedAt,
                recoverableUntil,
                dependencyCheck: 'not_required',
                idempotency: 'already_applied'
            };
        }
        const originalArchivedAt = input.nowAt;
        return {
            ...base,
            operation: 'archive',
            resultingState: 'archived',
            archivedAt: originalArchivedAt,
            recoverableUntil: archiveWindow({
                archivedAt: originalArchivedAt,
                policy: input.policy
            }),
            dependencyCheck: 'not_required',
            idempotency: 'new_operation'
        };
    }
    if (input.state !== 'archived') {
        if (input.operation === 'permanent_delete' &&
            input.state === 'permanently_deleted') {
            return {
                ...base,
                operation: 'permanent_delete',
                resultingState: 'permanently_deleted',
                archivedAt,
                recoverableUntil,
                dependencyCheck: 'complete',
                idempotency: 'already_applied'
            };
        }
        throw new DomainError('INVALID_VALUE', `${input.operation} requires an archived resource.`);
    }
    const verifiedArchive = {
        archivedAt,
        recoverableUntil,
        nowAt: input.nowAt,
        policy: input.policy
    };
    assertArchivedWindow(verifiedArchive);
    const verifiedArchivedAt = verifiedArchive.archivedAt;
    const verifiedRecoverableUntil = verifiedArchive.recoverableUntil;
    if (input.operation === 'restore') {
        if (Date.parse(input.nowAt) >= Date.parse(verifiedRecoverableUntil)) {
            throw new DomainError('INVALID_VALUE', 'the recovery window has expired.');
        }
        return {
            ...base,
            operation: 'restore',
            resultingState: 'active',
            archivedAt: null,
            recoverableUntil: null,
            dependencyCheck: 'not_required',
            idempotency: 'new_operation'
        };
    }
    if (input.legalHold) {
        throw new DomainError('DELEGATION_NOT_AUTHORIZED', 'legal hold blocks permanent deletion.');
    }
    if (Date.parse(input.nowAt) < Date.parse(verifiedRecoverableUntil)) {
        throw new DomainError('INVALID_VALUE', 'permanent deletion is not eligible before the recovery window ends.');
    }
    if (input.dependenciesReconciled !== true) {
        throw new DomainError('INVALID_VALUE', 'dependent records and projections must be reconciled first.');
    }
    return {
        ...base,
        operation: 'permanent_delete',
        resultingState: 'permanently_deleted',
        archivedAt: verifiedArchivedAt,
        recoverableUntil: verifiedRecoverableUntil,
        dependencyCheck: 'complete',
        idempotency: 'new_operation'
    };
}
