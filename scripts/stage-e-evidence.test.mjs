import { describe, expect, it } from 'vitest';

import {
  assembleStageEEvidence,
  syntheticMonitoringProofs
} from './stage-e-evidence.mjs';

const HEAD = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

describe('stage E evidence', () => {
  it('proves monitoring signals without claiming human delivery or a deploy', () => {
    const proofs = syntheticMonitoringProofs();
    expect(proofs.every((item) => item.pass)).toBe(true);
    const evidence = assembleStageEEvidence({
      now: () => '2026-09-15T00:00:00.000Z',
      sha: () => HEAD,
      nodeVersion: 'v24.0.0',
      environment: 'internal_test'
    });
    expect(evidence.sha).toBe(HEAD);
    expect(evidence.timestamp).toBe('2026-09-15T00:00:00.000Z');
    expect(evidence.humanNotificationProven).toBe(false);
    expect(evidence.verdicts.INTERNAL_PREPRODUCTION_COMPLETE).toBe('FAIL');
    expect(evidence.verdicts.PRODUCTION_CALENDAR_INBOUND).toBe(
      'GO_LIVE_DEFERRED'
    );
    expect(JSON.stringify(evidence)).not.toMatch(/09\d{8}/);
    expect(evidence.pass).toBe(true);
  });

  it('rejects a non-SHA as missing exact-head capture', () => {
    const evidence = assembleStageEEvidence({
      sha: () => 'short'
    });
    expect(evidence.pass).toBe(false);
    expect(
      evidence.checks.find((item) => item.id === 'exact_sha_captured')?.pass
    ).toBe(false);
  });
});
