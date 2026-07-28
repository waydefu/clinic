import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// @ts-expect-error — the budget script is plain ESM with no type declarations.
import {
  moduleGraphDepth,
  planBudgetReport
} from '../../../scripts/check-performance-budget.mjs';

type Files = Map<string, string>;

interface BudgetEntry {
  path: string;
  justification?: string;
  resourceSizes?: { resourceType: string; budget: number }[];
  resourceCounts?: { resourceType: string; budget: number }[];
  timings?: { metric: string; budget: number }[];
  moduleGraph?: { maxDiscoveryDepth: number };
}

interface Report {
  entries: {
    path: string;
    resources: string[];
    sizes: Map<string, number>;
    counts: Map<string, number>;
  }[];
  violations: string[];
}

// 一個縮小但形狀完整的 dist：兩個 HTML 進入點、共用的 CSS、一條模組鏈、一張圖，
// 外加一個沒有任何頁面參照的孤兒模組（不該被算進任何進入點）。
function sampleFiles(): Files {
  return new Map<string, string>([
    [
      'index.html',
      '<link rel="stylesheet" href="/styles.css" />' +
        '<link rel="icon" href="/favicon.svg" />' +
        '<a href="/patient.html">往患者頁</a>' +
        '<script type="module" src="/app.js"></script>'
    ],
    ['patient.html', '<link rel="stylesheet" href="/styles.css" />'],
    ['styles.css', ':root{color:green}'],
    ['app.js', "import { greet } from './modules/greet.js';\ngreet();\n"],
    ['modules/greet.js', "export const greet = () => 'clinic';\n"],
    ['modules/orphan.js', "export const unused = 'x'.repeat(10_000);\n"],
    ['favicon.svg', '<svg></svg>']
  ]);
}

// 測試用的「傳輸大小」＝原始位元組，讓斷言可以直接用字串長度算，
// 不必去猜 gzip 的輸出長度。
const rawBytes = {
  transferSizeOf: (content: string) => Buffer.byteLength(content)
};

const generousBudget: BudgetEntry[] = [
  {
    path: '*',
    justification: '測試夾具',
    resourceSizes: [{ resourceType: 'total', budget: 1024 }]
  }
];

function report(files: Files, budgets: BudgetEntry[] = generousBudget): Report {
  return planBudgetReport(files, budgets, rawBytes) as Report;
}

function entryOf(result: Report, path: string) {
  const entry = result.entries.find((candidate) => candidate.path === path);
  if (entry === undefined) throw new Error(`no entry for ${path}`);
  return entry;
}

describe('planBudgetReport', () => {
  it('walks the transitive subresource graph of each html entry point', () => {
    const index = entryOf(report(sampleFiles()), '/index.html');

    expect(index.resources).toEqual([
      'app.js',
      'favicon.svg',
      'index.html',
      'modules/greet.js',
      'styles.css'
    ]);
    expect(index.counts.get('script')).toBe(2);
    expect(index.counts.get('stylesheet')).toBe(1);
    expect(index.counts.get('image')).toBe(1);
    expect(index.counts.get('document')).toBe(1);
  });

  it('counts a link to another page as navigation, not as a subresource', () => {
    const files = sampleFiles();
    // 對外網址可以沒有副檔名（/booking 由 Hosting rewrite 對應到 patient.html）。
    // 那仍然是導覽，不是這一頁要下載的東西。
    files.set(
      'index.html',
      `${files.get('index.html') ?? ''}<a href="/booking">預約</a>`
    );
    const result = report(files);

    // index.html 連到 patient.html，但那是導覽，不該把患者頁的重量算進來。
    expect(entryOf(result, '/index.html').resources).not.toContain(
      'patient.html'
    );
    expect(entryOf(result, '/index.html').resources).not.toContain('booking');
    // 而且不得因此被誤判成「參照了不存在的資源」。
    expect(result.violations).toEqual([]);
    expect(entryOf(result, '/patient.html').resources).toEqual([
      'patient.html',
      'styles.css'
    ]);
  });

  it('ignores files no entry point reaches', () => {
    const result = report(sampleFiles());

    for (const entry of result.entries) {
      expect(entry.resources).not.toContain('modules/orphan.js');
    }
  });

  it('sums transfer bytes per resource type and in total', () => {
    const files = sampleFiles();
    const index = entryOf(report(files), '/index.html');

    const scriptBytes =
      Buffer.byteLength(files.get('app.js') ?? '') +
      Buffer.byteLength(files.get('modules/greet.js') ?? '');
    expect(index.sizes.get('script')).toBe(scriptBytes);
    expect(index.sizes.get('total')).toBe(
      [...index.resources].reduce(
        (total, path) => total + Buffer.byteLength(files.get(path) ?? ''),
        0
      )
    );
  });

  it('reports a size overrun in KiB against the matching budget', () => {
    const files = sampleFiles();
    files.set('app.js', `export const big = '${'x'.repeat(3 * 1024)}';\n`);

    const { violations } = report(files, [
      {
        path: '/index.html',
        justification: '測試夾具',
        resourceSizes: [{ resourceType: 'script', budget: 1 }]
      },
      { path: '*', justification: '測試夾具', resourceSizes: [] }
    ]);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('/index.html');
    expect(violations[0]).toContain('script');
    expect(violations[0]).toContain('1 KiB');
  });

  it('reports a request-count overrun', () => {
    const { violations } = report(sampleFiles(), [
      {
        path: '*',
        justification: '測試夾具',
        resourceCounts: [{ resourceType: 'script', budget: 1 }]
      }
    ]);

    expect(violations).toEqual([
      expect.stringContaining('/index.html: script 請求數 2 超過預算 1')
    ]);
  });

  // 2026-07-27（自動檢查缺口 F-5）：「預算調高必須留下理由與實測」先前只寫在
  // 品質把關文件的表格裡，靠人記得去補。於是「改一個數字讓 CI 變綠」與「說明
  // 為什麼」之間沒有任何強制關係。
  it('fails a budget that does not say where its numbers came from', () => {
    const { violations } = report(sampleFiles(), [
      { path: '*', resourceSizes: [{ resourceType: 'total', budget: 1024 }] }
    ]);

    expect(violations).toEqual([
      expect.stringContaining('/index.html: 預算沒有 justification'),
      expect.stringContaining('/patient.html: 預算沒有 justification')
    ]);
  });

  it('rejects a blank justification, not just a missing one', () => {
    const { violations } = report(sampleFiles(), [
      { path: '*', justification: '   ', resourceSizes: [] }
    ]);

    expect(violations).toHaveLength(2);
    expect(violations[0]).toContain('預算沒有 justification');
  });

  it('fails a page that has no budget rather than passing it silently', () => {
    const { violations } = report(sampleFiles(), [
      { path: '/index.html', justification: '測試夾具', resourceSizes: [] }
    ]);

    expect(violations).toEqual([
      expect.stringContaining('/patient.html: 沒有對應的效能預算')
    ]);
  });

  it('fails when a page references an asset the build did not emit', () => {
    const files = sampleFiles();
    files.set(
      'index.html',
      '<script type="module" src="/missing.js"></script>'
    );

    const { violations } = report(files);

    expect(violations).toEqual([
      expect.stringContaining('/index.html: 參照了 dist 裡不存在的資源')
    ]);
  });
});

describe('the shipped performance budget', () => {
  const budgets = JSON.parse(
    readFileSync(new URL('../performance-budget.json', import.meta.url), 'utf8')
  ) as BudgetEntry[];

  it('gives every shipped page a total-weight ceiling', () => {
    // 每一個會出貨的 HTML 進入點都必須在這裡：沒有預算的頁面 check:perf 會直接
    // fail，所以這張清單同時也是「新增對外頁面時不要忘了訂上限」的提醒。
    expect(budgets.map((budget) => budget.path)).toEqual([
      '/patient.html',
      '/index.html',
      '/clinic.html',
      '/privacy.html',
      '/404.html'
    ]);
    for (const budget of budgets) {
      expect(budget.resourceSizes?.map((size) => size.resourceType)).toContain(
        'total'
      );
      // 每個數字都要說得出它是怎麼來的（F-5）。
      expect(budget.justification?.trim()).toBeTruthy();
    }
  });

  it('keeps web-font weight at zero until a font decision is recorded', () => {
    // roadmap 的公開問題：Noto Sans TC 目前沒有實際載入。預算訂為 0 KiB，
    // 任何人加字型都會撞到這個 gate，變成一次刻意的決定而不是悄悄的迴歸。
    for (const budget of budgets) {
      const font = budget.resourceSizes?.find(
        (size) => size.resourceType === 'font'
      );
      expect(font?.budget).toBe(0);
    }
  });

  it('carries the timing budgets the browser test enforces', () => {
    for (const path of ['/patient.html', '/index.html', '/clinic.html']) {
      const timings = budgets.find((budget) => budget.path === path)?.timings;
      expect(timings?.map((timing) => timing.metric)).toEqual([
        'first-contentful-paint',
        'largest-contentful-paint',
        'cumulative-layout-shift'
      ]);
    }
  });

  // per-entry bundling 已否決（逐檔可讀性優先），所以 modulepreload 是請求瀑布的
  // 永久解法，不是過渡手段。既然沒有後續改動會再壓低請求數，深度就必須有閘門。
  it('requires every module entry point to be one round trip deep', () => {
    for (const path of ['/patient.html', '/index.html', '/clinic.html']) {
      const entry = budgets.find((budget) => budget.path === path);
      expect(entry?.moduleGraph?.maxDiscoveryDepth).toBe(1);
    }
  });
});

// 往返深度是位元組與請求數都看不見的那一維：31 個模組分 5 波與分 1 波下載，
// 位元組一樣、請求數一樣，但前者先付掉 4 趟 RTT 才開始執行。
describe('moduleGraphDepth', () => {
  function graphFiles(preloads: string[]): Files {
    return new Map<string, string>([
      [
        'index.html',
        `<head>${preloads
          .map((href) => `<link rel="modulepreload" href="${href}" />`)
          .join('')}</head>` +
          '<body><script type="module" src="/app.js"></script></body>'
      ],
      ['app.js', "import './mid.js';\n"],
      ['mid.js', "import './leaf.js';\n"],
      ['leaf.js', 'export const leaf = 1;\n']
    ]);
  }

  it('reports the natural depth when nothing is preloaded', () => {
    const graph = moduleGraphDepth('index.html', graphFiles([]));
    // app（script 標籤）→ mid → leaf：三趟連續往返。
    expect(graph.maxDepth).toBe(3);
    expect(graph.unpreloaded).toEqual(['leaf.js', 'mid.js']);
  });

  it('collapses to one round trip once the whole graph is declared', () => {
    const graph = moduleGraphDepth(
      'index.html',
      graphFiles(['/app.js', '/mid.js', '/leaf.js'])
    );
    expect(graph.maxDepth).toBe(1);
    expect(graph.unpreloaded).toEqual([]);
    expect(graph.moduleCount).toBe(3);
  });

  // 漏掉一個就退回兩趟——這正是這個檢查要抓的迴歸形狀。
  it('names the modules a missing preload pushed into a second trip', () => {
    const graph = moduleGraphDepth(
      'index.html',
      graphFiles(['/app.js', '/mid.js'])
    );
    expect(graph.maxDepth).toBe(2);
    expect(graph.unpreloaded).toEqual(['leaf.js']);
  });

  it('reports depth zero for a page with no modules at all', () => {
    const graph = moduleGraphDepth(
      '404.html',
      new Map([['404.html', '<head></head><body>gone</body>']])
    );
    expect(graph.maxDepth).toBe(0);
    expect(graph.moduleCount).toBe(0);
  });
});
