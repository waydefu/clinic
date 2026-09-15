import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  DAILY_BACKUP_RETENTION,
  PITR_RETENTION
} from './internal-test-backup-inspect.mjs';
import { INTERNAL_TEST_SMOKE_PROBES } from './internal-test-booking-smoke.mjs';
import { IAM_SETIAMPOLICY_METRIC } from './internal-test-monitoring-inspect.mjs';
import {
  GO_LIVE_DEFERRED_ITEMS,
  HUMAN_QUEUE_NOT_STAGE_BLOCKING,
  INSPECT_USAGE,
  evaluateInternalPreproduction,
  runInternalPreproductionCli
} from './internal-preproduction-complete.mjs';

const isolated = 'beauessence-clinic-stg-c1a01';
const HEAD = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function passingSnapshot(overrides = {}) {
  return {
    projectId: isolated,
    headSha: HEAD,
    ci: {
      conclusion: 'success',
      runUrl: 'https://github.com/waydefu/clinic/actions/runs/1',
      headSha: HEAD,
      commit: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    },
    hosting: {
      projectId: isolated,
      channels: [
        {
          id: 'internal-preproduction',
          url: `https://${isolated}--internal-preproduction.web.app`,
          expireTime: '2026-09-21T00:00:00.000Z'
        }
      ]
    },
    backup: {
      projectId: isolated,
      databases: [
        {
          locationId: 'asia-east1',
          type: 'FIRESTORE_NATIVE',
          pointInTimeRecoveryEnablement: 'POINT_IN_TIME_RECOVERY_ENABLED',
          deleteProtectionState: 'DELETE_PROTECTION_ENABLED',
          versionRetentionPeriod: PITR_RETENTION
        }
      ],
      backupSchedules: [
        { retention: DAILY_BACKUP_RETENTION, dailyRecurrence: {} }
      ]
    },
    monitoring: {
      projectId: isolated,
      loggingMetrics: [{ name: IAM_SETIAMPOLICY_METRIC }],
      alertPolicies: [
        {
          displayName: 'C1 IAM SetIamPolicy',
          conditions: [
            {
              conditionThreshold: {
                filter: `metric.type="logging.googleapis.com/user/${IAM_SETIAMPOLICY_METRIC}"`
              }
            }
          ]
        }
      ]
    },
    migration: { projectId: isolated },
    historicalArtifacts: {
      status: 'HISTORICAL_ARTIFACTS_LOST',
      newEvidenceSet: true
    },
    humanNotification: {
      status: 'IMPLEMENTED_NOT_DEPLOYED',
      proven: false
    },
    smoke: {
      probes: INTERNAL_TEST_SMOKE_PROBES.map((probe) => ({
        method: probe.method,
        path: probe.path,
        status: 503
      }))
    },
    ...overrides
  };
}

describe('evaluateInternalPreproduction', () => {
  it('passes a complete isolated-test evidence snapshot without forging D-series or project complete', () => {
    const result = evaluateInternalPreproduction(passingSnapshot());
    expect(result.ok).toBe(true);
    expect(result.execute).toBe(false);
    expect(result.stage).toBe('INTERNAL_PREPRODUCTION');
    expect(result.projectComplete).toBe('NOT_CLAIMED');
    expect(result.dSeriesForged).toBe(false);
    expect(result.goLiveDeferred).toEqual([...GO_LIVE_DEFERRED_ITEMS]);
    expect(result.humanQueueNotBlockingStage).toEqual([
      ...HUMAN_QUEUE_NOT_STAGE_BLOCKING
    ]);
    expect(result.humanBlockers).toEqual([]);
    expect(result.issues).toEqual([]);
  });

  it('accepts pull_request Verification evidence whose commit is the merge ref', () => {
    const result = evaluateInternalPreproduction(passingSnapshot());
    expect(result.ok).toBe(true);
    expect(passingSnapshot().ci.commit).not.toBe(HEAD);
    expect(passingSnapshot().ci.headSha).toBe(HEAD);
  });

  it('fails closed when the Actions run headSha is a prior SHA', () => {
    const result = evaluateInternalPreproduction(
      passingSnapshot({
        ci: {
          conclusion: 'success',
          runUrl: 'https://github.com/waydefu/clinic/actions/runs/1',
          headSha: 'cccccccccccccccccccccccccccccccccccccccc',
          commit: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
        }
      })
    );
    expect(result.ok).toBe(false);
    expect(result.humanBlockers.join('\n')).toMatch(/exact-head CI/);
    expect(result.issues.join('\n')).toMatch(/run headSha/);
  });

  it('fails closed on live-only Hosting without setting PROJECT_COMPLETE = HUMAN_BLOCKED', () => {
    const result = evaluateInternalPreproduction(
      passingSnapshot({
        hosting: {
          projectId: isolated,
          channels: [{ name: 'live', url: `https://${isolated}.web.app` }]
        }
      })
    );
    expect(result.ok).toBe(false);
    expect(result.projectComplete).toBe('NOT_CLAIMED');
    expect(result.humanBlockers.join('\n')).toMatch(/Safety Floor 8/);
    expect(result.issues.join('\n')).toMatch(/live-only/);
  });

  it('refuses staging and does not treat GO_LIVE_DEFERRED as HUMAN_BLOCKED', () => {
    const result = evaluateInternalPreproduction(
      passingSnapshot({ projectId: 'beauessence-clinic-staging' })
    );
    expect(result.ok).toBe(false);
    expect(result.humanBlockers).toEqual([]);
    expect(result.projectComplete).toBe('NOT_CLAIMED');
    expect(result.goLiveDeferred).toContain('real patient data');
    expect(result.issues.join('\n')).toMatch(/beauessence-clinic-staging/);
  });

  it('fails closed when smoke is a static 404 instead of fail-closed 503', () => {
    const result = evaluateInternalPreproduction(
      passingSnapshot({
        smoke: {
          probes: INTERNAL_TEST_SMOKE_PROBES.map((probe) => ({
            method: probe.method,
            path: probe.path,
            status: 404
          }))
        }
      })
    );
    expect(result.ok).toBe(false);
    expect(result.issues.join('\n')).toMatch(/api-not-mounted/);
  });

  it('rejects faked historical originals and unproven human notification', () => {
    const reused = evaluateInternalPreproduction(
      passingSnapshot({
        historicalArtifacts: { status: 'HASH_MATCH', newEvidenceSet: true }
      })
    );
    expect(reused.ok).toBe(false);
    const proven = evaluateInternalPreproduction(
      passingSnapshot({
        humanNotification: {
          status: 'HUMAN_NOTIFICATION_PROVEN',
          proven: true
        }
      })
    );
    expect(proven.ok).toBe(false);
    expect(proven.issues.join('\n')).toMatch(/inbox evidence/);
  });

  it('fails closed when exact-head CI or smoke evidence is missing', () => {
    const noCi = evaluateInternalPreproduction(
      passingSnapshot({ ci: undefined })
    );
    expect(noCi.ok).toBe(false);
    expect(noCi.humanBlockers.join('\n')).toMatch(/exact-head CI/);
    const noSmoke = evaluateInternalPreproduction(
      passingSnapshot({ smoke: {} })
    );
    expect(noSmoke.ok).toBe(false);
    expect(noSmoke.humanBlockers.join('\n')).toMatch(
      /smoke:internal-test-booking/
    );
  });
});

describe('internal-preproduction inspect source', () => {
  it('does not deploy, apply, or shell out', () => {
    const source = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        'internal-preproduction-complete.mjs'
      ),
      'utf8'
    );
    expect(source).not.toMatch(/execFile|spawnSync/);
    expect(source).not.toMatch(/firebase deploy|channel:deploy/);
    expect(source).toContain("projectComplete: 'NOT_CLAIMED'");
    expect(source).not.toMatch(/projectComplete: 'HUMAN_BLOCKED'/);
  });
});

describe('runInternalPreproductionCli', () => {
  it('exits 2 without mutating when inspect is missing', () => {
    let stderr = '';
    const code = runInternalPreproductionCli({
      argv: [],
      stdout: { write() {} },
      stderr: {
        write(chunk) {
          stderr += chunk;
        }
      }
    });
    expect(code).toBe(2);
    expect(stderr).toBe(INSPECT_USAGE);
  });

  it('inspects a snapshot without calling gcloud or firebase', () => {
    let stdout = '';
    const code = runInternalPreproductionCli({
      argv: ['--', 'inspect', 'snapshot.json'],
      stdout: {
        write(chunk) {
          stdout += chunk;
        }
      },
      stderr: { write() {} },
      readFile: () => JSON.stringify(passingSnapshot())
    });
    expect(code).toBe(0);
    const payload = JSON.parse(stdout);
    expect(payload.execute).toBe(false);
    expect(payload.ok).toBe(true);
    expect(payload.projectComplete).toBe('NOT_CLAIMED');
  });
});
