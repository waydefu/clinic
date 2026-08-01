import { describe, expect, it } from 'vitest';
import {
  definedTokens,
  outsideRootBlocks,
  planTokenReview,
  usedTokens,
  withoutComments
} from './check-design-tokens.mjs';

function sheets(entries) {
  return new Map(
    entries.map(({ name, source, scope = [], full = false, breakpoints }) => [
      name,
      { source, scope: new Set(scope), full, breakpoints }
    ])
  );
}

describe('token extraction', () => {
  it('collects tokens declared in a :root block', () => {
    expect([
      ...definedTokens(':root {\n  --colour-ink: #111;\n  --space-2: 8px;\n}')
    ]).toEqual(['--colour-ink', '--space-2']);
  });

  it('collects tokens referenced through var()', () => {
    expect(usedTokens('a { color: var(--colour-ink); }')).toEqual([
      '--colour-ink'
    ]);
  });

  // 註解裡的範例不該被當成宣告或使用，否則作者會不敢在註解裡寫範例。
  it('ignores declarations and usages inside comments', () => {
    const stripped = withoutComments(
      '/* --ghost-token: 1px; var(--other-ghost); */ a { color: red; }'
    );

    expect(stripped).not.toContain('--ghost-token');
    expect(stripped).not.toContain('--other-ghost');
  });

  it('keeps only the content outside a root block', () => {
    const outside = outsideRootBlocks(
      ':root {\n  --ok: 1px;\n}\n.card { --leaked: 2px; }'
    );

    expect(outside).toContain('--leaked');
    expect(outside).not.toContain('--ok');
  });
});

describe('token review', () => {
  it('passes a sheet that only uses tokens in its scope', () => {
    const review = planTokenReview(
      sheets([
        {
          name: 'a.css',
          source: ':root {\n  --ink: #111;\n}\nbody { color: var(--ink); }',
          scope: ['--ink']
        }
      ])
    );

    expect(review.violations).toEqual([]);
  });

  // 用了沒定義的 token，CSS 不會報錯，那條宣告只是靜默失效——正是最難發現的一種。
  it('reports a token that is used but not in scope', () => {
    const review = planTokenReview(
      sheets([
        {
          name: 'a.css',
          source: 'body { color: var(--never-declared); }',
          scope: []
        }
      ])
    );

    expect(review.violations.join('\n')).toContain('--never-declared');
  });

  it('does not report the same undefined token twice in one sheet', () => {
    const review = planTokenReview(
      sheets([
        {
          name: 'a.css',
          source: 'a { color: var(--x); }\nb { border-color: var(--x); }',
          scope: []
        }
      ])
    );

    expect(review.violations).toHaveLength(1);
  });

  it('rejects a breakpoint outside the canonical scale', () => {
    const review = planTokenReview(
      sheets([
        {
          name: 'a.css',
          source: '@media (max-width: 37rem) { a { color: red; } }',
          scope: [],
          breakpoints: true
        }
      ])
    );

    expect(review.violations.join('\n')).toContain('37rem');
  });

  it.each(['64rem', '48rem', '30rem'])(
    'accepts the canonical breakpoint %s',
    (width) => {
      const review = planTokenReview(
        sheets([
          {
            name: 'a.css',
            source: `@media (max-width: ${width}) { a { color: red; } }`,
            scope: [],
            breakpoints: true
          }
        ])
      );

      expect(review.violations).toEqual([]);
    }
  );

  // `full: true` = 參與共用設計系統的樣式表，才套寫死值的規則；
  // `full: false` = 自成一頁（404、隱私權政策、診所官網），沒有共用 token 可用。
  it('applies the hardcoded-value rules only to design-system sheets', () => {
    const hardcoded = 'a { color: #ff0000; font-weight: 700; }';

    const systemSheet = planTokenReview(
      sheets([{ name: 'styles.css', source: hardcoded, full: true }])
    );

    expect(systemSheet.violations.join('\n')).toContain('#ff0000');
    expect(systemSheet.violations.join('\n')).toContain('700');

    const standaloneSheet = planTokenReview(
      sheets([{ name: 'clinic.css', source: hardcoded, full: false }])
    );

    expect(standaloneSheet.violations).toEqual([]);
  });

  // scope 規則對兩種樣式表都適用：用了沒定義的 token，宣告一樣會靜默失效。
  it('applies the scope rule to a standalone sheet as well', () => {
    const review = planTokenReview(
      sheets([
        {
          name: 'clinic.css',
          source: 'body { color: var(--standalone); }',
          scope: [],
          full: false
        }
      ])
    );

    expect(review.violations.join('\n')).toContain('--standalone');
  });
});
