import { describe, expect, it } from 'vitest';
import {
  formatUtcDate,
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

  it('reads multiple quoted block-list entries without neighbouring values', () => {
    const workspace = [
      'auditConfig:',
      '  ignoreGhsas:',
      "    - 'GHSA-aaaa-bbbb-cccc'",
      '    - "GHSA-dddd-eeee-ffff"',
      'overrides:',
      '  synthetic: GHSA-gggg-hhhh-jjjj'
    ].join('\n');
    expect(parseIgnoredAdvisories(workspace)).toEqual([
      'GHSA-aaaa-bbbb-cccc',
      'GHSA-dddd-eeee-ffff'
    ]);
  });

  it('strips full-line and inline YAML comments inside ignoreGhsas', () => {
    const workspace = [
      'auditConfig: # section header comment',
      '  # nested comment',
      '  ignoreGhsas: # list header comment',
      '    # before item',
      "    - 'GHSA-aaaa-bbbb-cccc' # inline single quoted",
      '    - GHSA-dddd-eeee-ffff # inline bare',
      'overrides:',
      '  tar: "7"'
    ].join('\n');
    expect(parseIgnoredAdvisories(workspace)).toEqual([
      'GHSA-aaaa-bbbb-cccc',
      'GHSA-dddd-eeee-ffff'
    ]);
  });

  const invalidYamlCases = [
    ['flow list', 'auditConfig:\n  ignoreGhsas: [GHSA-aaaa-bbbb-cccc]\n'],
    ['empty flow list', 'auditConfig:\n  ignoreGhsas: []\n'],
    [
      'multiline flow bracket',
      'auditConfig:\n  ignoreGhsas: [\n    GHSA-aaaa-bbbb-cccc\n  ]\n'
    ],
    [
      'inline auditConfig object',
      'auditConfig: { ignoreGhsas: [GHSA-aaaa-bbbb-cccc] }\n'
    ],
    [
      'unclosed quote',
      "auditConfig:\n  ignoreGhsas:\n    - 'GHSA-aaaa-bbbb-cccc\n"
    ],
    ['empty quoted token', "auditConfig:\n  ignoreGhsas:\n    - ''\n"],
    [
      'trailing non-comment token',
      'auditConfig:\n  ignoreGhsas:\n    - GHSA-aaaa-bbbb-cccc extra\n'
    ],
    [
      '2-space list item indent',
      'auditConfig:\n  ignoreGhsas:\n  - GHSA-aaaa-bbbb-cccc\n'
    ],
    [
      '3-space list item indent',
      'auditConfig:\n  ignoreGhsas:\n   - GHSA-aaaa-bbbb-cccc\n'
    ],
    [
      '6-space list item indent',
      'auditConfig:\n  ignoreGhsas:\n      - GHSA-aaaa-bbbb-cccc\n'
    ],
    [
      'tab indentation',
      'auditConfig:\n  ignoreGhsas:\n\t- GHSA-aaaa-bbbb-cccc\n'
    ],
    [
      '4-space key indent',
      'auditConfig:\n    ignoreGhsas:\n    - GHSA-aaaa-bbbb-cccc\n'
    ],
    [
      'duplicate auditConfig section',
      [
        'auditConfig:',
        '  ignoreGhsas:',
        '    - GHSA-aaaa-bbbb-cccc',
        'auditConfig:',
        '  ignoreGhsas:',
        '    - GHSA-dddd-eeee-ffff'
      ].join('\n')
    ],
    [
      'duplicate ignoreGhsas key',
      [
        'auditConfig:',
        '  ignoreGhsas:',
        '    - GHSA-aaaa-bbbb-cccc',
        '  ignoreGhsas:',
        '    - GHSA-dddd-eeee-ffff'
      ].join('\n')
    ],
    [
      'duplicate advisory item',
      [
        'auditConfig:',
        '  ignoreGhsas:',
        '    - GHSA-aaaa-bbbb-cccc',
        '    - GHSA-aaaa-bbbb-cccc'
      ].join('\n')
    ],
    [
      'unknown key under auditConfig',
      [
        'auditConfig:',
        '  ignoreGhsas:',
        '    - GHSA-aaaa-bbbb-cccc',
        '  ignoreCves:',
        '    - CVE-2026-0001'
      ].join('\n')
    ],
    ['empty auditConfig section', 'auditConfig:\noverrides:\n  tar: "7"\n'],
    ['empty ignoreGhsas list', 'auditConfig:\n  ignoreGhsas:\n']
  ];

  it.each(invalidYamlCases)(
    'fails closed on unsupported auditConfig YAML (%s)',
    (_label, yaml) => {
      expect(() => parseIgnoredAdvisories(yaml)).toThrow();
    }
  );

  it('rejects missing or non-string workspace YAML input', () => {
    expect(() => parseIgnoredAdvisories(null)).toThrow('字串');
    expect(() => parseIgnoredAdvisories(undefined)).toThrow('字串');
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

  it('enforces UTC clock boundaries before, on, and after expiresOn', () => {
    const before = reviewAuditExceptions({
      ignored: ['GHSA-mh99-v99m-4gvg'],
      registry: { exceptions: [entry({ expiresOn: '2026-08-31' })] },
      now: '2026-08-30T23:59:59.999Z'
    });
    expect(before.ok).toBe(true);

    const onStart = reviewAuditExceptions({
      ignored: ['GHSA-mh99-v99m-4gvg'],
      registry: { exceptions: [entry({ expiresOn: '2026-08-31' })] },
      now: '2026-08-31T00:00:00.000Z'
    });
    expect(onStart.ok).toBe(true);

    const onEnd = reviewAuditExceptions({
      ignored: ['GHSA-mh99-v99m-4gvg'],
      registry: { exceptions: [entry({ expiresOn: '2026-08-31' })] },
      now: '2026-08-31T23:59:59.999Z'
    });
    expect(onEnd.ok).toBe(true);

    const after = reviewAuditExceptions({
      ignored: ['GHSA-mh99-v99m-4gvg'],
      registry: { exceptions: [entry({ expiresOn: '2026-08-31' })] },
      now: '2026-09-01T00:00:00.000Z'
    });
    expect(after.ok).toBe(false);
    expect(after.problems.join('\n')).toContain('到期');
  });

  it.each(['2026-02-31', '2026-99-99', '2026/08/31'])(
    'blocks impossible or malformed expiresOn date %s',
    (badDate) => {
      const review = reviewAuditExceptions({
        ignored: ['GHSA-mh99-v99m-4gvg'],
        registry: { exceptions: [entry({ expiresOn: badDate })] },
        today: '2026-08-01'
      });

      expect(review.ok).toBe(false);
      expect(review.problems.join('\n')).toContain('expiresOn');
    }
  );

  it('rejects invalid synthetic UTC clock inputs', () => {
    expect(() => formatUtcDate('not-a-date')).toThrow('UTC');
    const review = reviewAuditExceptions({
      ignored: ['GHSA-mh99-v99m-4gvg'],
      registry: { exceptions: [entry()] },
      today: '2026-02-30'
    });
    expect(review.ok).toBe(false);
    expect(review.problems.join('\n')).toContain('today');
  });
});
