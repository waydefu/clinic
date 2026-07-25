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

  // 沒有跨來源彈窗，也不需要被別站當子資源載入，所以兩者都收到 same-origin。
  it('isolates the browsing context and its resources cross-origin', () => {
    expect(headerValue('Cross-Origin-Opener-Policy')).toBe('same-origin');
    expect(headerValue('Cross-Origin-Resource-Policy')).toBe('same-origin');
  });

  // 處理健康資料的站台沒有理由預設參與 Privacy Sandbox 的任何一項。
  it('opts out of device access and the Privacy Sandbox APIs', () => {
    const policy = headerValue('Permissions-Policy');
    for (const feature of [
      'camera',
      'microphone',
      'geolocation',
      'payment',
      'browsing-topics',
      'attribution-reporting',
      'join-ad-interest-group',
      'run-ad-auction'
    ]) {
      expect(policy).toContain(`${feature}=()`);
    }
  });

  // HTML 進入點必須每次重新驗證，才會抓到最新的雜湊參照。
  //
  // 用 `no-cache` 而不是 `no-store`：兩者都保證重新驗證，但 `no-store` 額外
  // 禁止任何快取保存回應，因此 Chrome 不會把頁面放進 back/forward cache。
  // 上一頁會變成完整的重新載入而不是瞬間還原，白白犧牲一項實地效能指標。
  it('revalidates html entry points without forfeiting the bfcache', () => {
    expect(headerValue('Cache-Control')).toBe('no-cache');
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

// `apps/web/server.mjs` 存在的理由，是在本機以與 Firebase Hosting 相同的安全與
// 快取語意提供產物。兩份設定一旦漂移，本地與 E2E 測到的就不是會部署的東西——
// 這正是先前 Permissions-Policy 少了 `payment=()` 卻沒有人發現的原因。
describe('the local server mirrors the hosting headers', () => {
  const server = readFileSync(
    fileURLToPath(new URL('../server.mjs', import.meta.url)),
    'utf8'
  );

  it.each([
    'Content-Security-Policy',
    'Cross-Origin-Opener-Policy',
    'Cross-Origin-Resource-Policy',
    'Permissions-Policy',
    'Referrer-Policy',
    'X-Content-Type-Options',
    'X-Frame-Options',
    'X-Robots-Tag'
  ])('serves %s with the value firebase.json declares', (key) => {
    // 原始碼裡的 header 常為了行寬而在冒號後折行，比對前先把換行與縮排收掉。
    expect(server.replace(/\s*\n\s*/g, ' ')).toContain(headerValue(key));
  });

  it('serves html with the same revalidating cache policy', () => {
    expect(server).toContain(`'${headerValue('Cache-Control')}'`);
    expect(server).not.toContain("'no-store'");
  });
});
