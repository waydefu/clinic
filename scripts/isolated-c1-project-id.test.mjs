import { describe, expect, it } from 'vitest';

import {
  FORBIDDEN_STAGING_PROJECT,
  GCP_PROJECT_ID_MAX_LENGTH,
  ISOLATED_C1_PROJECT_PREFIX,
  UNAPPLIED_PLACEHOLDER,
  isIsolatedC1ProjectId,
  isolatedC1ProjectIdError
} from './isolated-c1-project-id.mjs';

describe('isolated C1 project id (GCP 6–30)', () => {
  it('accepts prefix plus 1–7 alphanumeric chars at or under 30', () => {
    expect(ISOLATED_C1_PROJECT_PREFIX).toHaveLength(23);
    expect(GCP_PROJECT_ID_MAX_LENGTH).toBe(30);
    expect(isIsolatedC1ProjectId('beauessence-clinic-stg-a')).toBe(true);
    expect(isIsolatedC1ProjectId('beauessence-clinic-stg-c1tmp')).toBe(true);
    expect(isIsolatedC1ProjectId('beauessence-clinic-stg-smoke1')).toBe(true);
    expect(isIsolatedC1ProjectId('beauessence-clinic-stg-toolong')).toBe(true);
    expect('beauessence-clinic-stg-smoke1').toHaveLength(29);
    expect('beauessence-clinic-stg-toolong').toHaveLength(30);
  });

  it('rejects staging, placeholder, hyphens in the suffix, and oversize ids', () => {
    expect(isIsolatedC1ProjectId(FORBIDDEN_STAGING_PROJECT)).toBe(false);
    expect(isIsolatedC1ProjectId(UNAPPLIED_PLACEHOLDER)).toBe(false);
    expect(UNAPPLIED_PLACEHOLDER.length).toBeGreaterThan(30);
    expect(isIsolatedC1ProjectId('beauessence-clinic-stg-replace-me')).toBe(
      false
    );
    expect('beauessence-clinic-stg-replace-me'.length).toBeGreaterThan(30);
    expect(isIsolatedC1ProjectId('beauessence-clinic-stg-toolongx')).toBe(
      false
    );
    expect(isIsolatedC1ProjectId('beauessence-clinic-stg-abc-')).toBe(false);
    expect(isIsolatedC1ProjectId('prod-clinic')).toBe(false);
    expect(isolatedC1ProjectIdError(FORBIDDEN_STAGING_PROJECT, 'C1')).toMatch(
      /CAL-PILOT/
    );
    expect(isolatedC1ProjectIdError(UNAPPLIED_PLACEHOLDER, 'C1')).toMatch(
      /unapplied/
    );
    expect(
      isolatedC1ProjectIdError('beauessence-clinic-stg-replace-me', 'C1')
    ).toMatch(/max 30/);
  });
});
