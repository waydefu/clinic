import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// 這份模組不呼叫 GitHub，也不產生簽章。它只做兩件本機可證明的事：
//   1. 對產物算 SHA-256；
//   2. 審查「產物 digest ↔ repository ↔ commit ↔ workflow ↔ attestation」綁定，
//      缺件、空件、舊 commit 或 digest 對不上都失敗。
//
// 真正的 Sigstore 簽章由 CI 的 `actions/attest` 產生。本機測不到那一步，所以
// 不得把本機綠燈說成 attestation 已驗證。這是 SLSA-aligned provenance 綁定，
// 不是 SLSA level 宣告。

export const BINDING_KIND = 'sbom-attestation-binding';
export const SLSA_PROVENANCE_PREDICATE = 'https://slsa.dev/provenance/v1';
export const WORKFLOW_FILE = '.github/workflows/verify.yml';

export function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function createSbomAttestationBinding({
  artifact = 'sbom.cdx.json',
  bytes,
  env = {},
  attestation = {}
} = {}) {
  const sha256 = sha256Hex(bytes);
  return {
    schemaVersion: 1,
    kind: BINDING_KIND,
    artifact,
    sha256,
    subjectDigest: `sha256:${sha256}`,
    repository: env.GITHUB_REPOSITORY || 'unknown/unknown',
    commit: env.GITHUB_SHA || 'unknown',
    workflow: env.GITHUB_WORKFLOW || 'verify',
    workflowFile: WORKFLOW_FILE,
    runId: env.GITHUB_RUN_ID || null,
    attestation: {
      predicate: SLSA_PROVENANCE_PREDICATE,
      id: attestation.id ?? null,
      url: attestation.url ?? null,
      bundlePath: attestation.bundlePath ?? null
    }
  };
}

export function reviewSbomAttestationBinding({
  required = true,
  bytes,
  expected = {},
  binding
} = {}) {
  const failures = [];
  if (!binding) {
    if (required) failures.push('missing attestation binding');
    return failures;
  }

  if (binding.kind !== BINDING_KIND) failures.push('unexpected binding kind');
  if (binding.schemaVersion !== 1)
    failures.push('unsupported binding schemaVersion');
  if (!/^[0-9a-f]{64}$/.test(binding.sha256 ?? ''))
    failures.push('sha256 is not 64 lowercase hex chars');
  if (binding.subjectDigest !== `sha256:${binding.sha256}`)
    failures.push('subjectDigest does not match sha256');

  if (bytes !== undefined) {
    const digest = sha256Hex(bytes);
    if (binding.sha256 !== digest) failures.push('digest mismatch');
  }

  if (expected.repository && binding.repository !== expected.repository)
    failures.push('repository mismatch');
  if (expected.commit && binding.commit !== expected.commit)
    failures.push('commit mismatch');
  if (expected.sha256 && binding.sha256 !== expected.sha256)
    failures.push('digest mismatch');
  if (expected.workflowFile && binding.workflowFile !== expected.workflowFile)
    failures.push('workflow mismatch');

  const commit = binding.commit ?? '';
  if (required && (commit === '' || commit === 'unknown'))
    failures.push('commit is missing');
  const repository = binding.repository ?? '';
  if (required && (repository === '' || repository === 'unknown/unknown'))
    failures.push('repository is missing');

  const hasAttestation = Boolean(
    binding.attestation?.url || binding.attestation?.id
  );
  if (required && !hasAttestation) failures.push('missing attestation');
  if (
    expected.attestationUrl &&
    binding.attestation?.url !== expected.attestationUrl
  )
    failures.push('attestation url mismatch');

  return [...new Set(failures)];
}

function flag(name) {
  return process.argv.includes(`--${name}`);
}

function option(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1 || index === process.argv.length - 1) return undefined;
  return process.argv[index + 1];
}

async function main() {
  const subject = option('subject');
  const writePath = option('write');
  if (!subject || !writePath) {
    console.error(
      'usage: node scripts/review-artifact-attestation.mjs --subject <file> --write <json> [--require-attestation]'
    );
    process.exitCode = 1;
    return;
  }

  const bytes = await readFile(subject);
  const binding = createSbomAttestationBinding({
    artifact: subject.replaceAll('\\', '/').split('/').pop(),
    bytes,
    env: process.env,
    attestation: {
      id: option('attestation-id') ?? null,
      url: option('attestation-url') ?? null,
      bundlePath: option('bundle-path') ?? null
    }
  });

  const required = flag('require-attestation');
  const failures = reviewSbomAttestationBinding({
    required,
    bytes,
    expected: {
      repository: process.env.GITHUB_REPOSITORY,
      commit: process.env.GITHUB_SHA,
      sha256: sha256Hex(bytes),
      workflowFile: WORKFLOW_FILE,
      attestationUrl: option('attestation-url')
    },
    binding
  });

  await mkdir(dirname(writePath), { recursive: true });
  await writeFile(writePath, `${JSON.stringify(binding, null, 2)}\n`, 'utf8');

  if (failures.length > 0) {
    console.error('SBOM attestation binding check failed:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `SBOM attestation binding written (${binding.subjectDigest}, required=${required}).`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
