import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  FirestoreWatchChannelRepository,
  WATCH_CHANNEL_COLLECTION
} from '../../apps/worker/src/calendar-sync/watch-channel-store.js';
import { planInboundNotificationWork } from '../../apps/worker/src/calendar-sync/watch-channel.js';
import {
  LOCAL_FIREBASE_PROJECT_ID,
  requireLocalFirestoreEmulatorTarget
} from '../../packages/config/src/index.js';

requireLocalFirestoreEmulatorTarget(process.env['FIRESTORE_EMULATOR_HOST']);

const CHANNEL = {
  channelId: 'chan-emu-1',
  resourceId: 'res-emu-1',
  calendarId: 'cal-emu',
  expirationMs: Date.parse('2026-09-20T00:00:00.000Z'),
  token: 'token-hash'
} as const;

let app: App;
let db: Firestore;

async function wipe(): Promise<void> {
  const documents = await db
    .collection(WATCH_CHANNEL_COLLECTION)
    .listDocuments();
  await Promise.all(documents.map((document) => document.delete()));
}

beforeAll(() => {
  app = initializeApp(
    { projectId: LOCAL_FIREBASE_PROJECT_ID },
    'watch-channel-store'
  );
  db = getFirestore(app);
});

beforeEach(wipe);

afterAll(async () => {
  await wipe();
  await deleteApp(app);
});

describe('watch channel store (emulator, unwired)', () => {
  it('round-trips a schemaVersion 1 record and uses it to plan incremental sync', async () => {
    const repository = new FirestoreWatchChannelRepository(db);
    await repository.upsert(CHANNEL);
    const stored = await repository.findByChannelId(CHANNEL.channelId);
    expect(stored).toEqual(CHANNEL);
    expect(
      planInboundNotificationWork({
        headers: {
          'x-goog-channel-id': CHANNEL.channelId,
          'x-goog-resource-id': CHANNEL.resourceId,
          'x-goog-resource-state': 'exists',
          'x-goog-message-number': '3',
          'x-goog-channel-token': CHANNEL.token
        },
        expectedToken: stored?.token
      })
    ).toMatchObject({
      action: 'incremental_sync',
      channelId: CHANNEL.channelId
    });
  });

  it('fails closed on a corrupt document instead of casting', async () => {
    await db.collection(WATCH_CHANNEL_COLLECTION).doc('bad').set({
      schemaVersion: 2,
      channelId: 'bad'
    });
    const repository = new FirestoreWatchChannelRepository(db);
    await expect(repository.findByChannelId('bad')).rejects.toThrow(
      /unreadable/
    );
  });
});
