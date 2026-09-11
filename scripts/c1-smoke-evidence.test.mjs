import { describe, expect, it } from 'vitest';

import {
  evaluateC1Smoke,
  loadC0EngineeringRecs
} from './c1-smoke-evidence.mjs';

const recs = loadC0EngineeringRecs();

function passingEvidence(overrides = {}) {
  return {
    projectId: 'beauessence-clinic-stg-smoke1',
    region: 'asia-east1',
    enabledApis: [...recs.c1.apiAllowlist],
    iamRoles: [
      'roles/serviceusage.serviceUsageAdmin',
      'roles/iam.serviceAccountAdmin'
    ],
    wifPoolId: 'c1-github',
    terraformCiSa: 'c1-terraform-ci',
    secretVersionCount: 0,
    budgetAmountTwd: 2000,
    budgetThresholds: [0.5, 0.8, 1.0],
    billingDetached: false,
    firestoreDatabase: false,
    identityPlatformEnabled: false,
    ...overrides
  };
}

describe('C1 smoke evidence evaluator', () => {
  it('passes a synthetic isolated-foundation snapshot', () => {
    expect(evaluateC1Smoke(passingEvidence(), recs)).toEqual({
      ok: true,
      issues: []
    });
  });

  it('rejects existing staging, excluded APIs, primitive IAM, and secret versions', () => {
    const staging = evaluateC1Smoke(
      passingEvidence({ projectId: 'beauessence-clinic-staging' }),
      recs
    );
    expect(staging.ok).toBe(false);
    expect(staging.issues.join('\n')).toMatch(/not C1/);

    const firestore = evaluateC1Smoke(
      passingEvidence({
        enabledApis: [...recs.c1.apiAllowlist, 'firestore.googleapis.com'],
        firestoreDatabase: true
      }),
      recs
    );
    expect(firestore.ok).toBe(false);
    expect(firestore.issues.join('\n')).toMatch(/firestore/);

    const iam = evaluateC1Smoke(
      passingEvidence({ iamRoles: ['roles/owner', 'roles/datastore.user'] }),
      recs
    );
    expect(iam.ok).toBe(false);
    expect(iam.issues.join('\n')).toMatch(/roles\/owner/);
    expect(iam.issues.join('\n')).toMatch(/datastore\.user/);

    const secrets = evaluateC1Smoke(
      passingEvidence({ secretVersionCount: 1 }),
      recs
    );
    expect(secrets.ok).toBe(false);
    expect(secrets.issues.join('\n')).toMatch(/zero versions/);
  });
});
