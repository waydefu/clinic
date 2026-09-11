import { describe, expect, it } from 'vitest';

import {
  C1_TERRAFORM_CI_ROLES,
  evaluateC1Smoke,
  loadC0EngineeringRecs
} from './c1-smoke-evidence.mjs';
import {
  assembleC1SmokeEvidence,
  assertC1CollectProjectId,
  c1SmokeCollectCommands
} from './collect-c1-smoke.mjs';

const recs = loadC0EngineeringRecs();
const terraformCiEmail =
  'c1-terraform-ci@beauessence-clinic-stg-smoke1.iam.gserviceaccount.com';

function terraformCiBindings() {
  return C1_TERRAFORM_CI_ROLES.map((role) => ({
    role,
    members: [`serviceAccount:${terraformCiEmail}`]
  }));
}

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
          {
            role: 'roles/owner',
            members: ['user:synthetic-owner@example.com']
          },
          ...terraformCiBindings()
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
      iamPolicy: { bindings: terraformCiBindings() },
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

  it('ignores the creating user Owner binding and rejects terraform-ci Owner', () => {
    const isolated = assembleC1SmokeEvidence({
      projectId: 'beauessence-clinic-stg-smoke1',
      region: 'asia-east1',
      services: recs.c1.apiAllowlist.map((api) => ({
        config: { name: api }
      })),
      iamPolicy: {
        bindings: [
          {
            role: 'roles/owner',
            members: ['user:synthetic-owner@example.com']
          },
          ...terraformCiBindings()
        ]
      },
      wifPools: [
        {
          name: 'projects/1/locations/global/workloadIdentityPools/c1-github'
        }
      ],
      serviceAccounts: [{ email: terraformCiEmail }],
      secretVersions: [],
      firestoreDatabases: [],
      identityServices: [],
      budgetAmountTwd: 2000,
      budgetThresholds: [0.5, 0.8, 1.0],
      billingDetached: false
    });
    expect(isolated.iamRoles).toEqual(C1_TERRAFORM_CI_ROLES);
    expect(evaluateC1Smoke(isolated, recs).ok).toBe(true);

    const privileged = assembleC1SmokeEvidence({
      projectId: 'beauessence-clinic-stg-smoke1',
      region: 'asia-east1',
      services: recs.c1.apiAllowlist.map((api) => ({
        config: { name: api }
      })),
      iamPolicy: {
        bindings: [
          {
            role: 'roles/owner',
            members: [`serviceAccount:${terraformCiEmail}`]
          }
        ]
      },
      wifPools: [
        {
          name: 'projects/1/locations/global/workloadIdentityPools/c1-github'
        }
      ],
      serviceAccounts: [{ email: terraformCiEmail }],
      secretVersions: [],
      firestoreDatabases: [],
      identityServices: [],
      budgetAmountTwd: 2000,
      budgetThresholds: [0.5, 0.8, 1.0],
      billingDetached: false
    });
    const result = evaluateC1Smoke(privileged, recs);
    expect(result.ok).toBe(false);
    expect(result.issues.join('\n')).toMatch(/forbidden role roles\/owner/);
  });

  it('does not invent budget or region when the snapshot omits them', () => {
    const evidence = assembleC1SmokeEvidence({
      projectId: 'beauessence-clinic-stg-smoke1',
      services: recs.c1.apiAllowlist.map((api) => ({
        config: { name: api }
      })),
      iamPolicy: { bindings: terraformCiBindings() },
      wifPools: [
        {
          name: 'projects/1/locations/global/workloadIdentityPools/c1-github'
        }
      ],
      serviceAccounts: [{ email: terraformCiEmail }],
      secretVersions: [],
      firestoreDatabases: [],
      identityServices: []
    });
    expect(evidence.region).toBeUndefined();
    expect(evidence.budgetAmountTwd).toBeUndefined();
    expect(evidence.billingDetached).toBeUndefined();
    expect(evaluateC1Smoke(evidence, recs).ok).toBe(false);
  });
});
