import { chromium } from "file:///F:/診所專案/cal-pilot/.claude/worktrees/shots/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright/index.mjs";
import { mkdir, writeFile } from "node:fs/promises";
const out =
  "F:/診所專案/output/playwright/clinic-editorial-home-20261006/" +
  (process.argv[2] || "round2-v1");
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const rows = [];
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
  await page.goto("http://127.0.0.1:3216/clinic", { waitUntil: "networkidle" });
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
  await page.screenshot({ path: out + "/home-" + width + "-first.png" });
  await page.screenshot({
    path: out + "/home-" + width + "-full.png",
    fullPage: true,
  });
  for (const selector of [
    "#care",
    "#team",
    "#environment",
    "#visit",
    ".site-footer",
  ])
    await page
      .locator(selector)
      .screenshot({
        path: out + "/" + selector.replace(/[.#]/g, "") + "-" + width + ".png",
      });
  await page.locator(".care-action").first().focus();
  await page.screenshot({ path: out + "/action-focus-" + width + ".png" });
  await page.locator(".arrival-map [data-image-open]").click();
  await page.locator(".reader-tools button").last().click();
  await page
    .locator(".image-reader")
    .screenshot({ path: out + "/map-reader-" + width + ".png" });
  await page.keyboard.press("Escape");
  rows.push({
    width,
    errors,
    overflow: await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    h1: await page.locator("h1").evaluate((e) => {
      const r = e.getBoundingClientRect();
      return { x: r.x, y: r.y + scrollY, width: r.width, height: r.height };
    }),
    imageCount: await page.locator("img").count(),
    footerLinks: await page.locator(".site-footer a").count(),
  });
  await page.close();
}
await browser.close();
await writeFile(out + "/observations.json", JSON.stringify(rows, null, 2));
console.log(JSON.stringify(rows));
