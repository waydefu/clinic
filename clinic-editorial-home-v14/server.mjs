import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
const root = fileURLToPath(new URL(".", import.meta.url));
const base =
  process.env.CLINIC_SOURCE_ROOT || "F:/診所專案/tmp/ui-check-refresh-20261005";
const canonical = await import(
  pathToFileURL(base + "/apps/web/public/clinic-content.js").href
);
const { hostingHeadersForPath, STAGING_AUTH_FRAME } = await import(
  pathToFileURL(base + "/apps/web/csp-policy.mjs").href
);
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webp": "image/webp",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};
const local = new Map([
  ["/clinic", "index.html"],
  ["/", "index.html"],
  ["/clinic/doctors", "doctors.html"],
  ["/clinic/nasal/inferior-turbinate-surgery", "turbinate.html"],
  ["/prototype/article-site.css", "article-site.css"],
  ["/prototype/article.js", "article.js"],
  ["/prototype/site.css", "home-site.css"],
  ["/prototype/site.js", "site.js"],
  ["/prototype/home-data.json", "home-data.json"],
  ["/prototype/home-data.js", "home-data.js"],
]);
for (const [route, file] of [
  ["snoring-five-in-one", "snoring"],
  ["septoplasty", "septoplasty"],
  ["snore-relief-mouthguard", "mouthguard"],
])
  local.set("/clinic/nasal/" + route, file + ".html");
const server = createServer(async (req, res) => {
  if (!["GET", "HEAD"].includes(req.method)) {
    res.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }
  const path = decodeURIComponent(
    new URL(req.url, "http://127.0.0.1").pathname,
  );
  if (path === "/booking") {
    res.writeHead(302, { Location: "http://127.0.0.1:3100/booking" }).end();
    return;
  }
  let directory = root;
  let relative = local.get(path);
  if (path.startsWith("/visual-assets/"))
    relative = "assets/" + path.slice("/visual-assets/".length);
  if (!relative) {
    directory = resolve(base, "apps/web/public");
    relative =
      canonical.CLINIC_ROUTES.includes(path) && path !== "/clinic"
        ? "clinic.html"
        : path.slice(1);
    if (path === "/privacy") relative = "privacy.html";
  }
  const file = resolve(directory, relative);
  if (!file.startsWith(resolve(directory) + sep) || !types[extname(file)]) {
    res.writeHead(404).end();
    return;
  }
  try {
    const bytes = await readFile(file);
    const compress =
      /\bgzip\b/.test(req.headers["accept-encoding"] || "") &&
      [".html", ".css", ".js", ".json", ".svg"].includes(extname(file));
    const response = compress ? gzipSync(bytes) : bytes;
    res.writeHead(200, {
      ...hostingHeadersForPath(path, {
        authFrame: STAGING_AUTH_FRAME,
        includeHsts: false,
      }),
      "Content-Type": types[extname(file)],
      "Cache-Control": "no-store",
      Vary: "Accept-Encoding",
      "Content-Length": response.length,
      ...(compress ? { "Content-Encoding": "gzip" } : {}),
    });
    res.end(req.method === "HEAD" ? undefined : response);
  } catch {
    res.writeHead(404).end();
  }
});
server.listen(3216, "127.0.0.1", () =>
  console.log(
    "Six-page editorial prototype: http://127.0.0.1:3216/clinic. Personal physician routes remain original; booking redirects to the existing test-only website.",
  ),
);
