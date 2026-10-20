import { readFileSync } from 'node:fs';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  entrypointPaths,
  validateCoverageResult
} from './test-sast-coverage.mjs';

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const sinkRule = 'clinic.javascript.html-sink-outside-trusted-entrypoint';
const report = (paths = []) => ({
  errors: [],
  paths: { scanned: entrypointPaths },
  results: paths.map((path) => ({ path, check_id: sinkRule }))
});
const result = (body = report(), status = 0) => ({
  status,
  stdout: JSON.stringify(body)
});

function unguardedSinks(source, path) {
  const tree = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS
  );
  const violations = [];
  const checked = (node) =>
    (ts.isStringLiteral(node) && node.text === '') ||
    (ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'assertRenderable' &&
      node.arguments.length === 1);
  const visit = (node) => {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(node.left) &&
      ['innerHTML', 'outerHTML'].includes(node.left.name.text) &&
      !checked(node.right)
    )
      violations.push(node.getStart(tree));
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'insertAdjacentHTML' &&
      (node.arguments.length !== 2 || !checked(node.arguments[1]))
    )
      violations.push(node.getStart(tree));
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return violations;
}

describe('SAST coverage proof oracle', () => {
  it('accepts a scanned safe tree and the three exact rejected entrypoint paths', () => {
    expect(() => validateCoverageResult(result(), [])).not.toThrow();
    expect(() =>
      validateCoverageResult(
        result(report(entrypointPaths), 1),
        entrypointPaths
      )
    ).not.toThrow();
  });

  it.each([
    ['missing findings', result(report(), 1)],
    [
      'wrong rule',
      result(
        {
          ...report(entrypointPaths),
          results: entrypointPaths.map((path) => ({
            path,
            check_id: 'unrelated.rule'
          }))
        },
        1
      )
    ],
    [
      'scanner errors',
      result(
        { ...report(entrypointPaths), errors: [{ type: 'parse-error' }] },
        1
      )
    ],
    [
      'unscanned inputs',
      result({ ...report(entrypointPaths), paths: { scanned: [] } }, 1)
    ],
    [
      'wrong path',
      result(report(['different.js', ...entrypointPaths.slice(1)]), 1)
    ],
    ['config failure', result(report(entrypointPaths), 2)],
    [
      'process error',
      {
        ...result(report(entrypointPaths), 1),
        error: new Error('synthetic spawn failure')
      }
    ],
    ['invalid JSON', { status: 1, stdout: '{}' }]
  ])('rejects %s rather than passing on missing evidence', (_label, value) => {
    expect(() => validateCoverageResult(value, entrypointPaths)).toThrow();
  });
});

describe('SAST expression-level HTML boundary', () => {
  it.each(entrypointPaths)(
    'keeps checked sinks and the actual policy import in %s',
    (path) => {
      const source = read(path);
      const modulePath = path.endsWith('calendar-pilot-entry.js')
        ? '../public/modules/trusted-html.js'
        : './modules/trusted-html.js';
      expect(
        source
          .trimStart()
          .startsWith(`import { assertRenderable } from '${modulePath}';`)
      ).toBe(true);
      expect(source).toContain('innerHTML = assertRenderable(');
      expect(unguardedSinks(source, path)).toEqual([]);
      expect(
        unguardedSinks(`${source}\nnode.innerHTML = untrustedInput;`, path)
      ).toHaveLength(1);
    }
  );
});

describe('SAST workflow acceptance contract', () => {
  it('keeps required same-run SAST and artifact evidence rather than adding upload authority', () => {
    const workflow = read('.github/workflows/sast-scan.yml');
    const verify = read('.github/workflows/verify.yml');
    expect(workflow).toContain('SAST_CONFIGURED_RULE_COUNT: 83');
    expect(workflow).toContain(
      '--config security/semgrep/clinic-terraform.yml'
    );
    expect(workflow).toContain('node scripts/test-sast-coverage.mjs');
    expect(workflow).toContain('--strict');
    expect(workflow).toContain('--error');
    expect(workflow).toContain(
      'GITHUB_CODE_SCANNING_UPLOAD_STATUS: not-uploaded-by-workflow'
    );
    expect(workflow).not.toContain('security-events: write');
    expect(workflow).not.toContain('upload-sarif');
    expect(workflow).toContain('if-no-files-found: error');
    expect(verify).toMatch(
      /sast:\s*\n\s+uses: \.\/\.github\/workflows\/sast-scan\.yml/u
    );
    const evidence = verify.slice(verify.indexOf('\n  evidence:'));
    expect(evidence).toMatch(/needs:[\s\S]*?\bsast\b/u);
    expect(read('security/semgrep/clinic-javascript.yml')).not.toContain(
      'exclude:'
    );
  });
});
