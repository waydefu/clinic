import { describe, expect, it } from 'vitest';
import {
  definedTokens,
  outsideRootBlocks,
  planTokenReview,
  reviewFontSizeClamp,
  splitArguments,
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

  // `@property` 是唯一能讓自訂屬性做動畫的宣告方式——沒有型別，瀏覽器不知道
  // `0deg` 到 `360deg` 之間要怎麼內插。只認 `:root` 會把正確的現代寫法報成
  // 「未定義」，把人推回舊寫法，或逼人在 `:root` 再寫一次同一個初始值。
  it('collects tokens declared with @property', () => {
    const source = [
      '@property --clinic-angle {',
      "  syntax: '<angle>';",
      '  inherits: false;',
      '  initial-value: 0deg;',
      '}'
    ].join('\n');
    expect([...definedTokens(source)]).toEqual(['--clinic-angle']);
  });

  it('collects both :root and @property declarations together', () => {
    const source = [
      ':root {\n  --a: 1;\n}',
      '@property --b {\n  syntax: "<number>";\n  inherits: false;\n  initial-value: 0;\n}'
    ].join('\n\n');
    expect([...definedTokens(source)].sort()).toEqual(['--a', '--b']);
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

  // 2026-08-06 的迴歸：`:root` 區塊的結尾要靠**大括號配對**找，不能靠縮排。
  //
  // 先前 `definedTokens` 與 `outsideRootBlocks` 各自寫了一份找「換行後頂格的
  // `}`」的 regex。`:root` 在最外層時碰巧成立，寫在 `@media` 裡就不成立——那個
  // `:root` 的結尾是縮排的，於是 regex 一路吃到整個 `@media` 的結尾，把中間所有
  // 規則當成 `:root` 的內容排除掉。實測吞掉 clinic-site.css 230 行／44 條 class
  // 規則、workbench.css 114 行／27 條；那些規則裡的寫死值從來沒有被檢查過，
  // 而 gate 一直是綠的。
  it('finds the end of a :root block inside @media by matching braces', () => {
    const source = [
      '@media (max-width: 48rem) {',
      '  :root {',
      '    --shell: 100%;',
      '  }',
      '',
      '  .card {',
      '    font-weight: 650;',
      '    color: #ff0000;',
      '  }',
      '}'
    ].join('\n');

    const body = outsideRootBlocks(source);
    // 巢狀 `:root` 之後的規則必須留在 body 裡，否則它們永遠掃不到。
    expect(body).toContain('font-weight: 650');
    expect(body).toContain('#ff0000');
    // 而 `:root` 自己的宣告仍要被排除，否則 token 定義會被當成違規。
    expect(body).not.toContain('--shell');

    const review = planTokenReview(
      sheets([{ name: 'styles.css', source, full: true }])
    );
    expect(review.violations.join('\n')).toContain('650');
    expect(review.violations.join('\n')).toContain('#ff0000');
  });

  // 區域性自訂屬性不是全域 token：`.word { --index: 0 }` 只在該選擇器內有效，
  // 把它登記成全域會讓「使用了未定義的 token」這條守衛跟著失準。
  it('does not treat scoped custom properties as global tokens', () => {
    const defined = definedTokens(
      ':root {\n  --global: 1;\n}\n\n.word {\n  --scoped: 0;\n}\n'
    );

    expect(defined.has('--global')).toBe(true);
    expect(defined.has('--scoped')).toBe(false);
  });

  // 引數要按括號深度切，不能 `split(',')`——目標寫法本身就有巢狀 `calc()`。
  it('splits function arguments by paren depth, not by comma', () => {
    expect(splitArguments('var(--a), calc(var(--b) + 2vw), var(--c)')).toEqual([
      'var(--a)',
      'calc(var(--b) + 2vw)',
      'var(--c)'
    ]);

    // 帶 fallback 的 var() 裡也有逗號。
    expect(splitArguments('var(--a, 1rem), 2vw')).toEqual([
      'var(--a, 1rem)',
      '2vw'
    ]);
  });

  describe('流體字級', () => {
    // 先前只要包進 clamp() 就整條免檢，於是官網 18 個端點只有 1 個在尺度上，
    // 而 gate 全綠。
    it('accepts endpoints on the scale with a scalable preferred value', () => {
      expect(
        reviewFontSizeClamp(
          'clamp(var(--text-2xl), calc(var(--text-2xl) * 0.5 + 2vw), var(--text-3xl))'
        )
      ).toBeNull();
      // 字面值只要落在尺度上也算數。
      expect(
        reviewFontSizeClamp('clamp(1rem, calc(1rem + 1vw), 1.44rem)')
      ).toBeNull();
    });

    it('rejects endpoints that are off the scale', () => {
      expect(
        reviewFontSizeClamp('clamp(2.6rem, calc(1rem + 4.6vw), 4rem)')
      ).toContain('最小值');
      expect(
        reviewFontSizeClamp('clamp(var(--text-md), calc(1rem + 2vw), 2.65rem)')
      ).toContain('最大值');
    });

    // W3C F94：純 viewport unit 當作主要的字級定義方式，文字可能無法隨使用者
    // 的文字大小設定放大。要求的是「可縮放基底 ＋ 流體單位」，不是禁用 vw。
    it('rejects a preferred value made only of viewport units', () => {
      expect(
        reviewFontSizeClamp('clamp(var(--text-2xl), 4.5vw, var(--text-3xl))')
      ).toContain('SC 1.4.4');
    });

    it('rejects px in the preferred value', () => {
      expect(
        reviewFontSizeClamp(
          'clamp(var(--text-md), calc(12px + 2vw), var(--text-lg))'
        )
      ).toContain('px');
    });

    // 解析不出來就失敗。沉默放行正是舊規則的問題。
    it('fails closed when it cannot parse three arguments', () => {
      expect(reviewFontSizeClamp('clamp(var(--text-md), 2vw)')).toContain(
        '無法判定就不放行'
      );
    });
  });
});
