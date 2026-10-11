import { readFile, writeFile, mkdir } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import assert from "node:assert/strict";
import { chromium } from "file:///F:/診所專案/cal-pilot/.claude/worktrees/shots/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright/index.mjs";
const root = new URL(".", import.meta.url);
const out =
  "F:/診所專案/output/playwright/clinic-editorial-home-20261006/" + (process.argv[2] || "verification");
await mkdir(out, { recursive: true });
const results = [];
async function check(name, action) {
  try {
    results.push({ name, status: "PASS", evidence: await action() });
  } catch (error) {
    results.push({ name, status: "FAIL", error: error.message });
  }
}
const manifest = JSON.parse(
  await readFile(new URL("asset-manifest.json", root)),
);
const files = [
  ...manifest.records.map((r) => ({ file: r.output, type: "image" })),
  { file: "index.html", type: "document" },
  { file: "home-site.css", type: "stylesheet" },
  ...["site.js", "home-data.js"].map((file) => ({ file, type: "script" })),
];
const sizes = {},
  counts = {};
for (const { file, type } of files) {
  const bytes = gzipSync(await readFile(new URL(file, root))).length;
  sizes[type] = (sizes[type] || 0) + bytes;
  counts[type] = (counts[type] || 0) + 1;
}
sizes.font = 0;
sizes.total = Object.values(sizes).reduce((n, size) => n + size, 0);
counts.total = files.length;
await check("Prototype allocation against unchanged clinic limits", () => {
  for (const [type, cap] of Object.entries({
    document: 3,
    stylesheet: 14,
    script: 20,
    image: 180,
    font: 0,
    total: 200,
  }))
    assert.ok(
      sizes[type] <= cap * 1024,
      type + " " + sizes[type] + " exceeds " + cap + " KiB",
    );
  for (const [type, cap] of Object.entries({
    image: 14,
    script: 2,
    stylesheet: 1,
    total: 18,
  }))
    assert.ok(counts[type] <= cap, type + " count");
  return {
    gzipBytes: sizes,
    counts,
    scope:
      "explicit full prototype closure including all six carousel photos, not formal dist/CI",
  };
});
const browser = await chromium.launch({ headless: true });
const axeSource = await readFile(
  "F:/診所專案/cal-pilot/.claude/worktrees/shots/node_modules/.pnpm/axe-core@4.12.1/node_modules/axe-core/axe.min.js",
  "utf8",
);
for (const width of [320, 375, 768, 1280, 1440]) {
  const page = await browser.newPage({
    viewport: { width, height: width <= 375 ? 812 : 900 },
    reducedMotion: "reduce",
  });
  const errors = [],
    requests = new Set();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("request", (request) => requests.add(request.url()));
  const response = await page.goto("http://127.0.0.1:3216/clinic", {
    waitUntil: "networkidle",
  });
  await check(width + "px native/CSP/reflow", async () => {
    assert.match(
      response.headers()["content-security-policy"],
      /require-trusted-types-for 'script'/,
    );
    assert.equal(await page.locator("h1").count(), 1);
    assert.equal(await page.locator("form").count(), 0);
    assert.equal(await page.locator('#team a[href*="booking"]').count(), 0);
    assert.equal(
      await page.locator(".hero-scene").getAttribute("data-playback"),
      "manual-only",
    );
    assert.equal(await page.locator("#photo-play").isVisible(), false);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    assert.deepEqual(errors, []);
    return {
      trustedTypes: true,
      pageErrors: errors,
      formCount: 0,
      individualBooking: 0,
    };
  });
  if ([375, 1440].includes(width)) {
    await check(width + "px accessible names/contrast/targets", async () => {
      await page.evaluate(axeSource);
      const axe = await page.evaluate(async () => {
        const result = await axe.run(document, {
          runOnly: {
            type: "tag",
            values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"],
          },
        });
        return result.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => n.target),
        }));
      });
      await writeFile(
        out + "/aria-" + width + ".yml",
        await page.locator("body").ariaSnapshot(),
      );
      assert.deepEqual(axe, []);
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
            .map((e) => ({
              label: e.textContent || e.getAttribute("aria-label"),
              height: e.getBoundingClientRect().height,
              width: e.getBoundingClientRect().width,
            }))
            .filter((e) => e.height < 43.9 || e.width < 43.9),
        );
      assert.deepEqual(small, []);
      return { axe: [], smallTargets: [] };
    });
    await check(width + "px complete image allocation", async () => {
      for (let i = 0; i < 6; i++) {
        await page.locator('[data-photo-index="' + i + '"]').click();
        await page.waitForFunction(
          (index) =>
            document
              .querySelector('[data-photo-index="' + index + '"]')
              .getAttribute("aria-pressed") === "true",
          i,
        );
      }
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
      });
      const images = [...requests]
        .filter((url) => url.includes("/visual-assets/"))
        .map((url) => new URL(url).pathname);
      const expected=manifest.records.map(record=>'/visual-assets/'+record.output.slice('assets/'.length));
      assert.deepEqual([...new Set(images)].sort(),expected.sort());
      assert.deepEqual(
        [...requests].filter(
          (url) => !url.startsWith("http://127.0.0.1:3216/"),
        ),
        [],
      );
      return { images, externalRequests: 0, fonts: 0 };
    });
  }
  await check(width + "px 200% text proxy", async () => {
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "32px";
      scrollTo(0, 0);
    });
    await page.screenshot({ path: out + "/text200-" + width + "-first.png" });
    await page.screenshot({
      path: out + "/text200-" + width + ".png",
      fullPage: true,
    });
    const overflow = await page.evaluate(() =>
      [...document.querySelectorAll("body *")]
        .filter((e) => {
          const r = e.getBoundingClientRect();
          const c = getComputedStyle(e);
          return (
            r.width &&
            c.position !== "absolute" &&
            c.visibility !== "hidden" &&
            (r.right > innerWidth + 1 || r.left < -1)
          );
        })
        .map((e) => ({
          tag: e.tagName,
          class: e.className,
          text: e.textContent.slice(0, 80),
        })),
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      JSON.stringify(overflow),
    );
    return {
      horizontalOverflow: false,
      method: "CSSOM root font 16 → 32; proxy, not physical browser zoom",
    };
  });
  await page.close();
}
const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
await page.clock.install();
await page.goto("http://127.0.0.1:3216/clinic", { waitUntil: "networkidle" });
await check(
  "Seven-second autoplay, full six-photo wrap and pause",
  async () => {
    const photos = [
      "logo",
      "consult",
      "reception",
      "lounge",
      "treatment",
      "desk",
      "logo",
    ];
    for (let i = 1; i < photos.length; i++) {
      await page.clock.runFor(7100);
      await page.waitForFunction(
        (id) => document.querySelector(".hero-scene").dataset.photo === id,
        photos[i],
      );
    }
    await page.locator("#photo-play").click();
    assert.equal(
      await page.locator(".hero-scene").getAttribute("data-playback"),
      "paused",
    );
    await page.clock.runFor(15000);
    assert.equal(
      await page.locator(".hero-scene").getAttribute("data-photo"),
      "logo",
    );
    return {
      seconds: 7,
      photos,
      pausedStable: true,
      timing: "Playwright virtual clock; decoded real local images",
    };
  },
);
await check(
  "Reduced motion toggle cancels autoplay and remains paused on return",
  async () => {
    await page.locator("#photo-play").click();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.locator('[data-photo-index="3"]').click();
    await page.waitForFunction(
      () => document.querySelector(".hero-scene").dataset.photo === "lounge",
    );
    await page.clock.runFor(20000);
    assert.equal(
      await page.locator(".hero-scene").getAttribute("data-photo"),
      "lounge",
    );
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.waitForFunction(
      () => document.querySelector(".hero-scene").dataset.playback === "paused",
    );
    assert.equal(
      await page.locator(".hero-scene").getAttribute("data-playback"),
      "paused",
    );
    await page.clock.runFor(15000);
    assert.equal(
      await page.locator(".hero-scene").getAttribute("data-photo"),
      "lounge",
    );
    return {
      reducedMotion: "manual-only",
      returningToNormal: "paused until explicit resume",
    };
  },
);
await check("Keyboard menu escape and visible focus", async () => {
  await page.locator(".mobile-navigation summary").focus();
  await page.keyboard.press("Enter");
  assert.equal(
    await page.locator(".mobile-navigation").getAttribute("open"),
    "",
  );
  await page.keyboard.press("Escape");
  assert.equal(
    await page.locator(".mobile-navigation").getAttribute("open"),
    null,
  );
  assert.equal(
    await page
      .locator(".mobile-navigation summary")
      .evaluate(
        (e) =>
          e === document.activeElement &&
          getComputedStyle(e).outlineStyle !== "none",
      ),
    true,
  );
  return { escapeFocus: "menu summary", visibleFocus: true };
});
await check("Booking boundary redirects to existing project", async () => {
  const response = await page.request.get("http://127.0.0.1:3216/booking", {
    maxRedirects: 0,
  });
  assert.equal(response.status(), 302);
  assert.equal(response.headers().location, "http://127.0.0.1:3100/booking");
  return {
    status: 302,
    boundary: response.headers().location,
    bookingMutations: 0,
  };
});
await browser.close();
await writeFile(
  out + "/results.json",
  JSON.stringify(
    {
      scope: "local source prototype, not formal content-hashed build or CI",
      results,
      externalManual: [
        "physical devices",
        "assistive technology",
        "real browser text zoom",
        "clinic medical/content review",
      ],
    },
    null,
    2,
  ),
);
console.log(JSON.stringify(results));
if (results.some((result) => result.status === "FAIL")) process.exitCode = 1;
