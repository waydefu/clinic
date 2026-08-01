import { describe, expect, it } from 'vitest';
import {
  extractPrettyPaths,
  extractPublicPageScanRoutes
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
