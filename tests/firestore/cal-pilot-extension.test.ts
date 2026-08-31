import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  CAL_PILOT_EXTENDED_EXPIRY,
  CAL_PILOT_ORIGINAL_EXPIRY
} from '../../scripts/cal-pilot-extension-policy.mjs';
import { extendCalPilot } from '../../scripts/extend-cal-pilot.mjs';
import {
  LOCAL_FIREBASE_PROJECT_ID,
  requireLocalFirestoreEmulatorTarget
} from '../../packages/config/src/index.js';

requireLocalFirestoreEmulatorTarget(process.env['FIRESTORE_EMULATOR_HOST']);

let app: App;
let db: Firestore;

async function wipe(): Promise<void> {
  for (const collection of [
    'calendar_pilot_configuration',
    'calendar_pilot_sources',
    'calendar_pilot_audit_events'
  ]) {
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
      previousSourceId: null,
      version: 1,
      expiresAt: CAL_PILOT_ORIGINAL_EXPIRY,
      health: 'healthy',
      lastSuccessfulSyncAt: '2026-08-31T03:00:00.000Z',
      nextScheduledSyncAt: '2026-08-31T03:05:00.000Z',
      inboundEnabled: true,
      outboundEnabled: true,
      ...overrides
    });
  for (const sourceId of [
    'calendar_source_primary',
    'calendar_source_secondary'
  ])
    await db
      .collection('calendar_pilot_sources')
      .doc(sourceId)
      .set({
        enabled: true,
        state: sourceId === 'calendar_source_primary' ? 'active' : 'standby'
      });
}

beforeAll(() => {
  app = initializeApp({ projectId: LOCAL_FIREBASE_PROJECT_ID }, 'extension');
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

describe('CAL-PILOT expiry extension transaction', () => {
  it('updates only expiresAt and atomically appends an anonymous audit', async () => {
    const before = (
      await db.collection('calendar_pilot_configuration').doc('active').get()
    ).data();

    await extendCalPilot({
      db,
      projectId: 'beauessence-clinic-staging',
      expectedCurrentExpiry: CAL_PILOT_ORIGINAL_EXPIRY,
      requestedExpiry: CAL_PILOT_EXTENDED_EXPIRY,
      expectedSourceGeneration: 1,
      auditId: 'extension_audit_001',
      occurredAt: '2026-08-31T04:00:00.000Z'
    });

    const after = (
      await db.collection('calendar_pilot_configuration').doc('active').get()
    ).data();
    expect(after).toEqual({ ...before, expiresAt: CAL_PILOT_EXTENDED_EXPIRY });
    expect(
      (
        await db
          .collection('calendar_pilot_audit_events')
          .doc('extension_audit_001')
          .get()
      ).data()
    ).toEqual({
      action: 'calendar_pilot_expiry_extended',
      actorId: 'deployment_operator',
      occurredAt: '2026-08-31T04:00:00.000Z',
      previousExpiresAt: CAL_PILOT_ORIGINAL_EXPIRY,
      expiresAt: CAL_PILOT_EXTENDED_EXPIRY
    });
    expect(
      (
        await db.collection('calendar_pilot_sources').orderBy('__name__').get()
      ).docs.map((document) => [document.id, document.data()])
    ).toEqual([
      ['calendar_source_primary', { enabled: true, state: 'active' }],
      ['calendar_source_secondary', { enabled: true, state: 'standby' }]
    ]);
  });

  it('writes nothing when the old expiry, source generation or allowlist drifted', async () => {
    const scenarios = [
      { expectedCurrentExpiry: '2026-09-30T04:51:37Z' },
      { expectedSourceGeneration: 2 },
      { replacementSource: true }
    ];

    for (const [index, scenario] of scenarios.entries()) {
      await wipe();
      await seed();
      if (scenario.replacementSource) {
        await db
          .collection('calendar_pilot_sources')
          .doc('calendar_source_secondary')
          .delete();
        await db.collection('calendar_pilot_sources').doc('replacement').set({
          enabled: true,
          state: 'standby'
        });
      }

      await expect(
        extendCalPilot({
          db,
          projectId: 'beauessence-clinic-staging',
          expectedCurrentExpiry:
            scenario.expectedCurrentExpiry ?? CAL_PILOT_ORIGINAL_EXPIRY,
          requestedExpiry: CAL_PILOT_EXTENDED_EXPIRY,
          expectedSourceGeneration: scenario.expectedSourceGeneration ?? 1,
          auditId: `rejected_audit_${index}`,
          occurredAt: '2026-08-31T04:00:00.000Z'
        })
      ).rejects.toThrow();
      expect(
        (
          await db
            .collection('calendar_pilot_configuration')
            .doc('active')
            .get()
        ).data()?.['expiresAt']
      ).toBe(CAL_PILOT_ORIGINAL_EXPIRY);
      expect(
        (await db.collection('calendar_pilot_audit_events').get()).empty
      ).toBe(true);
    }
  });
});
