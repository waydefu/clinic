import { describe, expect, it } from 'vitest';
import {
  expectedA11yScans,
  mergeA11yShards,
  mergeEvidence,
  mergePerformanceShards,
  parseArgs,
  repositoryInputs
} from './merge-web-evidence.mjs';

// WEB-P0-02／03 證據合併：多 worker 分片 → canonical artifact。
// 上一版各 worker 覆寫同一個 artifact 檔，上傳的是不確定的殘缺品；
// 這裡釘住合併語意——去重、SHA 一致、缺件大聲失敗。

const SHA = 'c'.repeat(40);
const TODAY = '2026-09-08';

const TIMINGS = [
  { metric: 'first-contentful-paint', budget: 1800 },
  { metric: 'largest-contentful-paint', budget: 2500 },
  { metric: 'cumulative-layout-shift', budget: 0.1 }
];
const budgets = [
  { path: '/patient.html', timings: TIMINGS },
  { path: '/index.html', timings: TIMINGS },
  { path: '/clinic.html', timings: TIMINGS }
];
const clinicRoutes = ['/clinic', '/clinic/doctors'];
const shellRoutes = ['/staff', '/booking', '/privacy', '/clinic'];

function perfRecord(route, profile, entryPath = '/clinic.html') {
  return {
    route,
    entryPath,
    profile,
    width: 1280,
    height: 720,
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
    status: 'PASS'
  };
}

describe('expectedA11yScans', () => {
  it('/clinic 同時是殼與具體路由，只期望一次', () => {
    const expected = expectedA11yScans({ shellRoutes, clinicRoutes });
    const clinicDefaults = expected.filter(
      (s) => s.route === '/clinic' && s.state === 'default'
    );
    expect(clinicDefaults).toHaveLength(1);
  });

  it('包含四個互動狀態', () => {
    const expected = expectedA11yScans({ shellRoutes, clinicRoutes });
    for (const state of [
      'workbench-appointments',
      'workbench-reschedule',
      'patient-reschedule',
      'workbench-pagination'
    ]) {
      expect(expected.some((s) => s.state === state)).toBe(true);
    }
  });
});

describe('mergePerformanceShards', () => {
  it('多 worker 分片合併成完整記錄集', () => {
    const records = mergePerformanceShards([
      { headSha: SHA, record: perfRecord('/clinic', 'desktop') },
      { headSha: SHA, record: perfRecord('/clinic', 'mobile') }
    ]);
    expect(records).toHaveLength(2);
  });
});

describe('mergeA11yShards', () => {
  it('多 worker 掃描合併且 rule id 取聯集', () => {
    const { scans, evaluatedRuleIds } = mergeA11yShards([
      {
        headSha: SHA,
        scan: {
          route: '/clinic',
          state: 'default',
          viewport: '1280x720',
          axeVersion: '4.12.1',
          findings: []
        },
        evaluatedRuleIds: ['label', 'color-contrast']
      },
      {
        headSha: SHA,
        scan: {
          route: '/staff',
          state: 'default',
          viewport: '1280x720',
          axeVersion: '4.12.1',
          findings: []
        },
        evaluatedRuleIds: ['label', 'landmark-one-main']
      }
    ]);
    expect(scans).toHaveLength(2);
    expect([...evaluatedRuleIds].sort()).toEqual(
      ['color-contrast', 'label', 'landmark-one-main'].sort()
    );
  });
});

describe('mergeEvidence', () => {
  function a11yShard(route, state) {
    return {
      headSha: SHA,
      scan: {
        route,
        state,
        viewport: '1280x720',
        axeVersion: '4.12.1',
        findings: []
      },
      evaluatedRuleIds: ['label']
    };
  }

  function fullInputs(overrides = {}) {
    const expected = expectedA11yScans({ shellRoutes, clinicRoutes });
    return {
      budgets,
      shellRoutes,
      clinicRoutes,
      waivers: { schemaVersion: 1, waivers: [] },
      today: TODAY,
      sha: SHA,
      perfShards: [
        {
          headSha: SHA,
          record: perfRecord('/booking', 'desktop', '/patient.html')
        },
        {
          headSha: SHA,
          record: perfRecord('/booking', 'mobile', '/patient.html')
        },
        {
          headSha: SHA,
          record: perfRecord('/staff', 'desktop', '/index.html')
        },
        { headSha: SHA, record: perfRecord('/staff', 'mobile', '/index.html') },
        { headSha: SHA, record: perfRecord('/clinic', 'desktop') },
        { headSha: SHA, record: perfRecord('/clinic', 'mobile') },
        { headSha: SHA, record: perfRecord('/clinic/doctors', 'desktop') },
        { headSha: SHA, record: perfRecord('/clinic/doctors', 'mobile') }
      ],
      a11yShards: expected.map((s) => a11yShard(s.route, s.state)),
      expect: 'both',
      ...overrides
    };
  }

  it('完整分片合併零失敗', () => {
    const { perfArtifact, a11yArtifact, failures } =
      mergeEvidence(fullInputs());
    expect(failures).toEqual([]);
    expect(perfArtifact.records).toHaveLength(8);
    expect(a11yArtifact.scans.length).toBeGreaterThan(0);
  });

  it('被期望的種類零分片即失敗（spec 被跳過也看得見）', () => {
    const { failures } = mergeEvidence(
      fullInputs({ perfShards: [], expect: 'perf' })
    );
    expect(failures.length).toBeGreaterThan(0);
  });

  it('分片 SHA 與本次不一致即失敗（陳舊證據不得混入）', () => {
    const inputs = fullInputs();
    inputs.perfShards[0] = { ...inputs.perfShards[0], headSha: 'd'.repeat(40) };
    const { failures } = mergeEvidence(inputs);
    expect(failures.length).toBeGreaterThan(0);
  });

  it('expect=none 直接通過（無分片產出的 CI 組別）', () => {
    const { failures } = mergeEvidence(
      fullInputs({ perfShards: [], a11yShards: [], expect: 'none' })
    );
    expect(failures).toEqual([]);
  });

  it('過期 waiver 在 merge 即被擋下', () => {
    const { failures } = mergeEvidence(
      fullInputs({
        waivers: {
          schemaVersion: 1,
          waivers: [
            {
              id: 'WA-X',
              rule: 'label',
              route: '/clinic',
              state: 'default',
              selector: '["x"]',
              rationale: '測試',
              owner: 'qa',
              created: '2026-09-01',
              expires: '2026-09-07'
            }
          ]
        }
      })
    );
    expect(failures.length).toBeGreaterThan(0);
  });
});

describe('parseArgs', () => {
  it('支援 --expect 值與 --expect=值兩種形式', () => {
    expect(parseArgs(['--expect', 'perf'])).toEqual({ expect: 'perf' });
    expect(parseArgs(['--expect=a11y'])).toEqual({ expect: 'a11y' });
    expect(parseArgs([])).toEqual({ expect: 'both' });
    expect(parseArgs(['--expect', 'bogus'])).toEqual({ expect: 'both' });
  });
});

describe('repositoryInputs', () => {
  it('讀得懂本 repo 的真實組態', async () => {
    const inputs = await repositoryInputs();
    expect(inputs.clinicRoutes).toContain('/clinic/nasal/septoplasty');
    expect(inputs.shellRoutes).toContain('/clinic');
    expect(inputs.shellRoutes).not.toContain('/404');
    expect(inputs.budgets.length).toBeGreaterThan(0);
  });
});
