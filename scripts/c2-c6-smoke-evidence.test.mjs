import { describe, expect, it } from 'vitest';

import {
  c2SmokeCollectCommands,
  c5SmokeCollectCommands,
  c6SmokeCollectCommands,
  evaluateC2Smoke,
  evaluateC5Smoke,
  evaluateC6Smoke
} from './c2-c6-smoke-evidence.mjs';

const isolated = 'beauessence-clinic-stg-smoke1';

function passingC2(overrides = {}) {
  return {
    projectId: isolated,
    region: 'asia-east1',
    enabledApis: ['identitytoolkit.googleapis.com'],
    totpAdjacentIntervals: 1,
    firestoreDatabase: false,
    ...overrides
  };
}

function passingC5(overrides = {}) {
  return {
    projectId: isolated,
    region: 'asia-east1',
    enabledApis: ['firestore.googleapis.com', 'identitytoolkit.googleapis.com'],
    firestoreType: 'FIRESTORE_NATIVE',
    pointInTimeRecovery: 'POINT_IN_TIME_RECOVERY_ENABLED',
    deleteProtection: 'DELETE_PROTECTION_ENABLED',
    ...overrides
  };
}

function passingC6(overrides = {}) {
  return {
    projectId: isolated,
    region: 'asia-east1',
    enabledApis: ['calendar-json.googleapis.com'],
    bookingUnrouted: true,
    watchUnrouted: true,
    ...overrides
  };
}

describe('C2–C6 smoke evaluators (no gcloud in this sandbox)', () => {
  it('prints collect commands and refuses CAL-PILOT staging', () => {
    expect(() => c2SmokeCollectCommands('beauessence-clinic-staging')).toThrow(
      /CAL-PILOT/
    );
    expect(() =>
      c5SmokeCollectCommands('beauessence-clinic-stg-unapplied')
    ).toThrow(/isolated/);
    const commands = c6SmokeCollectCommands(isolated);
    expect(commands.join('\n')).toContain('services list --enabled');
    expect(commands.join('\n')).not.toContain('beauessence-clinic-staging');
  });

  it('accepts isolated C2 Identity evidence and rejects Firestore/Calendar bleed', () => {
    expect(evaluateC2Smoke(passingC2())).toEqual({ ok: true, issues: [] });
    const firestore = evaluateC2Smoke(
      passingC2({
        enabledApis: [
          'identitytoolkit.googleapis.com',
          'firestore.googleapis.com'
        ],
        firestoreDatabase: true
      })
    );
    expect(firestore.ok).toBe(false);
    expect(firestore.issues.join('\n')).toMatch(/C5|Firestore/i);
    const totp = evaluateC2Smoke(passingC2({ totpAdjacentIntervals: 5 }));
    expect(totp.ok).toBe(false);
    expect(totp.issues.join('\n')).toMatch(/adjacentIntervals/);
  });

  it('requires Native Firestore with PITR and delete protection for C5', () => {
    expect(evaluateC5Smoke(passingC5())).toEqual({ ok: true, issues: [] });
    const datastore = evaluateC5Smoke(
      passingC5({ firestoreType: 'DATASTORE_MODE' })
    );
    expect(datastore.ok).toBe(false);
    const calendar = evaluateC5Smoke(
      passingC5({
        enabledApis: [
          'firestore.googleapis.com',
          'calendar-json.googleapis.com'
        ]
      })
    );
    expect(calendar.ok).toBe(false);
    expect(calendar.issues.join('\n')).toMatch(/C6/);
  });

  it('requires Calendar JSON API while keeping booking and watch unrouted', () => {
    expect(evaluateC6Smoke(passingC6())).toEqual({ ok: true, issues: [] });
    const routed = evaluateC6Smoke(passingC6({ bookingUnrouted: false }));
    expect(routed.ok).toBe(false);
    expect(routed.issues.join('\n')).toMatch(/UNROUTED/);
    const staging = evaluateC6Smoke(
      passingC6({ projectId: 'beauessence-clinic-staging' })
    );
    expect(staging.ok).toBe(false);
    expect(staging.issues.join('\n')).toMatch(/not C1/);
  });
});
