import { describe, expect, it } from 'vitest';
import {
  classifyFindings,
  matchWaiver,
  validateA11yArtifact,
  validateWaivers
} from './web-a11y-waivers.mjs';

// WEB-P0-03：expiring waiver 與 axe artifact 的純函式驗證。
//
// 瀏覽器掃描本身住在 tests/e2e/accessibility.spec.ts；這裡釘住的是
// 豁免的形狀、窄匹配與 artifact 完整性——未來的豁免不能變成永久債。

const TODAY = '2026-09-08';

function waiver(overrides = {}) {
  return {
    id: 'WA-001',
    rule: 'color-contrast',
    route: '/clinic/nasal/septoplasty',
    state: 'default',
    selector: '[".clinic-fee-note"]',
    rationale: '合成測試固件裡的次要說明文字對比，待設計 tokens 修復。',
    owner: 'qa',
    created: '2026-09-08',
    expires: '2026-10-08',
    ...overrides
  };
}

function violation(overrides = {}) {
  return {
    id: 'color-contrast',
    impact: 'serious',
    tags: ['wcag2aa', 'wcag143'],
    nodes: [
      {
        target: ['.clinic-fee-note'],
        failureSummary:
          'Fix any of the following:\n  Element has insufficient color contrast'
      }
    ],
    ...overrides
  };
}

describe('validateWaivers', () => {
  it('空 registry 合法（零豁免是正常狀態）', () => {
    expect(
      validateWaivers({ schemaVersion: 1, waivers: [] }, { today: TODAY })
    ).toEqual([]);
  });

  it('過期豁免 fail closed', () => {
    const failures = validateWaivers(
      { schemaVersion: 1, waivers: [waiver({ expires: '2026-09-07' })] },
      { today: TODAY }
    );
    expect(failures.length).toBeGreaterThan(0);
    expect(failures.join('\n')).toMatch(/WA-001/);
  });

  it('缺 owner／rationale／expiry 各自失敗', () => {
    const base = waiver();
    for (const key of ['owner', 'rationale', 'expires']) {
      const broken = { ...base };
      delete broken[key];
      expect(
        validateWaivers(
          { schemaVersion: 1, waivers: [broken] },
          { today: TODAY }
        ).length
      ).toBeGreaterThan(0);
    }
  });

  it('重複 id 與畸形日期失敗', () => {
    expect(
      validateWaivers(
        { schemaVersion: 1, waivers: [waiver(), waiver()] },
        { today: TODAY }
      ).length
    ).toBeGreaterThan(0);
    expect(
      validateWaivers(
        {
          schemaVersion: 1,
          waivers: [waiver({ id: 'WA-002', created: 'not-a-date' })]
        },
        { today: TODAY }
      ).length
    ).toBeGreaterThan(0);
  });
});

describe('matchWaiver', () => {
  it('rule＋route＋state＋selector 四者全對才命中', () => {
    const waivers = [waiver()];
    const finding = {
      rule: 'color-contrast',
      route: '/clinic/nasal/septoplasty',
      state: 'default',
      selector: '[".clinic-fee-note"]'
    };
    expect(matchWaiver(waivers, finding)?.id).toBe('WA-001');
  });

  it('selector 不同不命中（禁全站忽略）', () => {
    const waivers = [waiver()];
    expect(
      matchWaiver(waivers, {
        rule: 'color-contrast',
        route: '/clinic/nasal/septoplasty',
        state: 'default',
        selector: '[".other"]'
      })
    ).toBeUndefined();
  });

  it('route 不同不命中（禁整頁忽略）', () => {
    const waivers = [waiver()];
    expect(
      matchWaiver(waivers, {
        rule: 'color-contrast',
        route: '/clinic',
        state: 'default',
        selector: '[".clinic-fee-note"]'
      })
    ).toBeUndefined();
  });
});

describe('classifyFindings', () => {
  it('命中豁免的 finding 記 WAIVED 並綁 waiver id', () => {
    const { results, failures } = classifyFindings({
      violations: [violation()],
      route: '/clinic/nasal/septoplasty',
      state: 'default',
      waivers: [waiver()]
    });
    expect(failures).toEqual([]);
    expect(results).toHaveLength(1);
    expect(results[0].disposition).toBe('WAIVED');
    expect(results[0].waiverId).toBe('WA-001');
  });

  it('未豁免的 finding 記 VIOLATION 並回報 blocking 失敗', () => {
    const { results, failures } = classifyFindings({
      violations: [violation()],
      route: '/clinic/nasal/septoplasty',
      state: 'default',
      waivers: []
    });
    expect(results[0].disposition).toBe('VIOLATION');
    expect(failures.length).toBeGreaterThan(0);
  });

  it('moderate 也不放行（完整 A／AA，不是只擋 serious／critical）', () => {
    const { failures } = classifyFindings({
      violations: [violation({ impact: 'moderate' })],
      route: '/clinic',
      state: 'default',
      waivers: []
    });
    expect(failures.length).toBeGreaterThan(0);
  });
});

describe('validateA11yArtifact', () => {
  const expectedScans = [
    { route: '/clinic', state: 'default' },
    { route: '/clinic/nasal/septoplasty', state: 'default' }
  ];
  const evaluatedRuleIds = ['color-contrast', 'label', 'landmark-one-main'];

  function artifact(overrides = {}) {
    return {
      schemaVersion: 1,
      headSha: 'b'.repeat(40),
      axeVersion: '4.12.1',
      scans: expectedScans.map((s) => ({
        ...s,
        viewport: '1280x720',
        findings: []
      })),
      ...overrides
    };
  }

  it('乾淨 artifact 零失敗', () => {
    expect(
      validateA11yArtifact(artifact(), {
        waivers: [],
        evaluatedRuleIds,
        expectedScans
      })
    ).toEqual([]);
  });

  it('缺掃描的路由 FAIL', () => {
    const broken = artifact();
    broken.scans = broken.scans.slice(0, 1);
    expect(
      validateA11yArtifact(broken, {
        waivers: [],
        evaluatedRuleIds,
        expectedScans
      }).length
    ).toBeGreaterThan(0);
  });

  it('未知 rule 的豁免 FAIL', () => {
    expect(
      validateA11yArtifact(artifact(), {
        waivers: [waiver({ rule: 'not-a-real-rule' })],
        evaluatedRuleIds,
        expectedScans
      }).length
    ).toBeGreaterThan(0);
  });

  it('從未命中的豁免是 stale，FAIL', () => {
    expect(
      validateA11yArtifact(artifact(), {
        waivers: [waiver()],
        evaluatedRuleIds,
        expectedScans
      }).length
    ).toBeGreaterThan(0);
  });

  it('缺少 head SHA 是 FAIL', () => {
    const broken = artifact();
    delete broken.headSha;
    expect(
      validateA11yArtifact(broken, {
        waivers: [],
        evaluatedRuleIds,
        expectedScans
      }).length
    ).toBeGreaterThan(0);
  });
});
