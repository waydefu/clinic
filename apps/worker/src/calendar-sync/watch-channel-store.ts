import type { Firestore } from 'firebase-admin/firestore';

import {
  parseWatchChannelRecord,
  type WatchChannelRecord
} from './watch-channel.js';

/**
 * Unwired persistence for future watch channels. Calendar-pilot runtime
 * must not import this module. New collection, schemaVersion 1 required,
 * fail-closed on corrupt documents. Not a CAL-PILOT collection.
 */
export const WATCH_CHANNEL_COLLECTION = 'calendar_watch_channels';

export class FirestoreWatchChannelRepository {
  public constructor(private readonly db: Firestore) {}

  public async upsert(record: WatchChannelRecord): Promise<void> {
    await this.db
      .collection(WATCH_CHANNEL_COLLECTION)
      .doc(record.channelId)
      .set({
        schemaVersion: 1,
        channelId: record.channelId,
        resourceId: record.resourceId,
        calendarId: record.calendarId,
        expirationMs: record.expirationMs,
        token: record.token
      });
  }

  public async findByChannelId(
    channelId: string
  ): Promise<WatchChannelRecord | undefined> {
    const snapshot = await this.db
      .collection(WATCH_CHANNEL_COLLECTION)
      .doc(channelId)
      .get();
    if (!snapshot.exists) return undefined;
    return parseWatchChannelRecord(snapshot.data());
  }
}
