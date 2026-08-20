import { expect, test, type Browser, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { arch, platform, release } from 'node:os';
import { join } from 'node:path';

import { fillBirthDate } from '../e2e/support/patient.js';
import {
  createBooking,
  login,
  openDisclosure,
  seedAppointmentCopies,
  showAllAppointments
} from '../e2e/support/workbench.js';

const PORT = 3211;
const BASE_URL = `http://127.0.0.1:${PORT}`;
// 擷取日期。**改這裡就要一起改 `outputDirectory`、`check-structure.mjs` 的
// `visualBaselineDirectory` 與 required paths，以及介面規則書 §5.5 指向的現行基線。**
// 舊日期的目錄與文件保留作歷史證據，不刪。
const CAPTURE_DATE = '2026-08-20';
// 凍結的時鐘，讓合成狀態可重現。它**不是**擷取時間——兩者在 manifest 裡分開記錄，
// 正是為了不讓「畫面上顯示的日期」被誤讀成「這批圖是哪天拍的」。刻意沿用
// 2026-07-28 那批的值，讓兩批圖的合成資料落在同一個時間點，比對時只剩樣式差異。
const FIXED_TIME = '2026-07-29T01:00:00.000Z';
const LOCALE = 'zh-TW';
const TIME_ZONE = 'Asia/Taipei';
const THEME = 'warm';
const DEVICE_SCALE_FACTOR = 1;
const SOURCE_REVISION = 'commit-containing-this-manifest';
const NORMALIZATION_STYLESHEET_PATH =
  '/__ui-reference-capture-normalization.css';
// Chromium 的 fullPage 截圖會把 fixed／sticky 元件畫在某個任意拼接片段上，甚至把
// 已移出 viewport 的 skip link 畫回頁面中央。參考圖要表達文件的完整資訊層級，
// 因此只在截圖合成時把這些元件放回文流；實際 sticky/focus 行為仍由 E2E 驗證。
const FULL_PAGE_CAPTURE_STYLE = `
  .skip-link:not(:focus-visible),
  .clinic-skip-link:not(:focus) {
    visibility: hidden !important;
  }
  .clinic-header,
  .patient-header,
  .booking-summary,
  .workspace-nav,
  .status-banner,
  .status-message {
    position: static !important;
  }
`;
const repoRoot = process.cwd();
const outputDirectory = join(
  repoRoot,
  'docs',
  'reviews',
  'assets',
  `ui-visual-baseline-${CAPTURE_DATE}`
);
const playwrightVersion = (
  JSON.parse(
    readFileSync(
      join(repoRoot, 'node_modules', '@playwright', 'test', 'package.json'),
      'utf8'
    )
  ) as { version: string }
).version;

type Viewport = {
  width: number;
  height: number;
};

type ConsoleCounts = {
  errors: number;
  warnings: number;
};

type CaptureEntry = {
  file: string;
  route: string;
  role: string;
  viewport: Viewport;
  deviceScaleFactor: number;
  state: string;
  captureKind: 'reference-full-page' | 'reference-viewport';
  sha256: string;
  consoleCounts: ConsoleCounts;
};

type Scenario = {
  file: string;
  route: string;
  role: string;
  viewport: Viewport;
  state: string;
  fullPage?: boolean;
  prepare: (page: Page) => Promise<void>;
};

const DESKTOP = { width: 1280, height: 900 };
const PHONE = { width: 375, height: 812 };

function observeConsole(page: Page) {
  const errors: string[] = [];
  const warnings: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
    if (message.type() === 'warning') warnings.push(message.text());
  });
  page.on('pageerror', (error) => {
    errors.push(`pageerror: ${error.message}`);
  });

  return { errors, warnings };
}

async function resetLocalState(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate((theme) => {
    window.localStorage.clear();
    window.localStorage.setItem('beauessence_theme', theme);
  }, THEME);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', THEME);
}

async function decodeImages(page: Page): Promise<void> {
  await page.locator('img').evaluateAll(async (images) => {
    await Promise.all(
      images.map(async (node) => {
        const image = node as HTMLImageElement;
        image.loading = 'eager';
        await image.decode();
        if (image.naturalWidth === 0 || image.naturalHeight === 0) {
          throw new Error(
            `Image did not decode: ${image.currentSrc || image.src}`
          );
        }
      })
    );
  });
}

async function settlePage(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolveFrame) => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => resolveFrame());
      });
    });
  });
  await decodeImages(page);
}

async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth
  }));
  expect(
    dimensions.scrollWidth,
    `Horizontal overflow: ${JSON.stringify(dimensions)}`
  ).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

function assertConsoleClean(
  file: string,
  observed: ReturnType<typeof observeConsole>
): void {
  expect(observed.errors, `${file}: console/page errors`).toEqual([]);
  expect(observed.warnings, `${file}: console warnings`).toEqual([]);
}

async function prepareBookingStepOne(page: Page): Promise<void> {
  await page.goto('/booking');
  await expect(page.locator('[data-booking-type="initial"]')).toBeVisible();
  await expect(page.locator('[data-booking-step="1"]')).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.locator('#patient-title')).toBeVisible();
  await expect(page.locator('#patient-hours-summary')).toBeVisible();
  await expect(page.locator('.patient-header .brand')).toHaveAttribute(
    'href',
    '/booking'
  );
  await expect(page.locator('a[href="/clinic"]')).toHaveCount(0);
  await expect(page.locator('a[href="/clinic/doctors"]')).toHaveCount(0);
  await expect(page.locator('a[href="/"]')).toHaveCount(0);
}

async function prepareBookingStepTwo(page: Page): Promise<void> {
  await prepareBookingStepOne(page);
  await page.locator('[data-booking-type="initial"]').click();
  await page.locator('#patient-services [data-service]').first().click();
  await expect(page.locator('[data-patient-slot]').first()).toBeVisible();
  await expect(page.locator('[data-booking-step="2"]')).toBeVisible();
}

async function prepareFilledBookingDetails(page: Page): Promise<void> {
  await page.goto('/booking');
  await page.locator('[data-booking-type="initial"]').click();
  await page.locator('#patient-services [data-service]').first().click();
  await expect(page.locator('[data-patient-slot]').first()).toBeVisible();
  await page.locator('[data-patient-slot]').first().click();
  await expect(page.locator('#confirmation-heading')).toBeVisible();

  await page.locator('#patient-name').fill('合成截圖患者甲');
  await page.locator('#patient-phone').fill('0912345678');
  await fillBirthDate(page, { year: '1990', month: '05', day: '20' });
  await page.locator('#patient-national-id').fill('A123456789');
  await page.locator('#patient-nhi-card').check();
  await page.locator('[data-request-tag="same_day_procedure"]').check();
  await page.locator('[data-source-tag="friend_referral"]').check();
  await expect(page.locator('#patient-referrer-field')).toBeVisible();
  await page.locator('#patient-referrer').fill('合成介紹人');
  await page
    .locator('#patient-note')
    .fill('合成截圖基準資料；禁止輸入真實病患資料。');
  await page.locator('#privacy-consent').check();
  await page.locator('#synthetic-confirmation').check();
  await expect(page.locator('[data-booking-step="3"]')).toBeVisible();
}

async function prepareCalendarEmpty(page: Page): Promise<void> {
  await login(page, 'admin', { fresh: false });
  await page.goto('/#appointments-section');
  await openDisclosure(page, '#week-calendar-disclosure');
  await expect(page.locator('.wv-session-table')).toBeVisible();
  await expect(page.locator('#week-view [data-week-event]')).toHaveCount(0);
}

async function prepareCalendarEvents(page: Page): Promise<void> {
  await login(page, 'admin', { fresh: false });
  await createBooking(page);
  await seedAppointmentCopies(page, 3);
  await page.goto('/#appointments-section');
  await openDisclosure(page, '#week-calendar-disclosure');
  await expect(page.locator('.wv-session-table')).toBeVisible();
  await expect(page.locator('#week-view [data-week-event]')).toHaveCount(3);
}

async function prepareFollowUpWithCase(page: Page): Promise<void> {
  await login(page, 'admin', { fresh: false });
  await createBooking(page);
  await showAllAppointments(page);

  const appointment = page.locator('[data-appointment-card]').first();
  await appointment.locator('[data-appointment-action="complete"]').click();
  await page.locator('.confirm-dialog button.button-primary').click();
  await expect(page.locator('#status')).toContainText('到診已記錄');
  const form = page.locator('#follow-up-list [data-follow-up-form]').first();
  await expect(form).toBeVisible();
  await expect(form.locator('select[name="managerId"]')).toBeVisible();
}

async function preparePrivacyDialog(page: Page): Promise<void> {
  await prepareFilledBookingDetails(page);
  await page.locator('#open-privacy-policy').click();
  await expect(page.locator('.policy-dialog')).toBeVisible();
}

async function preparePrivacyReturn(page: Page): Promise<void> {
  await preparePrivacyDialog(page);
  await page
    .locator('.policy-dialog-body')
    .evaluate((element) => element.scrollTo(0, element.scrollHeight));
  await page.locator('.policy-dialog a[href="/booking?notice-read=1"]').click();
  await expect(page.locator('.policy-dialog')).toBeHidden();
  await expect(page.locator('[data-booking-step="3"]')).toBeVisible();
  await expect(page.locator('#patient-name')).toHaveValue('合成截圖患者甲');
  await expect(page.locator('#privacy-consent')).toBeChecked();
  await expect(page.locator('#open-privacy-policy')).toBeFocused();
}

const scenarios: Scenario[] = [
  {
    file: 'workbench--weekly-calendar-empty--desktop-1280x900--warm.png',
    route: '/#appointments-section',
    role: 'admin',
    viewport: DESKTOP,
    state: 'schedule-derived-sessions-no-events',
    prepare: prepareCalendarEmpty
  },
  {
    file: 'workbench--weekly-calendar-events--desktop-1280x900--warm.png',
    route: '/#appointments-section',
    role: 'admin',
    viewport: DESKTOP,
    state: 'three-actual-synthetic-events',
    prepare: prepareCalendarEvents
  },
  {
    file: 'workbench--follow-up-case--desktop-1280x900--warm.png',
    route: '/#appointments-section',
    role: 'admin',
    viewport: DESKTOP,
    state: 'completed-visit-follow-up-with-case-manager-field',
    prepare: prepareFollowUpWithCase
  },
  {
    file: 'workbench--follow-up-case--phone-375x812--warm.png',
    route: '/#appointments-section',
    role: 'admin',
    viewport: PHONE,
    state: 'completed-visit-follow-up-with-case-manager-field',
    prepare: prepareFollowUpWithCase
  },
  {
    file: 'booking--step-1-true-top--desktop-1280x900--warm.png',
    route: '/booking',
    role: 'public',
    viewport: DESKTOP,
    state: 'step-1-true-page-top-booking-only-header',
    fullPage: false,
    prepare: prepareBookingStepOne
  },
  {
    file: 'booking--step-2--desktop-1280x900--warm.png',
    route: '/booking',
    role: 'public',
    viewport: DESKTOP,
    state: 'step-2-with-persistent-summary',
    prepare: prepareBookingStepTwo
  },
  {
    file: 'booking--step-3--desktop-1280x900--warm.png',
    route: '/booking',
    role: 'public',
    viewport: DESKTOP,
    state: 'step-3-filled-with-persistent-summary',
    prepare: prepareFilledBookingDetails
  },
  {
    file: 'booking--step-3--phone-375x812--warm.png',
    route: '/booking',
    role: 'public',
    viewport: PHONE,
    state: 'step-3-filled-with-stacked-summary',
    prepare: prepareFilledBookingDetails
  },
  {
    file: 'booking--privacy-dialog-step-3--desktop-1280x900--warm.png',
    route: '/booking',
    role: 'public',
    viewport: DESKTOP,
    state: 'step-3-filled-policy-dialog-open',
    fullPage: false,
    prepare: preparePrivacyDialog
  },
  {
    file: 'booking--privacy-return-step-3--desktop-1280x900--warm.png',
    route: '/booking',
    role: 'public',
    viewport: DESKTOP,
    state: 'step-3-preserved-after-policy-return',
    prepare: preparePrivacyReturn
  }
];

async function captureScenario(
  browser: Browser,
  scenario: Scenario
): Promise<CaptureEntry> {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    viewport: scenario.viewport,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    locale: LOCALE,
    timezoneId: TIME_ZONE,
    colorScheme: 'light',
    reducedMotion: 'reduce'
  });
  const page = await context.newPage();
  const observed = observeConsole(page);

  try {
    // CSP 刻意禁止 inline style。以同源、只存在於 Playwright route 的 stylesheet
    // 套用截圖正規化，才能同時保留 production CSP 與 console-errors=0 的證據。
    await page.route(`**${NORMALIZATION_STYLESHEET_PATH}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/css; charset=utf-8',
        body: FULL_PAGE_CAPTURE_STYLE
      });
    });
    await page.clock.setFixedTime(FIXED_TIME);
    await resetLocalState(page);
    await scenario.prepare(page);
    await page.addStyleTag({
      url: `${BASE_URL}${NORMALIZATION_STYLESHEET_PATH}`
    });
    // 把游標移開，否則 `scenario.prepare` 最後一次點擊的位置會留下 `:hover`，
    // 而 hover 是有畫面的：`.button-primary:hover` 換成 `--accent-solid-strong`
    // 並 `translateY(-1px)`。2026-08-07 重拍時實際踩到——工作臺手機版的「到診」
    // 按鈕被拍成 `#0f4537`（hover）而不是 `#155c48`（預設），12457 個像素的差異
    // 看起來像是有人改了顏色 token，其實只是游標停在那裡。
    //
    // 基線是 approval artifact，把可控的非決定性留在裡面，之後每一次 diff 都要
    // 重新判斷一次「這是真的變更還是游標」。
    await page.mouse.move(-10, -10);
    await settlePage(page);
    await assertNoHorizontalOverflow(page);
    assertConsoleClean(scenario.file, observed);

    const outputPath = join(outputDirectory, scenario.file);
    const captureKind =
      scenario.fullPage === false
        ? 'reference-viewport'
        : 'reference-full-page';
    await page.screenshot({
      path: outputPath,
      fullPage: scenario.fullPage ?? true,
      animations: 'disabled',
      caret: 'hide',
      scale: 'css'
    });

    await settlePage(page);
    assertConsoleClean(scenario.file, observed);
    const bytes = await readFile(outputPath);
    return {
      file: scenario.file,
      route: scenario.route,
      role: scenario.role,
      viewport: scenario.viewport,
      deviceScaleFactor: DEVICE_SCALE_FACTOR,
      state: scenario.state,
      captureKind,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      consoleCounts: {
        errors: observed.errors.length,
        warnings: observed.warnings.length
      }
    };
  } finally {
    await context.close();
  }
}

test('capture the current synthetic UI reference set', async ({ browser }) => {
  await mkdir(outputDirectory, { recursive: true });

  const captures: CaptureEntry[] = [];
  for (const scenario of scenarios) {
    captures.push(await captureScenario(browser, scenario));
  }

  const manifest = {
    schemaVersion: 1,
    captureDate: CAPTURE_DATE,
    fixedTime: FIXED_TIME,
    sourceRevision: SOURCE_REVISION,
    referenceOnly: true,
    crossOsPixelGate: false,
    captureNormalization: [
      'Non-focused skip links are hidden to avoid Chromium full-page stitching artifacts.',
      'Sticky headers, navigation, booking summary and status regions are rendered in document flow; their runtime behavior remains covered by E2E tests.'
    ],
    environment: {
      os: {
        platform: platform(),
        release: release(),
        architecture: arch()
      },
      browser: {
        name: 'chromium',
        version: browser.version()
      },
      playwright: playwrightVersion,
      locale: LOCALE,
      timezone: TIME_ZONE,
      theme: THEME,
      reducedMotion: 'reduce',
      workers: 1,
      serverPort: PORT
    },
    captures
  };

  await writeFile(
    join(outputDirectory, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8'
  );

  const actualFiles = (await readdir(outputDirectory)).sort();
  const expectedFiles = [
    ...scenarios.map((scenario) => scenario.file),
    'manifest.json'
  ].sort();
  expect(actualFiles).toEqual(expectedFiles);
});
