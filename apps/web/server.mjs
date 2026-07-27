import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

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

// 對外網址與實體檔名。canonical 與 og:url 指向這些網址，所以它們必須真的可用。
// 一頁一列，避免再出現「新增一個對外頁面卻忘了在這裡開路」的落差。
const PRETTY_PATHS = new Map([
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
    response.writeHead(404).end();
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
    response.writeHead(200, {
      'Cache-Control': cacheControl,
      // connect-src must include 'self': the modular admin bootstrap fetches
      // /admin-shell.html from this origin, and the v2 pages hold their
      // synthetic state in the browser rather than calling the API.
      // `require-trusted-types-for 'script'`：寫進 innerHTML 的字串一律要先經過
      // Trusted Types policy，否則瀏覽器直接丟 TypeError。modules/trusted-html.js
      // 註冊 default policy，於是既有的 29 處指派全部流經那裡的結構檢查。
      // 導入前先以 report-only 跑過兩個進入點的完整 render 路徑，違規為 0。
      'Content-Security-Policy':
        "default-src 'self'; connect-src 'self'; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; require-trusted-types-for 'script'",
      // 沒有任何跨來源彈窗或被他站嵌入的需求，所以兩者都收到 same-origin：
      // 前者切斷跨來源視窗對 window.opener 的存取，後者阻止其他站台把本站資源
      // 當成子資源載入。
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Content-Type': contentType,
      // 必須與 firebase.json 逐字相同——這個 server 的存在意義就是在本機重現
      // Hosting 的安全與快取語意，漂移等於測到的不是會部署的東西。
      // Privacy Sandbox 的幾項一併關掉：處理健康資料的站台沒有理由預設參與。
      'Permissions-Policy':
        'camera=(), microphone=(), geolocation=(), payment=(), browsing-topics=(), attribution-reporting=(), join-ad-interest-group=(), run-ad-auction=()',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-Robots-Tag': 'noindex, nofollow, noarchive'
    });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch {
    response.writeHead(404).end();
  }
});

server.listen({ host, port }, () => {
  process.stdout.write(
    `Test-only website is listening on http://${host}:${port}\n`
  );
});
