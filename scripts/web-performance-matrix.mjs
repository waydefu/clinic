// WEB-P0-02：效能覆蓋矩陣與 artifact 結構驗證（純函式，可單元測試）。
//
// 「什麼算完整」的定義住在這裡，瀏覽器量測住在
// tests/e2e/performance.spec.ts。兩邊共用同一份定義：spec 收集 records，
// CI artifact 由 validatePerformanceArtifact 背書——缺漏、跳過、謊報預算
// 都變成 FAIL，永遠不是 PASS。
//
// 為什麼 profile 只寫死兩個：Playwright 專案已有 Desktop Chrome 與 Pixel 7
// 兩個 device descriptor（playwright.config.ts），行動版版面正確性由
// mobile-layout／responsive 兩支 spec 在真實 descriptor 下覆蓋；這裡的
// mobile 觀察是實驗室時間（lab timing）的代理，取 Pixel 7 的 CSS viewport
// 390×844，不另開第三種尺寸製造笛卡兒積。

/** 實驗室時間指標：沿用 performance-budget.json 的 timings，不自創。 */
export const TIMING_METRICS = [
  'first-contentful-paint',
  'largest-contentful-paint',
  'cumulative-layout-shift'
];

/**
 * 量測 viewport。桌機取 Desktop Chrome 預設 1280×720；手機取 Pixel 7 的
 * CSS viewport 390×844（device descriptor 本體仍由 mobile 專案覆蓋）。
 */
export const PERFORMANCE_PROFILES = [
  { name: 'desktop', width: 1280, height: 720 },
  { name: 'mobile', width: 390, height: 844 }
];

/** 觀察記錄的狀態：量不到只能是 UNAVAILABLE 或 FAIL，絕不能是 PASS。 */
export const RECORD_STATUSES = ['PASS', 'FAIL', 'UNAVAILABLE'];

/**
 * 進入點產物檔名 → 對外路由的 canonical 對應（單一來源）。
 *
 * index.html 是 `/staff`、patient.html 由 /booking 提供（firebase.json 的
 * rewrite，server.mjs 同步實作）；clinic.html 承載 CLINIC_ROUTES 的每一條
 * 具體路由。spec 與 merge 腳本都從這裡拿，不各寫一份。
 */
export function defaultEntryRoutes({ clinicRoutes }) {
  return [
    { entryPath: '/patient.html', routes: ['/booking'] },
    { entryPath: '/index.html', routes: ['/staff'] },
    { entryPath: '/clinic.html', routes: [...clinicRoutes] }
  ];
}

/** artifact 綁定的 exact commit：40 位小寫 hex，GITHUB_SHA 或 rev-parse。 */
export const SHA_PATTERN = /^[0-9a-f]{40}$/;

/**
 * 讀出 authoritative 預算。缺指標就丟錯——回傳 undefined 會讓呼叫端
 * 把「沒有門檻」當成「通過」。
 */
export function timingBudget(budgets, entryPath, metric) {
  const entry = budgets.find((candidate) => candidate.path === entryPath);
  const timing = entry?.timings?.find(
    (candidate) => candidate.metric === metric
  );
  if (timing === undefined) {
    throw new Error(`performance-budget.json 缺少 ${entryPath} 的 ${metric}`);
  }
  return timing.budget;
}

/**
 * 展開「進入點 × 具體路由 × 雙 profile」的完整觀察清單。
 *
 * @param budgets performance-budget.json 內容（決定哪些進入點有 timings）。
 * @param entryRoutes [{ entryPath, routes: [route...] }]，呼叫端由
 *   defaultEntryRoutes 建出來；這裡不自己猜對應關係。
 */
export function expectedObservations({ budgets, entryRoutes }) {
  const budgeted = new Set(
    budgets
      .filter((entry) => Array.isArray(entry.timings))
      .map((entry) => entry.path)
  );
  const expected = [];
  for (const { entryPath, routes } of entryRoutes) {
    if (!budgeted.has(entryPath)) continue;
    for (const route of routes) {
      for (const profile of PERFORMANCE_PROFILES) {
        expected.push({ entryPath, route, profile: profile.name });
      }
    }
  }
  return expected;
}

function isFiniteNonNegative(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/**
 * 驗證效能 artifact 的結構與誠實性，回傳失敗字串（空陣列＝通過）。
 *
 * 檢查：head SHA 存在且格式正確；每一個期望觀察點都有記錄；
 * 沒有未知路由／profile；PASS 記錄的每個指標都是有限數值、
 * 大於 0（量到 0 代表觀察器沒裝上，不是效能好）、不超過門檻，
 * 且記錄上寫的門檻數字與 authoritative 預算一致；
 * FAIL／UNAVAILABLE 是誠實的紅燈，結構對就通過。
 */
export function validatePerformanceArtifact(
  artifact,
  { budgets, entryRoutes }
) {
  const failures = [];
  const expected = expectedObservations({ budgets, entryRoutes });
  const expectedKeys = new Set(
    expected.map(({ route, profile }) => `${profile} ${route}`)
  );

  if (
    typeof artifact?.headSha !== 'string' ||
    !SHA_PATTERN.test(artifact.headSha)
  ) {
    failures.push('artifact 缺少合法的 head SHA（40 位 hex）。');
  }

  const records = Array.isArray(artifact?.records) ? artifact.records : [];
  if (!Array.isArray(artifact?.records)) {
    failures.push('artifact 缺少 records 陣列。');
  }

  const seen = new Set();
  for (const [index, record] of records.entries()) {
    const where = `records[${index}]`;
    const key = `${record?.profile} ${record?.route}`;
    if (!expectedKeys.has(key)) {
      failures.push(
        `${where} 的 ${key} 不在期望矩陣裡（未知路由或 profile）。`
      );
      continue;
    }
    seen.add(key);
    if (!RECORD_STATUSES.includes(record?.status)) {
      failures.push(`${where} 的狀態 ${String(record?.status)} 非法。`);
      continue;
    }
    for (const metric of TIMING_METRICS) {
      let authoritative;
      try {
        authoritative = timingBudget(budgets, record.entryPath, metric);
      } catch {
        failures.push(
          `${where} 的進入點 ${record?.entryPath} 沒有 ${metric} 門檻。`
        );
        continue;
      }
      if (record?.budgets?.[metric] !== authoritative) {
        failures.push(
          `${where} 申報的 ${metric} 門檻 ${String(record?.budgets?.[metric])} 與 authoritative 的 ${authoritative} 不一致。`
        );
      }
      const value = record?.metrics?.[metric];
      if (record.status === 'PASS') {
        if (!isFiniteNonNegative(value) || value <= 0) {
          failures.push(
            `${where} 標 PASS 但 ${metric} 量不到（${String(value)}）：必須是 FAIL 或 UNAVAILABLE。`
          );
        } else if (value > authoritative) {
          failures.push(
            `${where} 標 PASS 但 ${metric}=${value} 超過門檻 ${authoritative}。`
          );
        }
      }
    }
  }

  for (const { route, profile } of expected) {
    if (!seen.has(`${profile} ${route}`)) {
      failures.push(`缺少觀察記錄：${profile} ${route}（不得靜默跳過）。`);
    }
  }

  return failures;
}
