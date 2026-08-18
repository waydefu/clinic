import { describe, expect, it } from 'vitest';
import {
  createCiEvidence,
  renderCiEvidenceSummary,
  safeMarkdown
} from './generate-ci-evidence.mjs';

const CANDIDATE_COMMIT = '0123456789abcdef';

const allGreen = {
  CI_EVIDENCE_VERIFY_RESULT: 'success',
  CI_EVIDENCE_RULES_RESULT: 'success',
  CI_EVIDENCE_E2E_RESULT: 'success',
  CI_EVIDENCE_SUPPLY_CHAIN_RESULT: 'success',
  CI_EVIDENCE_SAST_RESULT: 'success'
};

const runContext = {
  GITHUB_SERVER_URL: 'https://github.com',
  GITHUB_REPOSITORY: 'waydefu/clinic',
  GITHUB_RUN_ID: '12345',
  GITHUB_RUN_ATTEMPT: '1',
  GITHUB_SHA: CANDIDATE_COMMIT,
  GITHUB_REF: 'refs/heads/main',
  GITHUB_EVENT_NAME: 'push',
  // 被呼叫的 SAST workflow 回報它掃的是哪一個 commit。綠燈的前提是它等於上面那個
  // 候選 commit。
  CI_EVIDENCE_SAST_COMMIT: CANDIDATE_COMMIT
};

const evidenceFor = (env) =>
  createCiEvidence({ env, now: new Date('2026-08-01T00:00:00.000Z') });

describe('required job evaluation', () => {
  it('concludes success only when every required job succeeded', () => {
    expect(evidenceFor({ ...runContext, ...allGreen }).conclusion).toBe(
      'success'
    );
  });

  it.each([
    'CI_EVIDENCE_VERIFY_RESULT',
    'CI_EVIDENCE_RULES_RESULT',
    'CI_EVIDENCE_E2E_RESULT',
    'CI_EVIDENCE_SUPPLY_CHAIN_RESULT',
    'CI_EVIDENCE_SAST_RESULT'
  ])('concludes failure when %s failed', (variable) => {
    expect(
      evidenceFor({ ...runContext, ...allGreen, [variable]: 'failure' })
        .conclusion
    ).toBe('failure');
  });

  // 被跳過或沒回報的 job 是最危險的一種：它看起來不像失敗，但它沒有跑。
  it.each(['cancelled', 'skipped', ''])(
    'treats the non-success result %s as failure',
    (result) => {
      expect(
        evidenceFor({
          ...runContext,
          ...allGreen,
          CI_EVIDENCE_E2E_RESULT: result
        }).conclusion
      ).toBe('failure');
    }
  );

  // SAST 是 `SCM-R01` 新加的第五項，同一條規則對它一樣適用：被跳過的掃描不是通過。
  it.each(['cancelled', 'skipped', ''])(
    'treats the non-success SAST result %s as failure',
    (result) => {
      expect(
        evidenceFor({
          ...runContext,
          ...allGreen,
          CI_EVIDENCE_SAST_RESULT: result
        }).conclusion
      ).toBe('failure');
    }
  );

  it('records a job that reported nothing as missing rather than assuming it passed', () => {
    const evidence = evidenceFor(runContext);

    expect(evidence.conclusion).toBe('failure');
    expect(evidence.requiredJobs.map((job) => job.result)).toEqual([
      'missing',
      'missing',
      'missing',
      'missing',
      'missing'
    ]);
  });

  it('keeps all five required jobs in the evidence', () => {
    expect(
      evidenceFor({ ...runContext, ...allGreen }).requiredJobs.map(
        (job) => job.name
      )
    ).toEqual(['verify', 'rules', 'e2e', 'supply-chain', 'sast']);
  });
});

// `SCM-R01` 的整個重點：required evidence 消費的必須是**這一個 commit** 的 SAST
// 結果。job 回綠但指向別的 commit，證明的是別的東西。
describe('same-commit SAST binding', () => {
  it('records the commit the SAST evidence named and that it matches', () => {
    expect(evidenceFor({ ...runContext, ...allGreen }).sast).toEqual({
      reportedCommit: CANDIDATE_COMMIT,
      commitMatchesCandidate: true
    });
  });

  it('fails when the SAST evidence names a different commit', () => {
    const evidence = evidenceFor({
      ...runContext,
      ...allGreen,
      CI_EVIDENCE_SAST_COMMIT: 'fedcba9876543210'
    });

    expect(evidence.conclusion).toBe('failure');
    expect(evidence.sast.commitMatchesCandidate).toBe(false);
  });

  // job 失敗、被取消或被跳過時，GitHub 不傳遞它的 output，呼叫端收到的是空字串。
  it('fails when the SAST workflow returned an empty commit output', () => {
    const evidence = evidenceFor({
      ...runContext,
      ...allGreen,
      CI_EVIDENCE_SAST_COMMIT: ''
    });

    expect(evidence.conclusion).toBe('failure');
    expect(evidence.sast).toEqual({
      reportedCommit: 'missing',
      commitMatchesCandidate: false
    });
  });

  it('fails when the SAST workflow returned no commit output at all', () => {
    const env = { ...runContext, ...allGreen };
    delete env.CI_EVIDENCE_SAST_COMMIT;
    const evidence = evidenceFor(env);

    expect(evidence.conclusion).toBe('failure');
    expect(evidence.sast).toEqual({
      reportedCommit: 'missing',
      commitMatchesCandidate: false
    });
  });

  // 兩邊都是 unknown 不是「相符」，那是兩邊都不知道自己在驗哪個 commit。
  it('does not treat two unknown commits as a match', () => {
    const env = { ...runContext, ...allGreen };
    delete env.GITHUB_SHA;
    env.CI_EVIDENCE_SAST_COMMIT = 'unknown';
    const evidence = evidenceFor(env);

    expect(evidence.commit).toBe('unknown');
    expect(evidence.conclusion).toBe('failure');
    expect(evidence.sast.commitMatchesCandidate).toBe(false);
  });
});

describe('run identification', () => {
  it('binds the evidence to the commit and run that produced it', () => {
    const evidence = evidenceFor({ ...runContext, ...allGreen });

    expect(evidence.commit).toBe(CANDIDATE_COMMIT);
    expect(evidence.run.url).toBe(
      'https://github.com/waydefu/clinic/actions/runs/12345'
    );
  });

  it('reports no run URL rather than a fabricated one when the id is absent', () => {
    const evidence = evidenceFor({ ...allGreen });

    expect(evidence.run.url).toBeNull();
    expect(evidence.repository).toBe('unknown/unknown');
  });
});

describe('summary rendering', () => {
  it('states the conclusion and lists every job', () => {
    const summary = renderCiEvidenceSummary(
      evidenceFor({ ...runContext, ...allGreen })
    );

    expect(summary).toContain('Conclusion: **success**');
    expect(summary).toContain('| supply-chain | success |');
    expect(summary).toContain('| sast | success |');
    expect(summary).toContain(
      '- SAST evidence commit: `' +
        CANDIDATE_COMMIT +
        '` (matches this candidate commit)'
    );
    expect(summary).toContain(
      'All required verification jobs completed successfully, and the SAST evidence names this exact commit.'
    );
  });

  it('says plainly that something did not complete when it did not', () => {
    const summary = renderCiEvidenceSummary(
      evidenceFor({
        ...runContext,
        ...allGreen,
        CI_EVIDENCE_RULES_RESULT: 'failure'
      })
    );

    expect(summary).toContain('Conclusion: **failure**');
    expect(summary).toContain(
      'At least one required verification job did not complete successfully.'
    );
  });

  // 全綠但 commit 對不上，講成「有 job 沒跑完」會把讀者指向錯的地方。
  it('names the commit mismatch rather than blaming a job that passed', () => {
    const summary = renderCiEvidenceSummary(
      evidenceFor({
        ...runContext,
        ...allGreen,
        CI_EVIDENCE_SAST_COMMIT: 'fedcba9876543210'
      })
    );

    expect(summary).toContain('Conclusion: **failure**');
    expect(summary).toContain(
      '- SAST evidence commit: `fedcba9876543210` (does not match this candidate commit)'
    );
    expect(summary).toContain(
      'Every required job reported success, but the SAST evidence does not name this commit, so this run is not accepted.'
    );
  });

  it('says the run is unavailable instead of printing null', () => {
    expect(renderCiEvidenceSummary(evidenceFor(allGreen))).toContain(
      '- Run: unavailable'
    );
  });

  // 值會被填進 Markdown 表格，未逸出的 | 會把欄位撐開、讓摘要看起來是別的內容。
  it('escapes characters that would break the markdown table', () => {
    expect(safeMarkdown('a|b')).toBe('a\\|b');
    expect(safeMarkdown('a\nb')).toBe('a b');
  });
});
