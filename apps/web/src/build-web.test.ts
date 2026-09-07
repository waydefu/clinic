import { describe, expect, it } from 'vitest';

// @ts-expect-error — the build script is plain ESM with no type declarations.
import {
  listRegisterDecisions,
  pagePublishDecision,
  planHashedBuild,
  publishDecisionsForInventory,
  readDecisionApproval
} from '../../../scripts/build-web.mjs';

type Files = Map<string, string>;

// 一個縮小但形狀完整的 public/：HTML 進入點、CSS、一條 leaf ← 中間 ← 進入點
// 的模組鏈，外加一張不雜湊的圖片。
function sampleFiles(): Files {
  return new Map<string, string>([
    [
      'index.html',
      '<head>\n' +
        '    <link rel="stylesheet" href="/styles.css" />\n' +
        '    <link rel="icon" href="/favicon.svg" />\n' +
        '  </head>\n' +
        '  <body>\n' +
        '    <a href="/patient.html">x</a><a href="#top">y</a>\n' +
        '    <script type="module" src="/app.js"></script>\n' +
        '  </body>'
    ],
    ['styles.css', ':root{color:green}'],
    ['app.js', "import { greet } from './modules/greet.js';\ngreet();\n"],
    [
      'modules/greet.js',
      "import { NAME } from './name.js';\nexport const greet = () => NAME;\n"
    ],
    ['modules/name.js', "export const NAME = 'clinic';\n"],
    ['favicon.svg', '<svg></svg>']
  ]);
}

const HASH = /\.[0-9a-f]{10}\.(?:js|css)$/;

describe('planHashedBuild', () => {
  it('content-hashes every js and css asset and leaves html and images alone', () => {
    const { outputs, manifest } = planHashedBuild(sampleFiles());

    for (const source of [
      'styles.css',
      'app.js',
      'modules/greet.js',
      'modules/name.js'
    ])
      expect(manifest.get(source)).toMatch(HASH);
    // Entry points and non-hashable assets keep their stable path.
    expect(manifest.get('index.html')).toBe('index.html');
    expect(manifest.get('favicon.svg')).toBe('favicon.svg');
    expect([...outputs.keys()]).toContain('index.html');
  });

  // 註解是寫給讀原始碼的人的，不是寫給瀏覽器的。
  //
  // 這個專案的註解密度很高，而且刻意如此；但 2026-07-27 之前建置只壓 CSS 與 JS，
  // HTML 註解被原封不動送給每一位訪客——實測患者頁的 document 有 2.3 KiB（gzip 後）
  // 是註解。更糟的是它製造了一個錯誤的取捨：多寫一段說明就會撞到效能預算。
  describe('HTML 註解', () => {
    it('不出貨到 dist', () => {
      const files = sampleFiles();
      files.set(
        'index.html',
        '<!doctype html>\n<!-- 這一段是寫給維護者的 -->\n' +
          '<head>\n  <title>x</title>\n</head>\n<body><p>內容</p></body>'
      );
      const { outputs } = planHashedBuild(files);
      const html = String(outputs.get('index.html'));
      expect(html).not.toContain('<!--');
      expect(html).not.toContain('這一段是寫給維護者的');
      // 只拿掉註解：doctype 與真正的內容一個字都不能少。
      expect(html).toContain('<!doctype html>');
      expect(html).toContain('<p>內容</p>');
    });

    it('不動到 JSON-LD 這種內容像標記的區塊', () => {
      const files = sampleFiles();
      files.set(
        'index.html',
        '<head>\n<script type="application/ld+json">\n' +
          '{ "@type": "MedicalClinic", "name": "一森渼診所" }\n' +
          '</script>\n</head>\n<body></body>'
      );
      const html = String(planHashedBuild(files).outputs.get('index.html'));
      expect(html).toContain('"@type": "MedicalClinic"');
      expect(html).toContain('一森渼診所');
    });
  });

  // 「上線忘了拿掉 noindex」是最常見也最安靜的一種 SEO 事故：網站永遠不進索引，
  // 沒有錯誤、沒有告警，通常幾個月後才有人問「怎麼都搜不到」。原始碼因此永遠
  // 保持 noindex（預設安全），只有明確設 WEB_PUBLIC_INDEXABLE=true 才放行。
  describe('WEB_PUBLIC_INDEXABLE', () => {
    const NOINDEX = '<meta name="robots" content="noindex, nofollow" />';
    const CANONICAL =
      '<link rel="canonical" href="https://beauessence.com.tw/booking" />';

    const TITLE = '<title>線上預約｜一森渼診所</title>';

    function pages(
      patientHead = `${NOINDEX}\n    ${CANONICAL}\n    ${TITLE}`
    ): Files {
      const files = sampleFiles();
      files.set('patient.html', `<head>\n    ${patientHead}\n  </head>`);
      files.set('index.html', `<head>\n    ${NOINDEX}\n  </head>`);
      return files;
    }

    const build = (files: Files, value?: string) => {
      const previous = process.env.WEB_PUBLIC_INDEXABLE;
      if (value === undefined) delete process.env.WEB_PUBLIC_INDEXABLE;
      else process.env.WEB_PUBLIC_INDEXABLE = value;
      try {
        return planHashedBuild(files);
      } finally {
        if (previous === undefined) delete process.env.WEB_PUBLIC_INDEXABLE;
        else process.env.WEB_PUBLIC_INDEXABLE = previous;
      }
    };

    it('預設不放行：預覽站的每一頁都留著 noindex', () => {
      const { outputs } = build(pages());
      expect(outputs.get('patient.html')).toContain('name="robots"');
      expect(outputs.get('index.html')).toContain('name="robots"');
    });

    it('只有 "true" 這個值算數，避免 "1"／"yes" 這種近似值意外放行', () => {
      for (const value of ['1', 'yes', 'TRUE', ''])
        expect(build(pages(), value).outputs.get('patient.html')).toContain(
          'name="robots"'
        );
    });

    it('放行時只開患者頁，工作臺永遠不進索引', () => {
      const { outputs } = build(pages(), 'true');
      expect(outputs.get('patient.html')).not.toContain('name="robots"');
      expect(outputs.get('index.html')).toContain('name="robots"');
    });

    it('沒有絕對 canonical 就拒絕放行，否則權重會灑在任何指得到它的網址上', () => {
      expect(() => build(pages(`${NOINDEX}\n    ${TITLE}`), 'true')).toThrow(
        /canonical/
      );
    });

    it('robots meta 被手動刪掉時要爆炸，而不是安靜地當作已經放行', () => {
      expect(() => build(pages(`${CANONICAL}\n    ${TITLE}`), 'true')).toThrow(
        /no <meta/
      );
    });

    // 業主看到的通常是分頁標題、書籤與截圖，不是頁面上的徽章，所以「測試用」
    // 要出現在 <title>。它與 noindex 綁同一個開關，不可能只拿掉一半。
    it('預覽建置在標題標上【測試用】', () => {
      const { outputs } = build(pages());
      expect(outputs.get('patient.html')).toContain('<title>【測試用】');
    });

    it('正式建置的標題乾淨，不會把測試字樣帶上線', () => {
      const { outputs } = build(pages(), 'true');
      expect(outputs.get('patient.html')).not.toContain('測試用');
    });

    it('已經寫了測試字樣的標題不重複標記', () => {
      const files = pages();
      files.set(
        'patient.html',
        `<head>\n    ${NOINDEX}\n    ${CANONICAL}\n    <title>測試站</title>\n  </head>`
      );
      expect(build(files).outputs.get('patient.html')).toContain(
        '<title>測試站</title>'
      );
    });
  });

  describe('per-page publication approval (WEB-P0-01)', () => {
    const NOINDEX = '<meta name="robots" content="noindex, nofollow" />';
    const BOOKING_CANONICAL =
      '<link rel="canonical" href="https://beauessence.com.tw/booking" />';
    const PRIVACY_CANONICAL =
      '<link rel="canonical" href="https://beauessence.com.tw/privacy" />';
    const STAFF_CANONICAL =
      '<link rel="canonical" href="https://beauessence.com.tw/staff" />';
    const REGISTER = [
      '| ID | Decision | Owner | Status | Needed before |',
      '| --- | --- | --- | --- | --- |',
      '| D-003 | Final policy text | Clinic owner | pending (owner input recorded) | Privacy acceptance |',
      '| D-006 | Identity provider | Clinic owner | approved (2026-07-28) | Authenticated write |'
    ].join('\n');

    function approvalInventory() {
      return {
        why: 'WEB-P0-01 縮小夾具：核准頁、草稿頁、工作臺、404。',
        pages: [
          {
            route: '/booking',
            entry: 'patient.html',
            audience: 'public',
            indexable: true,
            scans: [],
            note: 'approved page',
            routing: { kind: 'exact', entryRedirect: { status: 301 } }
          },
          {
            route: '/privacy',
            entry: 'privacy.html',
            audience: 'public',
            indexable: true,
            requiresDecision: 'D-003',
            scans: [],
            note: 'draft page',
            routing: { kind: 'exact', entryRedirect: { status: 301 } }
          },
          {
            route: '/staff',
            entry: 'index.html',
            audience: 'staff',
            indexable: false,
            scans: [],
            note: 'staff workbench',
            routing: { kind: 'exact', entryRedirect: { status: 301 } }
          },
          {
            route: '/404',
            entry: '404.html',
            audience: 'public',
            indexable: false,
            scans: [],
            note: 'hosting 404',
            routing: { kind: 'hosting-404', entryRedirect: null }
          }
        ]
      };
    }

    function siteFiles(): Files {
      return new Map<string, string>([
        [
          'patient.html',
          `<head>\n    ${NOINDEX}\n    ${BOOKING_CANONICAL}\n    <title>預約</title>\n  </head>`
        ],
        [
          'privacy.html',
          `<head>\n    ${NOINDEX}\n    ${PRIVACY_CANONICAL}\n    <title>隱私</title>\n  </head>`
        ],
        [
          'index.html',
          `<head>\n    ${NOINDEX}\n    ${STAFF_CANONICAL}\n    <title>工作臺</title>\n  </head>`
        ],
        [
          '404.html',
          `<head>\n    ${NOINDEX}\n    <title>迷路</title>\n  </head>`
        ],
        [
          'sitemap.xml',
          '<urlset>\n' +
            '  <url><loc>https://beauessence.com.tw/booking</loc></url>\n' +
            '  <url><loc>https://beauessence.com.tw/privacy</loc></url>\n' +
            '</urlset>'
        ]
      ]);
    }

    const build = (files: Files, value?: string) => {
      const previous = process.env.WEB_PUBLIC_INDEXABLE;
      if (value === undefined) delete process.env.WEB_PUBLIC_INDEXABLE;
      else process.env.WEB_PUBLIC_INDEXABLE = value;
      try {
        return planHashedBuild(files, {
          inventory: approvalInventory(),
          registerText: REGISTER
        });
      } finally {
        if (previous === undefined) delete process.env.WEB_PUBLIC_INDEXABLE;
        else process.env.WEB_PUBLIC_INDEXABLE = previous;
      }
    };

    const locsOf = (sitemap: unknown): string[] =>
      [...String(sitemap).matchAll(/<loc>([^<]+)<\/loc>/gi)].map((match) =>
        match[1].trim()
      );

    it('核准只認狀態欄以 approved 開頭，內文出現 approved 不算數', () => {
      expect(readDecisionApproval(REGISTER, 'D-006')).toBe(true);
      expect(readDecisionApproval(REGISTER, 'D-003')).toBe(false);
      expect(
        readDecisionApproval(
          '| D-009 | Calendar | Owner | pending for production; sub-scope approved 2026-08-28 | Review |',
          'D-009'
        )
      ).toBe(false);
    });

    it('缺列、編號形狀錯誤、非字串一律視為未核准', () => {
      expect(readDecisionApproval(REGISTER, 'D-999')).toBe(false);
      expect(readDecisionApproval(REGISTER, 'D-03')).toBe(false);
      expect(readDecisionApproval('', 'D-006')).toBe(false);
      expect(listRegisterDecisions(REGISTER).has('D-003')).toBe(true);
      expect(listRegisterDecisions(REGISTER).has('D-999')).toBe(false);
    });

    it('判定真值表：預設關閉，三者齊了才放行', () => {
      const yes = () => true;
      const no = () => false;
      expect(
        pagePublishDecision(
          { indexable: true },
          { globalRelease: false, isDecisionApproved: yes }
        )
      ).toEqual({ index: false, inSitemap: false });
      expect(
        pagePublishDecision(
          { indexable: false },
          { globalRelease: true, isDecisionApproved: yes }
        )
      ).toEqual({ index: false, inSitemap: false });
      expect(
        pagePublishDecision(
          { indexable: true, requiresDecision: 'D-003' },
          { globalRelease: true, isDecisionApproved: no }
        )
      ).toEqual({ index: false, inSitemap: false });
      expect(
        pagePublishDecision(
          { indexable: true, requiresDecision: 'D-003' },
          { globalRelease: true, isDecisionApproved: yes }
        )
      ).toEqual({ index: true, inSitemap: true });
      expect(
        publishDecisionsForInventory(approvalInventory(), REGISTER, true).get(
          'privacy.html'
        )
      ).toEqual({ index: false, inSitemap: false });
    });

    it('A/G：預設建置全部維持 noindex，sitemap 一筆不留', () => {
      const { outputs } = build(siteFiles());
      for (const entry of [
        'patient.html',
        'privacy.html',
        'index.html',
        '404.html'
      ])
        expect(String(outputs.get(entry))).toContain('name="robots"');
      expect(locsOf(outputs.get('sitemap.xml'))).toEqual([]);
    });

    it('B：開關打開只放行核准頁', () => {
      const { outputs } = build(siteFiles(), 'true');
      expect(String(outputs.get('patient.html'))).not.toContain(
        'name="robots"'
      );
    });

    it('C：開關打開，草稿仍維持 noindex', () => {
      const { outputs } = build(siteFiles(), 'true');
      expect(String(outputs.get('privacy.html'))).toContain('name="robots"');
    });

    it('D：開關打開，草稿不得進 sitemap', () => {
      const { outputs } = build(siteFiles(), 'true');
      const locs = locsOf(outputs.get('sitemap.xml'));
      expect(locs).toContain('https://beauessence.com.tw/booking');
      expect(locs).not.toContain('https://beauessence.com.tw/privacy');
    });

    it('E：全域開關打不開工作臺與 404（連 canonical 齊了也不行）', () => {
      const { outputs } = build(siteFiles(), 'true');
      expect(String(outputs.get('index.html'))).toContain('name="robots"');
      expect(String(outputs.get('404.html'))).toContain('name="robots"');
    });

    it('F：核准頁缺 canonical 照樣拒絕放行', () => {
      const files = siteFiles();
      files.set(
        'patient.html',
        `<head>\n    ${NOINDEX}\n    <title>預約</title>\n  </head>`
      );
      expect(() => build(files, 'true')).toThrow(/canonical/);
    });

    it('H：meta 放行集合與 sitemap 列出集合一致', () => {
      const { outputs } = build(siteFiles(), 'true');
      const released = ['patient.html', 'privacy.html'].filter(
        (entry) => !String(outputs.get(entry)).includes('name="robots"')
      );
      expect(released).toEqual(['patient.html']);
      expect(locsOf(outputs.get('sitemap.xml'))).toEqual([
        'https://beauessence.com.tw/booking'
      ]);
    });

    it('真實鏈路：現行登錄 D-003 pending 時草稿不被放行（D-003 核准後此測必須跟著翻）', () => {
      const previous = process.env.WEB_PUBLIC_INDEXABLE;
      process.env.WEB_PUBLIC_INDEXABLE = 'true';
      try {
        const { outputs } = planHashedBuild(
          new Map<string, string>([
            [
              'privacy.html',
              `<head>\n    ${NOINDEX}\n    ${PRIVACY_CANONICAL}\n    <title>隱私</title>\n  </head>`
            ],
            [
              'sitemap.xml',
              '<urlset>\n' +
                '  <url><loc>https://beauessence.com.tw/booking</loc></url>\n' +
                '  <url><loc>https://beauessence.com.tw/privacy</loc></url>\n' +
                '</urlset>'
            ]
          ])
        );
        expect(String(outputs.get('privacy.html'))).toContain('name="robots"');
        expect(locsOf(outputs.get('sitemap.xml'))).not.toContain(
          'https://beauessence.com.tw/privacy'
        );
      } finally {
        if (previous === undefined) delete process.env.WEB_PUBLIC_INDEXABLE;
        else process.env.WEB_PUBLIC_INDEXABLE = previous;
      }
    });
  });

  it('rewrites each relative import to its dependency hashed name', () => {
    const { outputs, manifest } = planHashedBuild(sampleFiles());

    const appOut = manifest.get('app.js')!;
    const greetOut = manifest.get('modules/greet.js')!;
    const nameOut = manifest.get('modules/name.js')!;
    const greetBasename = greetOut.split('/').pop();
    const nameBasename = nameOut.split('/').pop();

    // Each rewritten specifier keeps the relative prefix and only the basename
    // gains the hash: app → ./modules/greet, greet → ./name (same directory).
    expect(outputs.get(appOut)).toContain(`from './modules/${greetBasename}'`);
    expect(outputs.get(greetOut)).toContain(`from './${nameBasename}'`);
    // And every rewritten target is a file the build actually emitted.
    expect(outputs.has(greetOut)).toBe(true);
    expect(outputs.has(nameOut)).toBe(true);
  });

  it('rewrites the html entry references and keeps other links untouched', () => {
    const { outputs, manifest } = planHashedBuild(sampleFiles());
    const html = outputs.get('index.html') as string;

    expect(html).toContain(`href="/${manifest.get('styles.css')}"`);
    expect(html).toContain(`src="/${manifest.get('app.js')}"`);
    // Image, internal html link and anchor are not touched.
    expect(html).toContain('href="/favicon.svg"');
    expect(html).toContain('href="/patient.html"');
    expect(html).toContain('href="#top"');
  });

  // 逐檔出貨（不 bundling）代表瀏覽器只能一層一層發現相依。preload 把整張圖
  // 在解析 <head> 時就宣告完，往返從「圖的深度」壓成 1 趟。漏掉任何一個檔案
  // 就等於那一層又要多一趟。
  it('preloads the whole module graph of every entry point in the head', () => {
    const { outputs, manifest } = planHashedBuild(sampleFiles());
    const html = outputs.get('index.html') as string;

    for (const source of ['app.js', 'modules/greet.js', 'modules/name.js']) {
      expect(html).toContain(
        `<link rel="modulepreload" href="/${manifest.get(source)}" />`
      );
    }
    // In <head>, not appended somewhere later: a preload discovered after the
    // body has been parsed buys nothing.
    expect(html.indexOf('modulepreload')).toBeLessThan(html.indexOf('</head>'));
    // Only modules. The stylesheet has its own <link rel="stylesheet"> and the
    // image is not part of the module graph.
    expect(html).not.toContain(
      `<link rel="modulepreload" href="/${manifest.get('styles.css')}" />`
    );
    expect(html).not.toContain('modulepreload" href="/favicon.svg"');
  });

  it('hashes lazy imports and styles without preloading their payload', () => {
    const files = sampleFiles();
    files.set(
      'app.js',
      "const e = {};\ne.href = './pilot.css';\nvoid import('./pilot.js');\n"
    );
    files.set('pilot.css', '.pilot{display:block}');
    files.set('pilot.js', 'export const enabled = true;\n');

    const { outputs, manifest } = planHashedBuild(files);
    const html = String(outputs.get('index.html'));
    const app = String(outputs.get(manifest.get('app.js')));

    expect(app).toContain(`e.href = './${manifest.get('pilot.css')}'`);
    expect(app).toContain(`import('./${manifest.get('pilot.js')}')`);
    expect(html).not.toContain(
      `modulepreload" href="/${manifest.get('pilot.js')}"`
    );

    const changed = new Map(files);
    changed.set('pilot.js', 'export const enabled = false;\n');
    expect(planHashedBuild(changed).manifest.get('app.js')).not.toBe(
      manifest.get('app.js')
    );
  });

  it('preloads the hashed name, so a preload can never miss the served file', () => {
    const { outputs, manifest } = planHashedBuild(sampleFiles());
    const html = outputs.get('index.html') as string;

    for (const match of html.matchAll(
      /<link rel="modulepreload" href="\/([^"]+)" \/>/g
    ))
      expect(outputs.has(match[1] as string)).toBe(true);
    // And the source names never leak into the output.
    expect(html).not.toContain('href="/app.js"');
    expect(manifest.get('app.js')).not.toBe('app.js');
  });

  // 一個宣告了模組卻沒有 </head> 的進入點會靜默失去整層 preload。建置期爆炸
  // 好過在使用者的瀏覽器裡多付一趟往返。
  it('refuses to build an entry point that declares a module but has no head', () => {
    const headless = sampleFiles();
    headless.set('index.html', '<script type="module" src="/app.js"></script>');

    expect(() => planHashedBuild(headless)).toThrow(/no <\/head>/);
  });

  it('leaves an html file with no module script alone', () => {
    const files = sampleFiles();
    files.set('404.html', '<head>\n  </head>\n  <body>gone</body>');
    const { outputs } = planHashedBuild(files);

    expect(outputs.get('404.html')).not.toContain('modulepreload');
  });

  it('is deterministic across runs', () => {
    expect([...planHashedBuild(sampleFiles()).manifest]).toEqual([
      ...planHashedBuild(sampleFiles()).manifest
    ]);
  });

  // 快取正確性的核心：改一個 leaf，依賴它的每一層雜湊都要跟著變，否則舊快取
  // 會繼續回舊內容。
  it('cascades a leaf change up through every dependent hash', () => {
    const before = planHashedBuild(sampleFiles()).manifest;
    const changed = sampleFiles();
    changed.set('modules/name.js', "export const NAME = 'renamed';\n");
    const after = planHashedBuild(changed).manifest;

    for (const dependent of ['modules/name.js', 'modules/greet.js', 'app.js'])
      expect(after.get(dependent)).not.toBe(before.get(dependent));
    // An asset with no path to the change keeps its hash.
    expect(after.get('styles.css')).toBe(before.get('styles.css'));
  });

  // ES modules allow import cycles (the vendored domain has one). Cyclic files
  // cannot be hashed independently, so they share one hash and bust together —
  // correct, because changing either changes what the other resolves.
  it('hashes a cyclic pair as one unit that resolves to each other', () => {
    const cyclic = new Map<string, string>([
      ['a.js', "import './b.js';\nexport const A = 1;\n"],
      ['b.js', "import './a.js';\nexport const B = 2;\n"]
    ]);
    const { outputs, manifest } = planHashedBuild(cyclic);

    const aOut = manifest.get('a.js')!;
    const bOut = manifest.get('b.js')!;
    // Same shared hash suffix.
    expect(aOut.replace('a.', '')).toBe(bOut.replace('b.', ''));
    // Each rewritten import points at the other emitted file.
    expect(outputs.get(aOut)).toContain(`'./${bOut}'`);
    expect(outputs.get(bOut)).toContain(`'./${aOut}'`);
    expect(outputs.has(aOut)).toBe(true);
    expect(outputs.has(bOut)).toBe(true);

    // Changing one member re-hashes both, since the cycle busts as a unit.
    const changed = new Map(cyclic);
    changed.set('a.js', "import './b.js';\nexport const A = 99;\n");
    const after = planHashedBuild(changed).manifest;
    expect(after.get('a.js')).not.toBe(aOut);
    expect(after.get('b.js')).not.toBe(bOut);
  });
});
