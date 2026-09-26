import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AUTH_SPIKE_ALERT_THRESHOLD,
  AUTHZ_SPIKE_ALERT_THRESHOLD,
  BOOKING_WRITE_FAILURE_ALERT_THRESHOLD,
  HTTP_5XX_ALERT_THRESHOLD,
  HUMAN_NOTIFICATION_PATH,
  OUTBOX_AGE_ALERT_SECONDS,
  WP_B4_IMMEDIATE_ALERTS
} from '@beauessence/domain';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

export function loadWpB4Definitions(readFile = readFileSync) {
  const policies = JSON.parse(
    readFile(join(root, 'infra/monitoring/wp-b4-alert-policies.json'), 'utf8')
  );
  const notification = JSON.parse(
    readFile(join(root, 'infra/monitoring/notification-path.json'), 'utf8')
  );
  return { policies, notification };
}

export function evaluateWpB4Definitions({ policies, notification }) {
  const issues = [];
  if (policies?.status !== 'IMPLEMENTED_NOT_DEPLOYED') {
    issues.push('WP-B4 policy catalog must remain IMPLEMENTED_NOT_DEPLOYED.');
  }
  if (notification?.proven === true) {
    issues.push(
      'notification-path.json must not claim proven delivery in git.'
    );
  }
  if (notification?.status !== HUMAN_NOTIFICATION_PATH.status) {
    issues.push(
      `notification path status must be ${HUMAN_NOTIFICATION_PATH.status}.`
    );
  }
  const encoded = JSON.stringify({ policies, notification });
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(encoded)) {
    issues.push('WP-B4 definitions must not contain email addresses.');
  }
  const immediate = Array.isArray(policies?.immediate)
    ? policies.immediate
    : [];
  const ids = immediate.map((item) => item.id);
  const expected = WP_B4_IMMEDIATE_ALERTS.map((item) => item.id);
  if (JSON.stringify(ids) !== JSON.stringify(expected)) {
    issues.push(
      `WP-B4 JSON ids drifted from domain catalog: ${ids.join(',')} vs ${expected.join(',')}`
    );
  }
  const byId = new Map(immediate.map((item) => [item.id, item]));
  const expectedThreshold = {
    api_outage_or_5xx_burst: HTTP_5XX_ALERT_THRESHOLD,
    durable_booking_write_failure: BOOKING_WRITE_FAILURE_ALERT_THRESHOLD,
    persistent_firestore_transaction_failure:
      BOOKING_WRITE_FAILURE_ALERT_THRESHOLD,
    backup_failure: 1,
    outbox_dead_letter: 1,
    excessive_outbox_age: OUTBOX_AGE_ALERT_SECONDS,
    iam_setiampolicy: 1,
    auth_failure_spike: AUTH_SPIKE_ALERT_THRESHOLD,
    authz_denial_spike: AUTHZ_SPIKE_ALERT_THRESHOLD
  };
  for (const [id, threshold] of Object.entries(expectedThreshold)) {
    if (byId.get(id)?.threshold !== threshold) {
      issues.push(`WP-B4 ${id} threshold must be ${threshold}.`);
    }
  }
  if (
    JSON.stringify(notification?.path) !==
    JSON.stringify(['alert_policy', 'notification_channel', 'human_email'])
  ) {
    issues.push('WP-B4 human path must be alert → channel → human email.');
  }
  if (
    JSON.stringify(policies?.recovery) !==
    JSON.stringify({
      evaluationMissingData: 'EVALUATION_MISSING_DATA_INACTIVE',
      autoClose: '1800s',
      notificationPrompts: ['OPENED', 'CLOSED']
    })
  ) {
    issues.push(
      'WP-B4 recovery must close on missing data within 30 minutes and notify on open/close.'
    );
  }
  return { ok: issues.length === 0, issues };
}

export function inspectWpB4TerraformSource(readFile = readFileSync) {
  const terraform = readFile(
    join(root, 'infra/terraform/wp-b4-alerting/main.tf'),
    'utf8'
  );
  const issues = [];
  for (const needle of [
    'c1-application-alerts',
    'type         = "email"',
    'wp-b4-http-5xx',
    'wp-b4-booking-write-failure',
    'wp-b4-booking-transaction-failure',
    'wp-b4-backup-failure',
    'wp-b4-outbox-dead-letter',
    'wp-b4-auth-failure',
    'wp-b4-authz-denial',
    'wp-b4-outbox-oldest-age',
    'value_type  = "DISTRIBUTION"',
    'ALIGN_PERCENTILE_99',
    'EXTRACT(jsonPayload.oldestPendingAgeSeconds)',
    'c1-iam-setiampolicy',
    'resource "google_monitoring_alert_policy" "iam_setiampolicy_application"'
  ]) {
    if (!terraform.includes(needle)) {
      issues.push(`WP-B4 terraform source missing ${needle}.`);
    }
  }
  for (const [pattern, label] of [
    [/duration\s*=\s*"60s"/, '60-second outbox duration'],
    [/threshold_value\s*=\s*59/, '59-second outbox threshold']
  ]) {
    if (!pattern.test(terraform)) {
      issues.push(`WP-B4 terraform source missing ${label}.`);
    }
  }
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(terraform)) {
    issues.push('WP-B4 terraform must not contain email addresses.');
  }
  if (terraform.includes('resource.type=\\"global\\"')) {
    issues.push(
      'WP-B4 alert conditions must not require resource.type="global"; Cloud Run log metrics are cloud_run_revision.'
    );
  }
  const conditionFilters = [
    ...terraform.matchAll(/^\s*filter\s*=\s*"(metric\.type=.*)"$/gm)
  ].map((match) => match[1]);
  if (
    conditionFilters.length !== 3 ||
    conditionFilters.some((filter) => !filter.includes(' AND resource.type='))
  ) {
    issues.push(
      'Every WP-B4 alert condition must restrict resource.type; the Monitoring API rejects filters without one.'
    );
  }
  for (const [needle, expectedCount] of [
    ['evaluation_missing_data = "EVALUATION_MISSING_DATA_INACTIVE"', 3],
    ['auto_close           = "1800s"', 3],
    ['notification_prompts = ["OPENED", "CLOSED"]', 3]
  ]) {
    const count = terraform.split(needle).length - 1;
    if (count !== expectedCount) {
      issues.push(
        `WP-B4 terraform must contain ${expectedCount} occurrences of ${needle}; found ${count}.`
      );
    }
  }
  return { ok: issues.length === 0, issues };
}

export function inspectWpB4AlertDefinitions(readFile = readFileSync) {
  const json = evaluateWpB4Definitions(loadWpB4Definitions(readFile));
  const terraform = inspectWpB4TerraformSource(readFile);
  return {
    ok: json.ok && terraform.ok,
    issues: [...json.issues, ...terraform.issues]
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = inspectWpB4AlertDefinitions();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}
