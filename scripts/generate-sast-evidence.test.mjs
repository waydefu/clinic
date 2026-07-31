import { describe, expect, it } from 'vitest';
import {
  createSastEvidence,
  renderSastEvidenceSummary
} from './generate-sast-evidence.mjs';

// 這些常數必須與 `.github/workflows/sast.yml` 傳進來的環境變數同名。測試曾經
// 落後於實作（用的是已被拆成 local／upstream 兩組的舊 `SAST_RULE_CONFIGS`），
// 結果每一個案例都停在 `invalid-evidence`，等於規則證據的分類邏輯完全沒有被
// 驗證過。名稱若再次改動，這裡要一起改，不能只改 workflow。
const LOCAL_RULE_CONFIGS = [
  'security/semgrep/clinic-javascript.yml',
  'security/semgrep/firestore-rules.yml'
];
const UPSTREAM_RULE_ROOT = '.semgrep-rules';
// manifest 需要遞增排序且限定 javascript/ 或 typescript/ 前綴，這是實作用來擋
// 路徑穿越與清單被偷改順序的檢查。
const UPSTREAM_RULE_MANIFEST =
  'javascript/xss.yaml\ntypescript/injection.yaml\n';
const UPSTREAM_RULE_ENTRIES = [
  'javascript/xss.yaml',
  'typescript/injection.yaml'
];
const CONFIGURED_RULE_COUNT = 3;

const ruleFiles = [
  ...LOCAL_RULE_CONFIGS,
  ...UPSTREAM_RULE_ENTRIES.map((entry) => `${UPSTREAM_RULE_ROOT}/${entry}`)
].map((path) => ({ path, raw: `# fixture rules for ${path}\nrules: []\n` }));

const baseEnvironment = {
  GITHUB_REPOSITORY: 'waydefu/clinic',
  GITHUB_SHA: '0123456789abcdef',
  GITHUB_REF: 'refs/pull/1/merge',
  GITHUB_EVENT_NAME: 'pull_request',
  GITHUB_RUN_ID: '12345',
  GITHUB_RUN_ATTEMPT: '2',
  GITHUB_SERVER_URL: 'https://github.com',
  SAST_ENGINE_IMAGE: 'semgrep/semgrep:1.171.0@sha256:example',
  SAST_RULES_REPOSITORY: 'semgrep/semgrep-rules',
  SAST_RULES_REVISION: '40b8c63f75dc7c22c8a77482d73bfb864b146f7e',
  SAST_RULE_TEST_OUTCOME: 'success',
  SAST_LOCAL_RULE_CONFIGS: LOCAL_RULE_CONFIGS.join(','),
  SAST_UPSTREAM_RULE_MANIFEST: 'security/semgrep/upstream-rules.txt',
  SAST_UPSTREAM_RULE_ROOT: UPSTREAM_RULE_ROOT,
  SAST_EXPECTED_UPSTREAM_RULE_COUNT: String(UPSTREAM_RULE_ENTRIES.length),
  SAST_CONFIGURED_RULE_COUNT: String(CONFIGURED_RULE_COUNT),
  GITHUB_CODE_SCANNING_UPLOAD_STATUS: 'unavailable-private-personal-repository'
};

function semgrepJson({
  results = [],
  errors = [],
  scanned = ['apps/api/src/main.ts']
} = {}) {
  return JSON.stringify({ results, errors, paths: { scanned } });
}

// SARIF 內宣告的規則數必須與 `SAST_CONFIGURED_RULE_COUNT` 相符，否則實作會判為
// 證據不一致——那正是「掃描器實際載入的規則和我們宣稱的不同」這個情境。
function semgrepSarif(results = [], ruleCount = CONFIGURED_RULE_COUNT) {
  return JSON.stringify({
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'Semgrep OSS',
            rules: Array.from({ length: ruleCount }, (_unused, index) => ({
              id: `fixture.rule.${index}`
            }))
          }
        },
        results
      }
    ]
  });
}

function buildEvidence(overrides = {}) {
  return createSastEvidence({
    ruleFiles,
    ruleManifestRaw: UPSTREAM_RULE_MANIFEST,
    ...overrides
  });
}

describe('commit-bound SAST evidence', () => {
  it('passes only a complete zero-finding scan', () => {
    const evidence = buildEvidence({
      now: new Date('2026-07-31T00:00:00.000Z'),
      env: { ...baseEnvironment, SAST_SCAN_OUTCOME: 'success' },
      jsonRaw: semgrepJson({
        scanned: ['apps/api/src/main.ts', 'apps/web/server.mjs']
      }),
      sarifRaw: semgrepSarif(),
      exitCodeRaw: '0\n',
      versionRaw: '1.171.0\n'
    });

    expect(evidence.conclusion).toBe('success');
    expect(evidence.failureReason).toBeNull();
    expect(evidence.commit).toBe('0123456789abcdef');
    expect(evidence.scan).toMatchObject({
      exitCode: 0,
      findings: 0,
      scannerErrors: 0,
      scannedFiles: 2,
      sarifResults: 0
    });
    expect(evidence.githubCodeScanning).toEqual({
      uploadAttempted: false,
      status: 'unavailable-private-personal-repository'
    });
  });

  it('binds the evidence to the exact rule files that were scanned', () => {
    const evidence = buildEvidence({
      env: { ...baseEnvironment, SAST_SCAN_OUTCOME: 'success' },
      jsonRaw: semgrepJson(),
      sarifRaw: semgrepSarif(),
      exitCodeRaw: '0',
      versionRaw: '1.171.0'
    });

    expect(evidence.rules.valid).toBe(true);
    expect(evidence.rules.files.map((file) => file.path)).toEqual([
      ...LOCAL_RULE_CONFIGS,
      `${UPSTREAM_RULE_ROOT}/javascript/xss.yaml`,
      `${UPSTREAM_RULE_ROOT}/typescript/injection.yaml`
    ]);
    for (const file of evidence.rules.files)
      expect(file.sha256).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('blocks a rule file that the scan never actually loaded', () => {
    const evidence = buildEvidence({
      env: { ...baseEnvironment, SAST_SCAN_OUTCOME: 'success' },
      ruleFiles: ruleFiles.slice(0, -1),
      jsonRaw: semgrepJson(),
      sarifRaw: semgrepSarif(),
      exitCodeRaw: '0',
      versionRaw: '1.171.0'
    });

    expect(evidence).toMatchObject({
      conclusion: 'failure',
      failureReason: 'invalid-evidence'
    });
    expect(evidence.rules.valid).toBe(false);
  });

  it('blocks a rule manifest whose entries were reordered or tampered with', () => {
    const evidence = buildEvidence({
      env: { ...baseEnvironment, SAST_SCAN_OUTCOME: 'success' },
      ruleManifestRaw: 'typescript/injection.yaml\njavascript/xss.yaml\n',
      jsonRaw: semgrepJson(),
      sarifRaw: semgrepSarif(),
      exitCodeRaw: '0',
      versionRaw: '1.171.0'
    });

    expect(evidence).toMatchObject({
      conclusion: 'failure',
      failureReason: 'invalid-evidence'
    });
    expect(evidence.rules.error).toBe('invalid-entries');
  });

  it('blocks a failed rule test even when the scan itself is clean', () => {
    const evidence = buildEvidence({
      env: {
        ...baseEnvironment,
        SAST_SCAN_OUTCOME: 'success',
        SAST_RULE_TEST_OUTCOME: 'failure'
      },
      jsonRaw: semgrepJson(),
      sarifRaw: semgrepSarif(),
      exitCodeRaw: '0',
      versionRaw: '1.171.0'
    });

    expect(evidence).toMatchObject({
      conclusion: 'failure',
      failureReason: 'scanner-error'
    });
  });

  it('blocks a scan whose loaded rule count differs from the declared one', () => {
    const evidence = buildEvidence({
      env: { ...baseEnvironment, SAST_SCAN_OUTCOME: 'success' },
      jsonRaw: semgrepJson(),
      sarifRaw: semgrepSarif([], CONFIGURED_RULE_COUNT - 1),
      exitCodeRaw: '0',
      versionRaw: '1.171.0'
    });

    expect(evidence).toMatchObject({
      conclusion: 'failure',
      failureReason: 'invalid-evidence'
    });
  });

  it('blocks findings while preserving their count', () => {
    const jsonFinding = {
      check_id: 'javascript.express.security.audit.xss',
      path: 'apps/web/server.mjs'
    };
    const sarifFinding = {
      ruleId: 'javascript.express.security.audit.xss',
      level: 'error'
    };
    const evidence = buildEvidence({
      env: { ...baseEnvironment, SAST_SCAN_OUTCOME: 'failure' },
      jsonRaw: semgrepJson({ results: [jsonFinding] }),
      sarifRaw: semgrepSarif([sarifFinding]),
      exitCodeRaw: '1',
      versionRaw: '1.171.0'
    });

    expect(evidence).toMatchObject({
      conclusion: 'failure',
      failureReason: 'findings'
    });
    expect(evidence.scan.findings).toBe(1);
    expect(evidence.scan.sarifLevels).toEqual({ error: 1 });
  });

  it('blocks scanner failures even when no finding is present', () => {
    const evidence = buildEvidence({
      env: { ...baseEnvironment, SAST_SCAN_OUTCOME: 'failure' },
      jsonRaw: semgrepJson({
        errors: [{ type: 'SemgrepError', message: 'invalid rule' }]
      }),
      sarifRaw: semgrepSarif(),
      exitCodeRaw: '7',
      versionRaw: '1.171.0'
    });

    expect(evidence).toMatchObject({
      conclusion: 'failure',
      failureReason: 'scanner-error'
    });
    expect(evidence.scan.scannerErrors).toBe(1);
  });

  it('blocks missing or inconsistent evidence', () => {
    const evidence = buildEvidence({
      env: { ...baseEnvironment, SAST_SCAN_OUTCOME: 'success' },
      jsonRaw: semgrepJson(),
      sarifRaw: semgrepSarif([{ ruleId: 'unexpected', level: 'warning' }]),
      exitCodeRaw: '0',
      versionRaw: '1.171.0'
    });

    expect(evidence).toMatchObject({
      conclusion: 'failure',
      failureReason: 'invalid-evidence'
    });
  });

  it.each([
    {
      label: 'finding exit code without a finding',
      outcome: 'failure',
      results: [],
      sarifResults: [],
      exitCode: '1'
    },
    {
      label: 'finding with a successful exit code',
      outcome: 'success',
      results: [{ check_id: 'unexpected', path: 'apps/web/server.mjs' }],
      sarifResults: [{ ruleId: 'unexpected', level: 'warning' }],
      exitCode: '0'
    },
    {
      label: 'step outcome that disagrees with the exit code',
      outcome: 'failure',
      results: [],
      sarifResults: [],
      exitCode: '0'
    }
  ])('blocks $label as inconsistent evidence', (scenario) => {
    const evidence = buildEvidence({
      env: { ...baseEnvironment, SAST_SCAN_OUTCOME: scenario.outcome },
      jsonRaw: semgrepJson({ results: scenario.results }),
      sarifRaw: semgrepSarif(scenario.sarifResults),
      exitCodeRaw: scenario.exitCode,
      versionRaw: '1.171.0'
    });

    expect(evidence).toMatchObject({
      conclusion: 'failure',
      failureReason: 'invalid-evidence'
    });
  });

  it('states the capability limitation separately from scan success', () => {
    const evidence = buildEvidence({
      env: { ...baseEnvironment, SAST_SCAN_OUTCOME: 'success' },
      jsonRaw: semgrepJson(),
      sarifRaw: semgrepSarif(),
      exitCodeRaw: '0',
      versionRaw: '1.171.0'
    });
    const summary = renderSastEvidenceSummary(evidence);

    expect(summary).toContain('Conclusion: **success**');
    expect(summary).toContain(
      'GitHub code-scanning upload: `unavailable-private-personal-repository` (not attempted)'
    );
    expect(summary).toContain('not represented as equivalent to CodeQL');
  });
});
