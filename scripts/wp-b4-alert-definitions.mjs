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
  return { ok: issues.length === 0, issues };
}

export function inspectWpB4AlertDefinitions(readFile = readFileSync) {
  return evaluateWpB4Definitions(loadWpB4Definitions(readFile));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = inspectWpB4AlertDefinitions();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}
