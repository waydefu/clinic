import { DomainError } from './errors.js';
import { assertUtcTimestamp } from './timestamp.js';
const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;
const OPAQUE_IDENTIFIER = /^[A-Za-z0-9_-]{1,128}$/;
function assertOpaque(value, fieldName) {
    if (!OPAQUE_IDENTIFIER.test(value)) {
        throw new DomainError('INVALID_VALUE', `${fieldName} must be opaque.`);
    }
}
function assertMonth(value) {
    const match = MONTH_PATTERN.exec(value);
    if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) {
        throw new DomainError('INVALID_VALUE', 'month must be YYYY-MM.');
    }
}
function taipeiMonth(occurredAt) {
    assertUtcTimestamp(occurredAt, 'occurredAt');
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Taipei',
        year: 'numeric',
        month: '2-digit'
    }).format(new Date(occurredAt));
}
function eventFingerprint(event) {
    return JSON.stringify([
        event.occurredAt,
        event.eventClass,
        event.kind,
        event.actorId ?? null
    ]);
}
/**
 * Aggregates one Taipei calendar month. Duplicate event IDs are idempotent;
 * reusing an ID for different content fails closed instead of double-counting.
 * A non-complete source never becomes "unused" merely because no rows arrived.
 */
export function summarizeMonthlyBusinessUsage(input) {
    assertMonth(input.month);
    const seen = new Map();
    const staffIds = new Set();
    let bookingCreatedCount = 0;
    let majorIncidentCount = 0;
    let backupSuccessCount = 0;
    let backupFailureCount = 0;
    for (const event of input.events) {
        assertOpaque(event.eventId, 'eventId');
        const fingerprint = eventFingerprint(event);
        const previous = seen.get(event.eventId);
        if (previous !== undefined) {
            if (previous !== fingerprint) {
                throw new DomainError('INVALID_VALUE', 'an eventId cannot describe two different events.');
            }
            continue;
        }
        seen.set(event.eventId, fingerprint);
        if (taipeiMonth(event.occurredAt) !== input.month)
            continue;
        if (event.eventClass !== 'runtime')
            continue;
        if (event.kind === 'staff_login') {
            if (event.actorId === undefined) {
                throw new DomainError('INVALID_VALUE', 'a runtime staff_login requires an opaque actorId.');
            }
            assertOpaque(event.actorId, 'actorId');
            staffIds.add(event.actorId);
        }
        else if (event.kind === 'booking_created') {
            bookingCreatedCount += 1;
        }
        else if (event.kind === 'major_incident') {
            majorIncidentCount += 1;
        }
        else if (event.kind === 'backup_success') {
            backupSuccessCount += 1;
        }
        else if (event.kind === 'backup_failure') {
            backupFailureCount += 1;
        }
    }
    const used = staffIds.size > 0 || bookingCreatedCount > 0;
    const usageClassification = input.completeness === 'complete'
        ? used
            ? 'used'
            : 'unused'
        : 'insufficient_evidence';
    return {
        scope: input.scope,
        month: input.month,
        timeZone: 'Asia/Taipei',
        completeness: input.completeness,
        uniqueStaffUsers: staffIds.size,
        bookingCreatedCount,
        majorIncidentCount,
        backupSuccessCount,
        backupFailureCount,
        usageClassification
    };
}
