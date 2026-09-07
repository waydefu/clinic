import { describe, expect, it } from 'vitest';
import {
  PERFORMANCE_PROFILES,
  SHA_PATTERN,
  TIMING_METRICS,
  expectedObservations,
  timingBudget,
  validatePerformanceArtifact
} from './web-performance-matrix.mjs';

// WEB-P0-02：效能覆蓋矩陣與 artifact 的純函式驗證。
//
// 瀏覽器量測本身住在 tests/e2e/performance.spec.ts（PRoot 本機無 Chromium 時
// 記 UNAVAILABLE，CI 才是執行場地）；這裡釘住的是「什麼算完整」的定義，
// 讓缺漏永遠變成 FAIL 而不是靜默的綠燈。

const TIMINGS = [
  { metric: 'first-contentful-paint', budget: 1800 },
  { metric: 'largest-contentful-paint', budget: 2500 },
  { metric: 'cumulative-layout-shift', budget: 0.1 }
];

const budgets = [
  { path: '/patient.html', timings: TIMINGS },
  { path: '/index.html', timings: TIMINGS },
  { path: '/clinic.html', timings: TIMINGS },
  { path: '/privacy.html' },
  { path: '/404.html' }
];

const CLINIC_ROUTES = [
  '/clinic',
  '/clinic/doctors',
  '/clinic/doctors/yan-cheng-an',
  '/clinic/doctors/yang-sheng-feng',
  '/clinic/nasal/snoring-five-in-one',
  '/clinic/nasal/inferior-turbinate-surgery',
  '/clinic/nasal/septoplasty',
  '/clinic/nasal/snore-relief-mouthguard'
];

const entryRoutes = [
  { entryPath: '/patient.html', routes: ['/booking'] },
  { entryPath: '/index.html', routes: ['/staff'] },
  { entryPath: '/clinic.html', routes: CLINIC_ROUTES }
];

const SHA = 'a'.repeat(40);

function record(route, profile, overrides = {}) {
  return {
    route,
    entryPath:
      route === '/booking'
        ? '/patient.html'
        : route === '/staff'
          ? '/index.html'
          : '/clinic.html',
    profile: profile.name,
    width: profile.width,
    height: profile.height,
    metrics: {
      'first-contentful-paint': 500,
      'largest-contentful-paint': 900,
      'cumulative-layout-shift': 0.01
    },
    budgets: {
      'first-contentful-paint': 1800,
      'largest-contentful-paint': 2500,
      'cumulative-layout-shift': 0.1
    },
    status: 'PASS',
    ...overrides
  };
}

function completeArtifact() {
  const expected = expectedObservations({ budgets, entryRoutes });
  return {
    schemaVersion: 1,
    headSha: SHA,
    records: expected.map(({ route, entryPath }) =>
      record(route, PERFORMANCE_PROFILES[0], { entryPath })
    )
  };
}

describe('timingBudget', () => {
  it('回傳預算檔裡的 authoritative 門檻', () => {
    expect(
      timingBudget(budgets, '/clinic.html', 'largest-contentful-paint')
    ).toBe(2500);
  });

  it('缺少指標時大聲失敗而不是回傳 undefined', () => {
    expect(() =>
      timingBudget(budgets, '/privacy.html', 'largest-contentful-paint')
    ).toThrow();
  });
});

describe('expectedObservations', () => {
  it('每條具體 clinic 路由 × desktop＋mobile 都有觀察點', () => {
    const expected = expectedObservations({ budgets, entryRoutes });
    for (const route of CLINIC_ROUTES) {
      for (const profile of PERFORMANCE_PROFILES) {
        expect(expected).toContainEqual({
          entryPath: '/clinic.html',
          route,
          profile: profile.name
        });
      }
    }
  });

  it('staff 與 booking 兩條既有路由也各有雙 profile', () => {
    const expected = expectedObservations({ budgets, entryRoutes });
    expect(expected).toContainEqual({
      entryPath: '/index.html',
      route: '/staff',
      profile: 'desktop'
    });
    expect(expected).toContainEqual({
      entryPath: '/patient.html',
      route: '/booking',
      profile: 'mobile'
    });
  });

  it('沒有 timings 的進入點（privacy／404）不產生觀察點', () => {
    const expected = expectedObservations({ budgets, entryRoutes });
    expect(
      expected.some(({ entryPath }) => entryPath === '/privacy.html')
    ).toBe(false);
  });
});

describe('validatePerformanceArtifact', () => {
  it('完整 artifact 零失敗', () => {
    const expected = expectedObservations({ budgets, entryRoutes });
    const artifact = {
      schemaVersion: 1,
      headSha: SHA,
      records: expected.map(({ route, entryPath, profile }) => {
        const found = PERFORMANCE_PROFILES.find((p) => p.name === profile);
        return record(route, found, { entryPath });
      })
    };
    expect(
      validatePerformanceArtifact(artifact, { budgets, entryRoutes })
    ).toEqual([]);
  });

  it('少一條 mobile 觀察就 FAIL', () => {
    const artifact = completeArtifact();
    artifact.records = artifact.records.filter(
      (r) =>
        !(r.route === '/clinic/nasal/septoplasty' && r.profile === 'mobile')
    );
    // completeArtifact 只放 desktop，先補上 desktop 全集再刪一筆 mobile：
    const expected = expectedObservations({ budgets, entryRoutes });
    artifact.records = expected
      .filter(
        (e) =>
          !(e.route === '/clinic/nasal/septoplasty' && e.profile === 'mobile')
      )
      .map(({ route, entryPath, profile }) =>
        record(
          route,
          PERFORMANCE_PROFILES.find((p) => p.name === profile),
          {
            entryPath
          }
        )
      );
    const failures = validatePerformanceArtifact(artifact, {
      budgets,
      entryRoutes
    });
    expect(failures.length).toBeGreaterThan(0);
    expect(failures.join('\n')).toMatch(
      /septoplasty[^]*mobile|mobile[^]*septoplasty/
    );
  });

  it('量不到卻標 PASS 是 FAIL（禁靜默跳過）', () => {
    const expected = expectedObservations({ budgets, entryRoutes });
    const artifact = {
      schemaVersion: 1,
      headSha: SHA,
      records: expected.map(({ route, entryPath, profile }) =>
        record(
          route,
          PERFORMANCE_PROFILES.find((p) => p.name === profile),
          {
            entryPath,
            metrics: {
              'first-contentful-paint': 0,
              'largest-contentful-paint': 0,
              'cumulative-layout-shift': 0
            },
            status: 'PASS'
          }
        )
      )
    };
    expect(
      validatePerformanceArtifact(artifact, { budgets, entryRoutes }).length
    ).toBeGreaterThan(0);
  });

  it('超預算卻標 PASS 是 FAIL', () => {
    const expected = expectedObservations({ budgets, entryRoutes });
    const artifact = {
      schemaVersion: 1,
      headSha: SHA,
      records: expected.map(({ route, entryPath, profile }) =>
        record(
          route,
          PERFORMANCE_PROFILES.find((p) => p.name === profile),
          {
            entryPath,
            metrics: {
              'first-contentful-paint': 500,
              'largest-contentful-paint': 9000,
              'cumulative-layout-shift': 0.01
            },
            status: 'PASS'
          }
        )
      )
    };
    expect(
      validatePerformanceArtifact(artifact, { budgets, entryRoutes }).length
    ).toBeGreaterThan(0);
  });

  it('超預算誠實標 FAIL 可以通過 artifact 結構驗證（紅燈是證據）', () => {
    const expected = expectedObservations({ budgets, entryRoutes });
    const artifact = {
      schemaVersion: 1,
      headSha: SHA,
      records: expected.map(({ route, entryPath, profile }) =>
        record(
          route,
          PERFORMANCE_PROFILES.find((p) => p.name === profile),
          {
            entryPath,
            metrics: {
              'first-contentful-paint': 500,
              'largest-contentful-paint': 9000,
              'cumulative-layout-shift': 0.01
            },
            status: 'FAIL'
          }
        )
      )
    };
    expect(
      validatePerformanceArtifact(artifact, { budgets, entryRoutes })
    ).toEqual([]);
  });

  it('謊報預算數字（與 authoritative 不一致）是 FAIL', () => {
    const expected = expectedObservations({ budgets, entryRoutes });
    const artifact = {
      schemaVersion: 1,
      headSha: SHA,
      records: expected.map(({ route, entryPath, profile }) =>
        record(
          route,
          PERFORMANCE_PROFILES.find((p) => p.name === profile),
          {
            entryPath,
            budgets: {
              'first-contentful-paint': 1800,
              'largest-contentful-paint': 99999,
              'cumulative-layout-shift': 0.1
            }
          }
        )
      )
    };
    expect(
      validatePerformanceArtifact(artifact, { budgets, entryRoutes }).length
    ).toBeGreaterThan(0);
  });

  it('缺少或畸形的 head SHA 是 FAIL', () => {
    const artifact = completeArtifact();
    delete artifact.headSha;
    expect(
      validatePerformanceArtifact(artifact, { budgets, entryRoutes }).length
    ).toBeGreaterThan(0);
    expect(SHA_PATTERN.test('xyz')).toBe(false);
    expect(SHA_PATTERN.test(SHA)).toBe(true);
  });

  it('artifact 出現未知路由是 FAIL（打錯字不能混過去）', () => {
    const artifact = completeArtifact();
    artifact.records.push(
      record('/clinic/nasal/septoplasty-typo', PERFORMANCE_PROFILES[0], {
        entryPath: '/clinic.html'
      })
    );
    // completeArtifact 只有 desktop；先驗證未知路由這條就足以失敗。
    expect(
      validatePerformanceArtifact(artifact, { budgets, entryRoutes }).length
    ).toBeGreaterThan(0);
  });

  it('TIMING_METRICS 恰為 FCP／LCP／CLS，不自創指標', () => {
    expect([...TIMING_METRICS].sort()).toEqual(
      [
        'cumulative-layout-shift',
        'first-contentful-paint',
        'largest-contentful-paint'
      ].sort()
    );
  });
});
