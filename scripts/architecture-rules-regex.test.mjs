import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  forbiddenBrowserPatterns,
  importSpecifiers,
  layerViolations,
  opaqueDynamicImports,
  stripComments
} from './architecture-rules.mjs';

const regexes = [
  'const pattern = /[//]/;',
  'const pattern = /[/*]/;',
  'const pattern = /[//]/g;',
  String.raw`const pattern = /['"]/;`,
  String.raw`const pattern = /[\/*]/;`,
  String.raw`const pattern = /\/\//;`
];

function requireValidSource(source) {
  const parsed = ts.createSourceFile(
    'synthetic-comment-boundary.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  expect(parsed.parseDiagnostics).toEqual([]);
}

describe('compiler-literal import boundaries', () => {
  it('keeps parenthesized literals visible to the browser layer gate', () => {
    const source = "void import((('node:fs')));";
    requireValidSource(source);
    expect(importSpecifiers(source)).toEqual(['node:fs']);
    expect(
      layerViolations(
        {
          label: 'apps/web/public',
          allowedBare: [],
          why: 'Browser ESM has no Node dependency'
        },
        [{ path: 'apps/web/public/synthetic.js', source }]
      )
    ).toEqual([expect.objectContaining({ specifier: 'node:fs' })]);
  });

  it('treats transparent parentheses around a literal as resolved, not opaque', () => {
    const source = "void import((('./synthetic.js')));";
    requireValidSource(source);
    expect(importSpecifiers(source)).toEqual(['./synthetic.js']);
    expect(opaqueDynamicImports(source)).toEqual([]);
  });

  it.each([
    'void import((target));',
    "void import((String('node:fs')));",
    "void import(('node:' + 'fs'));"
  ])('keeps unresolved input fail-closed: %s', (source) => {
    requireValidSource(source);
    expect(importSpecifiers(source)).toEqual([]);
    expect(opaqueDynamicImports(source).length).toBeGreaterThan(0);
  });
  it.each([
    ["import/**/{ value }from'node:fs';", ['node:fs']],
    [
      "import{ value }from'node:fs'; export{ value }from'node:crypto';",
      ['node:fs', 'node:crypto']
    ],
    [
      "const loaded = import('node:fs', { with: { type: 'json' } });",
      ['node:fs']
    ],
    ["type NodeInfo = import('node:fs').Stats;", ['node:fs']],
    ["import NodeInfo = require('node:fs');", ['node:fs']],
    [
      "const decoy = / import value from 'ghost' /; import real from 'real';",
      ['real']
    ]
  ])('resolves only real literal imports in %s', (source, expected) => {
    requireValidSource(source);
    expect(importSpecifiers(source)).toEqual(expected);
  });
});

describe('regex-aware non-executing comment removal', () => {
  it.each(regexes)(
    'preserves %s and removes only the actual trailing comment',
    (prefix) => {
      const source = `${prefix} // actual comment\nimport safe from 'zod';`;
      requireValidSource(source);
      expect(stripComments(source)).toBe(`${prefix} \nimport safe from 'zod';`);
    }
  );

  it.each(regexes)('does not hide the real import following %s', (prefix) => {
    const source = `${prefix} import forbidden from 'node:fs';`;
    requireValidSource(source);
    expect(importSpecifiers(source)).toEqual(['node:fs']);
    expect(
      layerViolations(
        {
          label: 'synthetic browser-shared domain',
          allowedBare: ['vitest'],
          why: 'No Node dependency'
        },
        [{ path: 'synthetic-domain.ts', source }]
      )
    ).toEqual([
      expect.objectContaining({
        path: 'synthetic-domain.ts',
        specifier: 'node:fs'
      })
    ]);
  });

  it('preserves the forbidden source pattern following a regex block-comment decoy', () => {
    const source =
      "const pattern = /[/*]/;\nconst options = { timeZone: 'Asia/Taipei' };";
    requireValidSource(source);
    expect(
      forbiddenBrowserPatterns(source, [
        {
          pattern: /timeZone:\s*['"]Asia\/Taipei['"]/u,
          detail: 'synthetic domain duplicate'
        }
      ])
    ).toEqual(['synthetic domain duplicate']);
  });

  it('removes expression comments without changing raw template contents', () => {
    const source =
      'const label = `raw // text ${ 1 /* actual expression comment */ + 2 } raw /* text */`;';
    requireValidSource(source);
    expect(stripComments(source)).toBe(
      'const label = `raw // text ${ 1  + 2 } raw /* text */`;'
    );
  });

  it('keeps division and regex distinct and removes a real comment after both', () => {
    const source =
      'const count = total / 2; const pattern = /[/*]/; /* actual */ const safe = 1;';
    requireValidSource(source);
    expect(stripComments(source)).toBe(
      'const count = total / 2; const pattern = /[/*]/;  const safe = 1;'
    );
  });
});
