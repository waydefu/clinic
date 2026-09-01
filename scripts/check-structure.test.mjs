import { describe, expect, it } from 'vitest';
import {
  CAPTURE_CONFIG_COMMAND,
  CHECK_LINT_COMMAND,
  CHECK_TYPES_COMMAND,
  EXPECTED_CAPTURE_CONFIG_SCRIPT,
  findMissingPaths,
  requiredPaths,
  reviewVerifyOrdering
} from './check-structure.mjs';

function packageJson(overrides = {}) {
  return {
    scripts: {
      verify: [
        'node scripts/check-structure.mjs',
        CAPTURE_CONFIG_COMMAND,
        CHECK_TYPES_COMMAND,
        CHECK_LINT_COMMAND
      ].join(' && '),
      'check:types': 'corepack pnpm run build',
      'check:capture-config': EXPECTED_CAPTURE_CONFIG_SCRIPT,
      ...overrides
    }
  };
}

describe('required project files', () => {
  it('reports exactly the paths that are unreadable', () => {
    expect(
      findMissingPaths({
        paths: ['a', 'b', 'c'],
        isReadable: (candidate) => candidate !== 'b'
      })
    ).toEqual(['b']);
  });

  it('reports nothing when every path is readable', () => {
    expect(
      findMissingPaths({ paths: ['a', 'b'], isReadable: () => true })
    ).toEqual([]);
  });

  // 這份清單就是「刪掉某個把關檔案會被發現」的唯一保證，所以它自己不能悄悄變空。
  it('keeps every blocking gate script in the required list', () => {
    for (const gate of [
      'scripts/check-structure.mjs',
      'scripts/check-docs-links.mjs',
      'scripts/check-tracked-secrets.mjs',
      'scripts/check-audit-exceptions.mjs',
      'scripts/check-governance.mjs',
      'scripts/generate-governance-state.mjs',
      'scripts/generate-agent-skills.mjs',
      'scripts/generate-sast-evidence.mjs',
      'scripts/review-artifact-attestation.mjs',
      'security/audit-exceptions.json',
      '.github/workflows/sast.yml',
      '.github/workflows/sast-scan.yml'
    ])
      expect(requiredPaths).toContain(gate);
  });

  // 測試被刪掉比腳本被刪掉更難察覺：gate 還在、還是綠燈，只是不再驗證任何事。
  it.each([
    'scripts/check-structure.test.mjs',
    'scripts/check-docs-links.test.mjs',
    'scripts/check-tracked-secrets.test.mjs',
    'scripts/check-audit-exceptions.test.mjs',
    'scripts/check-governance.test.mjs',
    'scripts/generate-governance-state.test.mjs',
    'scripts/generate-agent-skills.test.mjs',
    'scripts/check-design-tokens.test.mjs',
    'scripts/check-performance-budget.test.mjs',
    'scripts/check-public-pages.test.mjs',
    'scripts/check-branch-protection.test.mjs',
    'scripts/generate-ci-evidence.test.mjs',
    'scripts/generate-sast-evidence.test.mjs',
    'scripts/generate-sbom.test.mjs',
    'scripts/review-artifact-attestation.test.mjs'
  ])('requires the gate test %s', (testFile) => {
    expect(requiredPaths).toContain(testFile);
  });

  it('has no duplicate entries', () => {
    expect(new Set(requiredPaths).size).toBe(requiredPaths.length);
  });
});

describe('clean-clone verify ordering', () => {
  it('accepts the current package.json shape', () => {
    expect(reviewVerifyOrdering(packageJson())).toEqual([]);
  });

  it.each([
    [CAPTURE_CONFIG_COMMAND, 'capture config'],
    [CHECK_TYPES_COMMAND, 'types'],
    [CHECK_LINT_COMMAND, 'lint']
  ])('blocks a verify script that drops %s', (command) => {
    const json = packageJson();
    json.scripts.verify = json.scripts.verify
      .split(' && ')
      .filter((part) => part !== command)
      .join(' && ');

    expect(reviewVerifyOrdering(json).join('\n')).toContain(
      `verify must include "${command}"`
    );
  });

  // 順序寫反時，CI 不會壞在 lint，而是壞在一連串看不出原因的型別錯誤。
  it('blocks type-aware lint running before the workspace build', () => {
    const json = packageJson();
    json.scripts.verify = [
      CAPTURE_CONFIG_COMMAND,
      CHECK_LINT_COMMAND,
      CHECK_TYPES_COMMAND
    ].join(' && ');

    expect(reviewVerifyOrdering(json)).toContain(
      'verify must build workspace types before running type-aware ESLint'
    );
  });

  it('blocks check:types that no longer builds the workspace', () => {
    expect(
      reviewVerifyOrdering(packageJson({ 'check:types': 'tsc --noEmit' }))
    ).toContain(
      'check:types must build the workspace packages that provide dist/*.d.ts'
    );
  });

  it('blocks a weakened capture-config type check', () => {
    expect(
      reviewVerifyOrdering(
        packageJson({ 'check:capture-config': 'tsc --noEmit' })
      )
    ).toContain(
      'check:capture-config must type-check the dedicated Playwright capture config'
    );
  });

  it('reports every problem at once rather than only the first', () => {
    expect(
      reviewVerifyOrdering({
        scripts: { verify: '', 'check:types': '', 'check:capture-config': '' }
      })
    ).toHaveLength(5);
  });

  it('treats a missing scripts block as a failure, not a pass', () => {
    expect(reviewVerifyOrdering({}).length).toBeGreaterThan(0);
  });
});
