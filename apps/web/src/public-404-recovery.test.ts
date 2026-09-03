import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function readWeb(relative) {
  return readFileSync(join(webRoot, relative), 'utf8');
}

describe('public 404 recovery', () => {
  it('sends home and booking CTAs to public routes, not staff login', () => {
    const html = readWeb('public/404.html');
    expect(html).toMatch(
      /<a\b[^>]*\bhref="\/clinic"[^>]*>\s*回到首頁\s*<\/a\s*>/
    );
    expect(html).toMatch(
      /<a\b[^>]*\bhref="\/booking"[^>]*>\s*前往線上預約\s*<\/a\s*>/
    );
    expect(html).not.toMatch(/\bhref="\/"/);
    expect(html).not.toMatch(/\bhref="\/staff"/);
  });

  it('keeps the local test server serving the branded 404 body for missing URLs', () => {
    const server = readWeb('server.mjs');
    expect(server).toContain("resolve(publicDirectory, '404.html')");
    expect(server).toContain('sendBrandedNotFound');
    expect(server).not.toMatch(
      /PRETTY_PATHS[\s\S]*\['\/this-page-does-not-exist'/
    );
  });
});
