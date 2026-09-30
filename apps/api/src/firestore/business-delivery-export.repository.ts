import { createHash } from 'node:crypto';

import {
  DomainError,
  renderBusinessExportCsvFile,
  toBusinessExportRow,
  type ApprovedBusinessDeliveryPolicy
} from '@beauessence/domain';
import type { BusinessExportJob } from '@beauessence/contracts';
import {
  Timestamp,
  type Firestore,
  type Transaction
} from 'firebase-admin/firestore';

import { ConflictError } from '../platform/errors/api-error.js';
import { COLLECTIONS } from './booking.repository.js';
import { PATIENT_COLLECTIONS } from '../patients/patient-directory.js';

export const EXPORT_COLLECTIONS = {
  jobs: 'bd_export_jobs',
  chunks: 'bd_export_chunks',
  log: 'bd_export_log'
} as const;

/**
 * Characters per chunk. Firestore caps a document at 1 MiB; Traditional
 * Chinese is three UTF-8 bytes per character, so 200 000 characters stays
 * under 600 KB. The chunk count cap keeps one export inside one transaction.
 */
const CHUNK_CHARACTERS = 200_000;
const MAX_CHUNKS = 20;
const HOUR_MS = 3_600_000;

interface StoredExportJob {
  readonly schemaVersion: 1;
  readonly exportId: string;
  readonly format: 'csv';
  readonly from: string;
  readonly to: string;
  readonly rowCount: number;
  readonly byteLength: number;
  readonly sha256: string;
  readonly chunkCount: number;
  readonly createdAt: string;
  readonly createdByRef: string;
  readonly downloadExpiresAt: string;
  readonly maxDownloads: number;
  readonly downloadCount: number;
  readonly purgeAt: Timestamp;
  readonly revokedAt: string | null;
  readonly idempotencyKey: string;
  readonly requestHash: string;
  readonly revokeIdempotencyKey?: string;
  readonly policyVersion: string;
}

export interface CreateExportCommand {
  readonly idempotencyKey: string;
  readonly from: string;
  readonly to: string;
  readonly startAt: string;
  readonly endAt: string;
  /** sha256 of the server-verified staff UID. */
  readonly actorRef: string;
  readonly now: string;
  readonly policy: ApprovedBusinessDeliveryPolicy;
}

export interface ExportDownload {
  readonly job: BusinessExportJob;
  readonly content: string;
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function exportIdFor(idempotencyKey: string): string {
  return `exp_${sha256(`bd-export:${idempotencyKey}`).slice(0, 40)}`;
}

function chunkIds(exportId: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => `${exportId}_${index}`);
}

function stringField(
  data: Record<string, unknown> | undefined,
  key: string
): string | undefined {
  const value = data?.[key];
  return typeof value === 'string' ? value : undefined;
}

export function exportStatus(
  job: StoredExportJob,
  now: string
): BusinessExportJob['status'] {
  const nowMs = Date.parse(now);
  if (job.revokedAt !== null) return 'revoked';
  if (nowMs >= job.purgeAt.toMillis()) return 'purged';
  if (nowMs >= Date.parse(job.downloadExpiresAt)) return 'expired';
  if (job.downloadCount >= job.maxDownloads) return 'exhausted';
  return 'ready';
}

function view(
  job: StoredExportJob,
  now: string,
  replayed?: boolean
): BusinessExportJob {
  return {
    exportId: job.exportId,
    status: exportStatus(job, now),
    format: job.format,
    from: job.from,
    to: job.to,
    rowCount: job.rowCount,
    byteLength: job.byteLength,
    sha256: job.sha256,
    createdAt: job.createdAt,
    downloadExpiresAt: job.downloadExpiresAt,
    downloadsRemaining: Math.max(0, job.maxDownloads - job.downloadCount),
    purgeAt: job.purgeAt.toDate().toISOString(),
    ...(replayed === undefined ? {} : { replayed })
  };
}

/**
 * CP-04 export store (OWNER-BATCH-2026-09-29B item 2). The file is generated
 * and stored in one transaction, so a failed export leaves nothing behind.
 * Chunks carry `purgeAt` for the Firestore TTL policy and are also refused
 * after it, because TTL deletion is not instantaneous. The log holds no
 * patient value, only who did what to which export and when.
 */
export class FirestoreBusinessExportRepository {
  public constructor(private readonly db: Firestore) {}

  public async create(
    command: CreateExportCommand
  ): Promise<BusinessExportJob> {
    const exportId = exportIdFor(command.idempotencyKey);
    const requestHash = sha256(
      JSON.stringify(['csv', command.from, command.to])
    );
    const jobRef = this.db.collection(EXPORT_COLLECTIONS.jobs).doc(exportId);
    const appointmentsQuery = this.db
      .collection(COLLECTIONS.appointments)
      .where('startsAt', '>=', command.startAt)
      .where('startsAt', '<', command.endAt)
      .orderBy('startsAt');

    return this.db.runTransaction(async (transaction) => {
      const existing = await transaction.get(jobRef);
      if (existing.exists) {
        const stored = existing.data() as StoredExportJob;
        if (stored.requestHash !== requestHash) throw new ConflictError();
        return view(stored, command.now, true);
      }

      const appointments = await transaction.get(appointmentsQuery);
      const exportableAppointments = appointments.docs.filter(
        (document) => document.data()['patientArchived'] !== true
      );
      const patientIds = [
        ...new Set(
          exportableAppointments
            .map((document) => stringField(document.data(), 'patientId'))
            .filter((id): id is string => id !== undefined && id !== '')
        )
      ];
      const patients =
        patientIds.length === 0
          ? []
          : await transaction.getAll(
              ...patientIds.map((id) =>
                this.db.collection(PATIENT_COLLECTIONS.patients).doc(id)
              )
            );
      const patientById = new Map(
        patients.map((snapshot) => [snapshot.id, snapshot.data()])
      );

      const rows = exportableAppointments.map((document) => {
        const data = document.data();
        const patient = patientById.get(stringField(data, 'patientId') ?? '');
        const name = stringField(patient, 'name');
        const phoneDigits = stringField(patient, 'phoneDigits');
        const birthMonthDay = stringField(patient, 'birthMonthDay');
        const nationality = stringField(data, 'intakeNationality');
        const startsAt = stringField(data, 'startsAt');
        const bookingKind = stringField(data, 'bookingKind');
        const itemId = stringField(data, 'itemId');
        const status = stringField(data, 'status');
        const patientNote = stringField(data, 'patientNote');
        return toBusinessExportRow({
          ...(name === undefined ? {} : { name }),
          ...(phoneDigits === undefined ? {} : { phoneDigits }),
          ...(birthMonthDay === undefined ? {} : { birthMonthDay }),
          ...(nationality === undefined ? {} : { nationality }),
          ...(startsAt === undefined ? {} : { startsAt }),
          ...(bookingKind === undefined ? {} : { bookingKind }),
          ...(itemId === undefined ? {} : { itemId }),
          ...(status === undefined ? {} : { status }),
          ...(patientNote === undefined ? {} : { patientNote })
        });
      });

      const csv = renderBusinessExportCsvFile({ rows });
      const chunkCount = Math.max(1, Math.ceil(csv.length / CHUNK_CHARACTERS));
      if (chunkCount > MAX_CHUNKS) {
        throw new DomainError(
          'INVALID_VALUE',
          'the export is too large; choose a shorter date range.'
        );
      }

      const nowMs = Date.parse(command.now);
      const purgeAt = Timestamp.fromMillis(
        nowMs + command.policy.export.fileRetentionDays * 24 * HOUR_MS
      );
      const job: StoredExportJob = {
        schemaVersion: 1,
        exportId,
        format: 'csv',
        from: command.from,
        to: command.to,
        rowCount: rows.length,
        byteLength: Buffer.byteLength(csv, 'utf8'),
        sha256: sha256(csv),
        chunkCount,
        createdAt: command.now,
        createdByRef: command.actorRef,
        downloadExpiresAt: new Date(
          nowMs + command.policy.export.downloadWindowHours * HOUR_MS
        ).toISOString(),
        maxDownloads: command.policy.export.maxDownloads,
        downloadCount: 0,
        purgeAt,
        revokedAt: null,
        idempotencyKey: command.idempotencyKey,
        requestHash,
        policyVersion: command.policy.version
      };

      transaction.create(jobRef, job);
      chunkIds(exportId, chunkCount).forEach((chunkId, index) => {
        transaction.create(
          this.db.collection(EXPORT_COLLECTIONS.chunks).doc(chunkId),
          {
            exportId,
            index,
            content: csv.slice(
              index * CHUNK_CHARACTERS,
              (index + 1) * CHUNK_CHARACTERS
            ),
            purgeAt
          }
        );
      });
      this.appendLog(
        transaction,
        exportId,
        'created',
        command.actorRef,
        command.now
      );
      return view(job, command.now, false);
    });
  }

  public async get(
    exportId: string,
    now: string
  ): Promise<BusinessExportJob | undefined> {
    const snapshot = await this.db
      .collection(EXPORT_COLLECTIONS.jobs)
      .doc(exportId)
      .get();
    return snapshot.exists
      ? view(snapshot.data() as StoredExportJob, now)
      : undefined;
  }

  /**
   * Reads every chunk and spends one download in the same transaction, so a
   * failed read never consumes an attempt and two parallel downloads cannot
   * both take the last one. The assembled file must match the stored hash.
   */
  public async download(
    exportId: string,
    actorRef: string,
    now: string
  ): Promise<ExportDownload | undefined> {
    const jobRef = this.db.collection(EXPORT_COLLECTIONS.jobs).doc(exportId);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(jobRef);
      if (!snapshot.exists) return undefined;
      const job = snapshot.data() as StoredExportJob;
      if (exportStatus(job, now) !== 'ready') throw new ConflictError();
      const chunks = await transaction.getAll(
        ...chunkIds(exportId, job.chunkCount).map((id) =>
          this.db.collection(EXPORT_COLLECTIONS.chunks).doc(id)
        )
      );
      if (chunks.some((chunk) => !chunk.exists)) throw new ConflictError();
      const content = chunks
        .map((chunk) => String(chunk.data()?.['content'] ?? ''))
        .join('');
      if (sha256(content) !== job.sha256) {
        throw new Error('Export content does not match its recorded hash.');
      }
      const next = { ...job, downloadCount: job.downloadCount + 1 };
      transaction.update(jobRef, { downloadCount: next.downloadCount });
      this.appendLog(transaction, exportId, 'downloaded', actorRef, now);
      return { job: view(next, now), content };
    });
  }

  /** Stops further downloads and deletes the stored file immediately. */
  public async revoke(
    exportId: string,
    idempotencyKey: string,
    actorRef: string,
    now: string
  ): Promise<BusinessExportJob | undefined> {
    const jobRef = this.db.collection(EXPORT_COLLECTIONS.jobs).doc(exportId);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(jobRef);
      if (!snapshot.exists) return undefined;
      const job = snapshot.data() as StoredExportJob;
      if (job.revokedAt !== null) {
        if (job.revokeIdempotencyKey !== idempotencyKey)
          throw new ConflictError();
        return view(job, now, true);
      }
      const next: StoredExportJob = {
        ...job,
        revokedAt: now,
        revokeIdempotencyKey: idempotencyKey
      };
      transaction.update(jobRef, {
        revokedAt: now,
        revokeIdempotencyKey: idempotencyKey
      });
      for (const chunkId of chunkIds(exportId, job.chunkCount)) {
        transaction.delete(
          this.db.collection(EXPORT_COLLECTIONS.chunks).doc(chunkId)
        );
      }
      this.appendLog(transaction, exportId, 'revoked', actorRef, now);
      return view(next, now, false);
    });
  }

  private appendLog(
    transaction: Transaction,
    exportId: string,
    action: 'created' | 'downloaded' | 'revoked',
    actorRef: string,
    at: string
  ): void {
    transaction.create(this.db.collection(EXPORT_COLLECTIONS.log).doc(), {
      schemaVersion: 1,
      exportId,
      action,
      actorRef,
      at
    });
  }
}
