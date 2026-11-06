import type { DocumentSnapshot, Firestore, Transaction } from 'firebase-admin/firestore';
import {
  CalendarPilotLeaseConfigurationRecordSchema,
  CalendarPilotRuntimeJobRecordSchema,
  OpaqueIdentifierSchema,
  parseCalendarPilotRecord
} from '@beauessence/contracts';

import {
  assertCalendarPilotWorkerLease,
  type CalendarPilotWorkerLease
} from './calendar-pilot-worker-lease.js';

function unchanged(before: DocumentSnapshot, after: DocumentSnapshot): boolean {
  if (before.ref.path !== after.ref.path || before.exists !== after.exists)
    return false;
  if (!before.exists) return true;
  return (
    before.updateTime !== undefined &&
    after.updateTime !== undefined &&
    before.updateTime.isEqual(after.updateTime)
  );
}

export interface ReconciliationDocuments {
  readonly sourceId: string;
  readonly appointment: DocumentSnapshot;
  readonly mirrors: readonly DocumentSnapshot[];
}

export async function verifyReconciliationDocuments(
  db: Firestore,
  lease: CalendarPilotWorkerLease,
  expected: ReconciliationDocuments
): Promise<boolean> {
  if (!expected.appointment.exists ||
      expected.appointment.ref.parent.path !== 'calendar_pilot_appointments' ||
      expected.mirrors.some((mirror) => mirror.ref.parent.path !== 'calendar_pilot_mirrors') ||
      expected.mirrors.length > 1) return false;
  const mirrors = db.collection('calendar_pilot_mirrors')
    .where('sourceId', '==', expected.sourceId)
    .where('linkId', '==', expected.appointment.id).limit(2);
  return db.runTransaction(async (transaction) => {
    const configuration = await transaction.get(db.collection('calendar_pilot_configuration').doc('active'));
    const appointment = await transaction.get(expected.appointment.ref);
    const currentMirrors = await transaction.get(mirrors);
    const record = parseCalendarPilotRecord(CalendarPilotLeaseConfigurationRecordSchema, configuration.data());
    assertCalendarPilotWorkerLease(record, lease);
    return record['activeSourceId'] === expected.sourceId &&
      unchanged(expected.appointment, appointment) &&
      currentMirrors.size === expected.mirrors.length &&
      expected.mirrors.every((mirror) => currentMirrors.docs.some((current) => unchanged(mirror, current)));
  });
}

export async function markCalendarPilotReconciliationNeeded(
  db: Firestore,
  lease: CalendarPilotWorkerLease,
  sourceId: string,
  linkId: string,
  kind: 'calendar_projection_upsert' | 'calendar_projection_delete'
): Promise<string> {
  if (!OpaqueIdentifierSchema.safeParse(sourceId).success ||
      !OpaqueIdentifierSchema.safeParse(linkId).success)
    throw new Error('Invalid calendar reconciliation failure target.');
  const job = db.collection('calendar_pilot_outbox').doc();
  await db.runTransaction(async (transaction: Transaction) => {
    const configuration = await transaction.get(db.collection('calendar_pilot_configuration').doc('active'));
    const record = parseCalendarPilotRecord(CalendarPilotLeaseConfigurationRecordSchema, configuration.data());
    const now = assertCalendarPilotWorkerLease(record, lease);
    if (record['activeSourceId'] !== sourceId)
      throw new Error('Calendar reconciliation source changed.');
    transaction.create(job, {
      kind, localRecordId: linkId, generation: lease.generation,
      status: 'failed', lastErrorCode: 'needs_reconcile', createdAt: now,
      attemptCount: 0, leaseOwner: null, leaseExpiresAt: null
    });
  });
  return job.id;
}

export async function settleReconciledCalendarPilotJob(
  db: Firestore,
  lease: CalendarPilotWorkerLease,
  expected: {
    readonly sourceId: string;
    readonly appointment: DocumentSnapshot;
    readonly mirrors: readonly DocumentSnapshot[];
    readonly job: DocumentSnapshot;
  }
): Promise<boolean> {
  if (
    !expected.appointment.exists ||
    expected.appointment.ref.parent.path !== 'calendar_pilot_appointments' ||
    expected.job.ref.parent.path !== 'calendar_pilot_outbox' ||
    expected.mirrors.some(
      (mirror) => mirror.ref.parent.path !== 'calendar_pilot_mirrors'
    ) ||
    expected.mirrors.length > 1
  )
    throw new Error('Invalid calendar reconciliation snapshot.');
  const linkId = expected.appointment.id;
  const mirrors = db
    .collection('calendar_pilot_mirrors')
    .where('sourceId', '==', expected.sourceId)
    .where('linkId', '==', linkId)
    .limit(2);
  const jobs = db.collection('calendar_pilot_outbox').where('localRecordId', '==', linkId).limit(100);
  return db.runTransaction(async (transaction) => {
    const configuration = await transaction.get(
      db.collection('calendar_pilot_configuration').doc('active')
    );
    const appointment = await transaction.get(expected.appointment.ref);
    const mirrorDocuments = await transaction.get(mirrors);
    const job = await transaction.get(expected.job.ref);
    const linkedJobs = await transaction.get(jobs);
    const record = parseCalendarPilotRecord(
      CalendarPilotLeaseConfigurationRecordSchema,
      configuration.data()
    );
    const now = assertCalendarPilotWorkerLease(record, lease);
    if (
      record['activeSourceId'] !== expected.sourceId ||
      !unchanged(expected.appointment, appointment) ||
      !unchanged(expected.job, job) ||
      mirrorDocuments.size !== expected.mirrors.length ||
      linkedJobs.size >= 100 ||
      linkedJobs.docs.some((document: DocumentSnapshot) => {
        const linked = CalendarPilotRuntimeJobRecordSchema.safeParse(document.data());
        return !linked.success || linked.data.status === 'pending' ||
          linked.data.status === 'processing' ||
          (linked.data.leaseOwner !== undefined && linked.data.leaseOwner !== null);
      }) ||
      expected.mirrors.some(
        (mirror) =>
          !mirrorDocuments.docs.some((current) => unchanged(mirror, current))
      )
    )
      return false;
    const data = job.data();
    const parsed = CalendarPilotRuntimeJobRecordSchema.safeParse(data);
    if (
      !parsed.success ||
      parsed.data.status !== 'failed' ||
      (parsed.data.leaseOwner !== undefined &&
        parsed.data.leaseOwner !== null) ||
      parsed.data.localRecordId !== linkId ||
      parsed.data.generation !== lease.generation ||
      (parsed.data.mirrorId !== undefined &&
        !expected.mirrors.some(
          (mirror) => mirror.id === parsed.data.mirrorId
        )) ||
      data?.['lastErrorCode'] !== 'needs_reconcile' ||
      ![
        'calendar_projection_upsert',
        'calendar_projection_delete',
        'calendar_projection_restore'
      ].includes(parsed.data.kind)
    )
      return false;
    transaction.update(job.ref, {
      status: 'completed',
      completedAt: now,
      leaseOwner: null,
      leaseExpiresAt: null,
      lastErrorCode: null
    });
    return true;
  });
}
