import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { evaluateC1ConfigContract } from './c1-config-contract.mjs';
import { planFirestoreIndexDeploy } from './firestore-index-plan.mjs';
import {
  evaluateExactShaAlignment,
  INTERNAL_TEST_API_SERVICE,
  INTERNAL_TEST_WORKER_SERVICE,
  ISOLATED_API_PREVIEW_CONFIG,
  ISOLATED_C1_PROJECT_ID,
  ISOLATED_C1_REGION,
  ISOLATED_PREVIEW_CONFIG
} from './internal-test-c1-identity.mjs';
import { inspectInternalTestImageSource } from './internal-test-image-names.mjs';
import { planInternalTestApiPreviewDeploy } from './internal-test-preview-plan.mjs';
import { inspectWpB4AlertDefinitions } from './wp-b4-alert-definitions.mjs';
import { evaluateAllStageFTerraform } from './terraform-sha-gate.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function closed(ok) {
  return ok ? 'CLOSED' : 'PARTIAL';
}

export function inspectE1HostingSource(repoRoot = root) {
  const issues = [];
  const api = JSON.parse(
    readFileSync(join(repoRoot, ISOLATED_API_PREVIEW_CONFIG), 'utf8')
  );
  const staticRollback = JSON.parse(
    readFileSync(join(repoRoot, ISOLATED_PREVIEW_CONFIG), 'utf8')
  );
  const live = JSON.parse(
    readFileSync(join(repoRoot, 'firebase.json'), 'utf8')
  );
  const apiRewrites = api?.hosting?.rewrites ?? [];
  const runRule = apiRewrites.find((rule) => rule?.run);
  if (
    apiRewrites[0] !== runRule ||
    runRule?.source !== '/v1/**' ||
    runRule?.run?.serviceId !== INTERNAL_TEST_API_SERVICE ||
    runRule?.run?.region !== ISOLATED_C1_REGION ||
    runRule?.run?.pinTag !== true
  ) {
    issues.push(
      'E1: firebase.isolated-api-preview.json must rewrite /v1/** to internal-test-api in asia-east1 with pinTag.'
    );
  }
  const encodedApi = JSON.stringify(api);
  if (encodedApi.includes('cal-pilot-api')) {
    issues.push('E1: isolated API Hosting must not target cal-pilot-api.');
  }
  if (encodedApi.includes('beauessence-clinic-staging')) {
    issues.push(
      'E1: isolated API Hosting must not trust beauessence-clinic-staging.'
    );
  }
  if ((staticRollback?.hosting?.rewrites ?? []).some((rule) => rule?.run)) {
    issues.push(
      'E1: firebase.isolated-preview.json must remain the Cloud Run-free static rollback.'
    );
  }
  const liveRun = (live?.hosting?.rewrites ?? []).find((rule) => rule?.run);
  if (liveRun?.run?.serviceId !== 'cal-pilot-api') {
    issues.push(
      'E1: firebase.json live/staging Hosting must keep the cal-pilot-api rewrite; do not retarget live to C1.'
    );
  }
  return { ok: issues.length === 0, issues };
}

export function inspectE4WorkerSource(repoRoot = root) {
  const issues = [];
  const main = readFileSync(
    join(repoRoot, 'apps/worker/src/internal-test-outbox-main.ts'),
    'utf8'
  );
  const runtime = readFileSync(
    join(repoRoot, 'apps/worker/src/internal-test-outbox-runtime.ts'),
    'utf8'
  );
  const terraform = readFileSync(
    join(repoRoot, 'infra/terraform/c1-internal-test-run/main.tf'),
    'utf8'
  );
  const calendar = readFileSync(
    join(repoRoot, 'apps/worker/src/google-calendar.ts'),
    'utf8'
  );
  if (runtime.includes("from './google-calendar")) {
    issues.push(
      'E4: internal-test-outbox-runtime.ts must keep Calendar injectable and must not import google-calendar.'
    );
  }
  if (!main.includes('createCalendarPort')) {
    issues.push(
      'E4: internal-test-outbox-main.ts must create the cloud Calendar port only on the cloud execution path.'
    );
  }
  if (
    /CalendarWatch|events\.watch/.test(main) ||
    /CalendarWatch|events\.watch/.test(runtime)
  ) {
    issues.push(
      'E4: Stage F worker must not enable CalendarWatchController or events.watch.'
    );
  }
  if (!main.includes('processing_disabled') || !main.includes("'/ready'")) {
    issues.push(
      'E4: worker HTTP surface must expose /ready and refuse drain with processing_disabled.'
    );
  }
  if (!main.includes('calendar_unavailable')) {
    issues.push(
      'E4: worker /ready must fail closed when Calendar access/config is unavailable.'
    );
  }
  if (
    !runtime.includes('INTERNAL_TEST_OUTBOX_EXECUTION') ||
    !runtime.includes('GOOGLE_CALENDAR_INTEGRATION_MODE') ||
    !runtime.includes('CLOUD_ADC') ||
    !runtime.includes('production')
  ) {
    issues.push(
      'E4: cloud boot must require isolated C1 identity, CLOUD_ADC, test Calendar mode, and refuse production.'
    );
  }
  if (
    !terraform.includes('GOOGLE_CALENDAR_AUTH') ||
    !terraform.includes('CLOUD_ADC') ||
    terraform.includes(
      'GOOGLE_SERVICE_ACCOUNT_JSON = "c1-calendar-service-account-json"'
    )
  ) {
    issues.push(
      'E4: worker Cloud Run must set GOOGLE_CALENDAR_AUTH=CLOUD_ADC and must not mount a user-managed key JSON.'
    );
  }
  if (
    !calendar.includes('createCloudAdcTokenProvider') ||
    !calendar.includes('METADATA_TOKEN_URL') ||
    !calendar.includes('GOOGLE_APPLICATION_CREDENTIALS')
  ) {
    issues.push(
      'E4: google-calendar.ts must implement keyless Cloud ADC and refuse GOOGLE_APPLICATION_CREDENTIALS.'
    );
  }
  return { ok: issues.length === 0, issues };
}

export function inspectStageFSourceGaps(repoRoot = root) {
  const terraform = evaluateAllStageFTerraform(repoRoot);
  const fRun = terraform.results.find((result) => result.slice === 'F-RUN');
  const fWpB4 = terraform.results.find((result) => result.slice === 'F-WP-B4');
  const hosting = inspectE1HostingSource(repoRoot);
  const worker = inspectE4WorkerSource(repoRoot);
  const images = inspectInternalTestImageSource(repoRoot);
  const indexes = planFirestoreIndexDeploy().evaluation;
  const config = evaluateC1ConfigContract();
  const alerts = inspectWpB4AlertDefinitions();
  const statuses = {
    e1: closed(hosting.ok),
    e2: closed(Boolean(fRun?.ok)),
    e3: closed(images.ok),
    e4: closed(worker.ok),
    e5: closed(Boolean(fWpB4?.ok) && alerts.ok),
    e6: closed(config.ok),
    e7: closed(indexes.ok)
  };
  const issues = [
    ...hosting.issues,
    ...terraform.issues,
    ...images.issues,
    ...worker.issues,
    ...indexes.issues,
    ...config.issues,
    ...alerts.issues
  ];
  return {
    ok:
      issues.length === 0 &&
      Object.values(statuses).every((status) => status === 'CLOSED'),
    issues,
    ...statuses
  };
}

export function planStageFDeploymentGraph({
  packet,
  headSha,
  originMainSha,
  inspect = {}
}) {
  const sha = evaluateExactShaAlignment({
    originMainSha: originMainSha ?? packet?.sha,
    authoritySha: packet?.sha,
    buildSourceSha: packet?.buildSourceSha ?? packet?.sha,
    imageSourceSha: packet?.imageSourceSha ?? packet?.sha
  });
  const hosting = planInternalTestApiPreviewDeploy(packet, headSha, inspect);
  const source = inspectStageFSourceGaps();
  return {
    execute: false,
    cloudMutation: 'NONE',
    stageFApply: 'NOT_STARTED',
    projectId: ISOLATED_C1_PROJECT_ID,
    region: ISOLATED_C1_REGION,
    apiServiceId: INTERNAL_TEST_API_SERVICE,
    workerServiceId: INTERNAL_TEST_WORKER_SERVICE,
    sha,
    source,
    graph: [
      'build immutable API/worker images (SHA tag + digest pin)',
      'Cloud Run plan for internal-test-api',
      'Cloud Run plan for internal-test-outbox',
      'Firestore indexes plan',
      'Hosting rewrite plan (firebase.isolated-api-preview.json)',
      'WP-B4 monitoring plan',
      'config/secret-reference validation',
      'synthetic schedule bootstrap plan (execute: false)',
      'synthetic human-alert proof plan (execute: false)',
      'rollback plan',
      'deployed acceptance plan'
    ],
    hosting,
    rollback: {
      cloudRun:
        'Route traffic to the previous revision and digest; do not destroy.',
      worker:
        'Set INTERNAL_TEST_OUTBOX_PROCESSING_ENABLED=false and keep the scheduler paused.',
      hosting: `Redeploy ${ISOLATED_PREVIEW_CONFIG} or delete the preview channel. Never mutate live.`,
      monitoring:
        'Targeted rollback of WP-B4 application policies only. Do not destroy C1 budget Pub/Sub.',
      indexes:
        'Keep indexes used by the previous revision. Do not blind-delete.',
      secrets:
        'Restore the previous numeric secret version. Never print values.'
    },
    acceptance: {
      apiNotMounted: 'HTTP 404 after intended /v1 rewrite = FAIL',
      gateClosed: 'HTTP 503 = API mounted, booking gate closed',
      config: ISOLATED_API_PREVIEW_CONFIG
    }
  };
}

export function generateStageFAuthorityPacketStatus({
  originMainSha,
  headSha,
  sourceReady
}) {
  const ownerDecision = {
    APPROVE: false,
    REJECT: false
  };
  if (originMainSha !== headSha) {
    return {
      APPLY_ON_THIS_SHA: 'WAITING_FOR_POST_MERGE_SHA',
      CLOUD_MUTATION: 'NONE',
      STAGE_F_APPLY: 'NOT_STARTED',
      OWNER_DECISION: ownerDecision
    };
  }
  if (!sourceReady) {
    return {
      APPLY_ON_THIS_SHA: 'BLOCKED_BY_SOURCE_GAPS',
      CLOUD_MUTATION: 'NONE',
      STAGE_F_APPLY: 'NOT_STARTED',
      OWNER_DECISION: ownerDecision
    };
  }
  return {
    APPLY_ON_THIS_SHA: 'READY',
    CLOUD_MUTATION: 'NONE',
    STAGE_F_APPLY: 'NOT_STARTED',
    OWNER_DECISION: ownerDecision
  };
}

/**
 * Authority packet is an artifact bound to origin/main, not a commit that
 * moves that SHA. Do not write this markdown into docs/ from a feature branch.
 */
export function renderStageFAuthorityPacketMarkdown(status, identity = {}) {
  const sha = identity.authoritySha ?? '<POST_MERGE_ORIGIN_MAIN_40_CHAR_SHA>';
  return [
    '# Stage F exact-SHA authority packet',
    '',
    'Not a deployment. OWNER DECISION stays unchecked until the clinic owner signs.',
    'PACKET_COMMIT_IS_NOT_AUTHORITY_SHA = true',
    '',
    '```text',
    `APPLY_ON_THIS_SHA = ${status.APPLY_ON_THIS_SHA}`,
    `CLOUD_MUTATION = ${status.CLOUD_MUTATION}`,
    `STAGE_F_APPLY = ${status.STAGE_F_APPLY}`,
    `AUTHORITY_SHA = ${sha}`,
    'OWNER DECISION:',
    '[ ] APPROVE',
    '[ ] REJECT',
    '```',
    '',
    'Apply requires origin/main == AUTHORITY_SHA == BUILD_SOURCE_SHA == IMAGE_SOURCE_SHA.',
    'Do not merge this packet onto main if that would move origin/main off AUTHORITY_SHA.',
    'Preferred: keep the packet as a GitHub artifact / unsigned review attached to the engineering merge SHA.',
    ''
  ].join('\n');
}

function isDirectRun() {
  const invoked = process.argv[1];
  if (typeof invoked !== 'string' || invoked === '') return false;
  return import.meta.url === pathToFileURL(invoked).href;
}

if (isDirectRun()) {
  const source = inspectStageFSourceGaps();
  const status = generateStageFAuthorityPacketStatus({
    originMainSha: process.env['INTERNAL_TEST_ORIGIN_MAIN_SHA'] ?? '',
    headSha: process.env['INTERNAL_TEST_HEAD_SHA'] ?? 'feature',
    sourceReady: source.ok
  });
  process.stdout.write(
    `${JSON.stringify(
      {
        execute: false,
        cloudMutation: 'NONE',
        stageFApply: 'NOT_STARTED',
        source,
        authority: status
      },
      null,
      2
    )}\n`
  );
  process.exit(source.ok ? 0 : 1);
}
