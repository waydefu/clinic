import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// firebase.json 是靜態託管的安全邊界來源：CSP、frame、referrer 等 header 都在
// 這裡定義，卻不會被一般單元測試執行到。這支測試把「應有哪些指令」釘住，讓任何
// 放寬（例如不小心拿掉 object-src 或允許 inline script）在 CI 就被擋下。
const firebaseConfig = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../../firebase.json', import.meta.url)),
    'utf8'
  )
);

function headerValue(key: string): string {
  const rule = firebaseConfig.hosting.headers.find(
    (entry: { source: string }) => entry.source === '**'
  );
  const header = rule?.headers.find(
    (item: { key: string }) => item.key.toLowerCase() === key.toLowerCase()
  );
  if (!header) throw new Error(`Missing "${key}" header on the "**" source.`);
  return header.value;
}

describe('hosting security headers', () => {
  it('locks the Content-Security-Policy directives', () => {
    const directives = new Set(
      headerValue('Content-Security-Policy')
        .split(';')
        .map((part) => part.trim())
        .filter(Boolean)
    );

    for (const directive of [
      "default-src 'self'",
      "connect-src 'self'",
      "style-src 'self'",
      "script-src 'self'",
      // 沒有任何 <object>/<embed>/<applet> 插件面：關掉外掛執行面。
      "object-src 'none'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'"
    ]) {
      expect(directives).toContain(directive);
    }
  });

  it('never allows inline or remote script/style execution', () => {
    const csp = headerValue('Content-Security-Policy');
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).not.toContain('*');
  });

  it('keeps the framing, sniffing and referrer protections', () => {
    expect(headerValue('X-Frame-Options')).toBe('DENY');
    expect(headerValue('X-Content-Type-Options')).toBe('nosniff');
    expect(headerValue('Referrer-Policy')).toBe('no-referrer');
    expect(headerValue('X-Robots-Tag')).toContain('noindex');
  });

  // HTML 進入點必須維持 no-store，永遠抓到最新的雜湊參照。
  it('keeps html entry points on no-store via the catch-all block', () => {
    expect(headerValue('Cache-Control')).toBe('no-store');
  });

  // 只有內容雜湊過的 js/css 可以永久 immutable 快取：改一版就是新檔名，舊快取
  // 不可能回錯內容。這個區塊排在 '**' 之後，才能覆蓋掉上面的 no-store。
  it('caches content-hashed assets immutably without weakening the catch-all', () => {
    const blocks = firebaseConfig.hosting.headers;
    const assetIndex = blocks.findIndex(
      (entry: { source: string }) => entry.source === '**/*.@(js|css)'
    );
    const catchAllIndex = blocks.findIndex(
      (entry: { source: string }) => entry.source === '**'
    );
    expect(assetIndex).toBeGreaterThan(catchAllIndex);

    const cacheControl = blocks[assetIndex].headers.find(
      (item: { key: string }) => item.key.toLowerCase() === 'cache-control'
    );
    expect(cacheControl.value).toContain('immutable');
    expect(cacheControl.value).toContain('max-age=31536000');
  });
});
