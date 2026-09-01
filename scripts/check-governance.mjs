import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  generateAgentSkills,
  reviewAgentSkills
} from './generate-agent-skills.mjs';
import {
  STATE_JSON,
  STATE_MD,
  buildProjection,
  renderedArtifacts,
  HASHED_SOURCES
} from './generate-governance-state.mjs';

export const AGENTS_WARN_BYTES = 6144;
export const AGENTS_FAIL_BYTES = 8192;
export const AGENTS_WARN_LINES = 120;
export const INDEX_WARN_BYTES = 5120;
export const INDEX_FAIL_BYTES = 6144;
export const KNOWN_RULE_IDS = new Set(['GOV-BOOT-SIZE', 'GOV-INDEX-SIZE']);
export const RETIRED_AGENTS_HEADINGS = [
  'Repository security posture — dated facts',
  'Current commands',
  'Mandatory reading order'
];

export function lineCount(text) {
  if (text.length === 0) return 0;
  const lines = text.split('\n');
  return text.endsWith('\n') ? lines.length - 1 : lines.length;
}

export function byteLength(text) {
  return Buffer.byteLength(text, 'utf8');
}

export function reviewBootBudgets({
  agentsText,
  indexText,
  claudeText,
  waivers,
  today
}) {
  const warnings = [];
  const problems = [];
  const agentsBytes = byteLength(agentsText);
  const agentsLines = lineCount(agentsText);
  const indexBytes = byteLength(indexText);
  const claudeBytes = byteLength(claudeText);
  const claudeLines = lineCount(claudeText);

  if (agentsBytes > AGENTS_WARN_BYTES) {
    warnings.push(
      `AGENTS.md is ${agentsBytes} bytes (warning threshold ${AGENTS_WARN_BYTES})`
    );
  }
  if (
    agentsBytes > AGENTS_FAIL_BYTES &&
    !hasValidWaiver(waivers, 'GOV-BOOT-SIZE', 'AGENTS.md', today)
  ) {
    problems.push(
      `AGENTS.md is ${agentsBytes} bytes (failure threshold ${AGENTS_FAIL_BYTES})`
    );
  }
  if (agentsLines > AGENTS_WARN_LINES) {
    warnings.push(
      `AGENTS.md is ${agentsLines} lines (advisory warning threshold ${AGENTS_WARN_LINES})`
    );
  }
  if (indexBytes > INDEX_WARN_BYTES) {
    warnings.push(
      `docs/INDEX.md is ${indexBytes} bytes (warning threshold ${INDEX_WARN_BYTES})`
    );
  }
  if (
    indexBytes > INDEX_FAIL_BYTES &&
    !hasValidWaiver(waivers, 'GOV-INDEX-SIZE', 'docs/INDEX.md', today)
  ) {
    problems.push(
      `docs/INDEX.md is ${indexBytes} bytes (failure threshold ${INDEX_FAIL_BYTES})`
    );
  }
  warnings.push(
    `CLAUDE.md advisory size ${claudeBytes} bytes / ${claudeLines} lines`
  );
  return { warnings, problems, agentsBytes, agentsLines, indexBytes };
}

export function reviewRetiredHeadings(agentsText) {
  return RETIRED_AGENTS_HEADINGS.filter((heading) =>
    agentsText.includes(heading)
  ).map((heading) => `AGENTS.md reintroduced retired heading: ${heading}`);
}

export function reviewWaivers({ registry, today }) {
  const problems = [];
  if (!registry || typeof registry !== 'object') {
    return ['docs/governance/waivers.json is malformed'];
  }
  const known = new Set(
    Array.isArray(registry.knownRuleIds)
      ? registry.knownRuleIds
      : [...KNOWN_RULE_IDS]
  );
  const waivers = registry.waivers;
  if (!Array.isArray(waivers)) {
    return ['docs/governance/waivers.json waivers must be an array'];
  }
  const ids = new Set();
  for (const [index, waiver] of waivers.entries()) {
    const prefix = `waiver[${index}]`;
    for (const field of [
      'id',
      'ruleId',
      'scope',
      'reason',
      'owner',
      'approver',
      'createdOn',
      'effectiveOn',
      'expiresOn',
      'evidence'
    ]) {
      if (!waiver?.[field]) problems.push(`${prefix} missing ${field}`);
    }
    if (waiver?.id) {
      if (ids.has(waiver.id)) problems.push(`duplicate waiver id ${waiver.id}`);
      ids.add(waiver.id);
    }
    if (
      waiver?.ruleId &&
      !known.has(waiver.ruleId) &&
      !KNOWN_RULE_IDS.has(waiver.ruleId)
    ) {
      problems.push(`${prefix} unknown ruleId ${waiver.ruleId}`);
    }
    if (waiver?.expiresOn && waiver.expiresOn < today) {
      problems.push(
        `${prefix} ${waiver.id || ''} expired on ${waiver.expiresOn}`
      );
    }
  }
  return problems;
}

export function hasValidWaiver(waivers, ruleId, scope, today) {
  return (waivers || []).some(
    (waiver) =>
      waiver.ruleId === ruleId &&
      waiver.scope === scope &&
      waiver.owner &&
      waiver.approver &&
      waiver.evidence &&
      waiver.expiresOn >= today
  );
}

export async function fileExists(root, relative) {
  try {
    await access(path.join(root, relative), constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const today = new Date().toISOString().slice(0, 10);
  const problems = [];
  const warnings = [];

  const agentsText = await readFile(path.join(root, 'AGENTS.md'), 'utf8');
  const indexText = await readFile(path.join(root, 'docs/INDEX.md'), 'utf8');
  const claudeText = await readFile(path.join(root, 'CLAUDE.md'), 'utf8');
  const waiverRaw = await readFile(
    path.join(root, 'docs/governance/waivers.json'),
    'utf8'
  );
  const waivers = JSON.parse(waiverRaw);
  problems.push(...reviewWaivers({ registry: waivers, today }));
  const budgets = reviewBootBudgets({
    agentsText,
    indexText,
    claudeText,
    waivers: waivers.waivers,
    today
  });
  warnings.push(...budgets.warnings);
  problems.push(...budgets.problems);
  problems.push(...reviewRetiredHeadings(agentsText));

  if (await fileExists(root, '.grok/skills')) {
    problems.push('.grok/skills must not exist; Grok uses .claude/skills');
  }

  const hashedSourceTexts = [];
  for (const sourcePath of HASHED_SOURCES) {
    hashedSourceTexts.push([
      sourcePath,
      await readFile(path.join(root, sourcePath), 'utf8')
    ]);
  }
  const artifacts = renderedArtifacts(buildProjection({ hashedSourceTexts }));
  const existingJson = await readFile(path.join(root, STATE_JSON), 'utf8');
  const existingMd = await readFile(path.join(root, STATE_MD), 'utf8');
  if (existingJson !== artifacts.json) {
    problems.push(`${STATE_JSON} drifted from hashed sources`);
  }
  if (existingMd !== artifacts.markdown) {
    problems.push(`${STATE_MD} drifted from hashed sources`);
  }
  const jsonObject = JSON.parse(existingJson);
  if ('generatedAt' in jsonObject) {
    problems.push(`${STATE_JSON} must not persist generatedAt`);
  }
  if (
    'commit' in jsonObject ||
    'head' in jsonObject ||
    'gitSha' in jsonObject
  ) {
    problems.push(`${STATE_JSON} must not persist a containing-commit SHA`);
  }

  const skillFiles = await generateAgentSkills(root);
  problems.push(...(await reviewAgentSkills(root, skillFiles)));

  for (const line of warnings) console.log(`warning: ${line}`);
  if (problems.length > 0) {
    console.error('Governance check failed:');
    for (const problem of problems) console.error(`- ${problem}`);
    process.exitCode = 1;
  } else {
    console.log(
      `Governance check passed (AGENTS ${budgets.agentsBytes} bytes / ${budgets.agentsLines} lines, INDEX ${budgets.indexBytes} bytes).`
    );
  }
}
