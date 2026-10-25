import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import * as adapter from './build-web.mjs';
import {
  cssAssetReferences,
  planHashedBuild,
  resolveCssReference
} from './web-build-planner.mjs';

const configuration = { inventory: { pages: [] }, registerText: '' };
const plan = (files, options = {}) =>
  planHashedBuild(files, { ...configuration, ...options });
const sha = (text) =>
  createHash('sha256').update(text).digest('hex').slice(0, 10);
const roots = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
function cssOutput(result, source) {
  return String(result.outputs.get(result.manifest.get(source)));
}
function expectCoherentCss(result) {
  let local = 0;
  for (const [path, content] of result.outputs) {
    if (!path.endsWith('.css')) continue;
    expect(String(content)).not.toContain('@scc:');
    for (const ref of cssAssetReferences(String(content))) {
      const target = resolveCssReference(path, ref.value);
      if (target === undefined) continue;
      local += 1;
      expect(result.outputs.has(target.path), `${path} -> ${target.path}`).toBe(
        true
      );
    }
  }
  expect(local).toBeGreaterThan(0);
}

describe('explicit planner boundary', () => {
  it('imports and plans in isolation with no repository configuration files', () => {
    const root = mkdtempSync(
      join(
        process.env.TMPDIR ?? process.env.RUNNER_TEMP ?? tmpdir(),
        'web-planner-'
      )
    );
    roots.push(root);
    const file = join(root, 'planner.mjs');
    copyFileSync(
      fileURLToPath(new URL('./web-build-planner.mjs', import.meta.url)),
      file
    );
    const script = `
      const { planHashedBuild } = await import(${JSON.stringify(pathToFileURL(file).href)});
      const result = planHashedBuild(new Map([['style.css', '.x{color:blue}']]), { inventory: { pages: [] }, registerText: '' });
      if (result.outputs.size !== 1 || !result.manifest.has('style.css')) throw new Error('empty plan');
      console.log('ISOLATED_PLANNER_PASS');
    `;
    const child = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', script],
      { cwd: root, encoding: 'utf8', timeout: 15000 }
    );
    expect(child.error).toBeUndefined();
    expect(child.status, child.stderr).toBe(0);
    expect(child.stdout.trim()).toBe('ISOLATED_PLANNER_PASS');
    expect(child.stderr).toBe('');
  });

  it('requires explicit inventory/register rather than guessing canonical policy', () => {
    expect(() => planHashedBuild(new Map())).toThrow(
      /explicit decision register/
    );
    expect(() => planHashedBuild(new Map(), { registerText: '' })).toThrow(
      /pages array/
    );
  });

  it('keeps compatibility exports/default configuration in the legacy adapter', () => {
    const files = new Map([
      ['a.js', 'export const a = 1;'],
      ['style.css', '.a{color:blue}']
    ]);
    const explicit = planHashedBuild(files, {
      inventory: adapter.PUBLIC_PAGE_INVENTORY,
      registerText: adapter.DECISION_REGISTER_TEXT,
      globalRelease: process.env.WEB_PUBLIC_INDEXABLE === 'true'
    });
    expect(adapter.planHashedBuild(files)).toEqual(explicit);
    expect(adapter.PUBLIC_INDEXABLE_ENTRIES).toEqual(
      adapter.indexableEntriesFromPublicPages(adapter.PUBLIC_PAGE_INVENTORY)
    );
    for (const name of [
      'readDecisionApproval',
      'listRegisterDecisions',
      'pagePublishDecision',
      'publishDecisionsForInventory'
    ])
      expect(typeof adapter[name]).toBe('function');
  });

  it('derives test labels and publication from the same explicit inventory', () => {
    const page =
      '<head><title>Example</title><meta name="robots" content="noindex, nofollow"/><link rel="canonical" href="https://example.invalid/alpha"/></head>';
    const files = new Map([
      ['alpha.html', page],
      [
        'sitemap.xml',
        '<urlset><url><loc>https://example.invalid/alpha</loc></url></urlset>'
      ]
    ]);
    const inventory = {
      pages: [
        { entry: 'alpha.html', indexable: true, requiresDecision: 'D-998' }
      ]
    };
    const pending =
      '| D-998 | Synthetic decision | Synthetic owner | pending |';
    const preview = plan(files, { inventory, registerText: pending });
    expect(preview.outputs.get('alpha.html')).toContain('【測試用】');
    expect(preview.outputs.get('alpha.html')).toContain('noindex');
    const denied = plan(files, {
      inventory,
      registerText: pending,
      globalRelease: true
    });
    expect(denied.outputs.get('alpha.html')).toContain('noindex');
    expect(denied.outputs.get('sitemap.xml')).not.toContain('<loc>');
    const released = plan(files, {
      inventory,
      registerText: pending.replace('pending', 'approved'),
      globalRelease: true
    });
    expect(released.outputs.get('alpha.html')).not.toContain('noindex');
    expect(released.outputs.get('sitemap.xml')).toContain(
      '<loc>https://example.invalid/alpha</loc>'
    );
  });

  it('preserves no-dependency CSS and JS-only content hash inputs', () => {
    const css = '.plain{color:blue}';
    const leaf = 'export const leaf = 1;';
    const leafHash = sha(`leaf.js\u0000${leaf}`);
    const entry = 'import "./leaf.js";';
    const rewritten = `import "./leaf.${leafHash}.js";`;
    const result = plan(
      new Map([
        ['plain.css', css],
        ['entry.js', entry],
        ['leaf.js', leaf]
      ])
    );
    expect(result.manifest.get('plain.css')).toBe(`plain.${sha(css)}.css`);
    expect(result.manifest.get('leaf.js')).toBe(`leaf.${leafHash}.js`);
    expect(result.manifest.get('entry.js')).toBe(
      `entry.${sha(`entry.js\u0000${rewritten}`)}.js`
    );
  });
});

describe('CSS emitted-reference graph', () => {
  it('recognizes escaped import and URL identifiers without matching identifier suffixes', () => {
    const files = new Map([
      [
        'root.css',
        String.raw`@\69 mport "./leaf.css"; .x{background:u\72 l("./leaf.css")}`
      ],
      ['leaf.css', '.leaf{color:green}']
    ]);
    const result = plan(files);
    expect(cssOutput(result, 'root.css')).toContain(
      posix.basename(result.manifest.get('leaf.css'))
    );
    expectCoherentCss(result);
  });

  it('does not treat at-rule predicates or namespaces as fetched resources', () => {
    const css =
      '@namespace url("./namespace"); @supports (background:url(missing.png)){.x{color:blue}} .x{--opaque:myéurl(missing.png)}';
    expect(cssOutput(plan(new Map([['root.css', css]])), 'root.css')).toBe(css);
  });
  it.each([
    '@import "./nested/leaf.css";',
    '@import url("./nested/leaf.css?v=1#part");',
    '@import url(./nested/leaf.css?v=1#part);',
    '@import "/styles/nested/leaf.css?v=1#part";',
    '.x{background:url("./nested/leaf.css?v=1#part")}',
    String.raw`@import "./nested/leaf\2e css";`
  ])('rewrites local references to emitted assets: %s', (source) => {
    const files = new Map([
      ['styles/root.css', source],
      ['styles/nested/leaf.css', '.leaf{color:green}']
    ]);
    const result = plan(files);
    expectCoherentCss(result);
    expect(cssOutput(result, 'styles/root.css')).toContain(
      posix.basename(result.manifest.get('styles/nested/leaf.css'))
    );
    if (source.includes('?v=1#part'))
      expect(cssOutput(result, 'styles/root.css')).toContain('?v=1#part');
    expect(result.outputs.has('styles/nested/leaf.css')).toBe(false);
  });

  it('propagates a transitive CSS leaf change through root and lazy JS loader', () => {
    const files = new Map([
      ['entry.js', 'const sheet={};sheet.href="./root.css";'],
      ['root.css', '@import "./nested/middle.css";'],
      ['nested/middle.css', '@import "./leaf.css";'],
      ['nested/leaf.css', '.leaf{color:green}']
    ]);
    const before = plan(files);
    const changed = new Map(files);
    changed.set('nested/leaf.css', '.leaf{color:purple}');
    const after = plan(changed);
    for (const path of files.keys())
      expect(after.manifest.get(path)).not.toBe(before.manifest.get(path));
    expectCoherentCss(after);
    expect(String(after.outputs.get(after.manifest.get('entry.js')))).toContain(
      posix.basename(after.manifest.get('root.css'))
    );
  });

  it('preserves binary paths/bytes but includes their content in dependent CSS hashes', () => {
    const binary = Buffer.from([0, 255, 3, 128]);
    const files = new Map([
      ['root.css', '.x{background:url("./image%20name.svg?v=1#part")}'],
      ['image name.svg', binary]
    ]);
    const before = plan(files);
    expect(before.manifest.get('image name.svg')).toBe('image name.svg');
    expect(before.outputs.get('image name.svg')).toBe(binary);
    expect(cssOutput(before, 'root.css')).toBe(files.get('root.css'));
    const changed = new Map(files);
    changed.set('image name.svg', Buffer.from([0, 254, 3, 128]));
    expect(plan(changed).manifest.get('root.css')).not.toBe(
      before.manifest.get('root.css')
    );
    expectCoherentCss(before);
  });

  it('handles cycles and self-references deterministically without placeholders in output', () => {
    const files = new Map([
      ['a.css', '@import "./b.css?v#part";'],
      ['b.css', '@import "./a.css";.x{color:green}'],
      ['self.css', '@import url("./self.css?self#part");']
    ]);
    const before = plan(files);
    const reordered = plan(new Map([...files].reverse()));
    expect([...before.manifest].sort()).toEqual([...reordered.manifest].sort());
    expectCoherentCss(before);
    const changed = new Map(files);
    changed.set('b.css', '@import "./a.css";.x{color:purple}');
    const after = plan(changed);
    expect(after.manifest.get('a.css')).not.toBe(before.manifest.get('a.css'));
    expect(after.manifest.get('b.css')).not.toBe(before.manifest.get('b.css'));
    expect(after.manifest.get('self.css')).toBe(
      before.manifest.get('self.css')
    );
  });

  it('keeps modulepreload restricted to static JS, not dynamic JS or CSS', () => {
    const files = new Map([
      [
        'index.html',
        '<head></head><script type="module" src="/entry.js"></script>'
      ],
      [
        'entry.js',
        'import "./static.js"; import("./dynamic.js"); const sheet={};sheet.href="./root.css";'
      ],
      ['static.js', 'export const ready=true;'],
      ['dynamic.js', 'export const deferred=true;'],
      ['root.css', '@import "./leaf.css";'],
      ['leaf.css', '.leaf{color:green}']
    ]);
    const result = plan(files);
    const html = String(result.outputs.get('index.html'));
    const preloads = [
      ...html.matchAll(/rel="modulepreload" href="([^"]+)"/g)
    ].map((m) => m[1]);
    expect(preloads).toEqual([
      `/${result.manifest.get('entry.js')}`,
      `/${result.manifest.get('static.js')}`
    ]);
    expectCoherentCss(result);
  });

  it('leaves comments, strings and non-local URLs byte-for-byte unchanged', () => {
    const css =
      '/* url(missing.png) @import "missing.css"; */ .x{content:"url(missing.png)";filter:url(#local);background:url(data:image/svg+xml,opaque)} @import "https://example.invalid/x.css"; @import url(//example.invalid/y.css);';
    expect(cssOutput(plan(new Map([['root.css', css]])), 'root.css')).toBe(css);
  });

  it.each([
    '@import "./missing.css";',
    '.x{background:url("./missing.png?v#part")}'
  ])('fails closed on a missing local target: %s', (css) =>
    expect(() => plan(new Map([['root.css', css]]))).toThrow(/cannot emit/)
  );
});

describe('per-route clinic pages', () => {
  const clinicHtml = [
    '<!doctype html><html><head>',
    '    <meta name="robots" content="noindex, nofollow" />',
    '    <meta',
    '      name="description"',
    '      content="home description"',
    '    />',
    '    <title>【測試用】Home｜一森渼診所</title>',
    '    <link rel="stylesheet" href="/clinic-site.css" />',
    '  </head><body><script type="module" src="/clinic-site.js"></script></body></html>'
  ].join('\n');
  const content = {
    CLINIC: { name: '一森渼診所' },
    HOME_PAGE: {
      seoTitle: '首頁',
      seoDescription: '首頁描述',
      heroImage: '/img/hero.webp'
    },
    DOCTORS: [
      {
        slug: 'dr-a',
        name: 'A <b>"醫師"</b> & Co',
        summary: "it's <i>ok</i>",
        image: '/img/a.webp'
      }
    ],
    NASAL_SERVICES: [
      { slug: 'svc', title: '療程', subtitle: '副標', image: '/img/s.webp' }
    ]
  };
  const pages = (html = clinicHtml, options) =>
    adapter.planClinicRoutePages(html, content, options);
  const refs = (html) =>
    [...html.matchAll(/(?:href|src)="([^"]+)"/g)]
      .map((m) => m[1])
      .filter((value) => !value.startsWith('http'))
      .sort();

  it('emits a flat file per route under clinic-route/ with the runtime title and description', () => {
    const result = pages();
    expect([...result.keys()].sort()).toEqual([
      'clinic-route/doctors.html',
      'clinic-route/doctors/dr-a.html',
      'clinic-route/nasal/svc.html',
      'clinic.html'
    ]);
    const list = result.get('clinic-route/doctors.html');
    expect(list).toContain('<title>【測試用】醫師團隊｜一森渼診所</title>');
    expect(list).toContain('content="認識一森渼診所專業醫師團隊。"');
    expect(list).toContain(
      'property="og:title" content="【測試用】醫師團隊｜一森渼診所"'
    );
    expect(list).toContain('name="twitter:card" content="summary_large_image"');
    const service = result.get('clinic-route/nasal/svc.html');
    expect(service).toContain('<title>【測試用】療程｜一森渼診所</title>');
    expect(service).toContain('content="副標"');
    expect(service).not.toContain('home description');
  });

  it('maps every route to the file the build emits and never writes under clinic/', () => {
    const files = adapter.clinicRoutePageFiles(content);
    expect([...files.keys()].sort()).toEqual([
      '/clinic/doctors',
      '/clinic/doctors/dr-a',
      '/clinic/nasal/svc'
    ]);
    expect([...files.values()].sort()).toEqual(
      [...pages().keys()].filter((file) => file !== 'clinic.html').sort()
    );
    for (const file of files.values()) expect(file).toMatch(/^clinic-route\//);
  });

  it('keeps hashed asset references and noindex identical to clinic.html', () => {
    for (const html of pages().values()) {
      expect(refs(html)).toEqual(refs(clinicHtml));
      expect(html).toContain(
        '<meta name="robots" content="noindex, nofollow" />'
      );
    }
  });

  it('drops the test prefix only when clinic.html is not noindex', () => {
    const live = clinicHtml.replace(/<meta name="robots"[^>]*>/, '');
    expect(pages(live).get('clinic-route/doctors.html')).toContain(
      '<title>醫師團隊｜一森渼診所</title>'
    );
  });

  it('escapes inserted text for attribute and text contexts', () => {
    const html = pages().get('clinic-route/doctors/dr-a.html');
    expect(html).toContain(
      '<title>【測試用】A &lt;b&gt;&quot;醫師&quot;&lt;/b&gt; &amp; Co｜一森渼診所</title>'
    );
    expect(html).toContain('content="it&#39;s &lt;i&gt;ok&lt;/i&gt;"');
    expect(html).not.toContain('<b>');
  });

  it('omits origin-dependent URLs without an origin and emits absolute ones with it', () => {
    const bare = pages().get('clinic-route/doctors/dr-a.html');
    for (const key of ['canonical', 'og:url', 'og:image', 'twitter:image'])
      expect(bare).not.toContain(key);
    const absolute = pages(clinicHtml, {
      origin: 'https://example.invalid'
    }).get('clinic-route/doctors/dr-a.html');
    expect(absolute).toContain(
      '<link rel="canonical" href="https://example.invalid/clinic/doctors/dr-a" />'
    );
    expect(absolute).toContain(
      'property="og:image" content="https://example.invalid/img/a.webp"'
    );
  });

  it('writes the home page tags back into clinic.html itself', () => {
    const home = pages(clinicHtml, { origin: 'https://example.invalid' }).get(
      'clinic.html'
    );
    expect(home).toContain('<title>【測試用】首頁｜一森渼診所</title>');
    expect(home).toContain('name="description" content="首頁描述"');
    expect(home).not.toContain('home description');
    expect(home).toContain(
      '<link rel="canonical" href="https://example.invalid/clinic" />'
    );
    expect(home).toContain(
      'property="og:image" content="https://example.invalid/img/hero.webp"'
    );
  });

  it('fails loudly when the shell has no title or description to replace', () => {
    expect(() => pages('<head></head>')).toThrow(/clinic\.html/);
  });

  it('covers every route that clinic-content.js declares', async () => {
    const real = await import('../apps/web/public/clinic-content.js');
    const html = clinicHtml;
    const result = adapter.planClinicRoutePages(html, real);
    expect([...result.keys()].sort()).toEqual(
      real.CLINIC_ROUTES.map((route) =>
        route === '/clinic'
          ? 'clinic.html'
          : `clinic-route${route.slice(7)}.html`
      ).sort()
    );
  });
});
