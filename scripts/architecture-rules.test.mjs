import { describe, expect, it } from 'vitest';
import {
  forbiddenBrowserPatterns,
  importSpecifiers,
  isBareSpecifier,
  layerViolations,
  stripComments
} from './architecture-rules.mjs';

// 這道守衛擋的是型別檢查與單元測試都擋不住的東西：方向寫反的依賴、瀏覽器端偷偷
// 重寫一份 domain 規則。它自己失效時不會報錯——只會安靜地不再擋任何東西，然後
// 一路綠燈。以下每一個案例都對準一種「守衛還在、但已經不守了」的情境。

describe('stripComments', () => {
  it('removes line and block comments', () => {
    expect(stripComments('a; // 說明\nb;')).toBe('a; \nb;');
    expect(stripComments('a; /* 說明\n跨行 */ b;')).toBe('a;  b;');
  });

  // 剝掉字串會讓守衛漏掉真正寫在程式碼裡的規則，那是它唯一要抓的東西。
  it('keeps string contents, including comment-like text inside them', () => {
    expect(stripComments(`const s = '// 不是註解';`)).toBe(
      `const s = '// 不是註解';`
    );
    expect(stripComments('const s = "/* 也不是 */";')).toBe(
      'const s = "/* 也不是 */";'
    );
    expect(stripComments('const s = `模板 // 內`;')).toBe(
      'const s = `模板 // 內`;'
    );
  });

  it('does not end a string at an escaped quote', () => {
    expect(stripComments(`const s = 'a\\'b'; // 尾`)).toBe(
      `const s = 'a\\'b'; `
    );
  });

  it('leaves a division operator alone', () => {
    expect(stripComments('const half = total / 2;')).toBe(
      'const half = total / 2;'
    );
  });
});

describe('importSpecifiers', () => {
  it.each([
    ["import x from 'a';", 'a'],
    ["import { x } from 'b';", 'b'],
    ["export { x } from 'c';", 'c'],
    ["import 'd';", 'd'],
    ["const m = await import('e');", 'e'],
    ["import type { T } from 'f';", 'f']
  ])('finds the specifier in %s', (source, expected) => {
    expect(importSpecifiers(source)).toContain(expected);
  });

  // 註解裡的 import 字樣不是依賴。把它算進去會製造無法修的假違規。
  it('ignores import-like text inside comments', () => {
    expect(importSpecifiers("// import x from 'ghost';\n")).toEqual([]);
  });

  it('finds every specifier in a file, not just the first', () => {
    const source = ["import a from 'alpha';", "import b from 'beta';"].join(
      '\n'
    );
    expect(importSpecifiers(source)).toEqual(['alpha', 'beta']);
  });
});

describe('isBareSpecifier', () => {
  it.each(['./x', '../x', '/x'])('treats %s as relative', (specifier) => {
    expect(isBareSpecifier(specifier)).toBe(false);
  });

  it.each(['zod', 'node:fs', '@scope/pkg'])(
    'treats %s as bare',
    (specifier) => {
      expect(isBareSpecifier(specifier)).toBe(true);
    }
  );
});

describe('layerViolations', () => {
  const browser = {
    label: 'apps/web/public',
    allowedBare: [],
    why: '瀏覽器是原生 ESM，沒有解析裸名的打包器——裸名匯入會在使用者端 404。'
  };

  it('accepts relative imports', () => {
    const files = [{ path: 'a.js', source: "import x from './x.js';" }];
    expect(layerViolations(browser, files)).toEqual([]);
  });

  it('rejects a bare import and explains why the layer forbids it', () => {
    const files = [{ path: 'a.js', source: "import x from 'lodash';" }];
    const [violation] = layerViolations(browser, files);
    expect(violation.path).toBe('a.js');
    expect(violation.specifier).toBe('lodash');
    expect(violation.detail).toContain('404');
  });

  it('permits only the bare names the layer allows', () => {
    const contracts = { label: 'c', allowedBare: ['zod'], why: 'x' };
    const files = [
      { path: 'a.ts', source: "import { z } from 'zod';" },
      { path: 'b.ts', source: "import d from 'domain';" }
    ];
    expect(layerViolations(contracts, files).map((v) => v.specifier)).toEqual([
      'domain'
    ]);
  });

  it('treats a missing allowedBare list as allowing nothing', () => {
    const files = [{ path: 'a.ts', source: "import x from 'anything';" }];
    expect(layerViolations({ label: 'l', why: 'w' }, files)).toHaveLength(1);
  });

  it('reports every violating file, not only the first', () => {
    const files = [
      { path: 'a.js', source: "import x from 'one';" },
      { path: 'b.js', source: "import y from 'two';" }
    ];
    expect(layerViolations(browser, files)).toHaveLength(2);
  });
});

describe('forbiddenBrowserPatterns', () => {
  const rules = [
    { pattern: /timeZone:\s*['"]Asia\/Taipei['"]/u, detail: '寫死時區' }
  ];

  it('reports a rule rewritten in browser code', () => {
    const source = "const opts = { timeZone: 'Asia/Taipei' };";
    expect(forbiddenBrowserPatterns(source, rules)).toEqual(['寫死時區']);
  });

  // 一段解釋「為什麼要走 domain」的註解會引用到規則本身。把它判成違規，會讓人
  // 為了讓 gate 變綠而刪掉正確的說明——守衛因此變成扣分項。
  it('does not report the same text appearing only in a comment', () => {
    const source =
      "// 不要寫 timeZone: 'Asia/Taipei'，改用 taipei-time.js\nx();";
    expect(forbiddenBrowserPatterns(source, rules)).toEqual([]);
  });

  it('returns nothing for clean source', () => {
    expect(forbiddenBrowserPatterns('export const a = 1;', rules)).toEqual([]);
  });
});
