import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { STAGING_AUTH_FRAME, hostingHeadersForPath } from './csp-policy.mjs';

if (process.env['TEST_ONLY_WEB_ENABLED'] !== 'true') {
  throw new Error(
    'Refusing to start the test-only website without TEST_ONLY_WEB_ENABLED=true.'
  );
}

const host = '127.0.0.1';
const port = Number(process.env['TEST_ONLY_WEB_PORT'] ?? '3100');
const applicationRoot = fileURLToPath(new URL('.', import.meta.url));
// Serves the raw, unbundled public/ by default (直接檢視原始 ES module). Set
// WEB_ROOT=dist to preview the content-hashed production build locally with the
// same security/cache policy used by Firebase Hosting.
const servingDist = process.env['WEB_ROOT'] === 'dist';
const publicDirectory = resolve(
  applicationRoot,
  servingDist ? 'dist' : 'public'
);
// 允許清單就是安全邊界：不在這裡的副檔名一律 404，所以新增資產型別要有意識地
// 加進來，而不是靠猜測 MIME。
// `.json` 在列表裡，是因為 dist 真的有 JSON（vendor/domain/manifest.json），而
// Firebase Hosting 會照常提供它。少了這一筆，本地一律 404 而線上 200——這個
// server 存在的意義就是重現會部署的行為，這種落差正是它該消除的東西。
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png'
};

// Firebase Hosting serves public/404.html for missing URLs. Mirror that body
// and status here so local/E2E recovery is the branded page, not an empty
// response and not a rewrite to staff `/`.
function hostingHeaders(contentType, cacheControl, pathname = '/') {
  return {
    ...hostingHeadersForPath(pathname, {
      authFrame: STAGING_AUTH_FRAME,
      includeHsts: false
    }),
    'Cache-Control': cacheControl,
    'Content-Type': contentType
  };
}

async function sendBrandedNotFound(request, response) {
  try {
    const content = await readFile(resolve(publicDirectory, '404.html'));
    response.writeHead(
      404,
      hostingHeaders('text/html; charset=utf-8', 'no-cache', '/404.html')
    );
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch {
    response.writeHead(404).end();
  }
}

// 根入口分流（Q4）：`/` 302 到 `/clinic`。具名常數供
// check-public-pages.mjs 逐字比對 firebase.json。
const ROOT_REDIRECT = { source: '/', destination: '/clinic', type: 302 };

// 對外網址與實體檔名。canonical 與 og:url 指向這些網址，所以它們必須真的可用。
// 一頁一列，避免再出現「新增一個對外頁面卻忘了在這裡開路」的落差。
const PRETTY_PATHS = new Map([
  ['/staff', 'index.html'],
  ['/booking', 'patient.html'],
  ['/privacy', 'privacy.html'],
  ['/clinic', 'clinic.html'],
  ['/clinic/doctors', 'clinic.html'],
  ['/clinic/doctors/yan-cheng-an', 'clinic.html'],
  ['/clinic/doctors/yang-sheng-feng', 'clinic.html'],
  ['/clinic/nasal/snoring-five-in-one', 'clinic.html'],
  ['/clinic/nasal/inferior-turbinate-surgery', 'clinic.html'],
  ['/clinic/nasal/septoplasty', 'clinic.html'],
  ['/clinic/nasal/snore-relief-mouthguard', 'clinic.html']
]);

const server = createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }

  const pathname = new URL(request.url ?? '/', `http://${host}`).pathname;

  // 根 `/` 不是工作臺了：公開訪客去 `/clinic`（Q4 front-door 分離）。
  // 302（非 301）是刻意的——這是入口分流，不是永久搬遷；寫成具名常數，
  // 讓 check-public-pages.mjs 可以逐字比對 firebase.json。
  if (pathname === ROOT_REDIRECT.source) {
    response
      .writeHead(ROOT_REDIRECT.type, { Location: ROOT_REDIRECT.destination })
      .end();
    return;
  }

  // 對外的預約頁網址是 /booking（2026-07-26 決策），實體檔名仍是 patient.html。
  // 這兩條規則必須與 firebase.json 的 redirects／rewrites 逐字對應——E2E 跑在這個
  // server 上，兩邊不一致就等於沒有測到真正會部署的行為。
  //
  // 順序與 Firebase Hosting 相同：先 redirects，再 rewrites。因此 /patient.html
  // 會 301 到 /booking，而 /booking 是內部取檔、不會再回到 redirect，沒有迴圈。
  const redirectTarget = [...PRETTY_PATHS].find(
    ([, file]) => pathname === `/${file}`
  );
  if (redirectTarget !== undefined) {
    response.writeHead(301, { Location: redirectTarget[0] }).end();
    return;
  }

  const rewritten = PRETTY_PATHS.get(pathname);
  const requestedPath = rewritten === undefined ? pathname : `/${rewritten}`;
  const relativePath =
    requestedPath === '/' ? 'index.html' : requestedPath.slice(1);
  const filePath = resolve(publicDirectory, relativePath);
  if (
    !filePath.startsWith(`${publicDirectory}${sep}`) &&
    filePath !== publicDirectory
  ) {
    response.writeHead(403).end();
    return;
  }

  const contentType = contentTypes[extname(filePath)];
  if (contentType === undefined) {
    await sendBrandedNotFound(request, response);
    return;
  }

  try {
    const content = await readFile(filePath);
    // `no-cache` 而不是 `no-store`：兩者都保證每次都向伺服器重新驗證，但
    // `no-store` 額外禁止把回應留在任何快取裡，因此 Chrome 不會把帶著它的頁面
    // 放進 back/forward cache。上一頁因此變成一次完整的重新載入與重新啟動，
    // 而 bfcache 還原在 Core Web Vitals 的實地資料裡是近乎瞬間的導覽。
    // 實測（同一份 dist，只改這個標頭）：no-store 時上一頁重新下載 19,983
    // bytes，no-cache 時 transferSize 為 0。
    const cacheControl =
      servingDist && /\.[a-f0-9]{10}\.(?:js|css)$/.test(relativePath)
        ? 'public, max-age=31536000, immutable'
        : 'no-cache';
    response.writeHead(
      200,
      hostingHeaders(contentType, cacheControl, pathname)
    );
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch {
    await sendBrandedNotFound(request, response);
  }
});

server.listen({ host, port }, () => {
  process.stdout.write(
    `Test-only website is listening on http://${host}:${port}\n`
  );
});
