import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const config = await readFile(new URL('../gitleaks.toml', import.meta.url), {
  encoding: 'utf8'
});
const allowlists = config
  .split('[[allowlists]]')
  .slice(1)
  .map((block) => ({
    target: block.match(/regexTarget = "(secret|line)"/)?.[1],
    patterns: [...block.matchAll(/^\s*'''(.*?)''',?\s*$/gm)].map(
      ([, pattern]) => new RegExp(pattern)
    )
  }));
if (allowlists.length !== 2 || allowlists.some(({ target }) => !target)) {
  throw new Error('Expected separate secret and full-line allowlists');
}

// This is a configuration-shape regression only. CI additionally exercises
// these scopes with the actual pinned Go scanner, not JavaScript semantics.
const matchesAllowlist = (line, secret = '') =>
  allowlists.some(({ target, patterns }) =>
    patterns.some((pattern) =>
      pattern.test(target === 'secret' ? secret : line)
    )
  );

// Reconstruct the historically verified synthetic request line without coupling
// this shared config test to the optional web package in other worktrees.
const fixtureKey = ['synthetic', 'key', '1234567890'].join('_');
const fixtureLine = `      body: { idempotencyKey: '${fixtureKey}', format: 'csv' },`;

describe('gitleaks allowlist', () => {
  it('does not path-allowlist whole files', () => {
    expect(config).not.toMatch(/paths\s*=/);
  });

  it('allowlists only documented synthetic and vendor-sha256 shapes', () => {
    expect(config).toContain("'''^payroll-close-key-\\d{4}$'''");
    expect(config).toContain("'''^schedule_publish_\\d{4}$'''");
    expect(config).toContain("'''^schedule_publish_occupancy_\\d{4}$'''");
    expect(config).toContain("'''^schedule-publish-key-\\d{4}$'''");
    expect(config).toContain("'''^booking-idempotency-\\d{4}$'''");
    expect(config).toContain("'''^arrive-idempotency-\\d{4}$'''");
    expect(config).toContain("'''^complete-idempotency-\\d{4}$'''");
    expect(config).toContain("'''^follow-up-idempotency-\\d{4}$'''");
    expect(config).toContain("'''^stagef_c1_schedule_publish_v0$'''");
    expect(config).toContain(
      "'''^\\s*body: \\{ idempotencyKey: 'synthetic[_]key_\\d{10}', format: 'csv' \\},\\s*$'''"
    );
    expect(config).toContain(
      "'''^\\s*\"[A-Za-z0-9.-]+\\.js\": \"[a-f0-9]{64}\",?\\s*$'''"
    );
    expect(config).toContain('regexTarget = "secret"');
    expect(config).toContain('regexTarget = "line"');
  });

  it('only allowlists the complete synthetic export request line', () => {
    expect(matchesAllowlist(fixtureLine)).toBe(true);

    const awsCredentialShape = `AKIA${['Q7M2', 'X9P4', 'N6R3', 'T8V5'].join('')}`;
    const lineWithExtraToken = fixtureLine.replace(
      /\s\},$/,
      `, apiKey: '${awsCredentialShape}' },`
    );
    expect(lineWithExtraToken).not.toBe(fixtureLine);
    expect(matchesAllowlist(lineWithExtraToken)).toBe(false);
    expect(matchesAllowlist(`const apiKey = '${awsCredentialShape}';`)).toBe(
      false
    );
  });

  it('does not allowlist AWS or GitHub token shapes', () => {
    expect(config).not.toMatch(/AKIA[0-9A-Z]{16}/);
    expect(config).not.toMatch(/ghp_[A-Za-z0-9]/);
  });
});
