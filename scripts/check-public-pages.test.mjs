import { beforeAll, describe, expect, it } from 'vitest';
import {
  checkPublicPageConfiguration,
  extractPrettyPaths,
  extractPublicPageScanRoutes,
  repositoryInputs
} from './check-public-pages.mjs';

// 這兩支是把關的資料來源：一支從 server.mjs 讀出實際生效的路由對應，一支從掃描
// 設定讀出被掃描的路由。任何一支「讀不到就當作空的」，整個對外頁面清單的雙向
// 比對都會靜默通過——所以它們的失敗路徑比成功路徑更需要測試。

function server(body) {
  return `const PRETTY_PATHS = new Map([\n${body}\n]);\n`;
}

describe('server pretty-path extraction', () => {
  it('reads every route-to-entry pair', () => {
    const { mappings, failures } = extractPrettyPaths(
      server("  ['/clinic', 'clinic.html'],\n  ['/booking', 'booking.html']")
    );

    expect(failures).toEqual([]);
    expect(mappings).toEqual([
      { route: '/clinic', entry: 'clinic.html' },
      { route: '/booking', entry: 'booking.html' }
    ]);
  });

  it('accepts double-quoted pairs as well', () => {
    const { mappings } = extractPrettyPaths(
      server('  ["/clinic", "clinic.html"]')
    );

    expect(mappings).toEqual([{ route: '/clinic', entry: 'clinic.html' }]);
  });

  // 讀不到宣告時必須大聲失敗。回傳空清單會讓後續的雙向比對「兩邊都空」而通過。
  it('fails loudly when the declaration is gone', () => {
    const { mappings, failures } = extractPrettyPaths(
      'const SOMETHING_ELSE = new Map([]);'
    );

    expect(mappings).toEqual([]);
    expect(failures.join('\n')).toContain('PRETTY_PATHS');
  });

  it('fails when the source is not a string at all', () => {
    const { failures } = extractPrettyPaths(undefined);

    expect(failures.length).toBeGreaterThan(0);
  });

  it('reports leftover content that the pair pattern did not understand', () => {
    const { failures } = extractPrettyPaths(
      server("  ['/clinic', 'clinic.html'],\n  ...spreadSomething")
    );

    expect(failures.length).toBeGreaterThan(0);
  });

  it('ignores comments inside the declaration', () => {
    const { mappings, failures } = extractPrettyPaths(
      server("  /* 診所官網 */\n  ['/clinic', 'clinic.html']")
    );

    expect(failures).toEqual([]);
    expect(mappings).toEqual([{ route: '/clinic', entry: 'clinic.html' }]);
  });
});

describe('scan-route extraction', () => {
  it('fails when the source cannot be parsed as TypeScript', () => {
    const { failures, routes } = extractPublicPageScanRoutes(
      'export const = {{{',
      'tests/scan.ts'
    );

    expect(routes).toEqual([]);
    expect(failures.length).toBeGreaterThan(0);
  });

  it('fails when the source is not a string', () => {
    const { failures } = extractPublicPageScanRoutes(null, 'tests/scan.ts');

    expect(failures.join('\n')).toContain('tests/scan.ts');
  });

  it('reports the expected export as missing when it is absent', () => {
    const { failures, routes } = extractPublicPageScanRoutes(
      'export const somethingElse = ["/a"];',
      'tests/scan.ts'
    );

    expect(routes).toEqual([]);
    expect(failures.length).toBeGreaterThan(0);
  });
});

// 上面測的是兩支解析器。以下測整個組態比對——那才是這道 gate 的用途：證明對外
// 頁面清單、效能預算、server 的 pretty-path、Firebase 的 rewrite/redirect 與各
// 掃描矩陣彼此雙向一致。只用手寫 fixture 測，證明得了比對邏輯自洽，證明不了它
// 讀得懂這個 repository 現在的組態。所以基準用真實輸入，再逐一破壞副本。

describe('checkPublicPageConfiguration', () => {
  let inputs;

  beforeAll(async () => {
    inputs = await repositoryInputs();
  });

  /** 從同一個已知良好的基準深拷貝，確保案例之間互不影響。 */
  function mutate(change) {
    const copy = {
      ...inputs,
      inventory: structuredClone(inputs.inventory),
      budgets: structuredClone(inputs.budgets),
      firebase: structuredClone(inputs.firebase),
      scanSources: { ...inputs.scanSources },
      dataRouteSources: { ...inputs.dataRouteSources }
    };
    change(copy);
    return checkPublicPageConfiguration(copy);
  }

  it('accepts the repository as it currently stands', () => {
    const result = checkPublicPageConfiguration(inputs);

    expect(result.failures).toEqual([]);
    expect(result.pageCount).toBeGreaterThan(0);
    expect(result.dataRouteCount).toBeGreaterThan(0);
  });

  it('rejects an inventory that is not an object', () => {
    expect(mutate((c) => (c.inventory = [])).failures.length).toBeGreaterThan(
      0
    );
  });

  it('rejects an empty page list', () => {
    expect(
      mutate((c) => (c.inventory.pages = [])).failures.length
    ).toBeGreaterThan(0);
  });

  it('rejects an unknown top-level key in the inventory', () => {
    expect(
      mutate((c) => (c.inventory.extra = true)).failures.length
    ).toBeGreaterThan(0);
  });

  it('rejects a route that is not an absolute lowercase path', () => {
    expect(
      mutate((c) => (c.inventory.pages[0].route = 'Booking/')).failures.length
    ).toBeGreaterThan(0);
  });

  // 以下四條各對應一種「其中一邊改了、另一邊沒跟上」的情境。它們都不會讓建置
  // 失敗，只會讓某個頁面存在卻沒被掃到，或被掃到卻其實不存在。
  it('notices a server pretty-path mapping that drifted', () => {
    expect(
      mutate((c) => {
        c.serverSource = c.serverSource.replace(
          /\['\/[a-z-]+',/u,
          "['/drifted',"
        );
      }).failures.length
    ).toBeGreaterThan(0);
  });

  it('notices Firebase rewrites that no longer match the inventory', () => {
    expect(
      mutate((c) => {
        c.firebase.hosting.rewrites = [];
      }).failures.length
    ).toBeGreaterThan(0);
  });

  it('notices a scan matrix that stopped covering its routes', () => {
    expect(
      mutate((c) => {
        const [first] = Object.keys(c.scanSources);
        c.scanSources[first] = 'export const nothing = [];';
      }).failures.length
    ).toBeGreaterThan(0);
  });

  it('notices a data-driven route source that lost its entries', () => {
    expect(
      mutate((c) => {
        c.dataRouteSources.CLINIC_ROUTES = [];
      }).failures.length
    ).toBeGreaterThan(0);
  });
});
