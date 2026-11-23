import { describe, expect, it } from 'vitest';

import {
  C1_TERRAFORM_CI_ROLES,
  evaluateC1Smoke,
  loadC0EngineeringRecs
} from './c1-smoke-evidence.mjs';
import {
  assembleC1SmokeEvidence,
  assertC1CollectProjectId,
  C1_BUDGET_DISPLAY_NAME,
  c1PreApplyEnableApisCommand,
  c1SmokeCollectCommands,
  selectC1TargetBudget
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

function c1Budget(overrides = {}) {
  return {
    name: 'billingAccounts/000000-000000-000000/budgets/synthetic-c1',
    displayName: C1_BUDGET_DISPLAY_NAME,
    budgetFilter: { projects: ['projects/1'] },
    allUpdatesRule: {
      pubsubTopic:
        'projects/beauessence-clinic-stg-smoke1/topics/c1-budget-notifications'
    },
    amount: {
      specifiedAmount: { currencyCode: 'TWD', units: '2000' }
    },
    thresholdRules: [
      { thresholdPercent: 0.5 },
      { thresholdPercent: 0.8 },
      { thresholdPercent: 1.0 }
    ],
    ...overrides
  };
}

function derivedFoundation(overrides = {}) {
  return {
    loggingBuckets: [
      {
        name: 'projects/1/locations/asia-east1/buckets/c1-foundation'
      }
    ],
    budgets: [c1Budget()],
    billingProject: {
      billingEnabled: true,
      billingAccountName: 'billingAccounts/000000-000000-000000'
    },
    ...overrides
  };
}

describe('C1 smoke collector (no gcloud in this sandbox)', () => {
  it('refuses CAL-PILOT staging and prints the local gcloud dump commands', () => {
    expect(() =>
      assertC1CollectProjectId('beauessence-clinic-staging')
    ).toThrow(/not C1/);
    expect(() =>
      assertC1CollectProjectId('beauessence-clinic-stg-replace-me')
    ).toThrow(/max 30/);
    expect(() =>
      assertC1CollectProjectId('beauessence-clinic-stg-unapplied')
    ).toThrow(/unapplied/);
    const enable = c1PreApplyEnableApisCommand('beauessence-clinic-stg-smoke1');
    expect(enable).toContain('gcloud services enable');
    for (const api of recs.c1.apiAllowlist) {
      expect(enable).toContain(api);
    }
    const commands = c1SmokeCollectCommands('beauessence-clinic-stg-smoke1');
    expect(
      commands.some((line) => line.includes('services list --enabled'))
    ).toBe(true);
    expect(commands.join('\n')).toContain('logging buckets list');
    expect(commands.join('\n')).toContain('billing projects describe');
    expect(commands.join('\n')).toContain('$BILLING_ACCOUNT_ID');
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
      ...derivedFoundation()
    });
    expect(evaluateC1Smoke(evidence, recs)).toEqual({ ok: true, issues: [] });
    expect(JSON.stringify(evidence)).not.toMatch(
      /billingAccounts\/[0-9A-F]{6}-[0-9A-F]{6}-[0-9A-F]{6}/
    );
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
      ...derivedFoundation()
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
      ...derivedFoundation()
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

  it('ignores typed budget fields and requires gcloud budget JSON', () => {
    const typed = assembleC1SmokeEvidence({
      projectId: 'beauessence-clinic-stg-smoke1',
      region: 'asia-east1',
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
      identityServices: [],
      budgetAmountTwd: 2000,
      budgetThresholds: [0.5, 0.8, 1.0],
      billingDetached: false
    });
    expect(typed.budgetAmountTwd).toBeUndefined();
    expect(typed.region).toBeUndefined();
    expect(typed.billingDetached).toBeUndefined();
    expect(evaluateC1Smoke(typed, recs).ok).toBe(false);
  });

  it('does not treat a missing Firestore list as firestoreDatabase=false', () => {
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
      identityServices: [],
      ...derivedFoundation()
    });
    expect(evidence.firestoreDatabase).toBeUndefined();
    expect(evaluateC1Smoke(evidence, recs).ok).toBe(false);
    expect(evaluateC1Smoke(evidence, recs).issues.join('\n')).toMatch(
      /Firestore database/
    );
  });

  it('selects the C1 target budget regardless of billing list order', () => {
    const foreignBudget = c1Budget({
      name: 'billingAccounts/000000-000000-000000/budgets/foreign',
      displayName: 'Unrelated project budget',
      budgetFilter: { projects: ['projects/99999'] },
      allUpdatesRule: {
        pubsubTopic: 'projects/other-project/topics/budget-alerts'
      },
      amount: { specifiedAmount: { currencyCode: 'TWD', units: '9999' } }
    });
    const baseSnapshot = {
      projectId: 'beauessence-clinic-stg-smoke1',
      region: 'asia-east1',
      services: recs.c1.apiAllowlist.map((api) => ({
        config: { name: `projects/1/services/${api}` }
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
    };
    const first = assembleC1SmokeEvidence({
      ...baseSnapshot,
      ...derivedFoundation({ budgets: [foreignBudget, c1Budget()] })
    });
    const second = assembleC1SmokeEvidence({
      ...baseSnapshot,
      ...derivedFoundation({ budgets: [c1Budget(), foreignBudget] })
    });
    expect(first).toEqual(second);
    expect(evaluateC1Smoke(first, recs)).toEqual({ ok: true, issues: [] });
  });

  it('fails closed when matching C1 budget is missing, duplicate, or invalid', () => {
    const baseSnapshot = {
      projectId: 'beauessence-clinic-stg-smoke1',
      region: 'asia-east1',
      services: recs.c1.apiAllowlist.map((api) => ({
        config: { name: `projects/1/services/${api}` }
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
    };

    const unscopedOnly = assembleC1SmokeEvidence({
      ...baseSnapshot,
      ...derivedFoundation({
        budgets: [
          c1Budget({
            budgetFilter: {},
            allUpdatesRule: {}
          })
        ]
      })
    });
    expect(unscopedOnly.budgetAmountTwd).toBeUndefined();
    expect(evaluateC1Smoke(unscopedOnly, recs).ok).toBe(false);

    const duplicateTarget = assembleC1SmokeEvidence({
      ...baseSnapshot,
      ...derivedFoundation({ budgets: [c1Budget(), c1Budget()] })
    });
    expect(duplicateTarget.budgetAmountTwd).toBeUndefined();
    expect(evaluateC1Smoke(duplicateTarget, recs).ok).toBe(false);

    const multiProject = c1Budget({
      budgetFilter: { projects: ['projects/1', 'projects/2'] }
    });
    expect(
      selectC1TargetBudget([multiProject], {
        projectId: 'beauessence-clinic-stg-smoke1',
        projectNumber: '1'
      })
    ).toBeUndefined();

    const usdAmount = {
      specifiedAmount: { currencyCode: 'USD', units: '2000' }
    };
    const wrongCurrency = assembleC1SmokeEvidence({
      ...baseSnapshot,
      ...derivedFoundation({ budgets: [c1Budget({ amount: usdAmount })] })
    });
    expect(wrongCurrency.budgetAmountTwd).toBeUndefined();
    expect(evaluateC1Smoke(wrongCurrency, recs).ok).toBe(false);

    const missingThreshold = assembleC1SmokeEvidence({
      ...baseSnapshot,
      ...derivedFoundation({
        budgets: [c1Budget({ thresholdRules: [] })]
      })
    });
    expect(missingThreshold.budgetThresholds).toBeUndefined();
    expect(evaluateC1Smoke(missingThreshold, recs).ok).toBe(false);
  });
});
