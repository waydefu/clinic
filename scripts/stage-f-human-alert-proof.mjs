import { pathToFileURL } from 'node:url';

import { OUTBOX_AGE_ALERT_SECONDS } from '@beauessence/domain';

import { FORBIDDEN_STAGING_PROJECT } from './isolated-c1-project-id.mjs';
import { ISOLATED_C1_PROJECT_ID } from './internal-test-c1-identity.mjs';
import { inspectWpB4AlertDefinitions } from './wp-b4-alert-definitions.mjs';

export function stageFSyntheticOutboxAgeLog() {
  return {
    service: 'internal-test-outbox-worker',
    pending: 1,
    inProgress: 0,
    deadLettered: 0,
    oldestPendingAgeSeconds: OUTBOX_AGE_ALERT_SECONDS,
    retryState: 'none'
  };
}

export function planStageFHumanAlertProof(options = {}) {
  if (options.execute === true) {
    throw new Error(
      'Stage F human-alert proof refuses execute; CLOUD_MUTATION = NONE. Do not send mail.'
    );
  }
  const projectId = String(options.projectId ?? ISOLATED_C1_PROJECT_ID);
  if (projectId === FORBIDDEN_STAGING_PROJECT) {
    throw new Error(
      'Stage F human-alert proof refuses beauessence-clinic-staging.'
    );
  }
  if (projectId !== ISOLATED_C1_PROJECT_ID) {
    throw new Error(
      'Stage F human-alert proof requires isolated C1 project beauessence-clinic-stg-c1a01.'
    );
  }
  const definitions = inspectWpB4AlertDefinitions();
  const logLine = stageFSyntheticOutboxAgeLog();
  return {
    execute: false,
    cloudMutation: 'NONE',
    projectId,
    humanNotificationProven: false,
    humanNotificationPath: 'IMPLEMENTED_NOT_DEPLOYED',
    definitionsOk: definitions.ok,
    definitionIssues: definitions.issues,
    reversible: true,
    contaminatesProduction: false,
    bookingImpact: 'none',
    pii: 'none',
    trigger: {
      kind: 'structured_worker_log',
      filter: 'jsonPayload.oldestPendingAgeSeconds>=0',
      condition:
        'DISTRIBUTION EXTRACT oldestPendingAgeSeconds, ALIGN_PERCENTILE_99 > 59 for 60s',
      logLine
    },
    futureApplyOnly: [
      'Emit the logLine once from isolated internal-test-outbox after a fresh exact-SHA packet.',
      'Confirm the WP-B4 outbox-age policy condition becomes true.',
      'Keep the email channel unproven until an explicit inbox-proof packet.',
      'Do not claim HUMAN_NOTIFICATION_PROVEN in this source round.'
    ],
    rollback:
      'Stop emitting the synthetic log. Do not destroy C1 budget Pub/Sub. Targeted rollback of WP-B4 application policies only.'
  };
}

function isDirectRun() {
  const invoked = process.argv[1];
  if (typeof invoked !== 'string' || invoked === '') return false;
  return import.meta.url === pathToFileURL(invoked).href;
}

if (isDirectRun()) {
  const execute = process.argv.includes('--execute');
  const plan = planStageFHumanAlertProof({
    execute,
    projectId: process.env['GOOGLE_CLOUD_PROJECT'] ?? ISOLATED_C1_PROJECT_ID
  });
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  process.exit(
    plan.definitionsOk && plan.humanNotificationProven === false ? 0 : 1
  );
}
