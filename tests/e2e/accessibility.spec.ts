import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// canonical 診所路由：clinic-content.js 的 CLINIC_ROUTES 是唯一真實來源，
// check:pages 會拿它與 public-pages.json、server 與 Hosting 雙向比對。
// 完整迴圈直接 import，不手抄第二份路由清單。
import { CLINIC_ROUTES } from '../../apps/web/public/clinic-content.js';
import {
  classifyFindings,
  targetKey
} from '../../scripts/web-a11y-waivers.mjs';

import {
  evidenceHeadSha,
  evidenceSlug,
  writeEvidenceShard
} from './support/evidence-shards.js';

import {
  createBooking,
  login,
  openStaffRescheduleForm,
  seedAppointmentCopies,
  showAllAppointments
} from './support/workbench.js';
import { openPatientRescheduleControls } from './support/patient.js';

export const PUBLIC_PAGE_SCAN_ROUTES = [
  '/staff',
  '/booking',
  '/privacy',
  '/clinic'
] as const;
const [WORKBENCH_ROUTE, BOOKING_ROUTE, PRIVACY_ROUTE, CLINIC_ROUTE] =
  PUBLIC_PAGE_SCAN_ROUTES;

// axe 無障礙掃描，跑在打包後的產物上。這是自動化能抓到的一部分 WCAG 問題
// （對比、名稱、地標、表單標籤…）；它補足而非取代人工報讀器與鍵盤測試。
//
// WEB-P0-03：涵蓋到 WCAG 2.2 AA 的**全部適用違規**——moderate 也擋。
// 先前只擋 serious／critical 的做法會讓 minor／moderate 的 A／AA 違規靜默通過，
// 與「0 未豁免 A／AA」的驗收直接衝突，故改為完整阻擋＋expiring waiver。
// 豁免住在 apps/web/accessibility-waivers.json，窄匹配、到期失效。
//
// 2.2 自 2023 年起就是 W3C Recommendation，是現行標準。
//
// 只加 wcag22aa 標籤仍不會執行 `target-size`：axe-core 4.12 將該規則預設停用。
// `scan` 必須另外明確啟用它，否則註解與規則書雖然都聲稱有量 24px，實際掃描卻
// 完全沒跑。
const STANDARD_TAGS = [
  'wcag2a',
  'wcag2aa',
  'wcag21a',
  'wcag21aa',
  'wcag22a',
  'wcag22aa'
];

interface A11yFinding {
  rule: string;
  impact: string;
  tags: string[];
  target: string[];
  summary: string;
  disposition: string;
  waiverId?: string;
}

const waiversRegistry = JSON.parse(
  readFileSync(
    join(__dirname, '..', '..', 'apps', 'web', 'accessibility-waivers.json'),
    'utf8'
  )
) as { schemaVersion: number; waivers: Array<Record<string, string>> };

// 期望掃描矩陣的互動狀態那一半住在 `scripts/merge-web-evidence.mjs` 的
// WORKBENCH_SCAN_STATES（單一來源）；這裡的 scan() 呼叫必須逐字使用那些字串。
// `/clinic` 已在字面迴圈掃過，完整迴圈只補其餘具體路由，不重複。
const CONCRETE_CLINIC_ROUTES = (CLINIC_ROUTES as string[]).filter(
  (route) => route !== CLINIC_ROUTE
);

async function scan(page: Page, route: string, state: string) {
  const builder = new AxeBuilder({ page }).withTags(STANDARD_TAGS).options({
    rules: {
      'target-size': { enabled: true }
    }
  });
  const results = await builder.analyze();
  const evaluatedRuleIds = new Set<string>();
  for (const group of [
    results.violations,
    results.passes,
    results.incomplete,
    results.inapplicable
  ]) {
    for (const rule of group ?? []) evaluatedRuleIds.add(rule.id);
  }
  const classification = classifyFindings({
    violations: results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact ?? 'unknown',
      tags: violation.tags ?? [],
      nodes: violation.nodes.map((node) => ({
        target: node.target,
        failureSummary: node.failureSummary
      }))
    })),
    route,
    state,
    waivers: waiversRegistry.waivers
  }) as unknown as { results: A11yFinding[]; failures: string[] };
  const findings = classification.results;
  const failures = classification.failures;
  const viewport = page.viewportSize();
  // 先寫分片再斷言：失敗的掃描也要留下記錄，合併後的 artifact 才完整。
  // findings 只存 target 與 failureSummary，不存節點 HTML——工作臺固件裡有
  // 電話號碼形式的合成值，進 artifact 會變成敏感外觀的資料。
  // 同一掃描 retry 會覆寫同名分片（先後執行，不競態）。
  const sha = evidenceHeadSha();
  writeEvidenceShard('web-accessibility', evidenceSlug(route, state), {
    schemaVersion: 1,
    headSha: sha,
    generatedBy: 'tests/e2e/accessibility.spec.ts',
    scan: {
      route,
      state,
      viewport:
        viewport === null ? 'unknown' : `${viewport.width}x${viewport.height}`,
      axeVersion: results.testEngine?.version ?? 'unknown',
      findings
    },
    evaluatedRuleIds: Array.from(evaluatedRuleIds)
  });
  // 失敗時把違規的規則與節點印出來，才知道要修哪裡。
  expect(
    failures,
    `${route} [${state}] axe violations:\n${JSON.stringify(
      findings
        .filter((finding) => finding.disposition === 'VIOLATION')
        .map((finding) => ({
          id: finding.rule,
          impact: finding.impact,
          target: targetKey(finding.target)
        })),
      null,
      2
    )}`
  ).toEqual([]);
}

for (const route of PUBLIC_PAGE_SCAN_ROUTES) {
  test(`manifest public page 沒有未豁免違規：${route}`, async ({ page }) => {
    await page.goto(route);

    if (route === WORKBENCH_ROUTE) {
      await page.evaluate(() => window.localStorage.clear());
      await page.reload();
      await expect(page.locator('#login-account')).toBeVisible();
    } else if (route === BOOKING_ROUTE) {
      await expect(page.locator('[data-booking-type="initial"]')).toBeVisible();
    } else if (route === PRIVACY_ROUTE) {
      await expect(
        page.getByRole('heading', { level: 1, name: /隱私權政策/ })
      ).toBeVisible();
    } else {
      await expect(
        page.getByRole('heading', {
          level: 1,
          name: '今晚，不必再和呼吸拔河'
        })
      ).toBeVisible();
    }

    await scan(page, route, 'default');
  });
}

// 具體 clinic 路由全掃：八條路由共用 clinic.html 殼，但醫師／療程內容實質不同，
// 只掃 `/clinic` 證明不了其餘七條。每條的 h1 由 clinic-site.spec.ts 背書。
for (const route of CONCRETE_CLINIC_ROUTES) {
  test(`clinic 具體路由沒有未豁免違規：${route}`, async ({ page }) => {
    await page.goto(route);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await scan(page, route, 'default');
  });
}

test.describe('無障礙掃描', () => {
  test('工作臺登入後的預約清單沒有未豁免違規', async ({ page }) => {
    await page.goto(WORKBENCH_ROUTE);
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    await page.locator('#login-account').fill('admin');
    await page.locator('#login-password').fill('beauessence-admin');
    await page.locator('#login-view button[type="submit"]').click();
    await expect(page.locator('#logout')).toBeVisible();
    await page.goto(`${WORKBENCH_ROUTE}#appointments-section`);
    // 展開建立預約的 <details>，讓掃描也涵蓋表單欄位。
    await page.locator('#booking-workflow').evaluate((element) => {
      (element as HTMLDetailsElement).open = true;
    });
    await expect(page.locator('#booking-form')).toBeVisible();
    await scan(page, WORKBENCH_ROUTE, 'workbench-appointments');
  });

  test('工作臺改期表單沒有未豁免違規', async ({ page }) => {
    await openStaffRescheduleForm(page);
    await scan(page, WORKBENCH_ROUTE, 'workbench-reschedule');
  });

  test('患者自助改期控制沒有未豁免違規', async ({ page }) => {
    await openPatientRescheduleControls(page);
    await expect(
      page.getByRole('heading', { name: '查詢／取消預約' })
    ).toBeVisible();
    await scan(page, BOOKING_ROUTE, 'patient-reschedule');
  });

  test('預約分頁有可及名稱、頁碼狀態且沒有未豁免違規', async ({ page }) => {
    await login(page);
    await createBooking(page);
    await seedAppointmentCopies(page, 25);
    await showAllAppointments(page);

    const pagination = page.getByRole('navigation', {
      name: '預約清單分頁'
    });
    await expect(pagination).toBeVisible();
    await expect(
      pagination.getByRole('button', { name: '上一頁預約' })
    ).toBeDisabled();
    await expect(
      pagination.getByRole('button', { name: '下一頁預約' })
    ).toBeEnabled();
    await expect(page.locator('#appointment-page-status')).toHaveText(
      '第 1 頁，共 2 頁'
    );
    await scan(page, WORKBENCH_ROUTE, 'workbench-pagination');
  });

  test('forced-colors 模擬保留焦點、目前步驟、目前工作區與按鈕邊界', async ({
    page
  }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await page.goto(BOOKING_ROUTE);
    await expect(page.locator('[data-booking-type="initial"]')).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () => window.matchMedia('(forced-colors: active)').matches
        )
      )
      .toBe(true);

    const currentStep = page.locator(
      '.booking-stepper li[aria-current="step"]'
    );
    const stepOutline = await currentStep.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        style: style.outlineStyle,
        width: Number.parseFloat(style.outlineWidth)
      };
    });
    expect(stepOutline.style).not.toBe('none');
    expect(stepOutline.width).toBeGreaterThanOrEqual(2);

    await page.keyboard.press('Tab');
    const focusOutline = await page.evaluate(() => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) return null;
      const style = getComputedStyle(active);
      return {
        style: style.outlineStyle,
        width: Number.parseFloat(style.outlineWidth)
      };
    });
    expect(focusOutline).not.toBeNull();
    expect(focusOutline?.style).not.toBe('none');
    // Chromium may normalize the authored 3px system-color outline to 2px
    // under forced colors; the invariant is that a visible outline survives.
    expect(focusOutline?.width).toBeGreaterThanOrEqual(2);

    await login(page);
    await page.goto(`${WORKBENCH_ROUTE}#appointments-section`);
    const currentWorkspace = page.locator(
      '[data-workspace-nav][aria-current="page"]'
    );
    const workspaceOutline = await currentWorkspace.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        style: style.outlineStyle,
        width: Number.parseFloat(style.outlineWidth)
      };
    });
    expect(workspaceOutline.style).not.toBe('none');
    expect(workspaceOutline.width).toBeGreaterThanOrEqual(2);

    const buttonBorder = await page
      .locator('#appointment-filter-reset')
      .evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          style: style.borderTopStyle,
          width: Number.parseFloat(style.borderTopWidth)
        };
      });
    expect(buttonBorder.style).not.toBe('none');
    expect(buttonBorder.width).toBeGreaterThanOrEqual(1);
  });
});
