import { describe, expect, it } from 'vitest';
import {
  AGENTS_FAIL_BYTES,
  AGENTS_WARN_BYTES,
  AGENTS_WARN_LINES,
  INDEX_FAIL_BYTES,
  INDEX_WARN_BYTES,
  hasValidWaiver,
  reviewBootBudgets,
  reviewRetiredHeadings,
  reviewWaivers
} from './check-governance.mjs';

const today = '2026-09-02';

function waiver(overrides = {}) {
  return {
    id: 'W-1',
    ruleId: 'GOV-BOOT-SIZE',
    scope: 'AGENTS.md',
    reason: 'safety floor cannot shrink further',
    owner: 'waydefu',
    approver: 'waydefu',
    createdOn: '2026-09-02',
    effectiveOn: '2026-09-02',
    expiresOn: '2026-12-31',
    evidence: 'docs/reviews/example.md',
    ...overrides
  };
}

describe('governance health check', () => {
  it('uses exact byte and line thresholds', () => {
    expect(AGENTS_WARN_BYTES).toBe(6144);
    expect(AGENTS_FAIL_BYTES).toBe(8192);
    expect(AGENTS_WARN_LINES).toBe(120);
    expect(INDEX_WARN_BYTES).toBe(5120);
    expect(INDEX_FAIL_BYTES).toBe(6144);
  });

  it('warns then fails AGENTS.md on exact byte cutovers', () => {
    const underWarn = reviewBootBudgets({
      agentsText: 'a'.repeat(AGENTS_WARN_BYTES),
      indexText: 'i',
      claudeText: 'c',
      waivers: [],
      today
    });
    expect(underWarn.problems).toEqual([]);
    expect(underWarn.warnings.some((line) => line.includes('AGENTS.md'))).toBe(
      false
    );

    const warnOnly = reviewBootBudgets({
      agentsText: 'a'.repeat(AGENTS_WARN_BYTES + 1),
      indexText: 'i',
      claudeText: 'c',
      waivers: [],
      today
    });
    expect(warnOnly.problems).toEqual([]);
    expect(warnOnly.warnings.join('\n')).toContain(
      `AGENTS.md is ${AGENTS_WARN_BYTES + 1} bytes`
    );

    const fail = reviewBootBudgets({
      agentsText: 'a'.repeat(AGENTS_FAIL_BYTES + 1),
      indexText: 'i',
      claudeText: 'c',
      waivers: [],
      today
    });
    expect(fail.problems.join('\n')).toContain(
      `AGENTS.md is ${AGENTS_FAIL_BYTES + 1} bytes`
    );
  });

  it('treats AGENTS.md line overflow as advisory only', () => {
    const text = `${Array.from({ length: AGENTS_WARN_LINES + 1 }, () => 'x').join('\n')}\n`;
    const review = reviewBootBudgets({
      agentsText: text,
      indexText: 'i',
      claudeText: 'c',
      waivers: [],
      today
    });
    expect(review.problems).toEqual([]);
    expect(review.warnings.join('\n')).toContain(
      `AGENTS.md is ${AGENTS_WARN_LINES + 1} lines`
    );
  });

  it('fails INDEX.md over 6144 bytes unless a valid waiver exists', () => {
    const over = 'i'.repeat(INDEX_FAIL_BYTES + 1);
    const blocked = reviewBootBudgets({
      agentsText: 'a',
      indexText: over,
      claudeText: 'c',
      waivers: [],
      today
    });
    expect(blocked.problems.join('\n')).toContain('docs/INDEX.md');
    const waived = reviewBootBudgets({
      agentsText: 'a',
      indexText: over,
      claudeText: 'c',
      waivers: [
        waiver({
          ruleId: 'GOV-INDEX-SIZE',
          scope: 'docs/INDEX.md'
        })
      ],
      today
    });
    expect(waived.problems).toEqual([]);
  });

  it('reports CLAUDE.md size as advisory only', () => {
    const review = reviewBootBudgets({
      agentsText: 'a',
      indexText: 'i',
      claudeText: 'claude'.repeat(2000),
      waivers: [],
      today
    });
    expect(review.problems).toEqual([]);
    expect(review.warnings.join('\n')).toMatch(/CLAUDE.md advisory size/);
  });

  it('rejects expired, unknown, incomplete and duplicate waivers', () => {
    expect(
      reviewWaivers({
        registry: { knownRuleIds: ['GOV-BOOT-SIZE'], waivers: [] },
        today
      })
    ).toEqual([]);
    expect(reviewWaivers({ registry: { waivers: 'nope' }, today })[0]).toMatch(
      /must be an array/
    );
    expect(
      reviewWaivers({
        registry: { waivers: [waiver({ owner: '' })] },
        today
      }).join('\n')
    ).toContain('missing owner');
    expect(
      reviewWaivers({
        registry: { waivers: [waiver({ ruleId: 'NOT-A-RULE' })] },
        today
      }).join('\n')
    ).toContain('unknown ruleId');
    expect(
      reviewWaivers({
        registry: { waivers: [waiver({ expiresOn: '2026-01-01' })] },
        today
      }).join('\n')
    ).toContain('expired');
    expect(
      reviewWaivers({
        registry: { waivers: [waiver(), waiver()] },
        today
      }).join('\n')
    ).toContain('duplicate waiver id');
  });

  it('only accepts a complete unexpired waiver as valid', () => {
    expect(
      hasValidWaiver([waiver()], 'GOV-BOOT-SIZE', 'AGENTS.md', today)
    ).toBe(true);
    expect(
      hasValidWaiver(
        [waiver({ expiresOn: '2026-01-01' })],
        'GOV-BOOT-SIZE',
        'AGENTS.md',
        today
      )
    ).toBe(false);
    expect(
      hasValidWaiver(
        [waiver({ scope: 'other' })],
        'GOV-BOOT-SIZE',
        'AGENTS.md',
        today
      )
    ).toBe(false);
  });

  it('detects reintroduced retired AGENTS headings', () => {
    expect(reviewRetiredHeadings('# boot\n')).toEqual([]);
    expect(
      reviewRetiredHeadings('## Current commands\n\npnpm verify\n').join('\n')
    ).toContain('Current commands');
  });
});
