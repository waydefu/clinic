import { pathToFileURL } from 'node:url';

import {
  FORBIDDEN_STAGING_PROJECT,
  isIsolatedC1ProjectId,
  isolatedC1ProjectIdError
} from './isolated-c1-project-id.mjs';

export const ISOLATED_PREVIEW_CONFIG = 'firebase.isolated-preview.json';
const CHANNEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function assertInternalTestPreviewPacket(packet, headSha) {
  const sha = String(packet?.sha ?? '').trim();
  const projectId = String(packet?.projectId ?? '').trim();
  const channel = String(packet?.channel ?? '').trim();
  const expires = String(packet?.expires ?? '').trim();
  const operator = String(packet?.operator ?? '').trim();
  const approver = String(packet?.approver ?? '').trim();
  const expectedSha = String(headSha ?? '').trim();

  if (expectedSha === '' || !/^[a-f0-9]{40}$/.test(expectedSha)) {
    throw new Error(
      'internal-test preview plan requires the current 40-char HEAD SHA.'
    );
  }
  if (sha !== expectedSha) {
    throw new Error(
      'internal-test preview packet SHA is not this HEAD; earlier packets are not reusable.'
    );
  }
  if (projectId === FORBIDDEN_STAGING_PROJECT) {
    throw new Error(
      'internal-test preview refuses beauessence-clinic-staging; earlier synthetic-review packets are not reusable.'
    );
  }
  if (!isIsolatedC1ProjectId(projectId)) {
    throw new Error(
      isolatedC1ProjectIdError(projectId, 'internal-test preview')
    );
  }
  if (channel === 'live') {
    throw new Error(
      'internal-test preview refuses the live Hosting channel; Safety Floor 8.'
    );
  }
  if (!CHANNEL_PATTERN.test(channel)) {
    throw new Error(
      'internal-test preview requires a preview channel id `[a-z0-9-]+`, not live.'
    );
  }
  if (expires === '' || operator === '' || approver === '') {
    throw new Error(
      'internal-test preview packet must name expiry, operator, and approver.'
    );
  }
  return { sha, projectId, channel, expires, operator, approver };
}

export function planInternalTestPreviewDeploy(packet, headSha) {
  const authorized = assertInternalTestPreviewPacket(packet, headSha);
  const previewUrl = `https://${authorized.projectId}--${authorized.channel}.web.app/`;
  return {
    execute: false,
    config: ISOLATED_PREVIEW_CONFIG,
    previewUrl,
    deployCommand: [
      'firebase',
      'hosting:channel:deploy',
      authorized.channel,
      `--expires=${authorized.expires}`,
      `--project=${authorized.projectId}`,
      `--config=${ISOLATED_PREVIEW_CONFIG}`
    ].join(' '),
    smokeCommand: `pnpm smoke:internal-test-booking -- ${previewUrl}`,
    rollbackCommand: [
      'firebase',
      'hosting:channel:delete',
      authorized.channel,
      '--force',
      `--project=${authorized.projectId}`,
      `--config=${ISOLATED_PREVIEW_CONFIG}`
    ].join(' ')
  };
}

export function packetFromEnv(env = process.env) {
  return {
    sha: env['INTERNAL_TEST_PREVIEW_SHA'],
    projectId: env['INTERNAL_TEST_PREVIEW_PROJECT'],
    channel: env['INTERNAL_TEST_PREVIEW_CHANNEL'],
    expires: env['INTERNAL_TEST_PREVIEW_EXPIRES'],
    operator: env['INTERNAL_TEST_PREVIEW_OPERATOR'],
    approver: env['INTERNAL_TEST_PREVIEW_APPROVER']
  };
}

export const PLAN_USAGE =
  'Usage: set INTERNAL_TEST_PREVIEW_{SHA,PROJECT,CHANNEL,EXPIRES,OPERATOR,APPROVER} then pnpm plan:internal-test-preview -- <40-char-HEAD-sha>\nPrints execute:false deploy, smoke, and preview-channel rollback. Does not deploy or delete. Live channel and beauessence-clinic-staging are refused.\n';

export function runInternalTestPreviewPlanCli({ argv, env, stdout, stderr }) {
  const args = argv.filter((argument) => argument !== '--');
  const headSha = args.find((argument) => /^[a-f0-9]{40}$/.test(argument));
  if (headSha === undefined) {
    stderr.write(PLAN_USAGE);
    return 2;
  }
  try {
    const plan = planInternalTestPreviewDeploy(packetFromEnv(env), headSha);
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
  process.exitCode = runInternalTestPreviewPlanCli({
    argv: process.argv.slice(2),
    env: process.env,
    stdout: process.stdout,
    stderr: process.stderr
  });
}
