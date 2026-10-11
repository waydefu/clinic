import { readFile, writeFile, mkdir } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import assert from "node:assert/strict";
import { chromium } from "file:///F:/診所專案/cal-pilot/.claude/worktrees/shots/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright/index.mjs";
const root = new URL(".", import.meta.url);
const out =
  "F:/診所專案/output/playwright/clinic-editorial-home-20261006/final-verification";
await mkdir(out, { recursive: true });
const routes = [
  ["doctors", "doctors"],
  ["nasal/snoring-five-in-one", "snoring"],
  ["nasal/inferior-turbinate-surgery", "turbinate"],
  ["nasal/septoplasty", "septoplasty"],
  ["nasal/snore-relief-mouthguard", "mouthguard"],
];
const report = {
  scope: "Local prototype evidence, not formal hashed build or CI",
  rows: [],
  allocation: [],
  regression: [],
};
const axeSource = await readFile(
  "F:/診所專案/cal-pilot/.claude/worktrees/shots/node_modules/.pnpm/axe-core@4.12.1/node_modules/axe-core/axe.min.js",
  "utf8",
);
const browser = await chromium.launch();
async function check(name, action) {
  try {
    report.rows.push({ name, status: "PASS", evidence: await action() });
  } catch (e) {
    report.rows.push({ name, status: "FAIL", error: e.message });
  }
}
for (const [route, file] of routes) {
  const html = await readFile(new URL(file + ".html", root), "utf8");
  const paths = new Set(
    [...html.matchAll(/(?:src|href|srcset)="([^"]+)"/g)]
      .flatMap(m=>m[1].split(',').map(item=>item.trim().split(/\s+/)[0]))
      .filter(path=>/^\/(visual-assets|prototype)\//.test(path))
      .map(path=>path.split('#')[0])
      .map(path=>path.startsWith('/visual-assets/')?'assets/'+path.slice(15):path.slice(11)),
  );
  paths.add("assets/background-atlas.webp");
  // Follow static public asset literals in the single shared controller/CSS as well.
  for (const source of ['article.js','article-site.css']) {
    const text=await readFile(new URL(source,root),'utf8');
    for (const match of text.matchAll(/\/visual-assets\/[\w/.-]+\.(?:webp|svg)/g))paths.add('assets/'+match[0].slice(15));
  }
  paths.add(file + ".html");
  const bytes = {},
    counts = {};
  for (const path of paths) {
    const kind = path.endsWith(".html")
      ? "document"
      : path.endsWith(".css")
        ? "stylesheet"
        : path.endsWith(".js")
          ? "script"
          : "image";
    bytes[kind] =
      (bytes[kind] || 0) + gzipSync(await readFile(new URL(path, root))).length;
    counts[kind] = (counts[kind] || 0) + 1;
  }
  bytes.font = 0;
  bytes.total = Object.values(bytes).reduce((n, b) => n + b, 0);
  counts.total = paths.size;
  const allocation = { route, bytes, counts, paths: [...paths] };
  report.allocation.push(allocation);
  await check(route + " complete allocation", () => {
    for (const [kind, cap] of Object.entries({
      document: 3,
      script: 20,
      stylesheet: 14,
      image: 180,
      font: 0,
      total: 200,
    }))
      assert.ok(
        bytes[kind] <= cap * 1024,
        kind + " exceeds " + cap + "KiB: " + bytes[kind],
      );
    for (const [kind, cap] of Object.entries({
      script: 2,
      stylesheet: 1,
      image: 14,
      total: 18,
    }))
      assert.ok(counts[kind] <= cap, kind + " count");
    return allocation;
  });
  for (const width of [375, 1440]) {
    const page = await browser.newPage({
      viewport: { width, height: width === 375 ? 812 : 1000 },
      reducedMotion: "reduce",
    });
    const errors = [],
      requests = new Set();
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("request", (r) => requests.add(r.url()));
    await page.goto("http://127.0.0.1:3216/clinic/" + route, {
      waitUntil: "networkidle",
    });
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 500) {
        scrollTo(0, y);
        await new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        );
      }
      await Promise.all(
        [...document.images].map((i) => i.decode().catch(() => {})),
      );
      scrollTo(0, 0);
    });
    await check(
      route + " " + width + " native accessibility and boundary",
      async () => {
        await page.evaluate(axeSource);
        const violations = await page.evaluate(async () => {
          const r = await axe.run(document, {
            runOnly: {
              type: "tag",
              values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"],
            },
          });
          return r.violations.map((v) => ({
            id: v.id,
            nodes: v.nodes.map((n) => n.target),
          }));
        });
        await writeFile(
          out + "/" + file + "-" + width + "-aria.yml",
          await page.locator("body").ariaSnapshot(),
        );
        assert.deepEqual(violations, []);
        assert.deepEqual(errors, []);
        assert.equal(await page.locator("h1").count(), 1);
        assert.equal(await page.locator("form").count(), 0);
        assert.equal(
          await page.locator('.editorial-profile a[href*="booking"]').count(),
          0,
        );
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
        );
        const small = await page
          .locator("a,button,summary")
          .evaluateAll((elements) =>
            elements
              .filter(
                (e) =>
                  e.getClientRects().length &&
                  getComputedStyle(e).visibility !== "hidden" &&
                  !e.classList.contains("skip-link"),
              )
              .filter(
                (e) =>
                  e.getBoundingClientRect().height < 43.9 ||
                  e.getBoundingClientRect().width < 43.9,
              )
              .map((e) => e.textContent),
          );
        assert.deepEqual(small, []);
        assert.deepEqual(
          [...requests].filter(
            (url) => !url.startsWith("http://127.0.0.1:3216/"),
          ),
          [],
        );
        const imageUrls = [...requests]
          .filter((url) => url.includes("/visual-assets/"))
          .map((url) => new URL(url).pathname);
        const planned = new Set(
          [...paths]
            .filter((p) => p.startsWith("assets/"))
            .map((p) => "/visual-assets/" + p.slice(7)),
        );
        for (const url of imageUrls)
          assert.ok(planned.has(url), "Unexpected image " + url);
        assert.ok(new Set(imageUrls).size <= counts.image);
        return {
          axe: [],
          errors: [],
          smallTargets: [],
          externalRequests: 0,
          observedImageCount: new Set(imageUrls).size,
          conservativeImageClosure: counts.image,
          note: "Static CSS closure includes the forest atlas even on routes where its selectors are unused.",
        };
      },
    );
    for (const scale of [2])
      await check(route + " " + width + " text200 proxy", async () => {
        await page.evaluate(() => {
          document.documentElement.style.fontSize = "32px";
          scrollTo(0, 0);
        });
        await page.screenshot({
          path: out + "/" + file + "-" + width + "-text200-first.png",
        });
        await page.screenshot({
          path: out + "/" + file + "-" + width + "-text200-full.png",
          fullPage: true,
        });
        const outside = await page.evaluate(() =>
          [...document.querySelectorAll("body *")]
            .filter((e) => {
              const c = getComputedStyle(e),
                r = e.getBoundingClientRect();
              return (
                r.width &&
                c.position !== "absolute" &&
                !e.closest(".comparison-scroll") &&
                (r.right > innerWidth + 1 || r.left < -1)
              );
            })
            .map((e) => ({
              tag: e.tagName,
              class: e.className,
              text: e.textContent.slice(0, 40),
            })),
        );
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
          JSON.stringify(outside),
        );
        return {
          overflow: false,
          method: "CSSOM font-size proxy; true browser zoom remains external",
        };
      });
    await page.close();
  }
  await writeFile(out + "/results.json", JSON.stringify(report, null, 2));
}
for (const route of ["doctors/yan-cheng-an", "doctors/yang-sheng-feng"])
  for (const width of [375, 1440]) {
    const page = await browser.newPage({
      viewport: { width, height: 812 },
      reducedMotion: "reduce",
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://127.0.0.1:3216/clinic/" + route, {
      waitUntil: "networkidle",
    });
    const row = {
      route,
      width,
      errors,
      title: await page.locator("h1").textContent(),
      overflow: await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      scope: "unchanged canonical personal route, regression only",
    };
    report.regression.push(row);
    await page.screenshot({
      path:
        out + "/" + route.split("/").at(-1) + "-" + width + "-regression.png",
    });
    await page.close();
  }
await browser.close();
report.externalManual = [
  "physical device and browser text zoom",
  "screen-reader operation",
  "clinic medical and brand review",
];
await writeFile(out + "/results.json", JSON.stringify(report, null, 2));
console.log(
  JSON.stringify({
    checks: report.rows.length,
    failures: report.rows.filter((r) => r.status === "FAIL"),
    regression: report.regression,
  }),
);
if (
  report.rows.some((r) => r.status === "FAIL") ||
  report.regression.some((r) => r.errors.length || r.overflow)
)
  process.exitCode = 1;
