import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  AUTH_SPIKE_ALERT_THRESHOLD,
  BOOKING_WRITE_FAILURE_ALERT_THRESHOLD,
  HTTP_5XX_ALERT_THRESHOLD,
  HUMAN_NOTIFICATION_PATH,
  INTERNAL_PREPRODUCTION_COMPLETE,
  PRODUCTION_CALENDAR_INBOUND,
  PUBLIC_PRODUCTION_LAUNCH,
  evaluateFailClosedApiSurface,
  evaluateOperationalHealth,
  firingImmediateAlerts,
  renderWeekdayOperationalSummary,
  sanitizeStructuredLog
} from '@beauessence/domain';

import { inspectWpB4AlertDefinitions } from './wp-b4-alert-definitions.mjs';
import { evaluateHistoricalArtifacts } from './historical-artifacts.mjs';

const HEALTHY = {
  processAlive: true,
  firestore: 'ok',
  calendarAdapter: 'ok',
  requiredConfigPresent: true,
  bookingGateEnabled: true,
  outboxDeadLetterCount: 0,
  outboxOldestAgeSeconds: 0,
  candidateBacklog: 0,
  calendarSyncStale: false,
  calendarGoneRecoveryNeeded: false,
  backupFailed: false,
  iamAlertIntegrated: true,
  workerDegraded: false
};

function gitSha() {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8'
  }).trim();
}

function redact(value) {
  const text = JSON.stringify(value);
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/09\d{8}/g, '[redacted-phone]');
}

export function syntheticMonitoringProofs() {
  const checks = [];
  const fiveXx = firingImmediateAlerts(HEALTHY, {
    http5xx: HTTP_5XX_ALERT_THRESHOLD,
    bookingWriteFailure: 0,
    bookingTransactionFailure: 0,
    authFailure: 0,
    authzDenial: 0,
    returnLookupRateLimited: 0,
    deadLetter: 0,
    outboxOldestAgeSeconds: 0,
    backupFailure: 0,
    iamSetIamPolicy: 0
  });
  checks.push({
    id: 'generated_5xx_signal',
    pass: fiveXx.includes('api_outage_or_5xx_burst')
  });
  const booking = firingImmediateAlerts(HEALTHY, {
    http5xx: 0,
    bookingWriteFailure: BOOKING_WRITE_FAILURE_ALERT_THRESHOLD,
    bookingTransactionFailure: 0,
    authFailure: 0,
    authzDenial: 0,
    returnLookupRateLimited: 0,
    deadLetter: 0,
    outboxOldestAgeSeconds: 0,
    backupFailure: 0,
    iamSetIamPolicy: 0
  });
  checks.push({
    id: 'booking_failure_signal',
    pass: booking.includes('durable_booking_write_failure')
  });
  const auth = firingImmediateAlerts(HEALTHY, {
    http5xx: 0,
    bookingWriteFailure: 0,
    bookingTransactionFailure: 0,
    authFailure: AUTH_SPIKE_ALERT_THRESHOLD,
    authzDenial: AUTH_SPIKE_ALERT_THRESHOLD,
    returnLookupRateLimited: 0,
    deadLetter: 0,
    outboxOldestAgeSeconds: 0,
    backupFailure: 0,
    iamSetIamPolicy: 0
  });
  checks.push({
    id: 'auth_failure_spike_signal',
    pass: auth.includes('auth_failure_spike')
  });
  checks.push({
    id: 'authz_denial_spike_signal',
    pass: auth.includes('authz_denial_spike')
  });
  const deadLetter = firingImmediateAlerts({
    ...HEALTHY,
    outboxDeadLetterCount: 1
  });
  checks.push({
    id: 'dead_letter_signal',
    pass: deadLetter.includes('outbox_dead_letter')
  });
  const degraded = evaluateOperationalHealth({
    ...HEALTHY,
    outboxDeadLetterCount: 1
  });
  checks.push({
    id: 'degraded_health',
    pass: degraded.status === 'degraded' && degraded.readiness === 'ready'
  });
  const failClosed404 = evaluateFailClosedApiSurface({
    method: 'POST',
    path: '/v1/bookings',
    status: 404
  });
  checks.push({
    id: 'fail_closed_404_is_not_pass',
    pass: failClosed404.ok === false
  });
  const failClosed503 = evaluateFailClosedApiSurface({
    method: 'POST',
    path: '/v1/bookings',
    status: 503
  });
  checks.push({
    id: 'fail_closed_503_is_pass',
    pass: failClosed503.ok === true
  });
  try {
    sanitizeStructuredLog({
      timestamp: '2026-09-15T00:00:00.000Z',
      environment: 'internal_test',
      service: 'api',
      correlationId: 'corr_req_0001',
      operation: 'POST_v1_bookings',
      result: 'error',
      errorCode: 'INTERNAL_ERROR',
      durationMs: 1,
      retryState: 'none',
      phone: '0912345678'
    });
    checks.push({ id: 'pii_log_rejected', pass: false });
  } catch {
    checks.push({ id: 'pii_log_rejected', pass: true });
  }
  return checks;
}

export function assembleStageEEvidence({
  now = () => new Date().toISOString(),
  sha = gitSha,
  nodeVersion = process.version,
  environment = 'internal_test'
} = {}) {
  const headSha = sha();
  const wpB4 = inspectWpB4AlertDefinitions();
  const historical = evaluateHistoricalArtifacts();
  const monitoring = syntheticMonitoringProofs();
  const weekday = renderWeekdayOperationalSummary({
    environment,
    generatedAt: now(),
    rateLimited: 0,
    authDenials: 0,
    authzDenials: 0,
    retries: 0,
    recoveries: 0,
    outboxBacklog: 0,
    calendarCandidateBacklog: 0,
    apiP95Ms: null,
    resourceCostSignal: 'not_applied'
  });
  const checks = [
    ...monitoring,
    { id: 'wp_b4_definitions', pass: wpB4.ok },
    {
      id: 'human_notification_not_proven',
      pass: HUMAN_NOTIFICATION_PATH.proven === false
    },
    {
      id: 'exact_sha_captured',
      pass: /^[a-f0-9]{40}$/.test(headSha)
    },
    {
      id: 'historical_disposition_recorded',
      pass:
        historical.status === 'HASH_MATCH' ||
        historical.status === 'HISTORICAL_ARTIFACTS_LOST'
    }
  ];
  const failed = checks.filter((item) => item.pass !== true);
  const evidence = {
    kind: 'stage_e_evidence',
    timestamp: now(),
    sha: headSha,
    environment,
    toolVersions: {
      node: nodeVersion
    },
    verdicts: {
      INTERNAL_PREPRODUCTION_COMPLETE,
      PUBLIC_PRODUCTION_LAUNCH,
      PRODUCTION_CALENDAR_INBOUND,
      HUMAN_NOTIFICATION_PATH: HUMAN_NOTIFICATION_PATH.status
    },
    wpB4,
    historical: {
      status: historical.status,
      newEvidenceSet: historical.newEvidenceSet,
      recovered: historical.recovered,
      expected: historical.expected
    },
    weekdaySummary: weekday,
    checks,
    pass: failed.length === 0,
    humanNotificationProven: false
  };
  return JSON.parse(redact(evidence));
}

export const EVIDENCE_USAGE =
  'Usage: pnpm evidence:stage-e [--out <path>]\nSynthetic local proof only. Does not deploy, apply, or send email.\n';

export function runStageEEvidenceCli({ argv, stdout, stderr, writeFile }) {
  const args = argv.filter((item) => item !== '--');
  const outIndex = args.indexOf('--out');
  const outPath = outIndex >= 0 ? args[outIndex + 1] : undefined;
  try {
    const evidence = assembleStageEEvidence();
    const payload = `${JSON.stringify(evidence, null, 2)}\n`;
    stdout.write(payload);
    if (typeof outPath === 'string' && outPath !== '') {
      (writeFile ?? writeFileSync)(outPath, payload);
    }
    return evidence.pass ? 0 : 1;
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    stderr.write(EVIDENCE_USAGE);
    return 2;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runStageEEvidenceCli({
    argv: process.argv.slice(2),
    stdout: process.stdout,
    stderr: process.stderr
  });
}
