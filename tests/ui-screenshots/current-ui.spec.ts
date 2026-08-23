import { expect, test, type Browser, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { arch, platform, release } from 'node:os';
import { join } from 'node:path';

import { fillBirthDate, submitBooking } from '../e2e/support/patient.js';
import {
  STORAGE_KEY,
  createBooking,
  login,
  openDisclosure,
  seedAppointmentCopies,
  showAllAppointments
} from '../e2e/support/workbench.js';

const PORT = 3211;
const BASE_URL = `http://127.0.0.1:${PORT}`;
// C6 使用新的 evidence id；C4、C5 與 C3 的目錄都是 immutable historical evidence。
const CAPTURE_DATE = '2026-08-23';
const EVIDENCE_ID = `ui-visual-c6-${CAPTURE_DATE}`;
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
  EVIDENCE_ID
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
  await expect(page.locator('#patient-hero')).toBeHidden();
  expect(
    await page.locator('#patient-slot-months [role="tab"]').count()
  ).toBeGreaterThanOrEqual(2);
}

async function prepareBookingTimeGroups(page: Page): Promise<void> {
  await prepareBookingStepTwo(page);
  let foundFullSaturday = false;
  const months = page.locator('#patient-slot-months [role="tab"]');
  for (
    let monthIndex = 0;
    monthIndex < (await months.count());
    monthIndex += 1
  ) {
    await months.nth(monthIndex).click();
    const saturdays = page.locator('#patient-slot-dates [role="tab"]', {
      hasText: '週六'
    });
    for (
      let dateIndex = 0;
      dateIndex < (await saturdays.count());
      dateIndex += 1
    ) {
      await saturdays.nth(dateIndex).click();
      if ((await page.locator('.slot-period h4').count()) === 3) {
        foundFullSaturday = true;
        break;
      }
    }
    if (foundFullSaturday) break;
  }
  expect(foundFullSaturday).toBe(true);
  await expect(page.locator('.slot-period h4')).toHaveText([
    '上午',
    '中午',
    '晚間'
  ]);
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

async function prepareBookingSuccess(page: Page): Promise<void> {
  await prepareFilledBookingDetails(page);
  await submitBooking(page);
  await expect(page.locator('[data-booking-result]')).toBeVisible();
  await expect(page.locator('#booking-complete-heading')).toHaveText(
    '預約已建立'
  );
}

async function prepareCancellationLookup(page: Page): Promise<void> {
  await prepareBookingSuccess(page);
  await page.locator('#booking-management-open').click();
  await page.locator('#booking-lookup-phone').fill('0912345678');
  await page.locator('#booking-lookup-birth').fill('1990-05-20');
  await page.locator('#booking-lookup-form button[type="submit"]').click();
  await expect(page.locator('.booking-lookup-card')).toBeVisible();
}

async function prepareEligibleCancellation(page: Page): Promise<void> {
  await prepareCancellationLookup(page);
  await page.locator('[data-managed-cancel]').click();
  await expect(page.locator('.confirm-dialog')).toBeVisible();
  await expect(page.locator('.confirm-dialog-message')).toContainText(
    '取消後時段會立即釋出'
  );
}

async function prepareCancellationPhoneFallback(page: Page): Promise<void> {
  await prepareBookingSuccess(page);
  await page.evaluate((key) => {
    const state = JSON.parse(localStorage.getItem(key) ?? 'null');
    state.appointments.at(-1).startsAt = new Date(
      Date.now() + 19 * 60_000
    ).toISOString();
    localStorage.setItem(key, JSON.stringify(state));
  }, STORAGE_KEY);
  await page.locator('#booking-management-open').click();
  await page.locator('#booking-lookup-phone').fill('0912345678');
  await page.locator('#booking-lookup-birth').fill('1990-05-20');
  await page.locator('#booking-lookup-form button[type="submit"]').click();
  await expect(page.locator('.booking-phone-fallback')).toBeVisible();
  await expect(page.locator('[data-managed-cancel]')).toHaveCount(0);
  // 第三步的診所聯絡區塊沿用了同一個 class（刻意重用已核可的樣式），所以
  // `.booking-cancel-contact` 現在會命中兩個元素——另一個雖然 hidden，CSS locator
  // 仍然算它，於是 strict mode 直接擋下。這裡要的是取消後備那一塊。
  await page
    .locator('.booking-cancel-contact:not(.patient-contact-options)')
    .scrollIntoViewIfNeeded();
  await expect(page.getByRole('link', { name: 'LINE' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Facebook' })).toBeVisible();
}

/**
 * 手機版成功結果頁。
 *
 * C5 在這裡壞過：showBookingResult 沿用 showStep(3) 留下的
 * data-booking-flow-step='3'，手機版「只留當下操作」的規則於是連結果頁一起命中，
 * 頁首與「查詢／取消預約」在 375px 消失。這個場景把修好的狀態固定成基準證據。
 */
async function prepareMobileSuccessHeader(page: Page): Promise<void> {
  await prepareBookingSuccess(page);
  await expect(page.locator('body')).toHaveAttribute(
    'data-booking-flow-step',
    'result'
  );
  await expect(page.locator('.patient-header')).toBeVisible();
  await expect(page.locator('#booking-management-open')).toBeVisible();
  await expect(page.locator('#theme-picker')).toBeVisible();
}

async function prepareCalendarEmpty(page: Page): Promise<void> {
  await login(page, 'admin', { fresh: false });
  await page.goto('/#appointments-section');
  await openDisclosure(page, '#week-calendar-disclosure');
  await expect(page.locator('.wv-date-table')).toBeVisible();
  await expect(page.locator('#week-view [data-week-event]')).toHaveCount(0);
}

async function prepareCalendarEvents(page: Page): Promise<void> {
  await login(page, 'admin', { fresh: false });
  await createBooking(page);
  await seedAppointmentCopies(page, 3);
  await page.goto('/#appointments-section');
  await openDisclosure(page, '#week-calendar-disclosure');
  await expect(page.locator('.wv-date-table')).toBeVisible();
  await expect(page.locator('#week-view [data-week-event]')).toHaveCount(3);
}

async function prepareCalendarOpenedException(page: Page): Promise<void> {
  await login(page, 'admin', { fresh: false });
  const expected = await page.evaluate((key) => {
    const state = JSON.parse(localStorage.getItem(key) ?? 'null');
    const firstSlot = [...state.slots].sort((left, right) =>
      String(left.startsAt).localeCompare(String(right.startsAt))
    )[0];
    const taipeiDate = new Date(
      Date.parse(firstSlot.startsAt) + 8 * 60 * 60_000
    )
      .toISOString()
      .slice(0, 10);
    const anchor = new Date(`${taipeiDate}T12:00:00Z`);
    const weekStart = new Date(
      anchor.getTime() - anchor.getUTCDay() * 24 * 60 * 60_000
    );
    const dateAt = (offset: number) =>
      new Date(weekStart.getTime() + offset * 24 * 60 * 60_000)
        .toISOString()
        .slice(0, 10);
    const openedDate = dateAt(1);
    const closedDate = dateAt(4);
    state.schedule.dateExceptions = [
      ...state.schedule.dateExceptions.filter(
        (entry) => ![openedDate, closedDate].includes(entry.date)
      ),
      {
        date: openedDate,
        kind: 'extra_open',
        intervals: [{ startLocalTime: '09:00', endLocalTime: '12:00' }]
      },
      { date: closedDate, kind: 'closed', intervals: [] }
    ];
    localStorage.setItem(key, JSON.stringify(state));
    return { openedDate, closedDate };
  }, STORAGE_KEY);
  await page.reload();
  await page.goto('/#appointments-section');
  await openDisclosure(page, '#week-calendar-disclosure');
  const calendar = page.locator('.wv-date-table');
  await expect(calendar).toBeVisible();
  await expect(calendar.locator('thead th')).toHaveCount(4);
  await expect(calendar.locator('.wv-extra-open')).toContainText('加開');
  await expect(calendar.locator('.wv-extra-open')).toContainText('09:00–12:00');
  await expect(calendar).toContainText(expected.openedDate.slice(5));
  await expect(calendar).not.toContainText(expected.closedDate.slice(5));
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

const scenarios: Scenario[] = [
  {
    file: 'workbench--weekly-calendar-empty--desktop-1280x900--warm.png',
    route: '/#appointments-section',
    role: 'admin',
    viewport: DESKTOP,
    state: 'four-open-date-columns-no-events',
    prepare: prepareCalendarEmpty
  },
  {
    file: 'workbench--weekly-calendar-opened-exception--desktop-1280x900--warm.png',
    route: '/#appointments-section',
    role: 'admin',
    viewport: DESKTOP,
    state: 'normally-closed-Monday-opened-and-Thursday-closed',
    prepare: prepareCalendarOpenedException
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
    state: 'step-2-month-navigation-available-dates',
    prepare: prepareBookingStepTwo
  },
  {
    file: 'booking--step-2-time-groups--desktop-1280x900--warm.png',
    route: '/booking',
    role: 'public',
    viewport: DESKTOP,
    state: 'step-2-morning-midday-evening-columns',
    prepare: prepareBookingTimeGroups
  },
  {
    file: 'booking--step-2--phone-375x812--warm.png',
    route: '/booking',
    role: 'public',
    viewport: PHONE,
    state: 'step-2-contained-month-and-date-navigation',
    prepare: prepareBookingStepTwo
  },
  {
    file: 'booking--step-3--desktop-1280x900--warm.png',
    route: '/booking',
    role: 'public',
    viewport: DESKTOP,
    state: 'step-3-filled-two-semantic-columns',
    prepare: prepareFilledBookingDetails
  },
  {
    file: 'booking--step-3--phone-375x812--warm.png',
    route: '/booking',
    role: 'public',
    viewport: PHONE,
    state: 'step-3-filled-sections-stacked',
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
    file: 'booking--cancellation-lookup--desktop-1280x900--warm.png',
    route: '/booking',
    role: 'public',
    viewport: DESKTOP,
    state: 'dual-field-phone-birth-lookup-result',
    fullPage: false,
    prepare: prepareCancellationLookup
  },
  {
    file: 'booking--eligible-cancellation-confirmation--desktop-1280x900--warm.png',
    route: '/booking',
    role: 'public',
    viewport: DESKTOP,
    state: 'more-than-20-minutes-confirmation-open',
    fullPage: false,
    prepare: prepareEligibleCancellation
  },
  {
    file: 'booking--cancellation-phone-social-fallback--phone-375x812--warm.png',
    route: '/booking',
    role: 'public',
    viewport: PHONE,
    state: '19-minutes-phone-primary-and-four-social-links',
    fullPage: false,
    prepare: prepareCancellationPhoneFallback
  },
  {
    file: 'booking--success-result--desktop-1280x900--warm.png',
    route: '/booking',
    role: 'public',
    viewport: DESKTOP,
    state: 'three-step-booking-success-result',
    fullPage: false,
    prepare: prepareBookingSuccess
  },
  {
    file: 'booking--success-header-restored--phone-375x812--warm.png',
    route: '/booking',
    role: 'public',
    viewport: PHONE,
    state: 'mobile-success-header-lookup-and-theme-restored',
    fullPage: false,
    prepare: prepareMobileSuccessHeader
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
      'Sticky headers, navigation and status regions are rendered in document flow; their runtime behavior remains covered by E2E tests.'
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
