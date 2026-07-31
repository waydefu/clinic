import { describe, expect, it } from 'vitest';
import {
  parseIgnoredAdvisories,
  renderReviewLines,
  reviewAuditExceptions
} from './check-audit-exceptions.mjs';

const WORKSPACE_WITH_ONE_IGNORE = [
  'packages:',
  '  - apps/*',
  '  - packages/*',
  '',
  'overrides:',
  "  tar: '>=7.5.22'",
  '',
  'auditConfig:',
  '  ignoreGhsas:',
  '    - GHSA-mh99-v99m-4gvg',
  ''
].join('\n');

function entry(overrides = {}) {
  return {
    ghsa: 'GHSA-mh99-v99m-4gvg',
    package: 'brace-expansion',
    severity: 'high',
    approvalId: 'SEC-03',
    approvalStatus: 'pending',
    approvedOn: null,
    expiresOn: '2026-08-31',
    scope: 'dev-only',
    reason: 'no compatible published fix',
    releaseCondition: 'remove once upstream publishes a fix',
    ...overrides
  };
}

describe('audit exception governance', () => {
  it('reads only the ignoreGhsas list, not neighbouring keys', () => {
    expect(parseIgnoredAdvisories(WORKSPACE_WITH_ONE_IGNORE)).toEqual([
      'GHSA-mh99-v99m-4gvg'
    ]);
  });

  it('reads nothing when no advisory is ignored', () => {
    expect(
      parseIgnoredAdvisories(
        'packages:\n  - apps/*\n\noverrides:\n  tar: "7"\n'
      )
    ).toEqual([]);
  });

  it('accepts a fully registered, unexpired exception', () => {
    const review = reviewAuditExceptions({
      ignored: ['GHSA-mh99-v99m-4gvg'],
      registry: { exceptions: [entry()] },
      today: '2026-08-01'
    });

    expect(review.ok).toBe(true);
    expect(review.problems).toEqual([]);
  });

  // 這是本閘門存在的理由：只要有人偷加一行 ignore，CI 就必須紅。
  it('blocks an ignore that was never registered', () => {
    const review = reviewAuditExceptions({
      ignored: ['GHSA-aaaa-bbbb-cccc'],
      registry: { exceptions: [entry()] },
      today: '2026-08-01'
    });

    expect(review.ok).toBe(false);
    expect(review.problems.join('\n')).toContain(
      '沒有登記在 security/audit-exceptions.json'
    );
  });

  it('blocks an expired exception so it cannot become permanent', () => {
    const review = reviewAuditExceptions({
      ignored: ['GHSA-mh99-v99m-4gvg'],
      registry: { exceptions: [entry({ expiresOn: '2026-07-31' })] },
      today: '2026-08-01'
    });

    expect(review.ok).toBe(false);
    expect(review.problems.join('\n')).toContain('到期');
  });

  it.each(['approvalId', 'expiresOn', 'scope', 'reason', 'releaseCondition'])(
    'blocks an exception missing %s',
    (field) => {
      const review = reviewAuditExceptions({
        ignored: ['GHSA-mh99-v99m-4gvg'],
        registry: { exceptions: [entry({ [field]: null })] },
        today: '2026-08-01'
      });

      expect(review.ok).toBe(false);
    }
  );

  it('blocks an approved exception that has no approval date', () => {
    const review = reviewAuditExceptions({
      ignored: ['GHSA-mh99-v99m-4gvg'],
      registry: {
        exceptions: [entry({ approvalStatus: 'approved', approvedOn: null })]
      },
      today: '2026-08-01'
    });

    expect(review.ok).toBe(false);
    expect(review.problems.join('\n')).toContain('approvedOn');
  });

  it('blocks a stale registry entry whose ignore was already removed', () => {
    const review = reviewAuditExceptions({
      ignored: [],
      registry: { exceptions: [entry()] },
      today: '2026-08-01'
    });

    expect(review.ok).toBe(false);
    expect(review.problems.join('\n')).toContain('沒有對應項目');
  });

  it('prints each ignored advisory with its approval id, status and expiry', () => {
    const review = reviewAuditExceptions({
      ignored: ['GHSA-mh99-v99m-4gvg'],
      registry: { exceptions: [entry()] },
      today: '2026-08-01'
    });

    expect(renderReviewLines(review.reviewed)).toEqual([
      '- GHSA-mh99-v99m-4gvg（brace-expansion，high）｜核准編號 SEC-03｜狀態 pending｜到期 2026-08-31｜範圍 dev-only'
    ]);
  });
});
