/* global document, window, console */
// Local review evidence; does not replace the owner-approved visual baseline.
// Build first, serve web-dist on loopback, then:
// node tests/ui-screenshots/redesign-capture.mjs before|after
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { format, resolveConfig } from 'prettier';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { URL } from 'node:url';
import { platform, arch } from 'node:os';
import process from 'node:process';

const phase = process.argv[2];
if (!['before', 'after'].includes(phase))
  throw new Error('Expected before|after');
const directory = `docs/reviews/assets/ui-ux-redesign-2026-09-07/${phase}`;
await mkdir(directory, { recursive: true });
const fixedTime = '2026-07-29T01:00:00.000Z';
const baseURL =
  process.env['CLINIC_CAPTURE_BASE_URL'] ?? 'http://127.0.0.1:3310';
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(baseURL).hostname)) {
  throw new Error('Synthetic capture requires loopback');
}
const hash = (data) => createHash('sha256').update(data).digest('hex');
const dist = [];
const distRoot = process.env['CLINIC_CAPTURE_DIST'] ?? 'apps/web/dist';
async function inventory(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const file = join(path, entry.name);
    if (entry.isDirectory()) await inventory(file);
    else
      dist.push({
        file: file.slice(distRoot.length + 1),
        sha256: hash(await readFile(file))
      });
  }
}
await inventory(distRoot);
dist.sort((a, b) => a.file.localeCompare(b.file));
// PRoot cannot start a GPU child process. Opt in only for local reference
// captures; CI keeps the normal multiprocess browser and unchanged gates.
const softwareOnly = process.env['CLINIC_CAPTURE_SOFTWARE_ONLY'] === 'true';
const launchArgs = softwareOnly
  ? ['--use-gl=disabled', '--disable-gpu-compositing']
  : [];
let browser;
let browserVersion;
const captures = [];
try {
  for (const width of [320, 360, 375, 390, 768, 1280, 1440]) {
    for (const surface of ['clinic', 'booking', 'staff']) {
      browser = await chromium.launch({ args: launchArgs });
      browserVersion = browser.version();
      const viewport = {
        width,
        height:
          width === 320 ? 568 : width === 375 ? 812 : width < 768 ? 844 : 900
      };
      const context = await browser.newContext({
        baseURL,
        viewport,
        locale: 'zh-TW',
        timezoneId: 'Asia/Taipei',
        deviceScaleFactor: 1,
        colorScheme: 'light',
        reducedMotion: 'reduce'
      });
      const page = await context.newPage();
      const errors = [];
      const warnings = [];
      const failedResponses = [];
      page.on('response', (response) => {
        if (response.status() >= 400)
          failedResponses.push({
            path: new URL(response.url()).pathname,
            status: response.status()
          });
      });
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
        if (m.type() === 'warning') warnings.push(m.text());
      });
      await page.clock.setFixedTime(new Date(fixedTime));
      await page.goto(`/${surface}`);
      if (surface === 'staff') {
        await page.locator('#login-account').fill('admin');
        await page.locator('#login-password').fill('beauessence-admin');
        await page.locator('#login-submit').click();
        await page.locator('#login-view').waitFor({ state: 'hidden' });
        await page.goto('/staff#appointments-section');
        await page.locator('#booking-workflow').evaluate((el) => {
          el.open = true;
        });
        await page.locator('#booking-name').fill('TEST_UI_001');
        await page.locator('#booking-phone').fill('0900000001');
        await page.locator('#booking-birth').fill('1990-01-01');
        await page.locator('#booking-national-id').fill('A123456789');
        await page.locator('#booking-kind').selectOption('initial');
        await page
          .locator('#booking-items [data-booking-item]')
          .first()
          .check();
        await page.locator('#slots [data-select-slot]').first().click();
        await page.locator('#booking-form button[type="submit"]').click();
        await page
          .locator('#status')
          .filter({ hasText: '預約已建立' })
          .waitFor();
        await page.locator('#appointment-status-filter').selectOption('all');
      }
      await page.waitForLoadState('networkidle');
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(
          [...document.images].filter((i) => i.complete).map((i) => i.decode())
        );
        window.scrollTo(0, 0);
      });
      await page.mouse.move(-10, -10);
      const dimensions = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        heading: [...document.querySelectorAll('h1, #appointments-heading')]
          .filter((el) => el.checkVisibility())
          .map((el) => el.innerText.trim()),
        theme: document.documentElement.dataset.theme ?? 'light',
        primaryY: document
          .querySelector(
            '[data-booking-type], .clinic-hybrid-hero__actions, #appointment-list'
          )
          ?.getBoundingClientRect().top
      }));
      const file = `${surface}-${width}.png`;
      const bytes = await page.screenshot({
        path: join(directory, file),
        animations: 'disabled'
      });
      let axe = null;
      if (width === 390 || width === 1280) {
        const result = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
          .withRules(['target-size'])
          .analyze();
        axe = {
          version: result.testEngine.version,
          violations: result.violations.map((v) => ({
            id: v.id,
            impact: v.impact,
            count: v.nodes.length,
            targets: v.nodes.map((n) => n.target)
          }))
        };
      }
      captures.push({
        file,
        role: surface === 'staff' ? 'synthetic-operator' : 'public',
        route: page.url().replace(baseURL, ''),
        viewport,
        theme: dimensions.theme,
        state:
          surface === 'staff' ? 'synthetic-appointment-populated' : 'initial',
        dimensions,
        sha256: hash(bytes),
        errors,
        warnings,
        failedResponses,
        axe
      });
      console.log(
        `${phase} ${surface} ${width}: overflow=${dimensions.scrollWidth - dimensions.clientWidth}, errors=${errors.length}, axe=${axe?.violations.length ?? 'not sampled'}`
      );
      await context.close();
      await browser.close();
    }
  }
} finally {
  await browser?.close();
}
await writeFile(
  join(directory, 'manifest.json'),
  await format(
    `${JSON.stringify(
      {
        phase,
        captureDate: new Date().toISOString(),
        fixedTime,
        sourceRevision:
          phase === 'before'
            ? 'df51b5ae32e74cbd0236f1367545c75205320adf'
            : 'commit-containing-this-manifest',
        environment: {
          os: platform(),
          arch: arch(),
          browser: browserVersion,
          playwright: JSON.parse(
            await readFile('node_modules/@playwright/test/package.json', 'utf8')
          ).version,
          launchArgs,
          locale: 'zh-TW',
          timezone: 'Asia/Taipei',
          reducedMotion: 'reduce',
          dpr: 1
        },
        captureKind: 'reference-viewport',
        dist,
        captures
      },
      null,
      2
    )}\n`,
    {
      ...(await resolveConfig(join(directory, 'manifest.json'))),
      parser: 'json'
    }
  )
);
