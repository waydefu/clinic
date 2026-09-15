import { describe, expect, it } from 'vitest';

import {
  STAGE_F_ACCEPTANCE_CASES,
  STAGE_F_BLOCKERS,
  evaluateStageFAcceptanceMatrix
} from './stage-f-acceptance-matrix.mjs';

describe('Stage F deployed acceptance matrix', () => {
  it('stays spec-only until isolated deployment evidence exists', () => {
    expect(STAGE_F_ACCEPTANCE_CASES.length).toBeGreaterThanOrEqual(11);
    expect(STAGE_F_BLOCKERS).toEqual(
      expect.arrayContaining([
        'cloud exact-SHA authority',
        'human alert delivery proof',
        'deployed Booking Page E2E'
      ])
    );
    const result = evaluateStageFAcceptanceMatrix();
    expect(result.ok).toBe(false);
    expect(result.results.every((item) => item.status === 'NOT_DEPLOYED')).toBe(
      true
    );
  });

  it('refuses HUMAN_NOTIFICATION_PROVEN without inbox proof', () => {
    const cases = Object.fromEntries(
      STAGE_F_ACCEPTANCE_CASES.map((item) => [
        item.id,
        { pass: true, humanInboxProof: false }
      ])
    );
    const result = evaluateStageFAcceptanceMatrix({
      deployed: true,
      humanNotificationProven: true,
      cases
    });
    expect(result.ok).toBe(false);
    expect(
      result.results.find((item) => item.id === 'security_one_real_human_alert')
        ?.pass
    ).toBe(false);
  });
});
