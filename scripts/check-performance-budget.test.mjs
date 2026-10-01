import { describe, expect, it } from 'vitest';
import {
  DEFERRED_BUSINESS_ASSET_SOURCES,
  moduleGraphDepth,
  planBudgetReport,
  planDeferredBusinessAssetReport
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

  // 反面：OG 分享圖不是這一頁的子資源。訪客的瀏覽器從不請求它——抓它的是社群
  // 平台的爬蟲，抓完快取在平台那邊。把它算進 image 桶會逼人為了沒有訪客下載的
  // 位元組去調高一個面向訪客的預算，那個數字從此不代表任何事。
  //
  // 它的體積由 check-web-ui.mjs 依 og-booking.metadata.json 的 maxBytes 守。
  // 完整理由見 check-performance-budget.mjs 裡 HTML_REFERENCE 底下的排除說明。
  it('leaves a meta og:image out of the page transfer weight', () => {
    const files = new Map([
      [
        'index.html',
        `${html({ modules: ['a.js'] })}<meta property="og:image" content="/og-booking.jpg" />`
      ],
      ['a.js', 'export const a = 1;'],
      ['og-booking.jpg', 'x'.repeat(60000)]
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

    expect(report.entries[0].counts.get('image')).toBeUndefined();
    expect(report.entries[0].resources).not.toContain('og-booking.jpg');
    expect(report.violations).toEqual([]);
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

function deferredBusinessFixture() {
  const manifest = Object.fromEntries(
    DEFERRED_BUSINESS_ASSET_SOURCES.map((sourcePath) => {
      const dot = sourcePath.lastIndexOf('.');
      return [
        sourcePath,
        `built/${sourcePath.slice(0, dot)}.fixture${sourcePath.slice(dot)}`
      ];
    })
  );
  const client = manifest['calendar-pilot-client.js'];
  const stylesheet = manifest['calendar-pilot.css'];
  const reauth = manifest['modules/business-reauth.js'];
  const businessView = manifest['modules/business-view.js'];
  const files = new Map([
    ['index.html', html({ modules: ['app.js'] })],
    ['app.js', "import './shared.js';"],
    ['shared.js', 'export const shared = 1;'],
    [client, "import '../shared.js'; import './client-dependency.js';"],
    ['built/client-dependency.js', 'export const client = 1;'],
    [stylesheet, "body { background: url('./texture.svg'); }"],
    ['built/texture.svg', '<svg></svg>'],
    [
      reauth,
      "import('../calendar-pilot-client.fixture.js'); import('../../shared.js');"
    ],
    [businessView, "import '../../shared.js'; import './business-helper.js';"],
    ['built/modules/business-helper.js', 'export const helper = 1;']
  ]);
  return {
    files,
    manifest,
    config: {
      budgetBytes: 68 * 1024,
      justification: 'New conservative deferred business asset ceiling.'
    },
    businessView,
    businessHelper: 'built/modules/business-helper.js'
  };
}

describe('deferred business asset budget', () => {
  it('accepts the inclusive 68 KiB limit and excludes initial/shared resources', () => {
    const fixture = deferredBusinessFixture();
    const initial = planDeferredBusinessAssetReport(
      fixture.files,
      fixture.manifest,
      fixture.config,
      { ...rawSize, featurePresent: true }
    );
    const otherDeferredBytes =
      initial.bytes -
      Buffer.byteLength(fixture.files.get(fixture.businessHelper));
    fixture.files.set(
      fixture.businessHelper,
      'x'.repeat(fixture.config.budgetBytes - otherDeferredBytes)
    );

    const report = planDeferredBusinessAssetReport(
      fixture.files,
      fixture.manifest,
      fixture.config,
      rawSize
    );

    expect(report.bytes).toBe(68 * 1024);
    expect(report.violations).toEqual([]);
    expect(report.resources).not.toContain('shared.js');
    expect(report.resources).toContain('built/texture.svg');
    expect(
      report.resources.filter(
        (path) => path === fixture.manifest['calendar-pilot-client.js']
      )
    ).toHaveLength(1);
    expect(
      report.resources.filter(
        (path) => path === 'built/modules/business-helper.js'
      )
    ).toHaveLength(1);
  });

  it('rejects a deferred aggregate one byte above its configured ceiling', () => {
    const fixture = deferredBusinessFixture();
    const initial = planDeferredBusinessAssetReport(
      fixture.files,
      fixture.manifest,
      fixture.config,
      rawSize
    );
    const otherDeferredBytes =
      initial.bytes -
      Buffer.byteLength(fixture.files.get(fixture.businessHelper));
    fixture.files.set(
      fixture.businessHelper,
      'x'.repeat(fixture.config.budgetBytes + 1 - otherDeferredBytes)
    );
    const report = planDeferredBusinessAssetReport(
      fixture.files,
      fixture.manifest,
      fixture.config,
      rawSize
    );

    expect(report.bytes).toBe(68 * 1024 + 1);
    expect(report.violations.join('\n')).toContain(
      'exceeding the 69632-byte ceiling'
    );
  });

  it('fails closed when the L3 feature exists but the build manifest is missing', () => {
    const fixture = deferredBusinessFixture();
    const report = planDeferredBusinessAssetReport(
      fixture.files,
      undefined,
      fixture.config,
      rawSize
    );

    expect(report.violations.join('\n')).toContain(
      'asset-manifest.json is missing'
    );
  });

  it('fails closed when a required root has no exact manifest mapping', () => {
    const fixture = deferredBusinessFixture();
    delete fixture.manifest['modules/business-view.js'];
    const report = planDeferredBusinessAssetReport(
      fixture.files,
      fixture.manifest,
      fixture.config,
      rawSize
    );

    expect(report.violations.join('\n')).toContain(
      'no safe exact mapping for modules/business-view.js'
    );
  });

  it('fails closed when the deferred budget config is missing', () => {
    const fixture = deferredBusinessFixture();
    const report = planDeferredBusinessAssetReport(
      fixture.files,
      fixture.manifest,
      undefined
    );

    expect(report.violations.join('\n')).toContain(
      'deferred-asset-budget.json is missing'
    );
  });

  it('fails closed when the feature is in the manifest but its budget config is missing', () => {
    const fixture = deferredBusinessFixture();
    const report = planDeferredBusinessAssetReport(
      fixture.files,
      fixture.manifest,
      undefined,
      rawSize
    );

    expect(report.violations.join('\n')).toContain(
      'deferred-asset-budget.json is missing'
    );
  });

  it('fails closed when a manifest-mapped root file is absent from dist', () => {
    const fixture = deferredBusinessFixture();
    fixture.manifest['calendar-pilot.css'] = 'built/missing.fixture.css';
    const report = planDeferredBusinessAssetReport(
      fixture.files,
      fixture.manifest,
      fixture.config,
      rawSize
    );

    expect(report.violations.join('\n')).toContain(
      'mapped asset calendar-pilot.css'
    );
  });

  it('fails closed when a deferred dependency is missing from dist', () => {
    const fixture = deferredBusinessFixture();
    fixture.files.set(
      fixture.businessView,
      "import './missing-dependency.js';"
    );
    const report = planDeferredBusinessAssetReport(
      fixture.files,
      fixture.manifest,
      fixture.config,
      rawSize
    );

    expect(report.violations.join('\n')).toContain(
      'references a missing dist resource'
    );
  });

  it('includes quoted and nested CSS imports in the aggregate gzip budget', () => {
    const fixture = deferredBusinessFixture();
    fixture.files.set(
      fixture.manifest['calendar-pilot.css'],
      "@import './existing.abc123.css';"
    );
    fixture.files.set(
      'built/existing.abc123.css',
      "@import './nested.456def.css';"
    );
    fixture.files.set('built/nested.456def.css', 'x'.repeat(69633));

    const report = planDeferredBusinessAssetReport(
      fixture.files,
      fixture.manifest,
      fixture.config,
      rawSize
    );

    expect(report.resources).toContain('built/existing.abc123.css');
    expect(report.resources).toContain('built/nested.456def.css');
    expect(report.violations.join('\n')).toContain(
      'exceeding the 69632-byte ceiling'
    );
  });

  it('does not count the same CSS import twice when it also appears in url()', () => {
    const fixture = deferredBusinessFixture();
    fixture.files.set(
      fixture.manifest['calendar-pilot.css'],
      "@import url('./existing.abc123.css'); body { background: url('./existing.abc123.css'); }"
    );
    fixture.files.set(
      'built/existing.abc123.css',
      '.existing { display: block; }'
    );

    const report = planDeferredBusinessAssetReport(
      fixture.files,
      fixture.manifest,
      fixture.config,
      rawSize
    );

    expect(
      report.resources.filter((path) => path === 'built/existing.abc123.css')
    ).toHaveLength(1);
  });

  it('fails closed when a CSS import target is missing from dist', () => {
    const fixture = deferredBusinessFixture();
    fixture.files.set(
      fixture.manifest['calendar-pilot.css'],
      "@import './missing.abc123.css';"
    );

    const report = planDeferredBusinessAssetReport(
      fixture.files,
      fixture.manifest,
      fixture.config,
      rawSize
    );

    expect(report.violations.join('\n')).toContain('missing.abc123.css');
  });

  it('includes dynamic imports in the deferred resource closure', () => {
    const fixture = deferredBusinessFixture();
    fixture.files.set(
      fixture.manifest['modules/business-reauth.js'],
      "import('./missing-lazy-dependency.js'); import('../../shared.js');"
    );
    const report = planDeferredBusinessAssetReport(
      fixture.files,
      fixture.manifest,
      fixture.config,
      rawSize
    );

    expect(report.violations.join('\n')).toContain(
      'missing-lazy-dependency.js'
    );
  });

  it('fails closed for comment-separated static, from, and dynamic imports', () => {
    const fixture = deferredBusinessFixture();
    fixture.files.set(
      fixture.businessView,
      "import /* side effect */ './missing-static.js'; import { value } /* imported names */ from /* target */ './missing-from.js'; import /* dynamic */ ('./missing-dynamic.js');"
    );

    const report = planDeferredBusinessAssetReport(
      fixture.files,
      fixture.manifest,
      fixture.config,
      rawSize
    );
    const violations = report.violations.join('\n');

    expect(violations).toContain('missing-static.js');
    expect(violations).toContain('missing-from.js');
    expect(violations).toContain('missing-dynamic.js');
  });

  it('fails closed when the deferred budget config is incomplete or relaxes 68 KiB', () => {
    const fixture = deferredBusinessFixture();
    const incomplete = planDeferredBusinessAssetReport(
      fixture.files,
      fixture.manifest,
      { budgetBytes: fixture.config.budgetBytes },
      rawSize
    );
    const relaxed = planDeferredBusinessAssetReport(
      fixture.files,
      fixture.manifest,
      {
        ...fixture.config,
        budgetBytes: fixture.config.budgetBytes + 1
      },
      rawSize
    );

    expect(incomplete.violations.join('\n')).toContain('justification');
    expect(relaxed.violations.join('\n')).toContain('no greater than 69632');
  });

  it('has no deferred group on a branch without the business-view feature', () => {
    const report = planDeferredBusinessAssetReport(
      new Map([['index.html', '<section id="case-section"></section>']]),
      undefined,
      undefined,
      { featurePresent: false, ...rawSize }
    );

    expect(report).toMatchObject({ active: false, bytes: 0, violations: [] });
  });

  it('activates the gate for an unquoted business section id', () => {
    const files = new Map([
      ['index.html', '<section id=business-section></section>']
    ]);
    const report = planDeferredBusinessAssetReport(files, undefined, undefined);

    expect(report.active).toBe(true);
    expect(report.violations.join('\n')).toContain(
      'asset-manifest.json is missing'
    );
    expect(report.violations.join('\n')).toContain(
      'deferred-asset-budget.json is missing'
    );
  });
});
