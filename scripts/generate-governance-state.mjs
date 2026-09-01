import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const GENERATOR = 'scripts/generate-governance-state.mjs';
export const GENERATOR_VERSION = '1';
export const SCHEMA_VERSION = 1;
export const STATE_JSON = 'docs/state/current.json';
export const STATE_MD = 'docs/state/current.md';
export const HASHED_SOURCES = [
  'docs/architecture/stage-2-gate-status.json',
  'security/audit-exceptions.json'
];
export const POINTERS = {
  decisionRegister: 'docs/product/phase-1-decision-register.md',
  roadmap: 'docs/roadmap.md',
  documentLifecycle: 'docs/document-lifecycle.md',
  adrs: 'docs/adr',
  conflicts: 'docs/state/conflicts.md',
  index: 'docs/INDEX.md'
};
export const UNVERIFIED = [
  'githubProtection',
  'previewAvailability',
  'dependabotAlerts',
  'remoteCloud'
];

export function sha256Hex(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function stableStringify(value) {
  return `${JSON.stringify(sortValue(value), null, 2)}\n`;
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortValue(value[key]);
    }
    return sorted;
  }
  return value;
}

export function materializeStage2(stage2) {
  if (!stage2 || typeof stage2 !== 'object') {
    throw new Error('stage-2-gate-status.json must be an object');
  }
  if (!stage2.stageSlices || typeof stage2.stageSlices !== 'object') {
    throw new Error('stage-2-gate-status.json is missing stageSlices');
  }
  if (
    !stage2.deploymentAuthorities ||
    typeof stage2.deploymentAuthorities !== 'object'
  ) {
    throw new Error(
      'stage-2-gate-status.json is missing deploymentAuthorities'
    );
  }
  return {
    stageSlices: { ...stage2.stageSlices },
    deploymentAuthorities: { ...stage2.deploymentAuthorities }
  };
}

export function materializeAuditExceptions(registry) {
  if (!registry || typeof registry !== 'object') {
    throw new Error('audit-exceptions.json must be an object');
  }
  if (!Array.isArray(registry.exceptions)) {
    throw new Error('audit-exceptions.json exceptions must be an array');
  }
  if (!Array.isArray(registry.released)) {
    throw new Error('audit-exceptions.json released must be an array');
  }
  return {
    activeCount: registry.exceptions.length,
    releasedCount: registry.released.length
  };
}

export function buildProjection({ hashedSourceTexts }) {
  const byPath = new Map(hashedSourceTexts);
  for (const sourcePath of HASHED_SOURCES) {
    if (!byPath.has(sourcePath)) {
      throw new Error(`missing hashed source ${sourcePath}`);
    }
  }
  const sources = HASHED_SOURCES.map((sourcePath) => ({
    path: sourcePath,
    sha256: sha256Hex(byPath.get(sourcePath))
  })).sort((a, b) => a.path.localeCompare(b.path));

  const stage2 = materializeStage2(
    JSON.parse(byPath.get('docs/architecture/stage-2-gate-status.json'))
  );
  const auditExceptions = materializeAuditExceptions(
    JSON.parse(byPath.get('security/audit-exceptions.json'))
  );

  return {
    schemaVersion: SCHEMA_VERSION,
    generated: true,
    generator: GENERATOR,
    generatorVersion: GENERATOR_VERSION,
    sources,
    sourceSnapshotSha256: sha256Hex(stableStringify(sources)),
    pointers: { ...POINTERS },
    stage2,
    auditExceptions,
    unverified: [...UNVERIFIED]
  };
}

export function renderCurrentMarkdown(projection) {
  const sourceRows = projection.sources
    .map((source) => `| \`${source.path}\` | \`${source.sha256}\` |`)
    .join('\n');
  const sliceRows = Object.entries(projection.stage2.stageSlices)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, status]) => `| ${id} | \`${status}\` |`)
    .join('\n');
  const authorityRows = Object.entries(projection.stage2.deploymentAuthorities)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, status]) => `| ${id} | \`${status}\` |`)
    .join('\n');
  return `# Current state projection

**generated:** true
**generator:** \`${projection.generator}\` version \`${projection.generatorVersion}\`
**schemaVersion:** ${projection.schemaVersion}

This file is a deterministic projection, not Canon. Decision status lives in
the [decision register](../product/phase-1-decision-register.md). Architecture
decisions live in accepted ADRs. Execution scope lives in the roadmap and
Phase 1 execution plan. Containing Git revision:
\`git log -1 -- docs/state/current.json\`.

## Hashed sources

| Path | sha256 |
| --- | --- |
${sourceRows}

**sourceSnapshotSha256:** \`${projection.sourceSnapshotSha256}\`

## Stage 2 (from stage-2-gate-status.json)

| Slice | Status |
| --- | --- |
${sliceRows}

| Slice | Deployment authority |
| --- | --- |
${authorityRows}

Changing these values records status only. It never grants deployment
authority or enables a route.

## Audit exceptions (counts only)

- active: ${projection.auditExceptions.activeCount}
- released: ${projection.auditExceptions.releasedCount}

## Pointers (paths only; not hashed)

- decision register: \`${projection.pointers.decisionRegister}\`
- roadmap: \`${projection.pointers.roadmap}\`
- document lifecycle: \`${projection.pointers.documentLifecycle}\`
- ADRs: \`${projection.pointers.adrs}\`
- unresolved conflicts: \`${projection.pointers.conflicts}\`
- AI index: \`${projection.pointers.index}\`

## UNVERIFIED

${projection.unverified.map((item) => `- \`${item}\``).join('\n')}
`;
}

export function renderedArtifacts(projection) {
  return {
    json: stableStringify(projection),
    markdown: renderCurrentMarkdown(projection)
  };
}

export function reviewStateArtifacts({ existingJson, existingMd, artifacts }) {
  const problems = [];
  if (existingJson !== artifacts.json) {
    problems.push(`${STATE_JSON} is stale; regenerate it`);
  }
  if (existingMd !== artifacts.markdown) {
    problems.push(`${STATE_MD} is stale; regenerate it`);
  }
  return problems;
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const checkOnly = process.argv.includes('--check');
  const hashedSourceTexts = [];
  for (const sourcePath of HASHED_SOURCES) {
    hashedSourceTexts.push([
      sourcePath,
      await readFile(path.join(root, sourcePath), 'utf8')
    ]);
  }
  const artifacts = renderedArtifacts(buildProjection({ hashedSourceTexts }));
  const jsonPath = path.join(root, STATE_JSON);
  const mdPath = path.join(root, STATE_MD);
  if (checkOnly) {
    const existingJson = await readFile(jsonPath, 'utf8');
    const existingMd = await readFile(mdPath, 'utf8');
    const problems = reviewStateArtifacts({
      existingJson,
      existingMd,
      artifacts
    });
    if (problems.length > 0) {
      console.error(problems.join('\n'));
      process.exit(1);
    }
    console.log('Governance state projection is up to date.');
  } else {
    await writeFile(jsonPath, artifacts.json, 'utf8');
    await writeFile(mdPath, artifacts.markdown, 'utf8');
    console.log(`Wrote ${STATE_JSON} and ${STATE_MD}`);
  }
}
