import {
  FieldPath,
  type DocumentSnapshot,
  type Firestore
} from 'firebase-admin/firestore';
import {
  CalendarPilotLeaseConfigurationRecordSchema,
  CalendarPilotMirrorReviewRecordSchema,
  CalendarPilotRuntimeAppointmentRecordSchema,
  CalendarPilotRuntimeJobRecordSchema,
  CalendarPilotSourceConfigurationSchema,
  OpaqueIdentifierSchema,
  parseCalendarPilotRecord
} from '@beauessence/contracts';
import { formatSyntheticAppointmentTitle } from '@beauessence/domain';

import { calendarEventId } from './calendar-pilot-event-id.js';
import type {
  CalendarPilotWorkerLease
} from './calendar-pilot-worker-lease.js';
import { assertCalendarPilotWorkerLease } from './calendar-pilot-worker-lease.js';
import {
  planCalendarPilotReconciliation,
  type CalendarPilotReconciliationPort,
  type ReconcileAction,
  type ReconcileEvent,
  type ReconcileSnapshot
} from './calendar-pilot-reconciler.js';
import {
  settleReconciledCalendarPilotJob,
  verifyReconciliationDocuments
} from './calendar-pilot-reconcile-store.js';
import {
  calendarWriteEventForConfirmedAppointment,
  type StoredMirror
} from './calendar-pilot-runtime.js';
import type {
  CalendarWriteEvent,
  GoogleCalendarEventReader,
  GoogleCalendarEventWriter
} from './google-sync-client.js';

// shortcut: 100 jobs/pages; raise only if synthetic CAL-PILOT volume exceeds this.
const MAX_SCAN_ITEMS = 100;
const MAX_RECONCILIATION_PAGES = 100;
const MAX_LINKED_JOBS = 100;
const ELIGIBLE_JOB_KINDS = new Set([
  'calendar_projection_upsert',
  'calendar_projection_delete',
  'calendar_projection_restore'
]);

export interface CalendarPilotReconcileExpectation {
  readonly sourceId: string;
  readonly configuration: DocumentSnapshot;
  readonly appointment: DocumentSnapshot;
  readonly mirrors: readonly DocumentSnapshot[];
  readonly jobs: readonly DocumentSnapshot[];
}

export interface CalendarPilotReconcileAdapterOptions {
  readonly db: Firestore;
  readonly lease: CalendarPilotWorkerLease;
  /** Must match the source used to construct the injected reader and writer. */
  readonly sourceId: string;
  readonly workerServiceAccount: string;
  /** Pass only the receiver's reader constructed with guardedFetch(lease). */
  readonly reader: Pick<
    GoogleCalendarEventReader,
    'listReconciliationEvents' | 'getReconciliationOriginal'
  >;
  /** Pass only the receiver's writer constructed with guardedFetch(lease). */
  readonly writer: Pick<
    GoogleCalendarEventWriter,
    'upsert' | 'update' | 'removeWithEtag'
  >;
  readonly deadline: number;
  readonly now: () => number;
  readonly cursor?: string;
  /** Validate the lease and compare expected Firestore versions transactionally. */
  readonly compareBeforeApply: (
    expected: CalendarPilotReconcileExpectation
  ) => Promise<boolean>;
  /** Record conflicts under lease without clearing or taking over a job owner. */
  readonly recordConflict: (
    snapshot: ReconcileSnapshot,
    expected: CalendarPilotReconcileExpectation
  ) => Promise<void>;
}

interface ReadContext {
  readonly expected: CalendarPilotReconcileExpectation;
  readonly settleJobs: readonly DocumentSnapshot[];
  readonly mirrorEventId?: string;
}

function validEvent(event: ReconcileEvent, linkId: string): boolean {
  return (
    typeof event === 'object' &&
    event !== null &&
    typeof event.id === 'string' &&
    event.id.trim() !== '' &&
    typeof event.etag === 'string' &&
    /^"[\x21\x23-\x7e]*"$/u.test(event.etag) &&
    event.linkId === linkId &&
    (event.status === 'cancelled' || event.status === 'confirmed')
  );
}

function sameEvent(left: ReconcileEvent, right: ReconcileEvent): boolean {
  return (
    left.id === right.id &&
    left.etag === right.etag &&
    left.linkId === right.linkId &&
    left.status === right.status &&
    left.linkMarker === right.linkMarker &&
    left.creatorEmail === right.creatorEmail &&
    left.organizerEmail === right.organizerEmail &&
    left.title === right.title &&
    left.startsAt === right.startsAt &&
    left.endsAt === right.endsAt
  );
}

function sameWriteEvent(
  left: CalendarWriteEvent,
  right: CalendarWriteEvent
): boolean {
  return (
    left.eventId === right.eventId &&
    left.linkId === right.linkId &&
    left.title === right.title &&
    left.allDay === right.allDay &&
    ('startsAt' in left ? left.startsAt : undefined) ===
      ('startsAt' in right ? right.startsAt : undefined) &&
    ('endsAt' in left ? left.endsAt : undefined) ===
      ('endsAt' in right ? right.endsAt : undefined) &&
    ('startDate' in left ? left.startDate : undefined) ===
      ('startDate' in right ? right.startDate : undefined) &&
    ('endDate' in left ? left.endDate : undefined) ===
      ('endDate' in right ? right.endDate : undefined)
  );
}

function isProjectionJob(
  value: unknown,
  generation: number
): value is {
  readonly kind: string;
  readonly generation: number;
  readonly localRecordId: string;
  readonly status: string;
  readonly leaseOwner?: string | null;
} {
  const parsed = CalendarPilotRuntimeJobRecordSchema.safeParse(value);
  return (
    parsed.success &&
    parsed.data.status === 'failed' &&
    value !== null &&
    typeof value === 'object' &&
    (value as Record<string, unknown>)['lastErrorCode'] === 'needs_reconcile' &&
    parsed.data.generation === generation &&
    parsed.data.localRecordId !== undefined &&
    ELIGIBLE_JOB_KINDS.has(parsed.data.kind)
  );
}

export class FirestoreCalendarPilotReconciliationAdapter
  implements CalendarPilotReconciliationPort
{
  private cursorValue: string | undefined;
  private lastNow = Number.NEGATIVE_INFINITY;
  private scannedJobs = new Map<string, readonly string[]>();
  private readonly contexts = new WeakMap<ReconcileSnapshot, ReadContext>();
  private readonly latestByLink = new Map<string, ReconcileSnapshot>();

  public constructor(private readonly options: CalendarPilotReconcileAdapterOptions) {
    if (
      !Number.isFinite(options.deadline) ||
      options.workerServiceAccount.trim() === '' ||
      !OpaqueIdentifierSchema.safeParse(options.sourceId).success ||
      (options.cursor !== undefined &&
        !OpaqueIdentifierSchema.safeParse(options.cursor).success)
    )
      throw new Error('Invalid calendar reconciliation bounds.');
    this.cursorValue = options.cursor;
  }

  /** Persist this opaque document cursor if the receiver needs cross-process resume. */
  public get scanCursor(): string | undefined {
    return this.cursorValue;
  }

  private expired(): boolean {
    const now = this.options.now();
    if (!Number.isFinite(now) || now < this.lastNow)
      throw new Error('Invalid calendar reconciliation clock.');
    this.lastNow = now;
    return now >= this.options.deadline;
  }

  private async currentConfiguration(): Promise<{
    readonly document: DocumentSnapshot;
    readonly sourceId: string;
  }> {
    const document = await this.options.db
      .collection('calendar_pilot_configuration')
      .doc('active')
      .get();
    if (!document.exists) throw new Error('CAL-PILOT configuration is missing.');
    const leaseConfiguration = parseCalendarPilotRecord(
      CalendarPilotLeaseConfigurationRecordSchema,
      document.data()
    );
    assertCalendarPilotWorkerLease(leaseConfiguration, this.options.lease);
    const source = parseCalendarPilotRecord(
      CalendarPilotSourceConfigurationSchema,
      document.data()
    );
    if (
      source.version !== this.options.lease.generation ||
      source.activeSourceId !== this.options.sourceId
    )
      throw new Error('CAL-PILOT source generation changed.');
    return { document, sourceId: this.options.sourceId };
  }

  public async scan(limit: number): Promise<readonly string[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_SCAN_ITEMS)
      throw new Error('Invalid calendar reconciliation scan limit.');
    this.scannedJobs.clear();
    this.latestByLink.clear();
    if (this.expired()) return [];
    await this.currentConfiguration();
    if (this.expired()) return [];
    let query = this.options.db
      .collection('calendar_pilot_outbox')
      .orderBy(FieldPath.documentId());
    if (this.cursorValue !== undefined)
      query = query.startAfter(this.cursorValue);
    const page = await query.limit(limit).get();
    const last = page.docs.at(-1);
    if (last !== undefined) this.cursorValue = last.id;
    else this.cursorValue = undefined;
    if (this.expired()) return [];

    for (const document of page.docs) {
      const data = document.data();
      if (
        data['status'] !== 'failed' ||
        data['lastErrorCode'] !== 'needs_reconcile'
      )
        continue;
      const linkId = data['localRecordId'];
      if (
        typeof linkId !== 'string' ||
        !OpaqueIdentifierSchema.safeParse(linkId).success
      )
        throw new Error('Calendar reconciliation job link is invalid.');
      const ids = this.scannedJobs.get(linkId) ?? [];
      this.scannedJobs.set(linkId, [...ids, document.id]);
    }
    return [...this.scannedJobs.keys()];
  }

  public async read(linkId: string): Promise<ReconcileSnapshot> {
    OpaqueIdentifierSchema.parse(linkId);
    if (this.expired())
      return this.remember(linkId, {
        linkId,
        blockedByOwner: false,
        inventoryComplete: false,
        projectionEventId: calendarEventId(linkId),
        projectionOwned: false,
        events: []
      }, undefined);
    const scannedIds = this.scannedJobs.get(linkId) ?? [];
    const { document: configuration, sourceId } =
      await this.currentConfiguration();
    if (this.expired())
      return this.remember(
        linkId,
        {
          linkId,
          blockedByOwner: false,
          inventoryComplete: false,
          projectionEventId: calendarEventId(linkId),
          projectionOwned: false,
          events: []
        },
        undefined
      );
    const [appointment, mirrorQuery, linkedJobs, scannedJobDocuments] =
      await Promise.all([
        this.options.db
          .collection('calendar_pilot_appointments')
          .doc(linkId)
          .get(),
        this.options.db
          .collection('calendar_pilot_mirrors')
          .where('sourceId', '==', sourceId)
          .where('linkId', '==', linkId)
          .limit(2)
          .get(),
        this.options.db
          .collection('calendar_pilot_outbox')
          .where('localRecordId', '==', linkId)
          .limit(MAX_LINKED_JOBS)
          .get(),
        Promise.all(
          scannedIds.map((id) =>
            this.options.db.collection('calendar_pilot_outbox').doc(id).get()
          )
        )
      ]);
    const jobsByPath = new Map<string, DocumentSnapshot>();
    for (const job of [...linkedJobs.docs, ...scannedJobDocuments])
      jobsByPath.set(job.ref.path, job);
    const jobs = [...jobsByPath.values()];
    let complete = linkedJobs.size < MAX_LINKED_JOBS;
    const parsedJobs = jobs.map((job) =>
      CalendarPilotRuntimeJobRecordSchema.safeParse(job.data())
    );
    if (parsedJobs.some((result) => !result.success || result.data.status === 'pending')) complete = false;
    if (jobs.some((job) => {
      const data = job.data();
      return data?.['status'] === 'failed' && data['lastErrorCode'] === 'needs_reconcile' &&
        !isProjectionJob(data, this.options.lease.generation);
    })) complete = false;
    const activeJobs = jobs.flatMap((job, index) => {
      const parsed = parsedJobs[index];
      return parsed?.success && isProjectionJob(job.data(), this.options.lease.generation)
        ? [{ document: job, record: parsed.data }]
        : [];
    });
    if (scannedIds.some((id) => !activeJobs.some(({ document }) => document.id === id)))
      complete = false;
    const hasOwner = jobs.some((job) => {
      const data = job.data();
      return (
        data === undefined ||
        data['status'] === 'processing' ||
        (data['leaseOwner'] !== undefined && data['leaseOwner'] !== null)
      );
    });
    const settleJobs = activeJobs.map(({ document }) => document);

    const expected: CalendarPilotReconcileExpectation = {
      sourceId,
      configuration,
      appointment,
      mirrors: mirrorQuery.docs,
      jobs
    };
    if (hasOwner) {
      return this.remember(linkId, {
        linkId,
        blockedByOwner: true,
        inventoryComplete: false,
        projectionEventId: calendarEventId(linkId),
        projectionOwned: false,
        workerServiceAccount: this.options.workerServiceAccount,
        events: []
      }, { expected, settleJobs });
    }
    let mirrorEventId: string | undefined;
    let stored: StoredMirror | undefined;
    if (mirrorQuery.size === 1) {
      const result = CalendarPilotMirrorReviewRecordSchema.safeParse(
        mirrorQuery.docs[0]?.data()
      );
      if (
        result.success &&
        result.data.parsed.ok &&
        result.data.linkId === linkId
      ) {
        stored = {
          externalEventId: result.data.externalEventId,
          etag: result.data.etag,
          parsed: result.data.parsed,
          linkId: result.data.linkId
        };
        mirrorEventId = stored.externalEventId;
      } else complete = false;
    } else if (mirrorQuery.size > 1) complete = false;

    let appointmentData: Record<string, unknown> | undefined;
    if (appointment.exists) {
      const raw = appointment.data();
      const parsed = CalendarPilotRuntimeAppointmentRecordSchema.safeParse(raw);
      if (
        parsed.success &&
        typeof raw === 'object' &&
        raw !== null &&
        !Array.isArray(raw) &&
        (raw as Record<string, unknown>)['appointmentId'] === linkId
      ) {
        appointmentData = raw as Record<string, unknown>;
      } else complete = false;
    } else complete = false;

    const projectionId = calendarEventId(linkId);
    let desired: CalendarWriteEvent | undefined;
    if (appointmentData?.['status'] === 'confirmed') {
      if (stored !== undefined) {
        try {
          desired = calendarWriteEventForConfirmedAppointment(
            stored,
            appointmentData,
            linkId
          );
        } catch {
          complete = false;
        }
      } else if (mirrorQuery.empty) {
        const appointmentRecord = CalendarPilotRuntimeAppointmentRecordSchema.parse(
          appointmentData
        );
        desired = {
          eventId: projectionId,
          title: formatSyntheticAppointmentTitle({
            patientCode: appointmentRecord.patientCode,
            bookingKind: appointmentRecord.bookingKind,
            serviceId: appointmentRecord.serviceId
          }),
          startsAt: appointmentRecord.startsAt,
          endsAt: appointmentRecord.endsAt,
          linkId
        };
      }
    }

    const events = new Map<string, ReconcileEvent>();
    let inventoryComplete = complete && mirrorQuery.size <= 1;
    if (inventoryComplete || stored !== undefined) {
      let pageToken: string | undefined;
      const seenPageTokens = new Set<string>();
      let finished = false;
      for (let pageNumber = 0; pageNumber < MAX_RECONCILIATION_PAGES; pageNumber += 1) {
        if (this.expired()) {
          inventoryComplete = false;
          break;
        }
        if (pageToken !== undefined) {
          if (pageToken.trim() === '' || seenPageTokens.has(pageToken)) {
            inventoryComplete = false;
            break;
          }
          seenPageTokens.add(pageToken);
        }
        const page = await this.options.reader.listReconciliationEvents(
          linkId,
          pageToken
        );
        for (const event of page.events) {
          if (!validEvent(event, linkId) || events.has(event.id)) {
            inventoryComplete = false;
            continue;
          }
          events.set(event.id, event);
        }
        if (page.nextPageToken === undefined) {
          finished = true;
          break;
        }
        if (
          typeof page.nextPageToken !== 'string' ||
          page.nextPageToken.trim() === ''
        ) {
          inventoryComplete = false;
          break;
        }
        pageToken = page.nextPageToken;
      }
      if (!finished) inventoryComplete = false;

      if (stored !== undefined && !this.expired()) {
        const original = await this.options.reader.getReconciliationOriginal(
          stored.externalEventId,
          linkId
        );
        if (original === undefined) {
          if (events.has(stored.externalEventId)) inventoryComplete = false;
        } else if (!validEvent(original, linkId)) {
          inventoryComplete = false;
        } else if (original.id !== stored.externalEventId) {
          inventoryComplete = false;
        } else {
          const listed = events.get(original.id);
          if (listed !== undefined && !sameEvent(listed, original))
            inventoryComplete = false;
          else events.set(original.id, original);
        }
      } else if (stored !== undefined) inventoryComplete = false;
    }
    if (this.expired()) inventoryComplete = false;
    const eventList = [...events.values()];
    const projectionOwned = eventList.some((event) =>
      event.id === projectionId && event.linkMarker === linkId &&
      (event.creatorEmail === this.options.workerServiceAccount ||
        event.organizerEmail === this.options.workerServiceAccount)
    );
    const snapshot: ReconcileSnapshot = {
      linkId,
      blockedByOwner: hasOwner,
      inventoryComplete,
      ...(mirrorEventId === undefined ? {} : { mirrorEventId }),
      projectionEventId: projectionId,
      projectionOwned,
      workerServiceAccount: this.options.workerServiceAccount,
      ...(desired === undefined ? {} : { desired }),
      events: eventList
    };
    return this.remember(snapshot.linkId, snapshot, {
      expected,
      settleJobs,
      ...(mirrorEventId === undefined ? {} : { mirrorEventId })
    });
  }

  public async apply(
    linkId: string,
    action: Extract<ReconcileAction, { kind: 'insert' | 'patch' | 'delete' }>
  ): Promise<void> {
    if (this.expired()) throw new Error('Calendar reconciliation deadline passed.');
    const snapshot = this.latestByLink.get(linkId);
    const context = snapshot === undefined ? undefined : this.contexts.get(snapshot);
    if (snapshot === undefined || context === undefined)
      throw new Error('Calendar reconciliation snapshot is unavailable.');
    const planned = planCalendarPilotReconciliation(snapshot);
    if (!this.sameAction(planned, action))
      throw new Error('Calendar reconciliation action changed.');
    if (action.kind === 'delete' && action.id === context.mirrorEventId)
      throw new Error('Calendar reconciliation cannot delete the original mirror event.');
    if (action.kind === 'delete') {
      const originals = await this.options.db.collection('calendar_pilot_mirrors')
        .where('externalEventId', '==', action.id).limit(1).get();
      if (!originals.empty) throw new Error('Calendar reconciliation cannot delete a mirror original.');
    }
    if (!(await this.options.compareBeforeApply(context.expected)))
      throw new Error('Calendar reconciliation changed before apply.');
    if (this.expired()) throw new Error('Calendar reconciliation deadline passed.');
    this.latestByLink.delete(linkId);
    if (action.kind === 'insert') await this.options.writer.upsert(action.event);
    else if (action.kind === 'patch')
      await this.options.writer.update(action.event, action.etag, true);
    else await this.options.writer.removeWithEtag(action.id, action.etag);
  }

  public async settleIfUnchanged(snapshot: ReconcileSnapshot): Promise<boolean> {
    const context = this.contexts.get(snapshot);
    if (
      context === undefined ||
      planCalendarPilotReconciliation(snapshot).kind !== 'no-op' ||
      this.expired() ||
      !(await this.options.compareBeforeApply(context.expected))
    ) return false;
    if (context.settleJobs.length === 0)
      return verifyReconciliationDocuments(this.options.db, this.options.lease, context.expected);
    for (const job of context.settleJobs) {
      if (this.expired() || !(await settleReconciledCalendarPilotJob(this.options.db, this.options.lease, {
        sourceId: context.expected.sourceId,
        appointment: context.expected.appointment,
        mirrors: context.expected.mirrors,
        job
      }))) return false;
    }
    return true;
  }

  public async recordConflict(snapshot: ReconcileSnapshot): Promise<void> {
    const context = this.contexts.get(snapshot);
    if (context === undefined)
      throw new Error('Calendar reconciliation snapshot is unavailable.');
    if (planCalendarPilotReconciliation(snapshot).kind !== 'conflict')
      throw new Error('Calendar reconciliation snapshot is not conflicted.');
    if (this.expired())
      throw new Error('Calendar reconciliation deadline passed.');
    await this.options.recordConflict(snapshot, context.expected);
  }

  private remember(
    linkId: string,
    snapshot: ReconcileSnapshot,
    context: ReadContext | undefined
  ): ReconcileSnapshot {
    if (context !== undefined) this.contexts.set(snapshot, context);
    this.latestByLink.set(linkId, snapshot);
    return snapshot;
  }

  private sameAction(planned: ReconcileAction, action: ReconcileAction): boolean {
    if (planned.kind !== action.kind) return false;
    if (planned.kind === 'insert' && action.kind === 'insert')
      return sameWriteEvent(planned.event, action.event);
    if (planned.kind === 'patch' && action.kind === 'patch')
      return (
        planned.etag === action.etag &&
        sameWriteEvent(planned.event, action.event)
      );
    return (
      planned.kind === 'delete' &&
      action.kind === 'delete' &&
      planned.id === action.id &&
      planned.etag === action.etag
    );
  }
}
