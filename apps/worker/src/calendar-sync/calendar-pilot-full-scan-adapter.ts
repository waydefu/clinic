import { FieldPath, type Firestore, type QueryDocumentSnapshot, type Transaction } from 'firebase-admin/firestore';
import {
  CalendarPilotLeaseConfigurationRecordSchema,
  CalendarPilotRuntimeJobRecordSchema,
  OpaqueIdentifierSchema,
  parseCalendarPilotRecord
} from '@beauessence/contracts';

import { assertCalendarPilotWorkerLease, type CalendarPilotWorkerLease } from './calendar-pilot-worker-lease.js';
import { FirestoreCalendarPilotReconciliationAdapter } from './calendar-pilot-reconcile-adapter.js';
import { planCalendarPilotReconciliation } from './calendar-pilot-reconciler.js';
import type { CalendarPilotFullScanPort, FullScanCalendarEvent } from './calendar-pilot-full-scan.js';
import type { GoogleCalendarEventReader } from './google-sync-client.js';

type Source = 'a' | 'm' | 'j';

export class FirestoreCalendarPilotFullScanPort implements CalendarPilotFullScanPort {
  public constructor(private readonly options: {
    readonly db: Firestore;
    readonly lease: CalendarPilotWorkerLease;
    readonly sourceId: string;
    readonly reader: Pick<GoogleCalendarEventReader, 'listWholeCalendarInventory'>;
    readonly reconciler: FirestoreCalendarPilotReconciliationAdapter;
    readonly recordUnattributedConflict: (id: string) => Promise<void>;
  }) {}

  private async assertLease(): Promise<void> {
    await this.options.db.runTransaction(async (transaction: Transaction) => {
      const document = await transaction.get(this.options.db.collection('calendar_pilot_configuration').doc('active'));
      const record = parseCalendarPilotRecord(CalendarPilotLeaseConfigurationRecordSchema, document.data());
      assertCalendarPilotWorkerLease(record, this.options.lease);
      if (record['activeSourceId'] !== this.options.sourceId)
        throw new Error('CAL-PILOT scan source changed.');
    });
  }

  public async calendarPage(limit: number, pageToken?: string) {
    await this.assertLease();
    return this.options.reader.listWholeCalendarInventory(limit, pageToken);
  }

  public async firestorePage(limit: number, cursor?: string) {
    await this.assertLease();
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
      throw new Error('Invalid Firestore scan limit.');
    const match = cursor === undefined ? undefined : /^(a|m|j):([A-Za-z0-9_-]*)$/.exec(cursor);
    if (cursor !== undefined && match === null) throw new Error('Invalid Firestore scan cursor.');
    const source: Source = (match?.[1] as Source | undefined) ?? 'a';
    const last = match?.[2];
    const name = source === 'a' ? 'calendar_pilot_appointments' :
      source === 'm' ? 'calendar_pilot_mirrors' : 'calendar_pilot_outbox';
    let query = this.options.db.collection(name).orderBy(FieldPath.documentId()).limit(limit);
    if (last !== undefined && last !== '') query = query.startAfter(last);
    const page = await query.get();
    const linkIds = page.docs.map((document: QueryDocumentSnapshot) => {
      if (source === 'a')
        return OpaqueIdentifierSchema.safeParse(document.id).success ? `l:${document.id}` : `x:${document.id}`;
      const data = document.data();
      if (source === 'm' && typeof data['sourceId'] !== 'string') return `x:${document.id}`;
      if (source === 'm' && data['sourceId'] !== this.options.sourceId) return `s:${document.id}`;
      if (source === 'j' && !CalendarPilotRuntimeJobRecordSchema.safeParse(data).success) return `x:${document.id}`;
      if (source === 'j' && (typeof data['kind'] !== 'string' ||
        !['calendar_projection_upsert', 'calendar_projection_delete',
          'calendar_projection_restore'].includes(data['kind']))) return `s:${document.id}`;
      const link = source === 'm' ? data['linkId'] : data['localRecordId'];
      return typeof link === 'string' && OpaqueIdentifierSchema.safeParse(link).success
        ? `l:${link}` : `x:${document.id}`;
    });
    const lastId = page.docs.at(-1)?.id;
    const nextCursor = page.size === limit && lastId !== undefined ? `${source}:${lastId}` :
      source === 'a' ? 'm:' : source === 'm' ? 'j:' : undefined;
    return { linkIds, ...(nextCursor === undefined ? {} : { nextCursor }) };
  }

  private async reconcile(linkId: string): Promise<'no-op' | 'changed' | 'conflict' | 'blocked'> {
    const snapshot = await this.options.reconciler.read(linkId);
    const action = planCalendarPilotReconciliation(snapshot);
    if (action.kind === 'blocked') return 'blocked';
    if (action.kind === 'conflict') {
      await this.options.reconciler.recordConflict(snapshot);
      return 'conflict';
    }
    if (action.kind === 'no-op') {
      const changed = this.options.reconciler.hasJobsToSettle(snapshot);
      if (await this.options.reconciler.settleIfUnchanged(snapshot)) return changed ? 'changed' : 'no-op';
      await this.options.reconciler.recordConflict(snapshot);
      return 'conflict';
    }
    await this.options.reconciler.apply(linkId, action);
    return 'changed';
  }

  public async reconcileCalendarEvent(event: FullScanCalendarEvent) {
    await this.assertLease();
    if (event.recurring) {
      await this.options.recordUnattributedConflict(event.id);
      return 'conflict' as const;
    }
    const originals = await this.options.db.collection('calendar_pilot_mirrors')
      .where('externalEventId', '==', event.id).limit(2).get();
    if (originals.size > 1) {
      await this.options.recordUnattributedConflict(event.id);
      return 'conflict' as const;
    }
    const original = originals.docs[0]?.data();
    const originalLink = original?.['linkId'];
    if (original !== undefined && (original['sourceId'] !== this.options.sourceId ||
      !OpaqueIdentifierSchema.safeParse(originalLink).success ||
      (event.linkId !== undefined && event.linkId !== originalLink))) {
      await this.options.recordUnattributedConflict(event.id);
      return 'conflict' as const;
    }
    const linkId = event.linkId ?? originalLink;
    if (typeof linkId !== 'string' || !OpaqueIdentifierSchema.safeParse(linkId).success) {
      await this.options.recordUnattributedConflict(event.id);
      return 'conflict' as const;
    }
    return this.reconcile(linkId);
  }

  public async reconcileFirestoreLink(item: string) {
    if (item.startsWith('s:')) return 'no-op' as const;
    if (item.startsWith('x:')) {
      await this.options.recordUnattributedConflict(item.slice(2));
      return 'conflict' as const;
    }
    if (!item.startsWith('l:') || !OpaqueIdentifierSchema.safeParse(item.slice(2)).success)
      throw new Error('Invalid Firestore scan item.');
    return this.reconcile(item.slice(2));
  }
}
