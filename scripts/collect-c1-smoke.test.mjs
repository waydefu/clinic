import { describe, expect, it } from 'vitest';

import {
  evaluateC1Smoke,
  loadC0EngineeringRecs
} from './c1-smoke-evidence.mjs';
import {
  assembleC1SmokeEvidence,
  assertC1CollectProjectId,
  c1SmokeCollectCommands
} from './collect-c1-smoke.mjs';

const recs = loadC0EngineeringRecs();

describe('C1 smoke collector (no gcloud in this sandbox)', () => {
  it('refuses CAL-PILOT staging and prints the local gcloud dump commands', () => {
    expect(() =>
      assertC1CollectProjectId('beauessence-clinic-staging')
    ).toThrow(/not C1/);
    const commands = c1SmokeCollectCommands('beauessence-clinic-stg-smoke1');
    expect(
      commands.some((line) => line.includes('services list --enabled'))
    ).toBe(true);
    expect(commands.join('\n')).not.toContain('beauessence-clinic-staging');
  });

  it('assembles gcloud JSON snapshots into evidence the evaluator accepts', () => {
    const evidence = assembleC1SmokeEvidence({
      projectId: 'beauessence-clinic-stg-smoke1',
      region: 'asia-east1',
      services: recs.c1.apiAllowlist.map((api) => ({
        config: { name: `projects/1/services/${api}` }
      })),
      iamPolicy: {
        bindings: [
          { role: 'roles/iam.serviceAccountAdmin', members: [] },
          { role: 'roles/logging.admin', members: [] }
        ]
      },
      wifPools: [
        {
          name: 'projects/1/locations/global/workloadIdentityPools/c1-github'
        }
      ],
      serviceAccounts: [
        {
          email:
            'c1-terraform-ci@beauessence-clinic-stg-smoke1.iam.gserviceaccount.com'
        }
      ],
      secretVersions: [],
      firestoreDatabases: [],
      identityServices: [],
      budgetAmountTwd: 2000,
      budgetThresholds: [0.5, 0.8, 1.0],
      billingDetached: false
    });
    expect(evaluateC1Smoke(evidence, recs)).toEqual({ ok: true, issues: [] });
  });

  it('surfaces Firestore or Identity in the assembled evidence', () => {
    const evidence = assembleC1SmokeEvidence({
      projectId: 'beauessence-clinic-stg-smoke1',
      services: recs.c1.apiAllowlist.map((api) => ({
        config: { name: api }
      })),
      iamPolicy: { bindings: [] },
      wifPools: [
        {
          name: 'projects/1/locations/global/workloadIdentityPools/c1-github'
        }
      ],
      serviceAccounts: [
        {
          email:
            'c1-terraform-ci@beauessence-clinic-stg-smoke1.iam.gserviceaccount.com'
        }
      ],
      secretVersions: [],
      firestoreDatabases: [{ name: '(default)' }],
      identityServices: [{ config: { name: 'identitytoolkit.googleapis.com' } }]
    });
    const result = evaluateC1Smoke(evidence, recs);
    expect(result.ok).toBe(false);
    expect(result.issues.join('\n')).toMatch(
      /Firestore|Identity|firestore|identity/i
    );
  });
});
