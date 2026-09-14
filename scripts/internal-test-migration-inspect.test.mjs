import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { inspectLegacyCalendarCandidates } from './migrate-cal-pilot-legacy-candidates.mjs';
import {
  INSPECT_USAGE,
  STAGING_SCOPED_MIGRATE_SCRIPT,
  assembleInternalTestMigrationEvidence,
  evaluateInternalTestMigration,
  internalTestMigrationCollectCommands,
  planInternalTestMigration,
  runInternalTestMigrationCli
} from './internal-test-migration-inspect.mjs';

const isolated = 'beauessence-clinic-stg-c1a01';
const HEAD = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const PACKET = {
  sha: HEAD,
  projectId: isolated,
  operator: 'clinic-operator',
  approver: 'clinic-owner'
};

function passingSnapshot(overrides = {}) {
  return {
    projectId: isolated,
    appointments: [{ schemaVersion: 1, slotId: 'slot_1', patientId: 'pat_1' }],
    slots: [
      { schemaVersion: 1, kind: 'initial', startsAt: '2026-09-14T01:00:00Z' }
    ],
    followUps: [
      { schemaVersion: 1, decision: 'not_required', appointmentId: 'appt_1' }
    ],
    calendarPilotCandidates: [
      {
        kind: 'invalid_format',
        status: 'pending',
        expectedEtag: 'etag-synthetic-1'
      }
    ],
    ...overrides
  };
}

describe('internalTestMigrationCollectCommands', () => {
  it('prints read-only C1 commands and refuses staging', () => {
    const commands = internalTestMigrationCollectCommands(isolated);
    expect(commands[0]).toContain(`--project=${isolated}`);
    expect(commands[0]).toContain('databases describe');
    expect(commands.join('\n')).not.toMatch(
      /terraform apply|firebase deploy|CALENDAR_PILOT_LEGACY_MIGRATION_MODE=apply|databases clone|documents delete/
    );
    expect(() =>
      internalTestMigrationCollectCommands('beauessence-clinic-staging')
    ).toThrow(/beauessence-clinic-staging/);
  });
});

describe('evaluateInternalTestMigration', () => {
  it('passes readable schemaVersion=1 documents on isolated C1', () => {
    const evidence = assembleInternalTestMigrationEvidence(passingSnapshot());
    expect(evaluateInternalTestMigration(evidence)).toEqual({
      ok: true,
      issues: []
    });
  });

  it('passes an empty isolated C1 snapshot', () => {
    const evidence = assembleInternalTestMigrationEvidence({
      projectId: isolated
    });
    expect(evidence.appointmentCount).toBe(0);
    expect(evidence.legacyCalendarCandidateCount).toBe(0);
    expect(evaluateInternalTestMigration(evidence)).toEqual({
      ok: true,
      issues: []
    });
  });

  it('fails closed on unreadable appointment schemaVersion', () => {
    const evidence = assembleInternalTestMigrationEvidence(
      passingSnapshot({
        appointments: [
          { schemaVersion: 2, slotId: 'slot_1', patientId: 'pat_1' }
        ]
      })
    );
    const result = evaluateInternalTestMigration(evidence);
    expect(result.ok).toBe(false);
    expect(result.issues.join('\n')).toMatch(/appointment document/);
    expect(result.issues.join('\n')).toMatch(/do not guess a rewrite/);
  });

  it('fails closed on CAL-PILOT legacy candidates without retargeting staging migrate', () => {
    const evidence = assembleInternalTestMigrationEvidence(
      passingSnapshot({
        calendarPilotCandidates: [
          { kind: 'invalid_format', status: 'pending', expectedEtag: '   ' }
        ]
      })
    );
    const result = evaluateInternalTestMigration(evidence);
    expect(result.ok).toBe(false);
    expect(result.issues.join('\n')).toMatch(/legacy candidate/);
    expect(result.issues.join('\n')).toContain(STAGING_SCOPED_MIGRATE_SCRIPT);
    expect(result.issues.join('\n')).toMatch(
      /do not run it against isolated C1/
    );
  });

  it('refuses staging project ids', () => {
    const staging = evaluateInternalTestMigration(
      assembleInternalTestMigrationEvidence(
        passingSnapshot({ projectId: 'beauessence-clinic-staging' })
      )
    );
    expect(staging.ok).toBe(false);
    expect(staging.issues.join('\n')).toMatch(/beauessence-clinic-staging/);
  });
});

describe('planInternalTestMigration', () => {
  it('prints execute:false and never emits a migrate command', () => {
    const plan = planInternalTestMigration(PACKET, HEAD);
    expect(plan.execute).toBe(false);
    expect(plan.migrateCommand).toBeNull();
    expect(plan.stagingMigrateScript).toBe(STAGING_SCOPED_MIGRATE_SCRIPT);
    expect(plan.note).toMatch(/staging-scoped/);
    expect(plan.note).toContain('beauessence-clinic-staging');
    expect(JSON.stringify(plan)).not.toMatch(
      /CALENDAR_PILOT_LEGACY_MIGRATION_MODE=apply/
    );
    expect(plan.projectId).toBe(isolated);
  });

  it('refuses staging and a stale SHA', () => {
    expect(() =>
      planInternalTestMigration(
        { ...PACKET, projectId: 'beauessence-clinic-staging' },
        HEAD
      )
    ).toThrow(/beauessence-clinic-staging/);
    expect(() =>
      planInternalTestMigration(
        { ...PACKET, sha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' },
        HEAD
      )
    ).toThrow(/not this HEAD/);
  });
});

describe('CAL-PILOT legacy migrate stays staging-scoped', () => {
  it('refuses isolated C1 before touching Firestore', async () => {
    await expect(
      inspectLegacyCalendarCandidates({
        db: {},
        projectId: isolated,
        expectedCount: 1,
        expectedSourceGeneration: 1
      })
    ).rejects.toThrow(/beauessence-clinic-staging/);
  });
});

describe('internal-test migration inspect source', () => {
  it('does not migrate, apply, or shell out', () => {
    const source = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        'internal-test-migration-inspect.mjs'
      ),
      'utf8'
    );
    expect(source).not.toMatch(
      /execFile|spawnSync|terraform apply|firebase deploy/
    );
    expect(source).not.toMatch(/CALENDAR_PILOT_LEGACY_MIGRATION_MODE=apply/);
  });
});

describe('runInternalTestMigrationCli', () => {
  it('exits 2 without mutating when inspect is missing', () => {
    let stderr = '';
    const code = runInternalTestMigrationCli({
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
    const code = runInternalTestMigrationCli({
      argv: ['--', 'inspect', 'snapshot.json'],
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
    const payload = JSON.parse(stdout);
    expect(payload.execute).toBe(false);
    expect(payload.result.ok).toBe(true);
  });

  it('plans execute:false without a migrate command', () => {
    let stdout = '';
    const code = runInternalTestMigrationCli({
      argv: ['--', 'plan', HEAD],
      env: {
        INTERNAL_TEST_MIGRATION_SHA: HEAD,
        INTERNAL_TEST_MIGRATION_PROJECT: isolated,
        INTERNAL_TEST_MIGRATION_OPERATOR: 'clinic-operator',
        INTERNAL_TEST_MIGRATION_APPROVER: 'clinic-owner'
      },
      stdout: {
        write(chunk) {
          stdout += chunk;
        }
      },
      stderr: { write() {} }
    });
    expect(code).toBe(0);
    const payload = JSON.parse(stdout);
    expect(payload.execute).toBe(false);
    expect(payload.migrateCommand).toBeNull();
  });
});
