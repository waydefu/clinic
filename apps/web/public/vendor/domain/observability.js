/**
 * Stage E operational contract: low-cardinality metrics, WP-B4 alerts,
 * liveness vs operational health, PII-safe logs, and completeness semantics.
 *
 * Monitoring reuses existing API and domain error codes. It does not invent a
 * second taxonomy. Metric labels never carry phone, DOB, names, tokens,
 * cookies, session ids, or appointment free text.
 */
export const PRODUCTION_CALENDAR_INBOUND = 'GO_LIVE_DEFERRED';
export const INTERNAL_PREPRODUCTION_COMPLETE = 'FAIL';
export const PUBLIC_PRODUCTION_LAUNCH = 'DEFERRED';
export const HUMAN_NOTIFICATION_PATH_STATUS = 'IMPLEMENTED_NOT_DEPLOYED';
export const HUMAN_NOTIFICATION_PROVEN = 'HUMAN_NOTIFICATION_PROVEN';
export const ALERT_WINDOW_MS = 5 * 60 * 1000;
export const HTTP_5XX_ALERT_THRESHOLD = 3;
export const BOOKING_WRITE_FAILURE_ALERT_THRESHOLD = 3;
export const AUTH_SPIKE_ALERT_THRESHOLD = 10;
export const AUTHZ_SPIKE_ALERT_THRESHOLD = 10;
export const DEAD_LETTER_ALERT_THRESHOLD = 1;
/** Existing worker Canon (60s) is stricter than a 5-minute guess; keep it. */
export const OUTBOX_AGE_ALERT_SECONDS = 60;
export const CANDIDATE_BACKLOG_ALERT_THRESHOLD = 50;
export const MAX_STRUCTURED_LOGS_PER_MINUTE = 120;
export const MAX_CANDIDATE_BACKLOG = 200;
export const MAX_LOG_FIELD_CHARS = 240;
export const WATCH_RENEWAL_DUPLICATE_PROTECTION = true;
export const FORBIDDEN_METRIC_LABELS = Object.freeze([
    'phone',
    'dob',
    'dateOfBirth',
    'patientName',
    'name',
    'nationalId',
    'passport',
    'token',
    'cookie',
    'authorization',
    'sessionId',
    'session',
    'totp',
    'clinicalNote',
    'payment',
    'freeText',
    'appointmentNotes'
]);
export const FORBIDDEN_LOG_KEYS = Object.freeze([
    'phone',
    'mobile',
    'dob',
    'dateOfBirth',
    'nationalId',
    'passport',
    'token',
    'accessToken',
    'refreshToken',
    'cookie',
    'cookies',
    'authorization',
    'totp',
    'clinicalNote',
    'notes',
    'payment',
    'cardNumber',
    'patientName',
    'name',
    'email',
    'password'
]);
export const WP_B4_IMMEDIATE_ALERTS = Object.freeze([
    {
        id: 'api_outage_or_5xx_burst',
        severity: 'immediate',
        signal: 'http_5xx',
        threshold: HTTP_5XX_ALERT_THRESHOLD,
        windowMs: ALERT_WINDOW_MS,
        comparison: 'gte',
        notificationPath: ['alert_policy', 'notification_channel', 'human_email']
    },
    {
        id: 'durable_booking_write_failure',
        severity: 'immediate',
        signal: 'booking_write_failure',
        threshold: BOOKING_WRITE_FAILURE_ALERT_THRESHOLD,
        windowMs: ALERT_WINDOW_MS,
        comparison: 'gte',
        notificationPath: ['alert_policy', 'notification_channel', 'human_email']
    },
    {
        id: 'persistent_firestore_transaction_failure',
        severity: 'immediate',
        signal: 'booking_transaction_failure',
        threshold: BOOKING_WRITE_FAILURE_ALERT_THRESHOLD,
        windowMs: ALERT_WINDOW_MS,
        comparison: 'gte',
        notificationPath: ['alert_policy', 'notification_channel', 'human_email']
    },
    {
        id: 'backup_failure',
        severity: 'immediate',
        signal: 'backup_failure',
        threshold: 1,
        windowMs: ALERT_WINDOW_MS,
        comparison: 'gte',
        notificationPath: ['alert_policy', 'notification_channel', 'human_email']
    },
    {
        id: 'outbox_dead_letter',
        severity: 'immediate',
        signal: 'outbox_dead_letter',
        threshold: DEAD_LETTER_ALERT_THRESHOLD,
        windowMs: ALERT_WINDOW_MS,
        comparison: 'gte',
        notificationPath: ['alert_policy', 'notification_channel', 'human_email']
    },
    {
        id: 'excessive_outbox_age',
        severity: 'immediate',
        signal: 'outbox_oldest_age',
        threshold: OUTBOX_AGE_ALERT_SECONDS,
        windowMs: ALERT_WINDOW_MS,
        comparison: 'gte',
        notificationPath: ['alert_policy', 'notification_channel', 'human_email']
    },
    {
        id: 'iam_setiampolicy',
        severity: 'immediate',
        signal: 'iam_setiampolicy',
        threshold: 1,
        windowMs: ALERT_WINDOW_MS,
        comparison: 'gte',
        notificationPath: ['alert_policy', 'notification_channel', 'human_email']
    },
    {
        id: 'auth_failure_spike',
        severity: 'immediate',
        signal: 'auth_failure',
        threshold: AUTH_SPIKE_ALERT_THRESHOLD,
        windowMs: ALERT_WINDOW_MS,
        comparison: 'gte',
        notificationPath: ['alert_policy', 'notification_channel', 'human_email']
    },
    {
        id: 'authz_denial_spike',
        severity: 'immediate',
        signal: 'authz_denial',
        threshold: AUTHZ_SPIKE_ALERT_THRESHOLD,
        windowMs: ALERT_WINDOW_MS,
        comparison: 'gte',
        notificationPath: ['alert_policy', 'notification_channel', 'human_email']
    }
]);
function check(id, status) {
    return { id, status };
}
export function evaluateOperationalHealth(input) {
    const checks = [
        check('process', input.processAlive ? 'ok' : 'unhealthy'),
        check('firestore', input.firestore === 'ok'
            ? 'ok'
            : input.firestore === 'unavailable'
                ? 'unhealthy'
                : 'unknown'),
        check('calendar_adapter', input.calendarAdapter === 'ok'
            ? 'ok'
            : input.calendarAdapter === 'unavailable'
                ? 'degraded'
                : 'unknown'),
        check('required_config', input.requiredConfigPresent ? 'ok' : 'unhealthy'),
        check('booking_gate', input.bookingGateEnabled ? 'ok' : 'disabled'),
        check('outbox_dead_letter', input.outboxDeadLetterCount > 0 ? 'degraded' : 'ok'),
        check('outbox_age', input.outboxOldestAgeSeconds >= OUTBOX_AGE_ALERT_SECONDS
            ? 'degraded'
            : 'ok'),
        check('candidate_backlog', input.candidateBacklog >= CANDIDATE_BACKLOG_ALERT_THRESHOLD
            ? 'degraded'
            : 'ok'),
        check('calendar_sync', input.calendarSyncStale || input.calendarGoneRecoveryNeeded
            ? 'degraded'
            : 'ok'),
        check('backup', input.backupFailed ? 'unhealthy' : 'ok'),
        check('iam_alert_integration', input.iamAlertIntegrated ? 'ok' : 'degraded'),
        check('worker', input.workerDegraded ? 'degraded' : 'ok')
    ];
    const liveness = input.processAlive ? 'alive' : 'dead';
    const readiness = input.processAlive &&
        input.requiredConfigPresent &&
        input.firestore !== 'unavailable'
        ? 'ready'
        : 'not_ready';
    const unhealthy = checks.some((item) => item.status === 'unhealthy');
    const degraded = checks.some((item) => item.status === 'degraded');
    const status = !input.processAlive
        ? 'unhealthy'
        : unhealthy
            ? 'unhealthy'
            : degraded
                ? 'degraded'
                : 'healthy';
    return {
        status,
        readiness,
        liveness,
        checks,
        firingAlerts: firingImmediateAlerts(input)
    };
}
export function firingImmediateAlerts(input, counts) {
    const firing = [];
    if (counts && counts.http5xx >= HTTP_5XX_ALERT_THRESHOLD)
        firing.push('api_outage_or_5xx_burst');
    if (counts &&
        counts.bookingWriteFailure >= BOOKING_WRITE_FAILURE_ALERT_THRESHOLD)
        firing.push('durable_booking_write_failure');
    if (counts &&
        counts.bookingTransactionFailure >= BOOKING_WRITE_FAILURE_ALERT_THRESHOLD)
        firing.push('persistent_firestore_transaction_failure');
    if (input.backupFailed || (counts && counts.backupFailure >= 1))
        firing.push('backup_failure');
    if (input.outboxDeadLetterCount >= DEAD_LETTER_ALERT_THRESHOLD)
        firing.push('outbox_dead_letter');
    if (input.outboxOldestAgeSeconds >= OUTBOX_AGE_ALERT_SECONDS)
        firing.push('excessive_outbox_age');
    if (counts && counts.iamSetIamPolicy >= 1)
        firing.push('iam_setiampolicy');
    if (counts && counts.authFailure >= AUTH_SPIKE_ALERT_THRESHOLD)
        firing.push('auth_failure_spike');
    if (counts && counts.authzDenial >= AUTHZ_SPIKE_ALERT_THRESHOLD)
        firing.push('authz_denial_spike');
    return firing;
}
export function evaluateAlertThreshold(policy, observed) {
    return observed >= policy.threshold;
}
export const HUMAN_NOTIFICATION_PATH = Object.freeze({
    status: HUMAN_NOTIFICATION_PATH_STATUS,
    channelKind: 'email',
    transport: 'pubsub_plus_email',
    recipientSource: 'secret_or_tfvar_never_in_repo',
    pubsubTopic: 'c1-application-alerts',
    proven: false
});
const OPAQUE = /^[A-Za-z0-9_-]{1,128}$/;
const ENVIRONMENT = /^[A-Za-z0-9_-]{1,64}$/;
export function assertSafeMetricLabels(labels) {
    for (const [key, value] of Object.entries(labels)) {
        if (FORBIDDEN_METRIC_LABELS.some((forbidden) => forbidden.toLowerCase() === key.toLowerCase())) {
            throw new Error(`metric label "${key}" is forbidden`);
        }
        if (!OPAQUE.test(key) || !OPAQUE.test(value)) {
            throw new Error('metric labels must be opaque identifiers');
        }
    }
}
export function sanitizeStructuredLog(input) {
    for (const key of Object.keys(input)) {
        if (FORBIDDEN_LOG_KEYS.some((forbidden) => forbidden.toLowerCase() === key.toLowerCase())) {
            throw new Error(`structured log key "${key}" is forbidden`);
        }
    }
    if (!ENVIRONMENT.test(input.environment))
        throw new Error('structured log environment is not a safe label');
    if (!OPAQUE.test(input.service))
        throw new Error('structured log service is not opaque');
    if (!OPAQUE.test(input.correlationId))
        throw new Error('structured log correlationId is not opaque');
    if (!OPAQUE.test(input.operation.replace(/[/:]/g, '_')))
        throw new Error('structured log operation is not a safe label');
    if (input.errorCode !== null &&
        (input.errorCode.length > MAX_LOG_FIELD_CHARS ||
            !/^[A-Z][A-Z0-9_]+$/.test(input.errorCode))) {
        throw new Error('structured log errorCode must be a stable code');
    }
    return {
        timestamp: input.timestamp,
        environment: input.environment,
        service: input.service,
        correlationId: input.correlationId,
        operation: input.operation,
        result: input.result,
        errorCode: input.errorCode,
        durationMs: input.durationMs,
        retryState: input.retryState
    };
}
export function renderWeekdayOperationalSummary(input) {
    return {
        kind: 'weekday_operational_summary',
        synthetic: true,
        environment: input.environment,
        generatedAt: input.generatedAt,
        rateLimited: input.rateLimited,
        authDenials: input.authDenials,
        authzDenials: input.authzDenials,
        retries: input.retries,
        recoveries: input.recoveries,
        outboxBacklog: input.outboxBacklog,
        calendarCandidateBacklog: input.calendarCandidateBacklog,
        apiP95Ms: input.apiP95Ms,
        resourceCostSignal: input.resourceCostSignal
    };
}
/**
 * Gate closed → 503. Staff unauthenticated → 401/403. Static Hosting 404 is
 * API-not-mounted, never a healthy fail-closed API.
 */
export function evaluateFailClosedApiSurface(input) {
    const { method, path, status } = input;
    if (status === 503) {
        return { ok: true, status, reason: 'fail-closed' };
    }
    if (status === 401 || status === 403) {
        return { ok: true, status, reason: 'unauthenticated-denied' };
    }
    if (status === 404) {
        return {
            ok: false,
            status,
            reason: `api-not-mounted: ${method} ${path} returned 404; fail-closed API must be 503`
        };
    }
    if (status >= 200 && status < 300) {
        return {
            ok: false,
            status,
            reason: `${method} ${path} returned ${status}: unauthenticated 2xx means production default is not OFF`
        };
    }
    return {
        ok: false,
        status,
        reason: `${method} ${path} returned unexpected status ${status}`
    };
}
export function evaluatePublicBookingGateOpen(input) {
    const { method, path, status } = input;
    if (method === 'POST' && path === '/v1/bookings') {
        if (status === 404) {
            return {
                ok: false,
                status,
                reason: 'api-not-mounted: public booking gate open cannot be a 404'
            };
        }
        if (status === 503) {
            return {
                ok: false,
                status,
                reason: 'booking-gate-closed: expected accountless create, got 503'
            };
        }
        if (status === 401 || status === 403) {
            return {
                ok: false,
                status,
                reason: 'accountless-booking-regressed: public create must not require login'
            };
        }
        if (status >= 200 && status < 300) {
            return { ok: true, status, reason: 'accountless-create' };
        }
    }
    if (status === 401 || status === 403) {
        return { ok: true, status, reason: 'unauthenticated-denied' };
    }
    return evaluateFailClosedApiSurface(input);
}
export function routeFamilyFromPath(path) {
    if (path.includes('/health'))
        return 'health';
    if (path.includes('/return-lookup'))
        return 'return_lookup';
    if (path.includes('/bookings'))
        return 'public_booking';
    if (path.includes('/calendar'))
        return 'calendar';
    if (path.includes('/schedule') || path.includes('/slots'))
        return 'schedule';
    if (path.includes('/calendar-session'))
        return 'staff';
    return 'other';
}
export function isBookingWritePath(method, path) {
    return method !== 'GET' && path.includes('/bookings');
}
export function candidateBacklogExceeded(count) {
    return count >= MAX_CANDIDATE_BACKLOG;
}
