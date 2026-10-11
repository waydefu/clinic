import { chromium } from "file:///F:/診所專案/cal-pilot/.claude/worktrees/shots/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright/index.mjs";
import { mkdir, writeFile } from "node:fs/promises";
const out =
  "F:/診所專案/output/playwright/clinic-editorial-home-20261006/" +
  (process.argv[2] || "articles-v1");
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const rows = [];
const routes = process.argv.slice(3);
if (!routes.length) routes.push("doctors", "nasal/inferior-turbinate-surgery");
for (const route of routes)
  for (const width of [1440, 375]) {
    const page = await browser.newPage({
      viewport: { width, height: width === 375 ? 812 : 1000 },
      reducedMotion: "reduce",
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await page.goto("http://127.0.0.1:3216/clinic/" + route, {
      waitUntil: "networkidle",
    });
    const name = route.split("/").at(-1) + "-" + width;
    await page.screenshot({ path: out + "/" + name + "-first.png" });
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
    await page.screenshot({
      path: out + "/" + name + "-full.png",
      fullPage: true,
    });
    for (const selector of [
      ".comparison-section",
      ".instrument-section",
      ".editorial-profile",
      ".types-spread",
      ".body-causes",
      ".appliance-sequence",
    ]) {
      const l = page.locator(selector);
      if (await l.count())
        await l
          .first()
          .screenshot({
            path: out + "/" + name + "-" + selector.slice(1) + ".png",
          });
    }
    rows.push({
      route,
      width,
      errors,
      ...(await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        height: document.body.scrollHeight,
        imageUrls: [...new Set([...document.images].map((i) => i.currentSrc))],
      }))),
    });
    await page.close();
  }
await browser.close();
await writeFile(out + "/observations.json", JSON.stringify(rows, null, 2));
console.log(
  JSON.stringify(
    rows.map(({ route, width, errors, overflow, height }) => ({
      route,
      width,
      errors,
      overflow,
      height,
    })),
  ),
);
