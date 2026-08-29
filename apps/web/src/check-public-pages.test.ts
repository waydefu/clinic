import { describe, expect, it } from 'vitest';

// @ts-expect-error — the repository gate is plain ESM with no type declarations.
import { checkPublicPageConfiguration } from '../../../scripts/check-public-pages.mjs';

type PrettyPath = [route: string, entry: string];

const CLINIC_ROUTES = ['/clinic', '/clinic/doctors', '/clinic/doctors/example'];
const PRETTY_PATHS: PrettyPath[] = [
  ['/booking', 'patient.html'],
  ['/privacy', 'privacy.html'],
  ...CLINIC_ROUTES.map((route): PrettyPath => [route, 'clinic.html'])
];

function serverSource(paths: PrettyPath[] = PRETTY_PATHS): string {
  return `const PRETTY_PATHS = new Map([\n${paths
    .map(([route, entry]) => `  ['${route}', '${entry}']`)
    .join(',\n')}\n]);\n`;
}

const SCAN_EXECUTORS = {
  axe: 'scan',
  responsive: 'horizontalOverflow',
  affordance: 'affordanceReport',
  'mobile-layout': 'pageOverflow'
} as const;
type ScanName = keyof typeof SCAN_EXECUTORS;

function scanSource(
  routes: string[] = [],
  scan: ScanName = 'axe',
  execute = true
): string {
  const declaration = `export const PUBLIC_PAGE_SCAN_ROUTES = [${routes
    .map((route) => `'${route}'`)
    .join(', ')}] as const;\n`;
  if (!execute) return declaration;
  return `${declaration}
for (const route of PUBLIC_PAGE_SCAN_ROUTES) {
  test(\`manifest scan: \${route}\`, async ({ page }) => {
    await page.goto(route);
    await ${SCAN_EXECUTORS[scan]}(page);
  });
}
`;
}

function fixture() {
  return {
    inventory: {
      why: '縮小但形狀完整的 public-page gate 測試夾具。',
      pages: [
        {
          route: '/',
          entry: 'index.html',
          audience: 'staff',
          indexable: false,
          scans: [],
          note: 'root',
          routing: { kind: 'root', entryRedirect: null }
        },
        {
          route: '/booking',
          entry: 'patient.html',
          audience: 'public',
          indexable: true,
          scans: [],
          note: 'exact route',
          routing: {
            kind: 'exact',
            entryRedirect: { status: 301 }
          }
        },
        {
          route: '/privacy',
          entry: 'privacy.html',
          audience: 'public',
          indexable: true,
          scans: [],
          note: 'another exact route',
          routing: {
            kind: 'exact',
            entryRedirect: { status: 301 }
          }
        },
        {
          route: '/clinic',
          entry: 'clinic.html',
          audience: 'public',
          indexable: false,
          scans: [],
          note: 'data-driven routes share one shell',
          routing: {
            kind: 'shared-shell',
            entryRedirect: { status: 301 },
            dataRoutes: 'CLINIC_ROUTES',
            hostingWildcard: '/clinic/**'
          }
        },
        {
          route: '/404',
          entry: '404.html',
          audience: 'public',
          indexable: false,
          scans: [],
          note: 'Hosting special file',
          routing: { kind: 'hosting-404', entryRedirect: null }
        }
      ]
    },
    budgets: [
      'index.html',
      'patient.html',
      'privacy.html',
      'clinic.html',
      '404.html'
    ].map((entry) => ({ path: `/${entry}` })),
    serverSource: serverSource(),
    firebase: {
      hosting: {
        redirects: [
          {
            source: '/patient.html',
            destination: '/booking',
            type: 301
          },
          {
            source: '/privacy.html',
            destination: '/privacy',
            type: 301
          },
          {
            source: '/clinic.html',
            destination: '/clinic',
            type: 301
          }
        ],
        rewrites: [
          {
            source: '/v1/**',
            run: {
              serviceId: 'cal-pilot-api',
              region: 'asia-east1',
              pinTag: true
            }
          },
          { source: '/booking', destination: '/patient.html' },
          { source: '/privacy', destination: '/privacy.html' },
          { source: '/clinic', destination: '/clinic.html' },
          { source: '/clinic/**', destination: '/clinic.html' }
        ]
      }
    },
    buildIndexableEntries: ['patient.html', 'privacy.html'],
    scanSources: {
      axe: scanSource([], 'axe'),
      responsive: scanSource([], 'responsive'),
      affordance: scanSource([], 'affordance'),
      'mobile-layout': scanSource([], 'mobile-layout')
    },
    dataRouteSources: { CLINIC_ROUTES: [...CLINIC_ROUTES] }
  };
}

function failuresOf(input: ReturnType<typeof fixture>): string[] {
  return checkPublicPageConfiguration(input).failures as string[];
}

describe('checkPublicPageConfiguration', () => {
  it('accepts explicitly modeled redirects and a data-driven shared shell', () => {
    const result = checkPublicPageConfiguration(fixture());

    expect(result.failures).toEqual([]);
    expect(result.pageCount).toBe(5);
    expect(result.dataRouteCount).toBe(3);
  });

  it('fails when a data-driven route is missing from PRETTY_PATHS', () => {
    const input = fixture();
    input.serverSource = serverSource(
      PRETTY_PATHS.filter(([route]) => route !== '/clinic/doctors/example')
    );

    expect(failuresOf(input)).toContainEqual(
      expect.stringContaining(
        'PRETTY_PATHS 少了 /clinic/doctors/example → clinic.html'
      )
    );
  });

  it('fails when shared-shell ordering makes the server redirect to an alias', () => {
    const input = fixture();
    const aliasesFirst = [
      ...PRETTY_PATHS.filter(([route]) => route !== '/clinic'),
      ['/clinic', 'clinic.html']
    ] as PrettyPath[];
    input.serverSource = serverSource(aliasesFirst);

    expect(failuresOf(input)).toContainEqual(
      expect.stringContaining(
        '/clinic.html redirect 到第一筆 /clinic/doctors；manifest 要求 canonical /clinic'
      )
    );
  });

  it('fails on routes that server and Firebase retain without a manifest owner', () => {
    const input = fixture();
    input.serverSource = serverSource([
      ...PRETTY_PATHS,
      ['/retired', 'retired.html']
    ]);
    input.firebase.hosting.rewrites.push({
      source: '/retired',
      destination: '/retired.html'
    });

    const failures = failuresOf(input);
    expect(failures).toContainEqual(
      expect.stringContaining('PRETTY_PATHS 多出未由 manifest 解釋的 /retired')
    );
    expect(failures).toContainEqual(
      expect.stringContaining('rewrites 多出未由 manifest 解釋的 /retired')
    );
  });

  it('rejects duplicate manifest entries instead of guessing a shared shell', () => {
    const input = fixture();
    input.inventory.pages[2].entry = 'patient.html';

    expect(failuresOf(input)).toContainEqual(
      expect.stringContaining(
        'entry 與 pages[1] 重複；共用 entry 必須用一筆 shared-shell 建模'
      )
    );
  });

  it('rejects traversal and non-file manifest entries', () => {
    for (const entry of ['../patient.html', 'pages/patient.html', '/patient']) {
      const input = fixture();
      input.inventory.pages[1].entry = entry;

      expect(failuresOf(input), entry).toContainEqual(
        expect.stringContaining('entry 必須是單一小寫 kebab-case .html 檔名')
      );
    }
  });

  it('rejects missing, mistyped and unknown manifest fields', () => {
    const input = fixture();
    const page = input.inventory.pages[1] as Record<string, unknown>;
    delete page.note;
    page.indexable = 'yes';
    page.scan = ['axe'];

    const failures = failuresOf(input);
    expect(failures).toContainEqual(expect.stringContaining('少了 note 欄位'));
    expect(failures).toContainEqual(
      expect.stringContaining('indexable 必須是 boolean')
    );
    expect(failures).toContainEqual(expect.stringContaining('未知欄位 scan'));
  });

  it('fails stale rewrite and redirect destinations', () => {
    const input = fixture();
    input.firebase.hosting.rewrites[1].destination = '/stale.html';
    input.firebase.hosting.redirects[0].destination = '/old-booking';

    const failures = failuresOf(input);
    expect(failures).toContainEqual(
      expect.stringContaining(
        'rewrite /booking 指向 /stale.html；manifest 要求 /patient.html'
      )
    );
    expect(failures).toContainEqual(
      expect.stringContaining(
        'redirect /patient.html 是 /old-booking (301)；manifest 要求 /booking (301)'
      )
    );
  });

  it('fails when build-web indexability drifts from manifest metadata', () => {
    const input = fixture();
    input.inventory.pages[3].indexable = true;

    expect(failuresOf(input)).toContainEqual(
      expect.stringContaining(
        'build-web indexable allowlist 少了 clinic.html（manifest /clinic indexable=true）'
      )
    );
  });

  it('fails when a scan retains an extra stale route', () => {
    const input = fixture();
    input.scanSources.axe = scanSource(['/retired'], 'axe');

    expect(failuresOf(input)).toContainEqual(
      expect.stringContaining(
        'PUBLIC_PAGE_SCAN_ROUTES 多出 manifest 沒有的 /retired'
      )
    );
  });

  it('does not accept a route that appears only in a comment', () => {
    const input = fixture();
    input.inventory.pages[1].scans = ['axe'];
    input.scanSources.axe =
      `${scanSource()}` + "// coverage: page.goto('/booking')\n";

    expect(failuresOf(input)).toContainEqual(
      expect.stringContaining(
        '/booking 宣告要跑 axe，但 tests/e2e/accessibility.spec.ts 的 PUBLIC_PAGE_SCAN_ROUTES 少了這個路由'
      )
    );
  });

  it('does not accept a declared route that the scan never executes', () => {
    const input = fixture();
    input.inventory.pages[1].scans = ['axe'];
    input.scanSources.axe = scanSource(['/booking'], 'axe', false);

    expect(failuresOf(input)).toContainEqual(
      expect.stringContaining(
        '沒有用它逐 route 註冊 test，並在同一測試內依序執行 page.goto(route) 與 scan(page)'
      )
    );
  });

  it('does not accept a route loop that navigates but omits the scanner', () => {
    const input = fixture();
    input.inventory.pages[1].scans = ['axe'];
    input.scanSources.axe = scanSource(['/booking'], 'axe').replace(
      '    await scan(page);\n',
      ''
    );

    expect(failuresOf(input)).toContainEqual(
      expect.stringContaining(
        '同一測試內依序執行 page.goto(route) 與 scan(page)'
      )
    );
  });

  it('does not accept a hard-coded goto that ignores the loop route', () => {
    const input = fixture();
    input.inventory.pages[1].scans = ['axe'];
    input.scanSources.axe = scanSource(['/booking'], 'axe').replace(
      'page.goto(route)',
      "page.goto('/booking')"
    );

    expect(failuresOf(input)).toContainEqual(
      expect.stringContaining(
        '同一測試內依序執行 page.goto(route) 與 scan(page)'
      )
    );
  });

  it('does not accept a scanner skipped for one declared route', () => {
    const input = fixture();
    input.inventory.pages[1].scans = ['axe'];
    input.scanSources.axe = scanSource(['/booking'], 'axe').replace(
      '    await scan(page);\n',
      "    if (route !== '/booking') await scan(page);\n"
    );

    expect(failuresOf(input)).toContainEqual(
      expect.stringContaining(
        '同一測試內依序執行 page.goto(route) 與 scan(page)'
      )
    );
  });

  it('does not accept conditionally registering the route test', () => {
    const input = fixture();
    input.inventory.pages[1].scans = ['axe'];
    input.scanSources.axe = scanSource(['/booking'], 'axe')
      .replace(
        '  test(`manifest scan: ${route}`',
        "  if (route !== '/booking') {\n    test(`manifest scan: ${route}`"
      )
      .replace('  });\n}', '  });\n  }\n}');

    expect(failuresOf(input)).toContainEqual(
      expect.stringContaining('沒有用它逐 route 註冊 test')
    );
  });
});
