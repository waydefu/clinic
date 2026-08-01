import { describe, expect, it } from 'vitest';
import { enforcedChecks, missingChecks } from './check-branch-protection.mjs';

const NOT_CONFIGURED = { status: 404, body: '' };
const NO_RULESETS = { status: 200, body: '[]' };

function classic(payload) {
  return { status: 200, body: JSON.stringify(payload) };
}

describe('reading enforced status checks', () => {
  // GitHub 回傳兩種形狀：新的 checks[].context 與舊的 contexts[]。只讀其中一種
  // 的話，另一種設定會被讀成「什麼都沒設」——而這道 gate 誤報安全比誤報失敗糟。
  it('reads the modern checks[].context shape', () => {
    const { enforced } = enforcedChecks({
      protection: classic({
        required_status_checks: {
          checks: [{ context: 'Verification evidence' }]
        }
      }),
      rulesets: NO_RULESETS
    });

    expect([...enforced]).toEqual(['Verification evidence']);
  });

  it('reads the legacy contexts[] shape', () => {
    const { enforced } = enforcedChecks({
      protection: classic({
        required_status_checks: { contexts: ['Verification evidence'] }
      }),
      rulesets: NO_RULESETS
    });

    expect([...enforced]).toEqual(['Verification evidence']);
  });

  it('reads rulesets as an alternative to classic protection', () => {
    const { enforced } = enforcedChecks({
      protection: NOT_CONFIGURED,
      rulesets: {
        status: 200,
        body: JSON.stringify([
          {
            type: 'required_status_checks',
            parameters: {
              required_status_checks: [{ context: 'Verification evidence' }]
            }
          }
        ])
      }
    });

    expect([...enforced]).toEqual(['Verification evidence']);
  });

  it('ignores ruleset rules of other types', () => {
    const { enforced } = enforcedChecks({
      protection: NOT_CONFIGURED,
      rulesets: {
        status: 200,
        body: JSON.stringify([
          { type: 'deletion' },
          { type: 'non_fast_forward' }
        ])
      }
    });

    expect(enforced.size).toBe(0);
  });

  it('merges both sources without duplicating a shared context', () => {
    const { enforced } = enforcedChecks({
      protection: classic({
        required_status_checks: {
          checks: [{ context: 'Verification evidence' }]
        }
      }),
      rulesets: {
        status: 200,
        body: JSON.stringify([
          {
            type: 'required_status_checks',
            parameters: {
              required_status_checks: [
                { context: 'Verification evidence' },
                { context: 'Semgrep' }
              ]
            }
          }
        ])
      }
    });

    expect([...enforced].sort()).toEqual(['Semgrep', 'Verification evidence']);
  });

  it('treats an unprotected branch as zero enforced checks, not an error', () => {
    const { enforced, unreadable } = enforcedChecks({
      protection: NOT_CONFIGURED,
      rulesets: NO_RULESETS
    });

    expect(unreadable).toBeUndefined();
    expect(enforced.size).toBe(0);
  });

  // 403 代表 token 權限不足。那必須是「沒查」，絕不能被當成「查了、沒設定」。
  it('reports an unreadable status instead of pretending nothing is enforced', () => {
    const result = enforcedChecks({
      protection: { status: 403, body: '' },
      rulesets: NO_RULESETS
    });

    expect(result.unreadable).toBe(403);
    expect(result.enforced).toBeUndefined();
  });
});

describe('missing required checks', () => {
  it('names the checks that are not enforced', () => {
    expect(
      missingChecks(new Set(['Other']), ['Verification evidence', 'Other'])
    ).toEqual(['Verification evidence']);
  });

  it('returns nothing when every required check is enforced', () => {
    expect(missingChecks(new Set(['A', 'B']), ['A', 'B'])).toEqual([]);
  });
});
