import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ALLOWED_TOP_LEVEL,
  assertCodexFrontmatter,
  generateAgentSkills,
  parseSkillMarkdown,
  reviewAgentSkills,
  translateFrontmatter,
  translateSkillFile
} from './generate-agent-skills.mjs';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);

const source = `---
name: verify-gates
description: Pick and run the blocking gates.
when_to_use: After making changes.
extra: drop-me
---

# Verify the change

Body stays.
`;

describe('agent skill adapter translation', () => {
  it('emits only Codex-safe top-level keys', () => {
    const parsed = parseSkillMarkdown(source);
    const translated = translateFrontmatter(parsed.frontmatter, {
      sourcePath: '.claude/skills/verify-gates/SKILL.md'
    });
    expect(Object.keys(translated).sort()).toEqual(
      ['description', 'metadata', 'name'].sort()
    );
    for (const key of Object.keys(translated)) {
      expect(ALLOWED_TOP_LEVEL).toContain(key);
    }
    expect(translated.generated).toBeUndefined();
    expect(translated.when_to_use).toBeUndefined();
    expect(translated.extra).toBeUndefined();
  });

  it('folds when_to_use into description and stores provenance as strings', () => {
    const translated = translateFrontmatter(
      parseSkillMarkdown(source).frontmatter,
      { sourcePath: '.claude/skills/verify-gates/SKILL.md' }
    );
    expect(translated.description).toContain(
      'Pick and run the blocking gates.'
    );
    expect(translated.description).toContain('After making changes.');
    expect(translated.metadata).toEqual({
      generated: 'true',
      generator: 'scripts/generate-agent-skills.mjs',
      source: '.claude/skills/verify-gates/SKILL.md'
    });
    for (const value of Object.values(translated.metadata)) {
      expect(typeof value).toBe('string');
    }
  });

  it('is deterministic and preserves the body', () => {
    const first = translateSkillFile(source, {
      sourcePath: '.claude/skills/verify-gates/SKILL.md'
    });
    const second = translateSkillFile(source, {
      sourcePath: '.claude/skills/verify-gates/SKILL.md'
    });
    expect(first).toBe(second);
    expect(first).toContain('# Verify the change');
    expect(first).toContain('Body stays.');
    expect(first).not.toMatch(/^generated:/m);
    expect(first).not.toContain('when_to_use:');
    const roundTrip = parseSkillMarkdown(first);
    expect(() => assertCodexFrontmatter(roundTrip.frontmatter)).not.toThrow();
  });

  it('keeps metadata keys in sorted order', () => {
    const rendered = translateSkillFile(source, {
      sourcePath: '.claude/skills/verify-gates/SKILL.md'
    });
    const metadataBlock = rendered.split('metadata:\n')[1].split('\n---')[0];
    const keys = metadataBlock
      .split('\n')
      .filter(Boolean)
      .map((line) => line.trim().split(':')[0]);
    expect(keys).toEqual([...keys].sort());
  });

  it('rejects malformed input', () => {
    expect(() => parseSkillMarkdown('# no frontmatter\n')).toThrow(
      /frontmatter/
    );
    expect(() => parseSkillMarkdown('---\nname: x\n')).toThrow(/not closed/);
    expect(() =>
      translateFrontmatter(
        { name: 'x' },
        { sourcePath: '.claude/skills/x/SKILL.md' }
      )
    ).toThrow(/name and description/);
    expect(() =>
      assertCodexFrontmatter({
        name: 'x',
        description: 'y',
        when_to_use: 'nope'
      })
    ).toThrow(/unsupported top-level keys/);
    expect(() =>
      assertCodexFrontmatter({
        name: 'x',
        description: 'y',
        metadata: { generated: true }
      })
    ).toThrow(/must be a string/);
  });

  it('detects adapter drift and missing files', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'gov-skills-'));
    const files = new Map([
      [
        '.agents/skills/verify-gates/SKILL.md',
        translateSkillFile(source, {
          sourcePath: '.claude/skills/verify-gates/SKILL.md'
        })
      ]
    ]);
    expect(await reviewAgentSkills(root, files)).toContain(
      '.agents/skills is missing'
    );
    await mkdir(path.join(root, '.agents/skills/verify-gates'), {
      recursive: true
    });
    await writeFile(
      path.join(root, '.agents/skills/verify-gates/SKILL.md'),
      '---\nname: "stale"\ndescription: "stale"\n---\n',
      'utf8'
    );
    const stale = await reviewAgentSkills(root, files);
    expect(stale.some((problem) => problem.includes('is stale'))).toBe(true);
  });

  it('keeps the committed verify-gates adapter in sync with the canonical skill', async () => {
    const canonical = await readFile(
      path.join(repoRoot, '.claude/skills/verify-gates/SKILL.md'),
      'utf8'
    );
    expect(() => parseSkillMarkdown(canonical)).not.toThrow();
    const files = await generateAgentSkills(repoRoot);
    expect(await reviewAgentSkills(repoRoot, files)).toEqual([]);
    const adapter = files.get('.agents/skills/verify-gates/SKILL.md');
    expect(adapter).toBeDefined();
    expect(() =>
      assertCodexFrontmatter(parseSkillMarkdown(adapter).frontmatter)
    ).not.toThrow();
  });
});
