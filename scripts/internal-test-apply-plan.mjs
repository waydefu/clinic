import { pathToFileURL } from 'node:url';

import {
  FORBIDDEN_STAGING_PROJECT,
  isIsolatedC1ProjectId,
  isolatedC1ProjectIdError
} from './isolated-c1-project-id.mjs';

export const C5_APPLY_DIRECTORY = 'infra/terraform/c5-firestore';
export const C1_APPLY_DIRECTORY = 'infra/terraform/c1-foundation';
export const APPLY_TARGETS = Object.freeze(['c5', 'c1-iam']);

const ROLLBACK_REMINDER =
  'Do not destroy this stack and do not re-apply with exact_apply_authority_sha=not_granted; that count-gates existing isolated C1 resources to zero. Delete only the new schedule or alert policy if a named rollback packet says so.';

function assertInternalTestApplyPacket(packet, headSha, context) {
  const sha = String(packet?.sha ?? '').trim();
  const projectId = String(packet?.projectId ?? '').trim();
  const operator = String(packet?.operator ?? '').trim();
  const approver = String(packet?.approver ?? '').trim();
  const expectedSha = String(headSha ?? '').trim();

  if (expectedSha === '' || !/^[a-f0-9]{40}$/.test(expectedSha)) {
    throw new Error(`${context} plan requires the current 40-char HEAD SHA.`);
  }
  if (sha !== expectedSha) {
    throw new Error(
      `${context} packet SHA is not this HEAD; earlier packets are not reusable.`
    );
  }
  if (projectId === FORBIDDEN_STAGING_PROJECT) {
    throw new Error(isolatedC1ProjectIdError(projectId, context));
  }
  if (!isIsolatedC1ProjectId(projectId)) {
    throw new Error(isolatedC1ProjectIdError(projectId, context));
  }
  if (operator === '' || approver === '') {
    throw new Error(
      `${context} packet must name operator and approver. This plan is not that packet.`
    );
  }
  return { sha, projectId, operator, approver };
}

function terraformApplyCommand(directory, authorized) {
  return [
    'terraform',
    `-chdir=${directory}`,
    'apply',
    `-var=exact_apply_authority_sha=${authorized.sha}`,
    `-var=project_id=${authorized.projectId}`,
    '-var=region=asia-east1'
  ].join(' ');
}

export function planInternalTestC5Apply(packet, headSha) {
  const authorized = assertInternalTestApplyPacket(
    packet,
    headSha,
    'internal-test C5 apply'
  );
  return {
    execute: false,
    target: 'c5',
    workingDirectory: C5_APPLY_DIRECTORY,
    projectId: authorized.projectId,
    sha: authorized.sha,
    applyCommand: terraformApplyCommand(C5_APPLY_DIRECTORY, authorized),
    inspectCommand:
      'pnpm inspect:internal-test-backup -- inspect <snapshot.json>',
    rollbackReminder: ROLLBACK_REMINDER,
    packetReminder:
      'This plan is not the C5 apply packet. Applying still needs a fresh exact-SHA packet for this HEAD, isolated project beauessence-clinic-stg-c1a01, operator, and named approver. Live (default) already exists; the SHA-gated daily schedule is the missing resource.'
  };
}

export function planInternalTestC1IamApply(packet, headSha) {
  const authorized = assertInternalTestApplyPacket(
    packet,
    headSha,
    'internal-test C1 IAM apply'
  );
  return {
    execute: false,
    target: 'c1-iam',
    workingDirectory: C1_APPLY_DIRECTORY,
    projectId: authorized.projectId,
    sha: authorized.sha,
    applyCommand: terraformApplyCommand(C1_APPLY_DIRECTORY, authorized),
    inspectCommand:
      'pnpm inspect:internal-test-monitoring -- inspect <snapshot.json>',
    rollbackReminder: ROLLBACK_REMINDER,
    packetReminder:
      'This plan is not the C1 IAM apply packet. Applying still needs a fresh exact-SHA packet for this HEAD, isolated project beauessence-clinic-stg-c1a01, operator, and named approver. Notify the existing budget Pub/Sub channel only; do not add email recipients.'
  };
}

export function packetFromEnv(env = process.env) {
  return {
    sha: env['INTERNAL_TEST_APPLY_SHA'],
    projectId: env['INTERNAL_TEST_APPLY_PROJECT'],
    operator: env['INTERNAL_TEST_APPLY_OPERATOR'],
    approver: env['INTERNAL_TEST_APPLY_APPROVER']
  };
}

export const PLAN_USAGE =
  'Usage: set INTERNAL_TEST_APPLY_{SHA,PROJECT,OPERATOR,APPROVER} then pnpm plan:internal-test-apply -- <c5|c1-iam> <40-char-HEAD-sha>\nPrints execute:false terraform apply for the SHA-gated C5 daily backup schedule or C1 IAM SetIamPolicy alert. Does not apply, destroy, or invent email recipients. Live staging/production are refused.\n';

export function runInternalTestApplyPlanCli({ argv, env, stdout, stderr }) {
  const args = argv.filter((argument) => argument !== '--');
  const target = args.find((argument) => APPLY_TARGETS.includes(argument));
  const headSha = args.find((argument) => /^[a-f0-9]{40}$/.test(argument));
  if (target === undefined || headSha === undefined) {
    stderr.write(PLAN_USAGE);
    return 2;
  }
  try {
    const packet = packetFromEnv(env);
    const plan =
      target === 'c5'
        ? planInternalTestC5Apply(packet, headSha)
        : planInternalTestC1IamApply(packet, headSha);
    stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stderr.write(`${message}\n`);
    return 2;
  }
}

function isDirectRun() {
  const invoked = process.argv[1];
  if (typeof invoked !== 'string' || invoked === '') return false;
  return import.meta.url === pathToFileURL(invoked).href;
}

if (isDirectRun()) {
  process.exitCode = runInternalTestApplyPlanCli({
    argv: process.argv.slice(2),
    env: process.env,
    stdout: process.stdout,
    stderr: process.stderr
  });
}
