import { describe, expect, it } from 'vitest';
import {
  moduleGraphDepth,
  planBudgetReport
} from './check-performance-budget.mjs';

// 傳輸大小在正式執行是 gzip；測試改用原始位元組長度，讓每個斷言都是可算的數字。
const rawSize = { transferSizeOf: (content) => Buffer.byteLength(content) };

function html({ modules = [], preloads = [], styles = [] } = {}) {
  return [
    '<!doctype html><html><head>',
    ...preloads.map((path) => `<link rel="modulepreload" href="/${path}" />`),
    ...styles.map((path) => `<link rel="stylesheet" href="/${path}" />`),
    '</head><body>',
    ...modules.map((path) => `<script type="module" src="/${path}"></script>`),
    '</body></html>'
  ].join('\n');
}

describe('module graph depth', () => {
  it('counts a module declared directly in the HTML as depth one', () => {
    const files = new Map([
      ['index.html', html({ modules: ['app.js'] })],
      ['app.js', 'export const a = 1;']
    ]);

    expect(moduleGraphDepth('index.html', files)).toMatchObject({
      maxDepth: 1,
      moduleCount: 1
    });
  });

  // 深度就是「瀏覽器要連續發現幾輪才拿得到全部模組」，每一輪都是一次往返。
  it('counts an import chain as increasing depth', () => {
    const files = new Map([
      ['index.html', html({ modules: ['a.js'] })],
      ['a.js', "import './b.js';"],
      ['b.js', "import './c.js';"],
      ['c.js', 'export const c = 1;']
    ]);

    expect(moduleGraphDepth('index.html', files).maxDepth).toBe(3);
  });

  it('treats a preloaded module as discovered in the first round', () => {
    const files = new Map([
      ['index.html', html({ modules: ['a.js'], preloads: ['b.js'] })],
      ['a.js', "import './b.js';"],
      ['b.js', 'export const b = 1;']
    ]);

    const graph = moduleGraphDepth('index.html', files);

    expect(graph.maxDepth).toBe(1);
    expect(graph.unpreloaded).toEqual([]);
  });

  it('names the modules that are imported but never preloaded', () => {
    const files = new Map([
      ['index.html', html({ modules: ['a.js'] })],
      ['a.js', "import './b.js';"],
      ['b.js', 'export const b = 1;']
    ]);

    expect(moduleGraphDepth('index.html', files).unpreloaded).toEqual(['b.js']);
  });

  it('ignores an import that does not resolve to a built file', () => {
    const files = new Map([
      ['index.html', html({ modules: ['a.js'] })],
      ['a.js', "import 'https://cdn.example.com/x.js';"]
    ]);

    expect(moduleGraphDepth('index.html', files).moduleCount).toBe(1);
  });
});

describe('budget report', () => {
  const budgets = [
    {
      path: '*',
      justification: '實測值加兩成餘裕',
      resourceSizes: [{ resourceType: 'script', budget: 1 }],
      resourceCounts: [{ resourceType: 'script', budget: 2 }]
    }
  ];

  // 沒有理由的數字，下一個人只會直接調大它。這條規則讓預算必須自我解釋。
  it('rejects a budget that does not say where its numbers came from', () => {
    const files = new Map([
      ['index.html', html({ modules: ['a.js'] })],
      ['a.js', 'x']
    ]);

    const report = planBudgetReport(
      files,
      [
        {
          path: '*',
          resourceSizes: [{ resourceType: 'script', budget: 1 }],
          resourceCounts: [{ resourceType: 'script', budget: 2 }]
        }
      ],
      rawSize
    );

    expect(report.violations.join('\n')).toContain('justification');
  });

  it('passes an entry point inside its budget', () => {
    const files = new Map([
      ['index.html', html({ modules: ['a.js'] })],
      ['a.js', 'x']
    ]);

    const report = planBudgetReport(files, budgets, rawSize);

    expect(report.violations ?? []).toEqual([]);
  });

  // 預算以 KiB 計；超過就必須擋，否則預算只是註解。
  it('reports an entry point that exceeds its size budget', () => {
    const files = new Map([
      ['index.html', html({ modules: ['big.js'] })],
      ['big.js', 'x'.repeat(4096)]
    ]);

    const report = planBudgetReport(files, budgets, rawSize);

    expect(JSON.stringify(report)).toContain('big.js'.slice(0, 3));
    expect(report.violations.length).toBeGreaterThan(0);
  });

  it('reports a reference that resolves to no built file', () => {
    const files = new Map([['index.html', html({ modules: ['missing.js'] })]]);

    const report = planBudgetReport(files, budgets, rawSize);

    expect(JSON.stringify(report)).toContain('missing.js');
  });

  // 2026-08-02：官網 12 張素材裡有 9 張只被 JS 用字串常數指到，那些位元組先前
  // 對這道預算完全隱形——頁面下載 2.2 MB，gate 只看到 522 KiB 而且全綠。
  it('counts an image that only a script references by string', () => {
    const files = new Map([
      ['index.html', html({ modules: ['a.js'] })],
      ['a.js', "export const card = { image: '/clinic-assets/doctor.webp' };"],
      ['clinic-assets/doctor.webp', 'x'.repeat(4096)]
    ]);

    const report = planBudgetReport(
      files,
      [
        {
          path: '*',
          justification: '實測值加兩成餘裕',
          resourceSizes: [{ resourceType: 'image', budget: 1 }]
        }
      ],
      rawSize
    );

    expect(report.entries[0].counts.get('image')).toBe(1);
    expect(report.violations.join('\n')).toContain('image');
  });

  // 反面：導覽目標不是子資源。`/booking` 由 Hosting rewrite 對應到別的頁面，
  // 把它當成缺失的資源會讓 gate 為了一個根本不存在的檔案而紅燈。
  it('ignores an extension-less route string in a script', () => {
    const files = new Map([
      ['index.html', html({ modules: ['a.js'] })],
      ['a.js', "export const BOOKING_PATH = '/booking';"]
    ]);

    const report = planBudgetReport(files, budgets, rawSize);

    expect(report.violations ?? []).toEqual([]);
  });

  it('walks the transitive closure rather than only direct references', () => {
    const files = new Map([
      ['index.html', html({ modules: ['a.js'] })],
      ['a.js', "import './b.js';"],
      ['b.js', 'x'.repeat(4096)]
    ]);

    const report = planBudgetReport(files, budgets, rawSize);

    expect(report.violations.length).toBeGreaterThan(0);
  });

  it('prefers an exact path budget over the wildcard budget', () => {
    const files = new Map([
      ['index.html', html({ modules: ['a.js'] })],
      ['a.js', 'x'.repeat(4096)]
    ]);

    const generous = planBudgetReport(
      files,
      [
        ...budgets,
        {
          path: '/index.html',
          justification: '這一頁刻意允許較大的載荷',
          resourceSizes: [{ resourceType: 'script', budget: 100 }],
          resourceCounts: [{ resourceType: 'script', budget: 100 }]
        }
      ],
      rawSize
    );

    expect(generous.violations ?? []).toEqual([]);
  });
});
