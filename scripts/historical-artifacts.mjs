import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';

/**
 * WP-B6 historical inspect artifacts from the 2026-09-14 complete review.
 * These hashes identify the originals. New files must not reuse the names.
 */
export const WP_B6_HISTORICAL_ARTIFACTS = Object.freeze([
  {
    name: 'internal-preproduction-complete-a9a445a.json',
    sha256: 'b80d92b70dea2564376732f95d8897bbdeca4bf7a26b875235e8d78ef23f5454'
  },
  {
    name: 'internal-preproduction-complete-a9a445a.result.json',
    sha256: 'bb34e7c18e46687e2762866b1b00135efa2ce5038841c41f74466e0cf2c710e6'
  },
  {
    name: 'ci-verification.json',
    sha256: '9efe81ca35109abf42b02ac8c33f2438df067319778686ab698c1e9e0a7b9285'
  },
  {
    name: 'hosting-inspect.json',
    sha256: '5022f9928ed91138e4b8611a8eb09b4772234312a6579c82bda8752a3b1bf7d4'
  },
  {
    name: 'backup-inspect.json',
    sha256: '2f076905c4df15330919efc85b64d4a3029f0df7a31a93b6738237081714dc2f'
  },
  {
    name: 'monitoring-inspect.json',
    sha256: '4fb41f9546d9c8a53071257873990a43360791675c702786b5d48c64ffbddf2b'
  },
  {
    name: 'migration-inspect.json',
    sha256: 'b392e7b5c6d2fd1e06940547d8cc84488f33b49908d70c488dcc6e13e438295f'
  },
  {
    name: 'smoke-probes.json',
    sha256: '00a138d677c207cb244c5c7fb3d70c15cf4e4896da81ce9d9a92463a7baf281a'
  },
  {
    name: 'c5-backup-schedule-apply-a9a445a.txt',
    sha256: '0cee46ea71f32c568d031b66e8f63443ef7696ff4232cb6329e6e6130334589e'
  },
  {
    name: 'c1-iam-alert-apply-a9a445a.txt',
    sha256: '9b0eeb2cfc86dce1afd47640f7a978ac6dfa29d843fecfdba2882e81ab821b94'
  },
  {
    name: 'firebase-preview-deploy-a9a445a.log',
    sha256: 'bc1afd4d80ebf2b36d27e4a032e3e1c6ef52a41aefd8a04355584306442e713c'
  },
  {
    name: 'hosting-channels-a9a445a.json',
    sha256: '8fbda6dbcee9136fbc15a056a364c9e86761a3fec6921913a29d83a793104a42'
  }
]);

export const DEFAULT_SEARCH_ROOTS = Object.freeze([
  '/opt/cursor/artifacts',
  'output/evidence'
]);

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function filesUnder(root) {
  if (!existsSync(root)) return [];
  const stat = statSync(root);
  if (stat.isFile()) return [root];
  const found = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) found.push(...filesUnder(path));
    else if (entry.isFile()) found.push(path);
  }
  return found;
}

export function evaluateHistoricalArtifacts({
  searchRoots = DEFAULT_SEARCH_ROOTS,
  listFiles = filesUnder,
  hashFile = sha256File
} = {}) {
  const scanned = searchRoots.flatMap((root) => listFiles(root));
  const byName = new Map();
  for (const path of scanned) {
    const name = basename(path);
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(path);
  }

  const matches = [];
  const missing = [];
  const mismatches = [];
  for (const artifact of WP_B6_HISTORICAL_ARTIFACTS) {
    const candidates = byName.get(artifact.name) ?? [];
    if (candidates.length === 0) {
      missing.push(artifact.name);
      continue;
    }
    const hashed = candidates.map((path) => ({
      path,
      sha256: hashFile(path)
    }));
    const hit = hashed.find((item) => item.sha256 === artifact.sha256);
    if (hit) matches.push({ name: artifact.name, path: hit.path });
    else mismatches.push({ name: artifact.name, found: hashed });
  }

  const recovered = matches.length === WP_B6_HISTORICAL_ARTIFACTS.length;
  const impersonation = mismatches.filter((item) =>
    (item.found ?? []).some((file) => file.sha256 !== undefined)
  );
  const status = recovered
    ? 'HASH_MATCH'
    : mismatches.length > 0
      ? 'HISTORICAL_ARTIFACT_NAME_REUSED_HASH_MISMATCH'
      : 'HISTORICAL_ARTIFACTS_LOST';

  const issues = [];
  if (status === 'HISTORICAL_ARTIFACT_NAME_REUSED_HASH_MISMATCH') {
    issues.push(
      'A file reused a WP-B6 historical name without matching SHA-256. New evidence must use a new name and NEW_EVIDENCE_SET.'
    );
  }
  if (status === 'HISTORICAL_ARTIFACTS_LOST') {
    issues.push(
      'WP-B6 originals were not found. Mark HISTORICAL_ARTIFACTS_LOST and build NEW_EVIDENCE_SET. Do not fake originals.'
    );
  }

  return {
    status,
    newEvidenceSet: status !== 'HASH_MATCH',
    recovered: matches.length,
    expected: WP_B6_HISTORICAL_ARTIFACTS.length,
    matches,
    missing,
    impersonation: impersonation.map((item) => item.name),
    issues,
    ok: status === 'HASH_MATCH' || status === 'HISTORICAL_ARTIFACTS_LOST'
  };
}

export function historicalDispositionForCompleteness(result) {
  if (result.status === 'HASH_MATCH') {
    return { status: 'HASH_MATCH', newEvidenceSet: false };
  }
  return {
    status: 'HISTORICAL_ARTIFACTS_LOST',
    newEvidenceSet: true
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = evaluateHistoricalArtifacts();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}
