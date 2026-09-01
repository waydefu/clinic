import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const GENERATOR = 'scripts/generate-agent-skills.mjs';
export const CANONICAL_ROOT = '.claude/skills';
export const ADAPTER_ROOT = '.agents/skills';
export const ALLOWED_TOP_LEVEL = [
  'name',
  'description',
  'license',
  'allowed-tools',
  'metadata'
];
export const ALLOWED_TOP_LEVEL_SET = new Set(ALLOWED_TOP_LEVEL);

export function parseSkillMarkdown(text) {
  if (!text.startsWith('---\n')) {
    throw new Error('SKILL.md must start with YAML frontmatter');
  }
  const end = text.indexOf('\n---\n', 4);
  if (end === -1) {
    throw new Error('SKILL.md frontmatter is not closed');
  }
  const raw = text.slice(4, end);
  const body = text.slice(end + 5);
  return { frontmatter: parseSimpleYaml(raw), body };
}

function parseSimpleYaml(raw) {
  const result = {};
  const lines = raw.split('\n');
  let nestedKey = null;
  for (const line of lines) {
    if (line.trim() === '') continue;
    const nested = /^ {2}([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (nested) {
      if (nestedKey === null) {
        throw new Error(`unsupported nested frontmatter line: ${line}`);
      }
      if (typeof result[nestedKey] !== 'object' || result[nestedKey] === null) {
        result[nestedKey] = {};
      }
      result[nestedKey][nested[1]] = unquote(nested[2]);
      continue;
    }
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!match) {
      throw new Error(`unsupported frontmatter line: ${line}`);
    }
    nestedKey = match[2] === '' ? match[1] : null;
    result[match[1]] = match[2] === '' ? {} : unquote(match[2]);
  }
  return result;
}

function unquote(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function yamlQuote(value) {
  return JSON.stringify(String(value));
}

export function translateFrontmatter(frontmatter, { sourcePath }) {
  if (!frontmatter.name || !frontmatter.description) {
    throw new Error(`skill ${sourcePath} needs name and description`);
  }
  let description = frontmatter.description;
  if (
    frontmatter.when_to_use &&
    !description.includes(frontmatter.when_to_use)
  ) {
    description = `${description} ${frontmatter.when_to_use}`;
  }
  const translated = {
    name: frontmatter.name,
    description
  };
  if (frontmatter.license) translated.license = frontmatter.license;
  if (frontmatter['allowed-tools']) {
    translated['allowed-tools'] = frontmatter['allowed-tools'];
  }
  translated.metadata = {
    generated: 'true',
    source: sourcePath.replaceAll('\\', '/'),
    generator: GENERATOR
  };
  return translated;
}

export function assertCodexFrontmatter(frontmatter) {
  const keys = Object.keys(frontmatter);
  const extra = keys.filter((key) => !ALLOWED_TOP_LEVEL_SET.has(key));
  if (extra.length > 0) {
    throw new Error(`unsupported top-level keys: ${extra.join(', ')}`);
  }
  if (typeof frontmatter.name !== 'string' || frontmatter.name === '') {
    throw new Error('name must be a non-empty string');
  }
  if (
    typeof frontmatter.description !== 'string' ||
    frontmatter.description === ''
  ) {
    throw new Error('description must be a non-empty string');
  }
  if (frontmatter.metadata) {
    if (
      typeof frontmatter.metadata !== 'object' ||
      Array.isArray(frontmatter.metadata)
    ) {
      throw new Error('metadata must be a string-valued object');
    }
    for (const [key, value] of Object.entries(frontmatter.metadata)) {
      if (typeof value !== 'string') {
        throw new Error(`metadata.${key} must be a string`);
      }
    }
  }
}

export function renderSkillMarkdown({ frontmatter, body }) {
  assertCodexFrontmatter(frontmatter);
  const lines = ['---'];
  lines.push(`name: ${yamlQuote(frontmatter.name)}`);
  lines.push(`description: ${yamlQuote(frontmatter.description)}`);
  if (frontmatter.license) {
    lines.push(`license: ${yamlQuote(frontmatter.license)}`);
  }
  if (frontmatter['allowed-tools']) {
    lines.push(`allowed-tools: ${yamlQuote(frontmatter['allowed-tools'])}`);
  }
  if (frontmatter.metadata) {
    lines.push('metadata:');
    for (const key of Object.keys(frontmatter.metadata).sort()) {
      lines.push(`  ${key}: ${yamlQuote(frontmatter.metadata[key])}`);
    }
  }
  lines.push('---');
  const normalisedBody = body.startsWith('\n') ? body : `\n${body}`;
  const withNewline = normalisedBody.endsWith('\n')
    ? normalisedBody
    : `${normalisedBody}\n`;
  return `${lines.join('\n')}${withNewline}`;
}

export function translateSkillFile(text, { sourcePath }) {
  const parsed = parseSkillMarkdown(text);
  const frontmatter = translateFrontmatter(parsed.frontmatter, { sourcePath });
  return renderSkillMarkdown({ frontmatter, body: parsed.body });
}

export async function listCanonicalSkills(root) {
  const skillsDir = path.join(root, CANONICAL_ROOT);
  const names = (await readdir(skillsDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  return names;
}

export async function generateAgentSkills(root) {
  const names = await listCanonicalSkills(root);
  const files = new Map();
  for (const name of names) {
    const sourcePath = `${CANONICAL_ROOT}/${name}/SKILL.md`;
    const text = await readFile(path.join(root, sourcePath), 'utf8');
    files.set(
      `${ADAPTER_ROOT}/${name}/SKILL.md`,
      translateSkillFile(text, { sourcePath })
    );
  }
  return files;
}

export async function writeAgentSkills(root, files) {
  const adapterDir = path.join(root, ADAPTER_ROOT);
  await rm(adapterDir, { recursive: true, force: true });
  const names = [...files.keys()].sort();
  for (const relative of names) {
    const full = path.join(root, relative);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, files.get(relative), 'utf8');
  }
}

export async function reviewAgentSkills(root, files) {
  const problems = [];
  const adapterDir = path.join(root, ADAPTER_ROOT);
  let existingNames;
  try {
    existingNames = (await readdir(adapterDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    problems.push(`${ADAPTER_ROOT} is missing`);
    return problems;
  }
  const expectedNames = [...files.keys()]
    .map((relative) => relative.split('/')[2])
    .sort();
  if (existingNames.join('\n') !== expectedNames.join('\n')) {
    problems.push(`${ADAPTER_ROOT} directories drifted from ${CANONICAL_ROOT}`);
  }
  for (const [relative, expected] of files) {
    let actual;
    try {
      actual = await readFile(path.join(root, relative), 'utf8');
    } catch {
      problems.push(`${relative} is missing`);
      continue;
    }
    if (actual !== expected)
      problems.push(`${relative} is stale; regenerate it`);
    try {
      const parsed = parseSkillMarkdown(actual);
      assertCodexFrontmatter(parsed.frontmatter);
    } catch (error) {
      problems.push(`${relative}: ${error.message}`);
    }
  }
  return problems;
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const checkOnly = process.argv.includes('--check');
  const files = await generateAgentSkills(root);
  if (checkOnly) {
    const problems = await reviewAgentSkills(root, files);
    if (problems.length > 0) {
      console.error(problems.join('\n'));
      process.exit(1);
    }
    console.log('Generated agent-skill adapters are up to date.');
  } else {
    await writeAgentSkills(root, files);
    console.log(`Wrote ${files.size} skills under ${ADAPTER_ROOT}`);
  }
}
