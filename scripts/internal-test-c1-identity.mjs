/**
 * Isolated C1 / Stage F identity. Values come from live Canon (C1/C5/WP-B4
 * terraform + Firestore locationId) and the F0 readback. Do not retarget
 * beauessence-clinic-staging or invent a second registry path.
 */

import { FORBIDDEN_STAGING_PROJECT } from './isolated-c1-project-id.mjs';

export { FORBIDDEN_STAGING_PROJECT };
export const ISOLATED_C1_PROJECT_ID = 'beauessence-clinic-stg-c1a01';
export const ISOLATED_C1_REGION = 'asia-east1';
export const ISOLATED_FIRESTORE_DATABASE = '(default)';
export const INTERNAL_TEST_API_SERVICE = 'internal-test-api';
export const INTERNAL_TEST_WORKER_SERVICE = 'internal-test-outbox';
export const INTERNAL_TEST_AR_REPOSITORY = 'internal-test';
export const INTERNAL_TEST_API_IMAGE_NAME = 'api';
export const INTERNAL_TEST_WORKER_IMAGE_NAME = 'worker';
export const ISOLATED_PREVIEW_CONFIG = 'firebase.isolated-preview.json';
export const ISOLATED_API_PREVIEW_CONFIG = 'firebase.isolated-api-preview.json';
export const ISOLATED_PREVIEW_CHANNEL = 'internal-preproduction';
export const ISOLATED_C1_FIREBASE_AUTH_DOMAIN =
  'beauessence-clinic-stg-c1a01--internal-preproduction-3u85hkcz.web.app';
export const ISOLATED_C1_FIREBASE_AUTH_HANDLER = `https://${ISOLATED_C1_FIREBASE_AUTH_DOMAIN}/__/auth/handler`;
export const C1_AUTHORIZED_FIREBASE_AUTH_DOMAINS = Object.freeze([
  ISOLATED_C1_FIREBASE_AUTH_DOMAIN
]);
export const WP_B4_APPLICATION_ALERTS_TOPIC = 'c1-application-alerts';
export const C1_IAM_SETIAMPOLICY_METRIC = 'c1-iam-setiampolicy';

export const ISOLATED_API_REWRITE = Object.freeze({
  source: '/v1/**',
  serviceId: INTERNAL_TEST_API_SERVICE,
  region: ISOLATED_C1_REGION,
  pinTag: true
});

const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;
const SHA_PATTERN = /^[a-f0-9]{40}$/;

export function artifactRegistryHost(region = ISOLATED_C1_REGION) {
  return `${region}-docker.pkg.dev`;
}

export function internalTestImageRepositoryPath(
  projectId,
  imageName,
  region = ISOLATED_C1_REGION
) {
  return `${artifactRegistryHost(region)}/${projectId}/${INTERNAL_TEST_AR_REPOSITORY}/${imageName}`;
}

export function shaBoundImageTag(sourceSha) {
  const sha = String(sourceSha ?? '').trim();
  if (!SHA_PATTERN.test(sha)) {
    throw new Error('image tag requires a 40-character lowercase Git SHA.');
  }
  return sha;
}

export function digestPinnedImageReference({
  projectId,
  imageName,
  digest,
  region = ISOLATED_C1_REGION
}) {
  const pinned = String(digest ?? '').trim();
  if (!DIGEST_PATTERN.test(pinned)) {
    throw new Error(
      'image digest must be sha256: followed by 64 lowercase hex characters.'
    );
  }
  if (
    String(digest).includes('latest') ||
    String(imageName).includes('latest')
  ) {
    throw new Error('mutable latest image references are refused.');
  }
  return `${internalTestImageRepositoryPath(projectId, imageName, region)}@${pinned}`;
}

export function evaluateImageReference(reference) {
  const value = String(reference ?? '').trim();
  const issues = [];
  if (value === '') {
    issues.push('image reference is missing.');
    return { ok: false, issues };
  }
  if (/(^|[:/])latest($|[@:])/.test(value) || value.endsWith(':latest')) {
    issues.push('mutable latest image references are refused.');
  }
  if (
    value.includes(FORBIDDEN_STAGING_PROJECT) ||
    value.includes('/cal-pilot/')
  ) {
    issues.push('C1 images must not use staging cal-pilot Artifact Registry.');
  }
  if (!value.includes('@sha256:')) {
    issues.push('deploy image must pin an immutable sha256 digest.');
  }
  if (!value.includes(`/${INTERNAL_TEST_AR_REPOSITORY}/`)) {
    issues.push(
      `C1 image repository must be ${INTERNAL_TEST_AR_REPOSITORY}, not an invented path.`
    );
  }
  if (!value.startsWith(`${ISOLATED_C1_REGION}-docker.pkg.dev/`)) {
    issues.push(`C1 images must use ${ISOLATED_C1_REGION}-docker.pkg.dev.`);
  }
  return { ok: issues.length === 0, issues };
}

export function evaluateExactShaAlignment({
  originMainSha,
  authoritySha,
  buildSourceSha,
  imageSourceSha
}) {
  const values = {
    originMainSha,
    authoritySha,
    buildSourceSha,
    imageSourceSha
  };
  const issues = [];
  for (const [name, value] of Object.entries(values)) {
    if (!SHA_PATTERN.test(String(value ?? '').trim())) {
      issues.push(`${name} must be a 40-character lowercase Git SHA.`);
    }
  }
  const unique = new Set(
    Object.values(values).map((value) => String(value ?? '').trim())
  );
  if (issues.length === 0 && unique.size !== 1) {
    issues.push(
      'AUTHORITY_INVALIDATED: origin/main, AUTHORITY_SHA, BUILD_SOURCE_SHA, and IMAGE_SOURCE_SHA must be identical.'
    );
  }
  return {
    ok: issues.length === 0,
    status: issues.length === 0 ? 'ALIGNED' : 'AUTHORITY_INVALIDATED',
    issues
  };
}
