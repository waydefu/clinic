import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { chromium, webkit } from "file:///F:/診所專案/cal-pilot/.claude/worktrees/shots/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright/index.mjs";

const out = "F:/診所專案/output/playwright/clinic-editorial-home-20261006/" + (process.argv[2] || "navigation-verification");
await mkdir(out, { recursive: true });
const results = [];
for (const [name, engine] of [["chromium", chromium], ["webkit", webkit]]) {
  const browser = await engine.launch();
  for (const width of [320, 375]) {
    const page = await browser.newPage({ viewport: { width, height: 812 }, reducedMotion: "no-preference" });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    try {
      await page.goto("http://127.0.0.1:3216/clinic", { waitUntil: "networkidle" });
      const summary = page.locator(".mobile-navigation summary");
      const menu = page.locator(".mobile-navigation");
      const nav = page.getByRole("navigation", { name: "手機主要導覽" });
      await summary.focus();
      await summary.press("Enter");
      const bounds = await nav.boundingBox();
      if (name === "chromium") await page.screenshot({ path: `${out}/menu-${width}.png` });
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width, "Opened menu must fit the viewport: " + JSON.stringify(bounds));
      const destinations = await nav.locator(".nav-care-links a").evaluateAll((links) => links.map((link) => ({ label: link.textContent, href: link.getAttribute("href"), height: link.getBoundingClientRect().height })));
      assert.equal(destinations.length, 4);
      assert.ok(destinations.every((link) => link.height >= 44));
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.waitForFunction(() => document.querySelector(".mobile-navigation nav").getAnimations().length === 0);
      assert.equal(await nav.isVisible(), true);
      await page.keyboard.press("Escape");
      assert.equal(await menu.getAttribute("open"), null);
      assert.equal(await summary.evaluate((node) => node === document.activeElement), true);
      await summary.click();
      await page.mouse.click(2, 200);
      assert.equal(await menu.getAttribute("open"), null);
      await summary.click();
      await nav.getByRole("link", { name: "下鼻甲手術", exact: true }).click();
      await page.waitForURL("**/clinic/nasal/inferior-turbinate-surgery");
      assert.match(await page.locator("h1").innerText(), /下鼻甲/);
      assert.deepEqual(errors, []);
      results.push({ engine: name, width, status: "PASS", bounds, destinations, route: await page.url(), reducedMotion: "open menu remains usable without animation", escapeFocus: "menu summary", outsideDismissal: true });
    } catch (error) {
      results.push({ engine: name, width, status: "FAIL", error: error.message, errors });
    }
    await page.close();
  }
  await browser.close();
}
await writeFile(out + "/results.json", JSON.stringify({ scope: "local source prototype navigation, not formal build or real devices", results }, null, 2));
console.log(JSON.stringify(results));
if (results.some((result) => result.status === "FAIL")) process.exitCode = 1;
