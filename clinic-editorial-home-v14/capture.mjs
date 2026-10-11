import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "file:///F:/診所專案/cal-pilot/.claude/worktrees/shots/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright/index.mjs";
const version = process.argv[2] || "v2";
const widths = process.argv[3] ? process.argv[3].split(",").map(Number) : [1440, 375];
if (!widths.length || widths.some((width) => !Number.isInteger(width) || width < 320 || width > 3840))
  throw new Error("Capture widths must be integers from 320 to 3840.");
const out =
  "F:/診所專案/output/playwright/clinic-editorial-home-20261006/" + version;
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const observations = [];
for (const width of widths) {
  const page = await browser.newPage({
    viewport: { width, height: width === 375 ? 812 : 1000 },
    reducedMotion: "reduce",
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("http://127.0.0.1:3216/clinic", { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: out + "/home-" + width + "-first.png" });
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 500) {
      scrollTo(0, y);
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    }
    await Promise.all(
      [...document.images].map((image) => image.decode().catch(() => {})),
    );
    scrollTo(0, 0);
  });
  await page.screenshot({
    path: out + "/home-" + width + "-full.png",
    fullPage: true,
  });
  for (const id of ["care", "team", "environment", "visit"])
    await page
      .locator("#" + id)
      .screenshot({ path: out + "/" + id + "-" + width + ".png" });
  observations.push({
    width,
    errors,
    ...(await page.evaluate(() => ({
      height: document.body.scrollHeight,
      overflow: document.documentElement.scrollWidth > innerWidth,
      images: [...document.images].map((image) => ({
        url: image.currentSrc,
        width: image.naturalWidth,
        height: image.naturalHeight,
      })),
    }))),
  });
  await page.close();
}
await browser.close();
await writeFile(
  out + "/observations.json",
  JSON.stringify(observations, null, 2),
);
console.log(
  JSON.stringify(
    observations.map(({ width, errors, height, overflow }) => ({
      width,
      errors,
      height,
      overflow,
    })),
  ),
);
