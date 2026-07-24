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
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml'
};

const server = createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }

  const pathname = new URL(request.url ?? '/', `http://${host}`).pathname;
  const relativePath = pathname === '/' ? 'index.html' : pathname.slice(1);
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
    const cacheControl =
      servingDist && /\.[a-f0-9]{10}\.(?:js|css)$/.test(relativePath)
        ? 'public, max-age=31536000, immutable'
        : 'no-store';
    response.writeHead(200, {
      'Cache-Control': cacheControl,
      // connect-src must include 'self': the modular admin bootstrap fetches
      // /admin-shell.html from this origin, and the v2 pages hold their
      // synthetic state in the browser rather than calling the API.
      'Content-Security-Policy':
        "default-src 'self'; connect-src 'self'; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
      'Content-Type': contentType,
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
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
