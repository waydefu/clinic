import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { FirestoreCalendarSyncRepository } from '../../apps/worker/src/calendar-sync/firestore-calendar-sync.repository.js';
import {
  inspectLegacyCalendarCandidates,
  migrateLegacyCalendarCandidates,
  validateMigrationSwitchState,
  verifyLegacyCalendarCandidateRegeneration
} from '../../scripts/migrate-cal-pilot-legacy-candidates.mjs';
import {
  LOCAL_FIREBASE_PROJECT_ID,
  requireLocalFirestoreEmulatorTarget
} from '../../packages/config/src/index.js';

requireLocalFirestoreEmulatorTarget(process.env['FIRESTORE_EMULATOR_HOST']);

const PROJECT = 'beauessence-clinic-staging';
const NOW = '2026-09-01T00:00:00.000Z';
const CANDIDATE_ID = 'legacy_candidate_001';
const MIRROR_ID = 'legacy_mirror_001';
const COLLECTIONS = [
  'calendar_pilot_configuration',
  'calendar_pilot_sources',
  'calendar_pilot_candidates',
  'calendar_pilot_mirrors',
  'calendar_pilot_audit_events'
] as const;

let app: App;
let db: Firestore;

async function wipe(): Promise<void> {
  for (const collection of COLLECTIONS) {
    const documents = await db.collection(collection).listDocuments();
    await Promise.all(documents.map((document) => document.delete()));
  }
}

async function seed(overrides: Record<string, unknown> = {}): Promise<void> {
  await db
    .collection('calendar_pilot_configuration')
    .doc('active')
    .set({
      activeSourceId: 'calendar_source_primary',
      version: 1,
      expiresAt: '2026-11-28T04:51:37Z',
      health: 'degraded',
      inboundEnabled: false,
      outboundEnabled: false,
      ...overrides
    });
  await Promise.all([
    db.collection('calendar_pilot_sources').doc('calendar_source_primary').set({
      enabled: true,
      syncToken: 'legacy_sync_token'
    }),
    db
      .collection('calendar_pilot_sources')
      .doc('calendar_source_secondary')
      .set({ enabled: true })
  ]);
  await db
    .collection('calendar_pilot_mirrors')
    .doc(MIRROR_ID)
    .set({
      mirrorId: MIRROR_ID,
      sourceId: 'calendar_source_primary',
      sourceVersion: 1,
      externalEventId: 'server_only_external_event',
      etag: '"legacy-etag"',
      externalStatus: 'confirmed',
      localDirty: false,
      parsed: { ok: false, errors: ['title_format_invalid'] }
    });
  await db
    .collection('calendar_pilot_candidates')
    .doc(CANDIDATE_ID)
    .set({
      candidateId: CANDIDATE_ID,
      mirrorId: MIRROR_ID,
      sourceId: 'calendar_source_primary',
      sourceVersion: 1,
      expectedVersion: 0,
      kind: 'invalid_format',
      status: 'pending',
      displayLabel: '格式需修正',
      startsAt: null,
      endsAt: null,
      validationErrors: ['title_format_invalid'],
      parsed: { ok: false, errors: ['title_format_invalid'] },
      createdAt: NOW
    });
}

beforeAll(() => {
  app = initializeApp(
    { projectId: LOCAL_FIREBASE_PROJECT_ID },
    'legacy-migration'
  );
  db = getFirestore(app);
});

beforeEach(async () => {
  await wipe();
  await seed();
});

afterAll(async () => {
  await wipe();
  await deleteApp(app);
});

describe('CAL-PILOT legacy candidate migration', () => {
  it('requires the exact enabled or safe-stopped switch state before a deployment attempt', async () => {
    const enabledInspection = await inspectLegacyCalendarCandidates({
      db,
      projectId: PROJECT,
      expectedCount: 1,
      expectedSourceGeneration: 1
    });
    expect(() =>
      validateMigrationSwitchState(enabledInspection, 'disabled')
    ).not.toThrow();
    expect(() =>
      validateMigrationSwitchState(enabledInspection, 'enabled')
    ).toThrow('not both enabled');

    await db
      .collection('calendar_pilot_configuration')
      .doc('active')
      .update({ inboundEnabled: true, outboundEnabled: true });
    const activeInspection = await inspectLegacyCalendarCandidates({
      db,
      projectId: PROJECT,
      expectedCount: 1,
      expectedSourceGeneration: 1
    });
    expect(() =>
      validateMigrationSwitchState(activeInspection, 'enabled')
    ).not.toThrow();
    expect(() =>
      validateMigrationSwitchState(activeInspection, 'disabled')
    ).toThrow('not both disabled');
  });

  it('supersedes the legacy candidate, removes only its mirror and requests full resync', async () => {
    await expect(
      migrateLegacyCalendarCandidates({
        db,
        projectId: PROJECT,
        expectedCount: 1,
        expectedSourceGeneration: 1,
        auditId: 'audit_migration_001',
        occurredAt: NOW
      })
    ).resolves.toMatchObject({ migratedCount: 1 });

    expect(
      (
        await db.collection('calendar_pilot_candidates').doc(CANDIDATE_ID).get()
      ).data()
    ).toMatchObject({
      status: 'superseded',
      expectedVersion: 1,
      supersededReason: 'legacy_candidate_requires_resync'
    });
    expect(
      (await db.collection('calendar_pilot_mirrors').doc(MIRROR_ID).get())
        .exists
    ).toBe(false);
    expect(
      (
        await db
          .collection('calendar_pilot_sources')
          .doc('calendar_source_primary')
          .get()
      ).data()
    ).toMatchObject({
      syncToken: null,
      lastErrorCode: 'legacy_candidate_resync_requested'
    });
    expect(
      (
        await db
          .collection('calendar_pilot_audit_events')
          .doc('audit_migration_001')
          .get()
      ).data()
    ).toEqual({
      action: 'calendar_pilot_legacy_candidates_superseded',
      actorId: 'deployment_operator',
      occurredAt: NOW,
      sourceGeneration: 1,
      candidateCount: 1
    });
  });

  it('fails closed with zero writes when switches, count or mirror safety drift', async () => {
    const scenarios = ['switches', 'count', 'managed_mirror'] as const;
    for (const scenario of scenarios) {
      await wipe();
      await seed(scenario === 'switches' ? { inboundEnabled: true } : {});
      if (scenario === 'managed_mirror')
        await db
          .collection('calendar_pilot_mirrors')
          .doc(MIRROR_ID)
          .update({ linkId: 'managed_projection' });

      await expect(
        migrateLegacyCalendarCandidates({
          db,
          projectId: PROJECT,
          expectedCount: scenario === 'count' ? 2 : 1,
          expectedSourceGeneration: 1,
          auditId: `audit_${scenario}`,
          occurredAt: NOW
        })
      ).rejects.toThrow();
      expect(
        (
          await db
            .collection('calendar_pilot_candidates')
            .doc(CANDIDATE_ID)
            .get()
        ).data()?.['status']
      ).toBe('pending');
      expect(
        (await db.collection('calendar_pilot_mirrors').doc(MIRROR_ID).get())
          .exists
      ).toBe(true);
      expect(
        (await db.collection('calendar_pilot_audit_events').get()).empty
      ).toBe(true);
    }
  });

  it('verifies that full sync regenerated the same mirror with a fresh matching etag', async () => {
    await migrateLegacyCalendarCandidates({
      db,
      projectId: PROJECT,
      expectedCount: 1,
      expectedSourceGeneration: 1,
      auditId: 'audit_migration_001',
      occurredAt: NOW
    });
    await new FirestoreCalendarSyncRepository(db, 'p'.repeat(64)).commitSync({
      sourceId: 'calendar_source_primary',
      expectedSourceVersion: 1,
      fullSync: true,
      completedAt: '2026-09-01T00:01:00.000Z',
      mutations: [
        {
          mirror: {
            mirrorId: MIRROR_ID,
            sourceId: 'calendar_source_primary',
            sourceVersion: 1,
            externalEventId: 'server_only_external_event',
            etag: '"fresh-etag"',
            externalStatus: 'confirmed',
            localDirty: false,
            parsed: { ok: false, errors: ['title_format_invalid'] },
            updatedAt: '2026-09-01T00:01:00.000Z'
          },
          candidate: {
            candidateId: CANDIDATE_ID,
            mirrorId: MIRROR_ID,
            expectedEtag: '"fresh-etag"',
            sourceId: 'calendar_source_primary',
            sourceVersion: 1,
            expectedVersion: 0,
            kind: 'invalid_format',
            validationErrors: ['title_format_invalid'],
            parsed: { ok: false, errors: ['title_format_invalid'] },
            createdAt: '2026-09-01T00:01:00.000Z'
          }
        }
      ]
    });

    expect(
      (
        await db.collection('calendar_pilot_candidates').doc(CANDIDATE_ID).get()
      ).data()
    ).toMatchObject({
      status: 'pending',
      expectedEtag: '"fresh-etag"'
    });

    await expect(
      verifyLegacyCalendarCandidateRegeneration({
        db,
        projectId: PROJECT,
        expectedCount: 1,
        expectedSourceGeneration: 1
      })
    ).resolves.toEqual({ regeneratedCount: 1 });
  });

  it('never overwrites a superseded candidate outside the exact legacy rebuild marker', async () => {
    await db.collection('calendar_pilot_candidates').doc(CANDIDATE_ID).update({
      status: 'superseded',
      supersededReason: 'unrelated_operator_action'
    });
    await new FirestoreCalendarSyncRepository(db, 'p'.repeat(64)).commitSync({
      sourceId: 'calendar_source_primary',
      expectedSourceVersion: 1,
      fullSync: true,
      mutations: [
        {
          mirror: {
            mirrorId: MIRROR_ID,
            sourceId: 'calendar_source_primary',
            sourceVersion: 1,
            externalEventId: 'server_only_external_event',
            etag: '"fresh-etag"',
            externalStatus: 'confirmed',
            localDirty: false,
            parsed: { ok: false, errors: ['title_format_invalid'] },
            updatedAt: '2026-09-01T00:01:00.000Z'
          },
          candidate: {
            candidateId: CANDIDATE_ID,
            mirrorId: MIRROR_ID,
            expectedEtag: '"fresh-etag"',
            sourceId: 'calendar_source_primary',
            sourceVersion: 1,
            expectedVersion: 0,
            kind: 'invalid_format',
            validationErrors: ['title_format_invalid'],
            parsed: { ok: false, errors: ['title_format_invalid'] },
            createdAt: '2026-09-01T00:01:00.000Z'
          }
        }
      ]
    });

    expect(
      (
        await db.collection('calendar_pilot_candidates').doc(CANDIDATE_ID).get()
      ).data()
    ).toMatchObject({
      status: 'superseded',
      supersededReason: 'unrelated_operator_action'
    });
  });
});
