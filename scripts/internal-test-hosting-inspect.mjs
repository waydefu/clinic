import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import {
  FORBIDDEN_STAGING_PROJECT,
  isIsolatedC1ProjectId,
  isolatedC1ProjectIdError
} from './isolated-c1-project-id.mjs';
import { isolatedProjectIdFromPreviewHost } from './internal-test-booking-smoke.mjs';
import { ISOLATED_PREVIEW_CONFIG } from './internal-test-preview-plan.mjs';

export { ISOLATED_PREVIEW_CONFIG };

function assertIsolatedC1Project(projectId, context) {
  if (projectId === FORBIDDEN_STAGING_PROJECT) {
    throw new Error(isolatedC1ProjectIdError(projectId, context));
  }
  if (!isIsolatedC1ProjectId(projectId)) {
    throw new Error(isolatedC1ProjectIdError(projectId, context));
  }
}

export function internalTestHostingCollectCommands(projectId) {
  assertIsolatedC1Project(projectId, 'internal-test Hosting inspect');
  return [
    `firebase hosting:channel:list --project=${projectId} --json --config=${ISOLATED_PREVIEW_CONFIG}`
  ];
}

function channelsFromSnapshot(snapshot) {
  const value = snapshot?.channels ?? snapshot?.result?.channels;
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.channels)) return value.channels;
  return [];
}

export function hostingChannelId(channel) {
  const raw = String(channel?.id ?? channel?.name ?? '').trim();
  if (raw === '') return '';
  const parts = raw.split('/');
  return parts[parts.length - 1] ?? '';
}

export function isLiveHostingChannel(channel) {
  return hostingChannelId(channel) === 'live';
}

function expireTimeOf(channel) {
  const value = channel?.expireTime ?? channel?.expire_time;
  return typeof value === 'string' ? value.trim() : '';
}

function urlOf(channel) {
  const value = channel?.url ?? channel?.urlOverride ?? channel?.hostedUrl;
  return typeof value === 'string' ? value.trim() : '';
}

export function assembleInternalTestHostingEvidence(
  snapshot,
  nowMs = Date.now()
) {
  const projectId = String(snapshot?.projectId ?? '').trim();
  const channels = channelsFromSnapshot(snapshot);
  const live = channels.filter(isLiveHostingChannel);
  const previews = channels.filter((channel) => !isLiveHostingChannel(channel));
  const usable = [];
  for (const channel of previews) {
    const id = hostingChannelId(channel);
    const expireTime = expireTimeOf(channel);
    const url = urlOf(channel);
    let hostname;
    try {
      hostname = new URL(url).hostname;
    } catch {
      hostname = '';
    }
    const expireMs = Date.parse(expireTime);
    const expired =
      expireTime === '' || Number.isNaN(expireMs) || expireMs <= nowMs;
    const urlProjectId = isolatedProjectIdFromPreviewHost(hostname);
    usable.push({
      channelId: id,
      url,
      expireTime: expireTime === '' ? null : expireTime,
      expired,
      urlMatchesIsolatedPreview: urlProjectId === projectId
    });
  }
  const passing = usable.filter(
    (channel) => channel.expired === false && channel.urlMatchesIsolatedPreview
  );
  return {
    projectId,
    channelCount: channels.length,
    liveChannelCount: live.length,
    previewChannelCount: previews.length,
    usablePreviewCount: passing.length,
    previewChannelId: passing[0]?.channelId ?? null,
    previewUrl: passing[0]?.url ?? null,
    previewExpireTime: passing[0]?.expireTime ?? null
  };
}

export function evaluateInternalTestHosting(evidence) {
  if (!evidence || typeof evidence !== 'object') {
    return {
      ok: false,
      issues: ['internal-test Hosting evidence must be a JSON object']
    };
  }
  const issues = [];
  const projectId = evidence.projectId;
  if (projectId === FORBIDDEN_STAGING_PROJECT) {
    issues.push(
      isolatedC1ProjectIdError(projectId, 'internal-test Hosting inspect')
    );
  } else if (!isIsolatedC1ProjectId(projectId)) {
    issues.push(
      isolatedC1ProjectIdError(projectId, 'internal-test Hosting inspect')
    );
  } else if (evidence.usablePreviewCount < 1) {
    issues.push(
      'internal-test Hosting requires a named preview channel (not live) with a future expiry on `{project}--{channel}.web.app`; Safety Floor 8 packet. Isolated C1 live-only Hosting is not this inspect pass.'
    );
  }
  return { ok: issues.length === 0, issues };
}

export const INSPECT_USAGE =
  'Usage: pnpm inspect:internal-test-hosting -- inspect <snapshot.json>\nDoes not deploy, delete, or mutate Hosting. Live channel, staging, and production are refused as the smoke target.\n';

export function runInternalTestHostingCli({ argv, stdout, stderr, readFile }) {
  const reader = readFile ?? ((path) => readFileSync(path, 'utf8'));
  const args = argv.filter((argument) => argument !== '--');
  const [mode, operand] = args;
  if (mode !== 'inspect') {
    stderr.write(INSPECT_USAGE);
    return 2;
  }
  if (typeof operand !== 'string' || operand === '') {
    stderr.write(INSPECT_USAGE);
    return 2;
  }
  try {
    const snapshot = JSON.parse(reader(operand));
    const evidence = assembleInternalTestHostingEvidence(snapshot);
    const result = evaluateInternalTestHosting(evidence);
    stdout.write(
      `${JSON.stringify({ execute: false, evidence, result }, null, 2)}\n`
    );
    return result.ok ? 0 : 1;
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
  process.exitCode = runInternalTestHostingCli({
    argv: process.argv.slice(2),
    stdout: process.stdout,
    stderr: process.stderr
  });
}
