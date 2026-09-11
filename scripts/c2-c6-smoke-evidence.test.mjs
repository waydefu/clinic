import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  assembleC2SmokeEvidence,
  assembleC5SmokeEvidence,
  assembleC6SmokeEvidence,
  bookingAndWatchRemainUnrouted,
  c2SmokeCollectCommands,
  c5SmokeCollectCommands,
  c6SmokeCollectCommands,
  evaluateC2Smoke,
  evaluateC5Smoke,
  evaluateC6Smoke
} from './c2-c6-smoke-evidence.mjs';

const isolated = 'beauessence-clinic-stg-smoke1';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const liveAppModule = readFileSync(
  join(root, 'apps/api/src/app.module.ts'),
  'utf8'
);

function c1FoundationBuckets(location = 'asia-east1') {
  return [
    {
      name: `projects/1/locations/${location}/buckets/c1-foundation`
    }
  ];
}

function passingIdentityConfig() {
  return {
    mfa: {
      state: 'ENABLED',
      providerConfigs: [
        { state: 'ENABLED', totpProviderConfig: { adjacentIntervals: 1 } }
      ]
    }
  };
}

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
    ).toThrow(/unapplied/);
    expect(() =>
      c2SmokeCollectCommands('beauessence-clinic-stg-replace-me')
    ).toThrow(/max 30/);
    const commands = c6SmokeCollectCommands(isolated);
    expect(commands.join('\n')).toContain('services list --enabled');
    expect(commands.join('\n')).toContain('logging buckets list');
    expect(commands.join('\n')).not.toContain('beauessence-clinic-staging');
    expect(c2SmokeCollectCommands(isolated).join('\n')).toContain(
      '/admin/v2/projects/beauessence-clinic-stg-smoke1/config'
    );
    expect(c2SmokeCollectCommands(isolated).join('\n')).toContain(
      'logging buckets list'
    );
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
    const omittedFirestore = evaluateC2Smoke(
      passingC2({ firestoreDatabase: undefined })
    );
    expect(omittedFirestore.ok).toBe(false);
    expect(omittedFirestore.issues.join('\n')).toMatch(/Firestore database/);
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

  it('assembles C2 from gcloud snapshots and does not invent TOTP=1', () => {
    const evidence = assembleC2SmokeEvidence({
      projectId: isolated,
      services: [
        { config: { name: 'identitytoolkit.googleapis.com' } },
        { config: { name: 'iam.googleapis.com' } }
      ],
      firestoreDatabases: [],
      loggingBuckets: c1FoundationBuckets(),
      identityConfig: passingIdentityConfig()
    });
    expect(evaluateC2Smoke(evidence)).toEqual({ ok: true, issues: [] });

    const missingTotp = assembleC2SmokeEvidence({
      projectId: isolated,
      services: [{ config: { name: 'identitytoolkit.googleapis.com' } }],
      firestoreDatabases: [],
      loggingBuckets: c1FoundationBuckets(),
      identityConfig: {}
    });
    expect(missingTotp.totpAdjacentIntervals).toBeUndefined();
    expect(evaluateC2Smoke(missingTotp).ok).toBe(false);

    const missingFirestoreList = assembleC2SmokeEvidence({
      projectId: isolated,
      services: [{ config: { name: 'identitytoolkit.googleapis.com' } }],
      loggingBuckets: c1FoundationBuckets(),
      identityConfig: passingIdentityConfig()
    });
    expect(missingFirestoreList.firestoreDatabase).toBeUndefined();
    expect(evaluateC2Smoke(missingFirestoreList).ok).toBe(false);
  });

  it('ignores typed C2/C6 region and TOTP fields; derives region from c1-foundation', () => {
    const typedRegion = assembleC2SmokeEvidence({
      projectId: isolated,
      region: 'asia-east1',
      totpAdjacentIntervals: 1,
      services: [{ config: { name: 'identitytoolkit.googleapis.com' } }],
      firestoreDatabases: [],
      identityConfig: {}
    });
    expect(typedRegion.region).toBeUndefined();
    expect(typedRegion.totpAdjacentIntervals).toBeUndefined();
    expect(evaluateC2Smoke(typedRegion).ok).toBe(false);

    const wrongBucket = assembleC2SmokeEvidence({
      projectId: isolated,
      region: 'asia-east1',
      totpAdjacentIntervals: 1,
      services: [{ config: { name: 'identitytoolkit.googleapis.com' } }],
      firestoreDatabases: [],
      loggingBuckets: c1FoundationBuckets('us-central1'),
      identityConfig: passingIdentityConfig()
    });
    expect(wrongBucket.region).toBe('us-central1');
    expect(wrongBucket.totpAdjacentIntervals).toBe(1);
    expect(evaluateC2Smoke(wrongBucket).ok).toBe(false);

    const typedC6 = assembleC6SmokeEvidence(
      {
        projectId: isolated,
        region: 'asia-east1',
        bookingUnrouted: true,
        watchUnrouted: true,
        services: [{ config: { name: 'calendar-json.googleapis.com' } }]
      },
      liveAppModule
    );
    expect(typedC6.region).toBeUndefined();
    expect(evaluateC6Smoke(typedC6).ok).toBe(false);

    const c6FromBucket = assembleC6SmokeEvidence(
      {
        projectId: isolated,
        region: 'us-central1',
        services: [{ config: { name: 'calendar-json.googleapis.com' } }],
        loggingBuckets: c1FoundationBuckets()
      },
      liveAppModule
    );
    expect(c6FromBucket.region).toBe('asia-east1');
    expect(evaluateC6Smoke(c6FromBucket)).toEqual({ ok: true, issues: [] });
  });

  it('assembles C5 Native/PITR/delete-protection from Firestore list JSON', () => {
    const evidence = assembleC5SmokeEvidence({
      projectId: isolated,
      services: [{ config: { name: 'firestore.googleapis.com' } }],
      firestoreDatabases: [
        {
          type: 'FIRESTORE_NATIVE',
          locationId: 'asia-east1',
          pointInTimeRecoveryEnablement: 'POINT_IN_TIME_RECOVERY_ENABLED',
          deleteProtectionState: 'DELETE_PROTECTION_ENABLED'
        }
      ]
    });
    expect(evaluateC5Smoke(evidence)).toEqual({ ok: true, issues: [] });

    const empty = assembleC5SmokeEvidence({
      projectId: isolated,
      region: 'asia-east1',
      services: [{ config: { name: 'firestore.googleapis.com' } }],
      firestoreDatabases: []
    });
    expect(evaluateC5Smoke(empty).ok).toBe(false);

    const typedRegionOverride = assembleC5SmokeEvidence({
      projectId: isolated,
      region: 'asia-east1',
      services: [{ config: { name: 'firestore.googleapis.com' } }],
      firestoreDatabases: [
        {
          type: 'FIRESTORE_NATIVE',
          locationId: 'us-central1',
          pointInTimeRecoveryEnablement: 'POINT_IN_TIME_RECOVERY_ENABLED',
          deleteProtectionState: 'DELETE_PROTECTION_ENABLED'
        }
      ]
    });
    expect(typedRegionOverride.region).toBe('us-central1');
    expect(evaluateC5Smoke(typedRegionOverride).ok).toBe(false);
  });

  it('derives C6 UNROUTED from AppModule and does not invent it', () => {
    expect(bookingAndWatchRemainUnrouted(liveAppModule)).toBe(true);
    const evidence = assembleC6SmokeEvidence(
      {
        projectId: isolated,
        services: [{ config: { name: 'calendar-json.googleapis.com' } }],
        loggingBuckets: c1FoundationBuckets()
      },
      liveAppModule
    );
    expect(evaluateC6Smoke(evidence)).toEqual({ ok: true, issues: [] });

    const invented = assembleC6SmokeEvidence({
      projectId: isolated,
      services: [{ config: { name: 'calendar-json.googleapis.com' } }],
      loggingBuckets: c1FoundationBuckets()
    });
    expect(invented.bookingUnrouted).toBeUndefined();
    expect(evaluateC6Smoke(invented).ok).toBe(false);

    const routed = assembleC6SmokeEvidence(
      {
        projectId: isolated,
        services: [{ config: { name: 'calendar-json.googleapis.com' } }],
        loggingBuckets: c1FoundationBuckets()
      },
      'controllers: [AppointmentController, CalendarWatchController]'
    );
    expect(evaluateC6Smoke(routed).ok).toBe(false);
    expect(
      bookingAndWatchRemainUnrouted('controllers: [BookPilotController]')
    ).toBe(false);
  });
});
