import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  evaluateC1Smoke,
  loadC0EngineeringRecs
} from './c1-smoke-evidence.mjs';
import {
  bookingAndWatchRemainUnrouted,
  emitExactAuthorityRequest,
  evaluateC3Source,
  evaluateC4Source,
  loadLiveSources,
  nextSequentialAction,
  terraformCliStatus
} from './sequential-c-gate.mjs';
import { parseStageGateStatus } from './unrouted-inventory.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const recs = loadC0EngineeringRecs();
const liveSources = loadLiveSources(root);
const liveGate = JSON.parse(
  readFileSync(join(root, 'docs/architecture/stage-2-gate-status.json'), 'utf8')
);

function passingC1() {
  return {
    projectId: 'beauessence-clinic-stg-smoke1',
    region: 'asia-east1',
    enabledApis: [...recs.c1.apiAllowlist],
    iamRoles: ['roles/iam.serviceAccountAdmin'],
    wifPoolId: 'c1-github',
    terraformCiSa: 'c1-terraform-ci',
    secretVersionCount: 0,
    budgetAmountTwd: 2000,
    budgetThresholds: [0.5, 0.8, 1.0],
    billingDetached: false,
    firestoreDatabase: false,
    identityPlatformEnabled: false
  };
}

function passingC2() {
  return {
    projectId: 'beauessence-clinic-stg-smoke1',
    region: 'asia-east1',
    enabledApis: ['identitytoolkit.googleapis.com'],
    totpAdjacentIntervals: 1,
    firestoreDatabase: false
  };
}

function passingC5() {
  return {
    projectId: 'beauessence-clinic-stg-smoke1',
    region: 'asia-east1',
    enabledApis: ['firestore.googleapis.com', 'identitytoolkit.googleapis.com'],
    firestoreType: 'FIRESTORE_NATIVE',
    pointInTimeRecovery: 'POINT_IN_TIME_RECOVERY_ENABLED',
    deleteProtection: 'DELETE_PROTECTION_ENABLED'
  };
}

function passingC6() {
  return {
    projectId: 'beauessence-clinic-stg-smoke1',
    region: 'asia-east1',
    enabledApis: ['calendar-json.googleapis.com'],
    bookingUnrouted: true,
    watchUnrouted: true
  };
}

function patchGate(overrides) {
  const value = JSON.parse(JSON.stringify(liveGate));
  Object.assign(value.stageSlices, overrides.stageSlices ?? {});
  Object.assign(
    value.deploymentAuthorities,
    overrides.deploymentAuthorities ?? {}
  );
  return value;
}

describe('sequential C1→C6 gate (source/tests/dry-run; no apply)', () => {
  it('keeps the live tree on a C1 exact-SHA hard blocker', () => {
    const action = nextSequentialAction(liveGate, liveSources);
    expect(action.kind).toBe('HARD_BLOCKER');
    expect(action.slice).toBe('C1');
    expect(action.proposedPatch).toBeNull();
    expect(action.exactAuthorityRequest.kind).toBe('EXACT_SHA_CLOUD_MUTATION');
    expect(action.exactAuthorityRequest.directory).toBe(
      'infra/terraform/c1-foundation'
    );
    expect(action.exactAuthorityRequest.forbidden).toContain(
      'beauessence-clinic-staging'
    );
    expect(evaluateC1Smoke(passingC1(), recs).ok).toBe(true);
    expect(terraformCliStatus().gcloud).toBe(false);
    expect(terraformCliStatus().terraform).toBe(false);
  });

  it('proposes C1 completed and grants only C2 after C1 smoke PASS', () => {
    const action = nextSequentialAction(liveGate, {
      ...liveSources,
      c1Smoke: passingC1()
    });
    expect(action.kind).toBe('PROPOSE_COMPLETE_AND_GRANT_NEXT');
    expect(action.slice).toBe('C1');
    const parsed = parseStageGateStatus(action.proposedPatch);
    expect(parsed.issues).toEqual([]);
    expect(parsed.stageSlices.get('C1')).toBe('completed');
    expect(parsed.deploymentAuthorities.get('C2')).toBe('granted');
    for (const id of ['C3', 'C4', 'C5', 'C6']) {
      expect(parsed.stageSlices.get(id)).toBe('pending');
      expect(parsed.deploymentAuthorities.get(id)).toBe('not_granted');
    }
  });

  it('does not treat C2 smoke as a substitute for C1 PASS', () => {
    const action = nextSequentialAction(liveGate, {
      ...liveSources,
      c2Smoke: passingC2()
    });
    expect(action.kind).toBe('HARD_BLOCKER');
    expect(action.slice).toBe('C1');
    expect(action.proposedPatch).toBeNull();
  });

  it('walks C2→C3→C4 source/cloud steps one grant at a time', () => {
    const afterC1 = patchGate({
      stageSlices: { C1: 'completed' },
      deploymentAuthorities: { C2: 'granted' }
    });
    const c2 = nextSequentialAction(afterC1, {
      ...liveSources,
      c2Smoke: passingC2()
    });
    expect(c2.kind).toBe('PROPOSE_COMPLETE_AND_GRANT_NEXT');
    expect(c2.proposedPatch.stageSlices.C2).toBe('completed');
    expect(c2.proposedPatch.deploymentAuthorities.C3).toBe('granted');

    const afterC2 = patchGate({
      stageSlices: { C1: 'completed', C2: 'completed' },
      deploymentAuthorities: { C2: 'granted', C3: 'granted' }
    });
    const c3 = nextSequentialAction(afterC2, liveSources);
    expect(c3.kind).toBe('PROPOSE_COMPLETE_AND_GRANT_NEXT');
    expect(c3.slice).toBe('C3');
    expect(c3.proposedPatch.deploymentAuthorities.C4).toBe('granted');

    const afterC3 = patchGate({
      stageSlices: { C1: 'completed', C2: 'completed', C3: 'completed' },
      deploymentAuthorities: { C2: 'granted', C3: 'granted', C4: 'granted' }
    });
    const c4 = nextSequentialAction(afterC3, liveSources);
    expect(c4.slice).toBe('C4');
    expect(c4.proposedPatch.deploymentAuthorities.C5).toBe('granted');
    expect(c4.proposedPatch.deploymentAuthorities.C6).toBe('not_granted');
  });

  it('requires C5/C6 smoke and keeps booking unrouted through C6', () => {
    const afterC4 = patchGate({
      stageSlices: {
        C1: 'completed',
        C2: 'completed',
        C3: 'completed',
        C4: 'completed'
      },
      deploymentAuthorities: {
        C2: 'granted',
        C3: 'granted',
        C4: 'granted',
        C5: 'granted'
      }
    });
    const missing = nextSequentialAction(afterC4, liveSources);
    expect(missing.kind).toBe('HARD_BLOCKER');
    expect(missing.slice).toBe('C5');
    expect(missing.exactAuthorityRequest.directory).toBe(
      'infra/terraform/c5-firestore'
    );

    const c5 = nextSequentialAction(afterC4, {
      ...liveSources,
      c5Smoke: passingC5()
    });
    expect(c5.proposedPatch.stageSlices.C5).toBe('completed');
    expect(c5.proposedPatch.deploymentAuthorities.C6).toBe('granted');

    const afterC5 = patchGate({
      stageSlices: {
        C1: 'completed',
        C2: 'completed',
        C3: 'completed',
        C4: 'completed',
        C5: 'completed'
      },
      deploymentAuthorities: {
        C2: 'granted',
        C3: 'granted',
        C4: 'granted',
        C5: 'granted',
        C6: 'granted'
      }
    });
    const c6 = nextSequentialAction(afterC5, {
      ...liveSources,
      c6Smoke: passingC6()
    });
    expect(c6.kind).toBe('PROPOSE_COMPLETE_AND_GRANT_NEXT');
    expect(c6.proposedPatch.stageSlices.C6).toBe('completed');
    expect(c6.proposedPatch.deploymentAuthorities.C6).toBe('granted');
    expect(bookingAndWatchRemainUnrouted(liveSources.appModuleSource)).toBe(
      true
    );

    const routed = nextSequentialAction(afterC5, {
      ...liveSources,
      appModuleSource: 'controllers: [AppointmentController]',
      c6Smoke: passingC6()
    });
    expect(routed.kind).toBe('HARD_BLOCKER');
    expect(routed.proposedPatch).toBeNull();
  });

  it('evaluates live C3/C4 source and emits a C1 authority request packet', () => {
    expect(evaluateC3Source(liveSources.sessionSource).ok).toBe(true);
    expect(
      evaluateC4Source(
        liveSources.rolesSource,
        liveSources.authParametersSource,
        recs
      ).ok
    ).toBe(true);
    const request = emitExactAuthorityRequest('C1');
    expect(request.packet).toBe('docs/runbooks/c1-local-execution-packet.md');
    expect(request.thisSandbox).toMatch(/no gcloud/);
  });

  it('refuses --write on the live tree and writes only a legal temp patch', () => {
    const liveWrite = spawnSync(
      process.execPath,
      ['scripts/sequential-c-gate.mjs', '--write'],
      { cwd: root, encoding: 'utf8' }
    );
    expect(liveWrite.status).toBe(1);
    expect(liveWrite.stderr).toMatch(/refuses to mutate Canon/);
    expect(
      JSON.parse(
        readFileSync(
          join(root, 'docs/architecture/stage-2-gate-status.json'),
          'utf8'
        )
      ).stageSlices.C1
    ).toBe('pending');

    const dir = mkdtempSync(join(tmpdir(), 'c-gate-'));
    const gatePath = join(dir, 'gate.json');
    const smokePath = join(dir, 'c1.json');
    writeFileSync(gatePath, `${JSON.stringify(liveGate, null, 2)}\n`);
    writeFileSync(smokePath, `${JSON.stringify(passingC1(), null, 2)}\n`);
    const written = spawnSync(
      process.execPath,
      [
        'scripts/sequential-c-gate.mjs',
        '--write',
        '--gate-status',
        gatePath,
        '--c1-smoke',
        smokePath
      ],
      { cwd: root, encoding: 'utf8' }
    );
    expect(written.status).toBe(0);
    const patched = JSON.parse(readFileSync(gatePath, 'utf8'));
    expect(patched.stageSlices.C1).toBe('completed');
    expect(patched.deploymentAuthorities.C2).toBe('granted');
    expect(patched.deploymentAuthorities.C3).toBe('not_granted');
  });
});
