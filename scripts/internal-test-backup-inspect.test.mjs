import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  DAILY_BACKUP_RETENTION,
  INSPECT_USAGE,
  PITR_RETENTION,
  assembleInternalTestBackupEvidence,
  evaluateInternalTestBackup,
  internalTestBackupCollectCommands,
  planInternalTestRestore,
  runInternalTestBackupCli
} from './internal-test-backup-inspect.mjs';

const isolated = 'beauessence-clinic-stg-c1a01';
const HEAD = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const PACKET = {
  sha: HEAD,
  projectId: isolated,
  destinationDatabase: 'c5restore-drill',
  snapshotTime: '2026-09-14T00:00:00.000Z',
  operator: 'clinic-operator',
  approver: 'clinic-owner'
};

function passingSnapshot(overrides = {}) {
  return {
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
      {
        retention: DAILY_BACKUP_RETENTION,
        dailyRecurrence: {}
      }
    ],
    ...overrides
  };
}

describe('internalTestBackupCollectCommands', () => {
  it('prints read-only C1 commands and refuses staging', () => {
    const commands = internalTestBackupCollectCommands(isolated);
    expect(commands[0]).toContain(`--project=${isolated}`);
    expect(commands[1]).toContain('backups schedules list');
    expect(commands.join('\n')).not.toMatch(
      /terraform apply|databases clone|firebase deploy|backups delete/
    );
    expect(() =>
      internalTestBackupCollectCommands('beauessence-clinic-staging')
    ).toThrow(/beauessence-clinic-staging/);
  });
});

describe('evaluateInternalTestBackup', () => {
  it('passes native PITR plus a 30-day daily schedule on isolated C1', () => {
    const evidence = assembleInternalTestBackupEvidence(passingSnapshot());
    expect(evaluateInternalTestBackup(evidence)).toEqual({
      ok: true,
      issues: []
    });
  });

  it('fails closed when the daily schedule is missing', () => {
    const evidence = assembleInternalTestBackupEvidence(
      passingSnapshot({ backupSchedules: [] })
    );
    const result = evaluateInternalTestBackup(evidence);
    expect(result.ok).toBe(false);
    expect(result.issues.join('\n')).toMatch(/daily schedule/);
    expect(result.issues.join('\n')).toMatch(/exact-SHA packet/);
  });

  it('refuses staging and in-place production-shaped project ids', () => {
    const staging = evaluateInternalTestBackup(
      assembleInternalTestBackupEvidence(
        passingSnapshot({ projectId: 'beauessence-clinic-staging' })
      )
    );
    expect(staging.ok).toBe(false);
    expect(staging.issues.join('\n')).toMatch(/beauessence-clinic-staging/);
  });
});

describe('planInternalTestRestore', () => {
  it('prints execute:false clone onto a new database', () => {
    const plan = planInternalTestRestore(PACKET, HEAD);
    expect(plan.execute).toBe(false);
    expect(plan.cloneCommand).toContain(
      '--destination-database=c5restore-drill'
    );
    expect(plan.cloneCommand).toContain(`--project=${isolated}`);
    expect(plan.cloneCommand).not.toMatch(/--destination-database=\(default\)/);
    expect(plan.cloneCommand).not.toContain('beauessence-clinic-staging');
  });

  it('refuses in-place default, live staging, and a stale SHA', () => {
    expect(() =>
      planInternalTestRestore(
        { ...PACKET, destinationDatabase: '(default)' },
        HEAD
      )
    ).toThrow(/in-place/);
    expect(() =>
      planInternalTestRestore(
        { ...PACKET, projectId: 'beauessence-clinic-staging' },
        HEAD
      )
    ).toThrow(/beauessence-clinic-staging/);
    expect(() =>
      planInternalTestRestore(
        { ...PACKET, sha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' },
        HEAD
      )
    ).toThrow(/not this HEAD/);
  });
});

describe('internal-test backup inspect source', () => {
  it('does not apply, clone, or shell out', () => {
    const source = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        'internal-test-backup-inspect.mjs'
      ),
      'utf8'
    );
    expect(source).not.toMatch(
      /execFile|spawnSync|terraform apply|firebase deploy/
    );
  });
});

describe('runInternalTestBackupCli', () => {
  it('exits 2 without mutating when the packet is missing', () => {
    let stderr = '';
    const code = runInternalTestBackupCli({
      argv: [],
      env: {},
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

  it('inspects a snapshot without calling gcloud', () => {
    let stdout = '';
    const code = runInternalTestBackupCli({
      argv: ['inspect', 'snapshot.json'],
      env: {},
      stdout: {
        write(chunk) {
          stdout += chunk;
        }
      },
      stderr: { write() {} },
      readFile: () => JSON.stringify(passingSnapshot())
    });
    expect(code).toBe(0);
    expect(JSON.parse(stdout).execute).toBe(false);
    expect(JSON.parse(stdout).result.ok).toBe(true);
  });
});
