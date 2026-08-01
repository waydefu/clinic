import { describe, expect, it } from 'vitest';
import {
  createCiEvidence,
  renderCiEvidenceSummary,
  safeMarkdown
} from './generate-ci-evidence.mjs';

const allGreen = {
  CI_EVIDENCE_VERIFY_RESULT: 'success',
  CI_EVIDENCE_RULES_RESULT: 'success',
  CI_EVIDENCE_E2E_RESULT: 'success',
  CI_EVIDENCE_SUPPLY_CHAIN_RESULT: 'success'
};

const runContext = {
  GITHUB_SERVER_URL: 'https://github.com',
  GITHUB_REPOSITORY: 'waydefu/clinic',
  GITHUB_RUN_ID: '12345',
  GITHUB_RUN_ATTEMPT: '1',
  GITHUB_SHA: '0123456789abcdef',
  GITHUB_REF: 'refs/heads/main',
  GITHUB_EVENT_NAME: 'push'
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
    'CI_EVIDENCE_SUPPLY_CHAIN_RESULT'
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

  it('records a job that reported nothing as missing rather than assuming it passed', () => {
    const evidence = evidenceFor(runContext);

    expect(evidence.conclusion).toBe('failure');
    expect(evidence.requiredJobs.map((job) => job.result)).toEqual([
      'missing',
      'missing',
      'missing',
      'missing'
    ]);
  });

  it('keeps all four required jobs in the evidence', () => {
    expect(
      evidenceFor({ ...runContext, ...allGreen }).requiredJobs.map(
        (job) => job.name
      )
    ).toEqual(['verify', 'rules', 'e2e', 'supply-chain']);
  });
});

describe('run identification', () => {
  it('binds the evidence to the commit and run that produced it', () => {
    const evidence = evidenceFor({ ...runContext, ...allGreen });

    expect(evidence.commit).toBe('0123456789abcdef');
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
    expect(summary).toContain(
      'All required verification jobs completed successfully.'
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
