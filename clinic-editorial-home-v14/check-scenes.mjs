import { chromium } from "file:///F:/診所專案/cal-pilot/.claude/worktrees/shots/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright/index.mjs";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
const sharp = createRequire(import.meta.url)(
  "<HOME>/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp",
);
const out =
  "F:/診所專案/output/playwright/clinic-editorial-home-20261006/scenes";
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const rows = [];
const linear = (value) => {
  const s = value / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]) =>
  0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
const ink = luminance([24, 57, 47]);
for (const width of [1440, 375]) {
  const page = await browser.newPage({
    viewport: { width, height: 1000 },
    reducedMotion: "reduce",
  });
  await page.goto("http://127.0.0.1:3216/clinic", { waitUntil: "networkidle" });
  for (let i = 0; i < 6; i++) {
    await page.locator('[data-photo-index="' + i + '"]').click();
    await page.waitForFunction(
      (index) =>
        document
          .querySelector('[data-photo-index="' + index + '"]')
          .getAttribute("aria-pressed") === "true",
      i,
    );
    for (const scale of [1, 2]) {
      await page.evaluate((scale) => {
        document.documentElement.style.fontSize = 16 * scale + "px";
        scrollTo(0, 0);
      }, scale);
      const box = await page.locator("#hero-title").boundingBox();
      const controls = await page.locator(".photo-controls").boundingBox();
      if (scale === 1)
        await page.screenshot({
          path: out + "/scene-" + i + "-" + width + ".png",
        });
      await page.locator("#hero-title").evaluate((e) => {
        e.style.visibility = "hidden";
      });
      const buffer = await page.screenshot({
        clip: {
          x: Math.ceil(box.x),
          y: Math.ceil(box.y),
          width: Math.floor(box.width),
          height: Math.floor(box.height),
        },
        captureBeyondViewport: true,
      });
      await page.locator("#hero-title").evaluate((e) => {
        e.style.visibility = "";
      });
      const pixels = await sharp(buffer)
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      let minimum = Infinity;
      for (let n = 0; n < pixels.data.length; n += 3 * 4) {
        const bg = luminance([...pixels.data.subarray(n, n + 3)]);
        minimum = Math.min(
          minimum,
          (Math.max(bg, ink) + 0.05) / (Math.min(bg, ink) + 0.05),
        );
      }
      rows.push({
        width,
        scale,
        photo: i,
        minimumTitleContrast: minimum,
        controlsOverlap:
          controls.y < box.y + box.height &&
          controls.x < box.x + box.width &&
          controls.x + controls.width > box.x,
        title: box,
      });
    }
  }
  await page.close();
}
await browser.close();
await writeFile(out + "/contrast.json", JSON.stringify(rows, null, 2));
console.log(
  JSON.stringify({
    samples: rows.length,
    minContrast: Math.min(...rows.map((r) => r.minimumTitleContrast)),
    overlaps: rows.filter((r) => r.controlsOverlap),
  }),
);
