import { createHash } from 'node:crypto';

import {
  DomainError,
  planBusinessTerminationOperation,
  taipeiCalendarDateOf,
  type ApprovedBusinessDeliveryPolicy,
  type BusinessTerminationState
} from '@beauessence/domain';
import type {
  BusinessTerminationAcknowledgementRequest,
  BusinessTerminationChecklistItem,
  BusinessTerminationReceipt,
  BusinessTerminationResponse
} from '@beauessence/contracts';
import { NotFoundException } from '@nestjs/common';
import {
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
  type Transaction
} from 'firebase-admin/firestore';

import { ConflictError } from '../platform/errors/api-error.js';
import { EXPORT_COLLECTIONS } from './business-delivery-export.repository.js';

export const TERMINATION_COLLECTIONS = {
  records: 'bd_terminations',
  log: 'bd_termination_log',
  exportReceipts: 'bd_termination_export_receipts'
} as const;

const TERMINATION_ID = /^term_[a-f0-9]{40}$/;
const EXPORT_ID = /^exp_[a-f0-9]{40}$/;

export interface CreateTerminationCommand {
  readonly idempotencyKey: string;
  readonly noticeDate: string;
  readonly actorRef: string;
  readonly now: string;
  readonly scope: 'internal_synthetic' | 'production';
  readonly policy: ApprovedBusinessDeliveryPolicy;
}

export interface AcknowledgeTerminationCommand {
  readonly terminationId: string;
  readonly request: BusinessTerminationAcknowledgementRequest;
  readonly actorRef: string;
  readonly now: string;
  readonly scope: 'internal_synthetic' | 'production';
  readonly policy: ApprovedBusinessDeliveryPolicy;
}

export interface CloseTerminationCommand {
  readonly terminationId: string;
  readonly idempotencyKey: string;
  readonly expectedVersion: number;
  readonly actorRef: string;
  readonly now: string;
  readonly scope: 'internal_synthetic' | 'production';
  readonly policy: ApprovedBusinessDeliveryPolicy;
}

interface StoredTerminationReceipt {
  readonly receiptKind: 'data_return' | BusinessTerminationChecklistItem;
  readonly actorRef: string;
  readonly acknowledgedAt: string;
  readonly exportId?: string;
  readonly evidenceRef?: string;
  readonly sha256?: string;
}

interface StoredTermination {
  readonly schemaVersion: 1;
  readonly terminationId: string;
  readonly state: BusinessTerminationState;
  readonly noticeDate: string;
  readonly noticeStartedAt: string;
  readonly noticeDueAt: string;
  readonly noticeExceptionReference: null;
  readonly returnManifestReference: string | null;
  readonly recipientConfirmationReference: string | null;
  readonly returnCompletedAt: string | null;
  readonly controlledRetentionUntil: string | null;
  readonly receipts: readonly StoredTerminationReceipt[];
  readonly version: number;
  readonly createdAt: string;
  readonly createdByRef: string;
  readonly updatedAt: string;
  readonly closeReviewRequestedAt: string | null;
  readonly policyVersion: string;
  readonly scope: 'internal_synthetic' | 'production';
}

interface StoredOperationLog {
  readonly schemaVersion: 1;
  readonly terminationId: string;
  readonly action: 'created' | 'acknowledged' | 'close_review_requested';
  readonly actorRef: string;
  readonly at: string;
  readonly idempotencyKeyHash: string;
  readonly version: number;
  readonly requestHash: string;
  readonly result: BusinessTerminationResponse;
}

interface StoredExportJob {
  readonly schemaVersion: 1;
  readonly exportId: string;
  readonly format: string;
  readonly sha256: string;
  readonly downloadCount: number;
  readonly revokedAt: string | null;
  readonly purgeAt: { toMillis(): number };
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function requestHash(value: unknown): string {
  return sha256(JSON.stringify(value));
}

function assertPolicyScope(
  policy: ApprovedBusinessDeliveryPolicy,
  scope: 'internal_synthetic' | 'production'
): void {
  if (!(policy.applicableScopes as readonly string[]).includes(scope)) {
    throw new ConflictError();
  }
}

function terminationIdFor(idempotencyKey: string): string {
  return `term_${sha256(`bd-termination:${idempotencyKey}`).slice(0, 40)}`;
}

function operationLogId(
  action: string,
  terminationId: string,
  idempotencyKey: string
): string {
  return `${action}_${sha256(`${terminationId}:${idempotencyKey}`).slice(0, 40)}`;
}

function operationRequestId(
  action: string,
  terminationId: string,
  idempotencyKey: string
): string {
  return `termreq_${sha256(`${action}:${terminationId}:${idempotencyKey}`).slice(0, 48)}`;
}

function replay<T>(
  snapshot: DocumentSnapshot,
  expectedHash: string
): { readonly found: false } | { readonly found: true; readonly result: T } {
  if (!snapshot.exists) return { found: false };
  const existing = snapshot.data() as StoredOperationLog;
  if (existing.requestHash !== expectedHash) throw new ConflictError();
  return { found: true, result: existing.result as T };
}

function receiptsFor(record: StoredTermination): BusinessTerminationReceipt[] {
  return record.receipts.map((receipt) =>
    receipt.receiptKind === 'data_return'
      ? {
          receiptKind: 'data_return',
          exportId: receipt.exportId!,
          actorRef: receipt.actorRef,
          acknowledgedAt: receipt.acknowledgedAt,
          sha256: receipt.sha256!
        }
      : {
          receiptKind: receipt.receiptKind,
          evidenceRef: receipt.evidenceRef!,
          actorRef: receipt.actorRef,
          acknowledgedAt: receipt.acknowledgedAt
        }
  );
}

const CHECKLIST_ITEMS: readonly BusinessTerminationChecklistItem[] = [
  'backup_disposition',
  'audit_disposition',
  'access_revocation'
];

function closeMissingSteps(
  record: StoredTermination,
  now: string
): BusinessTerminationResponse['closeReadiness']['missingSteps'] {
  const missing: BusinessTerminationResponse['closeReadiness']['missingSteps'] =
    [];
  if (!record.receipts.some((receipt) => receipt.receiptKind === 'data_return'))
    missing.push('data_return');
  if (
    record.controlledRetentionUntil === null ||
    Date.parse(now) < Date.parse(record.controlledRetentionUntil)
  ) {
    missing.push('controlled_copy_retention');
  }
  for (const item of CHECKLIST_ITEMS) {
    if (!record.receipts.some((receipt) => receipt.receiptKind === item))
      missing.push(item);
  }
  return missing;
}

function view(
  record: StoredTermination,
  now: string,
  replayed?: boolean
): BusinessTerminationResponse {
  const missingSteps = closeMissingSteps(record, now);
  return {
    terminationId: record.terminationId,
    state: record.state as BusinessTerminationResponse['state'],
    noticeDate: record.noticeDate,
    noticeStartedAt: record.noticeStartedAt,
    noticeDueAt: record.noticeDueAt,
    controlledRetentionUntil: record.controlledRetentionUntil,
    version: record.version,
    receipts: receiptsFor(record),
    closeReadiness: {
      ready: missingSteps.length === 0,
      missingSteps
    },
    ...(replayed === undefined ? {} : { replayed })
  };
}

function planProof(input: {
  readonly scope: 'internal_synthetic' | 'production';
  readonly requestId: string;
  readonly actorRef: string;
}) {
  return {
    scopeId: input.scope,
    requestId: input.requestId,
    authorizationReference: input.actorRef,
    reauthenticationReference: input.actorRef,
    authorized: true,
    reauthenticated: true
  } as const;
}

function terminationPlan(input: {
  readonly operation:
    | 'open_notice'
    | 'record_return'
    | 'start_controlled_retention'
    | 'request_manual_close_review';
  readonly record: StoredTermination;
  readonly requestId: string;
  readonly now: string;
  readonly scope: 'internal_synthetic' | 'production';
  readonly actorRef: string;
  readonly policy: ApprovedBusinessDeliveryPolicy;
  readonly returnManifestReference?: string | null;
  readonly recipientConfirmationReference?: string | null;
  readonly returnCompletedAt?: string | null;
  readonly backupDispositionConfirmed?: boolean;
  readonly auditDispositionConfirmed?: boolean;
}) {
  try {
    return planBusinessTerminationOperation({
      operation: input.operation,
      terminationId: input.record.terminationId,
      requestId: input.requestId,
      state: input.record.state,
      nowAt: input.now,
      noticeStartedAt: input.record.noticeStartedAt,
      noticeDueAt: input.record.noticeDueAt,
      noticeExceptionReference: null,
      returnManifestReference:
        input.returnManifestReference ?? input.record.returnManifestReference,
      recipientConfirmationReference:
        input.recipientConfirmationReference ??
        input.record.recipientConfirmationReference,
      returnCompletedAt:
        input.returnCompletedAt ?? input.record.returnCompletedAt,
      controlledRetentionUntil: input.record.controlledRetentionUntil,
      ...(input.backupDispositionConfirmed === undefined
        ? {}
        : { backupDispositionConfirmed: input.backupDispositionConfirmed }),
      ...(input.auditDispositionConfirmed === undefined
        ? {}
        : { auditDispositionConfirmed: input.auditDispositionConfirmed }),
      policy: input.policy.termination,
      proof: planProof({
        scope: input.scope,
        requestId: input.requestId,
        actorRef: input.actorRef
      })
    });
  } catch (error) {
    if (error instanceof DomainError) throw new ConflictError();
    throw error;
  }
}

function writeOperationLog(
  transaction: Transaction,
  reference: DocumentReference,
  input: Omit<StoredOperationLog, 'schemaVersion'>
): void {
  transaction.create(reference, { schemaVersion: 1, ...input });
}

/** CP-07 state, receipts, optimistic version and append-only audit in Firestore transactions. */
export class FirestoreBusinessTerminationRepository {
  public constructor(private readonly db: Firestore) {}

  public async create(
    command: CreateTerminationCommand
  ): Promise<BusinessTerminationResponse> {
    assertPolicyScope(command.policy, command.scope);
    const terminationId = terminationIdFor(command.idempotencyKey);
    const recordRef = this.db
      .collection(TERMINATION_COLLECTIONS.records)
      .doc(terminationId);
    const logRef = this.db
      .collection(TERMINATION_COLLECTIONS.log)
      .doc(operationLogId('create', terminationId, command.idempotencyKey));
    const hash = requestHash(['create', command.noticeDate]);

    return this.db.runTransaction(async (transaction) => {
      const [existingLog, existingRecord] = await transaction.getAll(
        logRef,
        recordRef
      );
      if (existingRecord!.exists) {
        const stored = existingRecord!.data() as StoredTermination;
        if (
          stored.terminationId !== terminationId ||
          stored.scope !== command.scope
        ) {
          throw new ConflictError();
        }
      }
      const previous = replay<BusinessTerminationResponse>(existingLog!, hash);
      if (previous.found) {
        if (!existingRecord!.exists) throw new ConflictError();
        return { ...previous.result, replayed: true };
      }
      if (existingRecord!.exists) throw new ConflictError();
      if (command.noticeDate !== taipeiCalendarDateOf(command.now)) {
        throw new DomainError(
          'INVALID_VALUE',
          'noticeDate must be the current Taipei calendar date.'
        );
      }

      const requestId = operationRequestId(
        'create',
        terminationId,
        command.idempotencyKey
      );
      const planned = planBusinessTerminationOperation({
        operation: 'open_notice',
        terminationId,
        requestId,
        state: 'active',
        nowAt: command.now,
        policy: command.policy.termination,
        proof: planProof({
          scope: command.scope,
          requestId,
          actorRef: command.actorRef
        })
      });
      const record: StoredTermination = {
        schemaVersion: 1,
        terminationId,
        state: planned.resultingState,
        noticeDate: command.noticeDate,
        noticeStartedAt: planned.noticeStartedAt!,
        noticeDueAt: planned.noticeDueAt!,
        noticeExceptionReference: null,
        returnManifestReference: null,
        recipientConfirmationReference: null,
        returnCompletedAt: null,
        controlledRetentionUntil: null,
        receipts: [],
        version: 1,
        createdAt: command.now,
        createdByRef: command.actorRef,
        updatedAt: command.now,
        closeReviewRequestedAt: null,
        policyVersion: command.policy.version,
        scope: command.scope
      };
      const response = view(record, command.now);
      transaction.create(recordRef, record);
      writeOperationLog(transaction, logRef, {
        terminationId,
        action: 'created',
        actorRef: command.actorRef,
        at: command.now,
        idempotencyKeyHash: sha256(command.idempotencyKey),
        version: record.version,
        requestHash: hash,
        result: response
      });
      return response;
    });
  }

  public async get(
    terminationId: string,
    now: string,
    scope: 'internal_synthetic' | 'production'
  ): Promise<BusinessTerminationResponse | undefined> {
    if (!TERMINATION_ID.test(terminationId)) return undefined;
    const snapshot = await this.db
      .collection(TERMINATION_COLLECTIONS.records)
      .doc(terminationId)
      .get();
    if (!snapshot.exists) return undefined;
    const record = snapshot.data() as StoredTermination;
    return record.scope === scope ? view(record, now) : undefined;
  }

  public async acknowledge(
    command: AcknowledgeTerminationCommand
  ): Promise<BusinessTerminationResponse> {
    assertPolicyScope(command.policy, command.scope);
    if (!TERMINATION_ID.test(command.terminationId))
      throw new NotFoundException();
    const request = command.request;
    const actionHash = requestHash([
      'acknowledge',
      request.receiptKind,
      request.receiptKind === 'data_return'
        ? request.exportId
        : request.evidenceRef
    ]);
    const requestId = operationRequestId(
      'acknowledge',
      command.terminationId,
      request.idempotencyKey
    );
    const recordRef = this.db
      .collection(TERMINATION_COLLECTIONS.records)
      .doc(command.terminationId);
    const logRef = this.db
      .collection(TERMINATION_COLLECTIONS.log)
      .doc(
        operationLogId('ack', command.terminationId, request.idempotencyKey)
      );
    const exportRef =
      request.receiptKind === 'data_return' && EXPORT_ID.test(request.exportId)
        ? this.db.collection(EXPORT_COLLECTIONS.jobs).doc(request.exportId)
        : undefined;
    const exportReceiptRef =
      request.receiptKind === 'data_return' && EXPORT_ID.test(request.exportId)
        ? this.db
            .collection(TERMINATION_COLLECTIONS.exportReceipts)
            .doc(request.exportId)
        : undefined;
    if (request.receiptKind === 'data_return' && exportRef === undefined)
      throw new ConflictError();

    return this.db.runTransaction(async (transaction) => {
      const references = [recordRef, logRef];
      if (exportRef !== undefined) references.push(exportRef);
      if (exportReceiptRef !== undefined) references.push(exportReceiptRef);
      const snapshots = await transaction.getAll(...references);
      const [recordSnapshot, logSnapshot, exportSnapshot] = snapshots;
      if (!recordSnapshot!.exists) throw new NotFoundException();
      const record = recordSnapshot!.data() as StoredTermination;
      if (
        record.terminationId !== command.terminationId ||
        record.scope !== command.scope
      ) {
        throw new ConflictError();
      }
      const previous = replay<BusinessTerminationResponse>(
        logSnapshot!,
        actionHash
      );
      if (previous.found) return { ...previous.result, replayed: true };

      if (request.receiptKind !== 'data_return') {
        if (
          record.state !== 'controlled_retention' ||
          record.returnCompletedAt === null
        ) {
          throw new ConflictError();
        }
        const existingReceipt = record.receipts.find(
          (receipt) => receipt.receiptKind === request.receiptKind
        );
        if (existingReceipt !== undefined) {
          if (existingReceipt.evidenceRef !== request.evidenceRef)
            throw new ConflictError();
          const response = view(record, command.now, true);
          writeOperationLog(transaction, logRef, {
            terminationId: command.terminationId,
            action: 'acknowledged',
            actorRef: command.actorRef,
            at: command.now,
            idempotencyKeyHash: sha256(request.idempotencyKey),
            version: response.version,
            requestHash: actionHash,
            result: response
          });
          return response;
        }
        const receipt: StoredTerminationReceipt = {
          receiptKind: request.receiptKind,
          evidenceRef: request.evidenceRef,
          actorRef: command.actorRef,
          acknowledgedAt: command.now
        };
        const updated: StoredTermination = {
          ...record,
          receipts: [...record.receipts, receipt],
          version: record.version + 1,
          updatedAt: command.now
        };
        const response = view(updated, command.now);
        transaction.update(recordRef, {
          receipts: updated.receipts,
          version: updated.version,
          updatedAt: updated.updatedAt
        });
        writeOperationLog(transaction, logRef, {
          terminationId: command.terminationId,
          action: 'acknowledged',
          actorRef: command.actorRef,
          at: command.now,
          idempotencyKeyHash: sha256(request.idempotencyKey),
          version: response.version,
          requestHash: actionHash,
          result: response
        });
        return response;
      }

      const exportData = exportSnapshot?.data() as StoredExportJob | undefined;
      if (
        !exportSnapshot?.exists ||
        exportData === undefined ||
        exportData.schemaVersion !== 1 ||
        exportData.exportId !== request.exportId ||
        exportData.format !== 'csv' ||
        !/^[a-f0-9]{64}$/.test(exportData.sha256) ||
        !Number.isInteger(exportData.downloadCount) ||
        exportData.downloadCount < 1 ||
        exportData.revokedAt !== null ||
        typeof exportData.purgeAt?.toMillis !== 'function' ||
        Date.parse(command.now) >= exportData.purgeAt.toMillis()
      ) {
        throw new ConflictError();
      }

      const existingReceipt = record.receipts.find(
        (receipt) => receipt.receiptKind === 'data_return'
      );
      if (existingReceipt !== undefined) {
        if (
          existingReceipt.exportId !== request.exportId ||
          existingReceipt.sha256 !== exportData.sha256
        ) {
          throw new ConflictError();
        }
        const response = view(record, command.now, true);
        writeOperationLog(transaction, logRef, {
          terminationId: command.terminationId,
          action: 'acknowledged',
          actorRef: command.actorRef,
          at: command.now,
          idempotencyKeyHash: sha256(request.idempotencyKey),
          version: response.version,
          requestHash: actionHash,
          result: response
        });
        return response;
      }

      const exportReceiptSnapshot = snapshots[3];
      if (exportReceiptSnapshot?.exists) throw new ConflictError();

      const recipientConfirmationReference = `receipt_${sha256(`${command.terminationId}:${request.idempotencyKey}`).slice(0, 40)}`;
      const common = {
        record,
        requestId,
        now: command.now,
        scope: command.scope,
        actorRef: command.actorRef,
        policy: command.policy,
        returnManifestReference: request.exportId,
        recipientConfirmationReference,
        returnCompletedAt: command.now
      } as const;
      const returned = terminationPlan({
        ...common,
        operation: 'record_return'
      });
      const beforeRetention: StoredTermination = {
        ...record,
        state: returned.resultingState,
        returnManifestReference: returned.returnManifestReference,
        recipientConfirmationReference: returned.recipientConfirmationReference,
        returnCompletedAt: returned.returnCompletedAt
      };
      const retention = terminationPlan({
        ...common,
        record: beforeRetention,
        operation: 'start_controlled_retention'
      });
      const receipt: StoredTerminationReceipt = {
        receiptKind: 'data_return',
        exportId: request.exportId,
        actorRef: command.actorRef,
        acknowledgedAt: command.now,
        sha256: exportData.sha256
      };
      const updated: StoredTermination = {
        ...beforeRetention,
        state: retention.resultingState,
        controlledRetentionUntil: retention.controlledRetentionUntil,
        receipts: [...record.receipts, receipt],
        version: record.version + 1,
        updatedAt: command.now
      };
      const response = view(updated, command.now);
      transaction.update(recordRef, {
        state: updated.state,
        returnManifestReference: updated.returnManifestReference,
        recipientConfirmationReference: updated.recipientConfirmationReference,
        returnCompletedAt: updated.returnCompletedAt,
        controlledRetentionUntil: updated.controlledRetentionUntil,
        receipts: updated.receipts,
        version: updated.version,
        updatedAt: updated.updatedAt
      });
      transaction.create(exportReceiptRef!, {
        schemaVersion: 1,
        exportId: request.exportId,
        terminationId: command.terminationId,
        actorRef: command.actorRef,
        acknowledgedAt: command.now,
        sha256: exportData.sha256
      });
      writeOperationLog(transaction, logRef, {
        terminationId: command.terminationId,
        action: 'acknowledged',
        actorRef: command.actorRef,
        at: command.now,
        idempotencyKeyHash: sha256(request.idempotencyKey),
        version: response.version,
        requestHash: actionHash,
        result: response
      });
      return response;
    });
  }

  public async close(
    command: CloseTerminationCommand
  ): Promise<BusinessTerminationResponse> {
    assertPolicyScope(command.policy, command.scope);
    if (!TERMINATION_ID.test(command.terminationId))
      throw new NotFoundException();
    const recordRef = this.db
      .collection(TERMINATION_COLLECTIONS.records)
      .doc(command.terminationId);
    const logRef = this.db
      .collection(TERMINATION_COLLECTIONS.log)
      .doc(
        operationLogId('close', command.terminationId, command.idempotencyKey)
      );
    const hash = requestHash(['close', command.expectedVersion]);

    return this.db.runTransaction(async (transaction) => {
      const [recordSnapshot, logSnapshot] = await transaction.getAll(
        recordRef,
        logRef
      );
      if (!recordSnapshot!.exists) throw new NotFoundException();
      const record = recordSnapshot!.data() as StoredTermination;
      if (
        record.terminationId !== command.terminationId ||
        record.scope !== command.scope
      ) {
        throw new ConflictError();
      }
      const previous = replay<BusinessTerminationResponse>(logSnapshot!, hash);
      if (previous.found) return { ...previous.result, replayed: true };
      if (record.version !== command.expectedVersion) {
        throw new ConflictError();
      }
      const missingSteps = closeMissingSteps(record, command.now);
      if (missingSteps.length > 0) throw new ConflictError(missingSteps);

      const requestId = operationRequestId(
        'close',
        command.terminationId,
        command.idempotencyKey
      );
      const planned = terminationPlan({
        operation: 'request_manual_close_review',
        record,
        requestId,
        now: command.now,
        scope: command.scope,
        actorRef: command.actorRef,
        policy: command.policy,
        backupDispositionConfirmed: record.receipts.some(
          (receipt) => receipt.receiptKind === 'backup_disposition'
        ),
        auditDispositionConfirmed: record.receipts.some(
          (receipt) => receipt.receiptKind === 'audit_disposition'
        )
      });
      if (planned.idempotency === 'already_applied') {
        const response = view(record, command.now, true);
        writeOperationLog(transaction, logRef, {
          terminationId: command.terminationId,
          action: 'close_review_requested',
          actorRef: command.actorRef,
          at: command.now,
          idempotencyKeyHash: sha256(command.idempotencyKey),
          version: response.version,
          requestHash: hash,
          result: response
        });
        return response;
      }
      const updated: StoredTermination = {
        ...record,
        state: planned.resultingState,
        version: record.version + 1,
        updatedAt: command.now,
        closeReviewRequestedAt: command.now
      };
      const response = view(updated, command.now);
      transaction.update(recordRef, {
        state: updated.state,
        version: updated.version,
        updatedAt: updated.updatedAt,
        closeReviewRequestedAt: updated.closeReviewRequestedAt
      });
      writeOperationLog(transaction, logRef, {
        terminationId: command.terminationId,
        action: 'close_review_requested',
        actorRef: command.actorRef,
        at: command.now,
        idempotencyKeyHash: sha256(command.idempotencyKey),
        version: response.version,
        requestHash: hash,
        result: response
      });
      return response;
    });
  }
}
