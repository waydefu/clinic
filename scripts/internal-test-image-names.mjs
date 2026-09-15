import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { isIsolatedC1ProjectId } from './isolated-c1-project-id.mjs';
import {
  FORBIDDEN_STAGING_PROJECT,
  INTERNAL_TEST_API_IMAGE_NAME,
  INTERNAL_TEST_API_SERVICE,
  INTERNAL_TEST_AR_REPOSITORY,
  INTERNAL_TEST_WORKER_IMAGE_NAME,
  INTERNAL_TEST_WORKER_SERVICE,
  ISOLATED_C1_REGION,
  digestPinnedImageReference,
  evaluateExactShaAlignment,
  evaluateImageReference,
  internalTestImageRepositoryPath,
  shaBoundImageTag
} from './internal-test-c1-identity.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const SHA_PATTERN = /^[a-f0-9]{40}$/;

export function assertInternalTestImageBuildPacket(packet) {
  const sourceSha = String(packet?.sourceSha ?? '').trim();
  const projectId = String(packet?.projectId ?? '').trim();
  const tag = String(packet?.tag ?? '').trim();
  if (!SHA_PATTERN.test(sourceSha)) {
    throw new Error('C1 image build requires the 40-character source SHA.');
  }
  if (projectId === FORBIDDEN_STAGING_PROJECT) {
    throw new Error('C1 image build refuses beauessence-clinic-staging.');
  }
  if (!isIsolatedC1ProjectId(projectId)) {
    throw new Error('C1 image build requires an isolated C1 project id.');
  }
  if (tag === 'latest') {
    throw new Error(
      'C1 image tag must equal the 40-character source SHA; latest is refused.'
    );
  }
  if (tag !== '' && tag !== 'unset' && tag !== sourceSha) {
    throw new Error(
      'C1 image tag must equal the 40-character source SHA; latest is refused.'
    );
  }
  return { sourceSha, projectId, tag: sourceSha };
}

export function planInternalTestImageBuild(packet) {
  const authorized = assertInternalTestImageBuildPacket(packet);
  const apiRepo = internalTestImageRepositoryPath(
    authorized.projectId,
    INTERNAL_TEST_API_IMAGE_NAME
  );
  const workerRepo = internalTestImageRepositoryPath(
    authorized.projectId,
    INTERNAL_TEST_WORKER_IMAGE_NAME
  );
  const tag = shaBoundImageTag(authorized.sourceSha);
  return {
    execute: false,
    projectId: authorized.projectId,
    region: ISOLATED_C1_REGION,
    repository: INTERNAL_TEST_AR_REPOSITORY,
    sourceSha: authorized.sourceSha,
    apiServiceId: INTERNAL_TEST_API_SERVICE,
    workerServiceId: INTERNAL_TEST_WORKER_SERVICE,
    apiTag: `${apiRepo}:${tag}`,
    workerTag: `${workerRepo}:${tag}`,
    config: 'containers/internal-test.cloudbuild.yaml',
    dockerfile: {
      api: 'containers/api.Dockerfile',
      worker: 'containers/internal-test-outbox.Dockerfile'
    },
    buildCommand: [
      'gcloud',
      'builds',
      'submit',
      `--project=${authorized.projectId}`,
      `--region=${ISOLATED_C1_REGION}`,
      `--config=containers/internal-test.cloudbuild.yaml`,
      `--substitutions=_SOURCE_SHA=${authorized.sourceSha}`
    ].join(' '),
    note: 'Deploy must pin the image digest, not this tag alone. Artifact Registry API enablement stays in the future apply packet.'
  };
}

export function pinInternalTestImageDigest(packet) {
  const authorized = assertInternalTestImageBuildPacket(packet);
  return {
    api: digestPinnedImageReference({
      projectId: authorized.projectId,
      imageName: INTERNAL_TEST_API_IMAGE_NAME,
      digest: packet.apiDigest
    }),
    worker: digestPinnedImageReference({
      projectId: authorized.projectId,
      imageName: INTERNAL_TEST_WORKER_IMAGE_NAME,
      digest: packet.workerDigest
    })
  };
}

export function inspectInternalTestImageSource(repoRoot = root) {
  const cloudbuild = readFileSync(
    join(repoRoot, 'containers/internal-test.cloudbuild.yaml'),
    'utf8'
  );
  const calPilot = readFileSync(
    join(repoRoot, 'containers/cal-pilot.cloudbuild.yaml'),
    'utf8'
  );
  const issues = [];
  if (!cloudbuild.includes('/internal-test/api:${_SOURCE_SHA}')) {
    issues.push('C1 cloudbuild must tag internal-test/api with _SOURCE_SHA.');
  }
  if (!cloudbuild.includes('/internal-test/worker:${_SOURCE_SHA}')) {
    issues.push(
      'C1 cloudbuild must tag internal-test/worker with _SOURCE_SHA.'
    );
  }
  if (cloudbuild.includes(':latest') || cloudbuild.includes('cal-pilot')) {
    issues.push('C1 cloudbuild must not use latest or cal-pilot image names.');
  }
  if (calPilot.includes('internal-test')) {
    issues.push(
      'CAL-PILOT cloudbuild must stay on the staging cal-pilot path.'
    );
  }
  return { ok: issues.length === 0, issues };
}

export function evaluateStageFImageGuard({
  originMainSha,
  authoritySha,
  buildSourceSha,
  imageSourceSha,
  apiImage,
  workerImage
}) {
  const sha = evaluateExactShaAlignment({
    originMainSha,
    authoritySha,
    buildSourceSha,
    imageSourceSha
  });
  const api = evaluateImageReference(apiImage);
  const worker = evaluateImageReference(workerImage);
  const issues = [...sha.issues, ...api.issues, ...worker.issues];
  return {
    ok: issues.length === 0,
    status: issues.length === 0 ? 'ALIGNED' : 'AUTHORITY_INVALIDATED',
    issues
  };
}

function isDirectRun() {
  const invoked = process.argv[1];
  if (typeof invoked !== 'string' || invoked === '') return false;
  return import.meta.url === pathToFileURL(invoked).href;
}

if (isDirectRun()) {
  const report = inspectInternalTestImageSource();
  process.stdout.write(
    `${JSON.stringify({ execute: false, ...report }, null, 2)}\n`
  );
  process.exit(report.ok ? 0 : 1);
}
