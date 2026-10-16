import {
  FieldPath,
  type DocumentSnapshot,
  type Firestore
} from 'firebase-admin/firestore';

import { assertUtcTimestamp } from '@beauessence/domain';

export const ACTIVATION_PAGE_SIZE = 20;
export const ACTIVATION_COPY_PAGES = 'activation_copy_pages';

interface CopyCursor {
  readonly startsAt: string;
  readonly localRecordId: string;
}
export interface CalendarActivationProgress {
  readonly version: 1;
  readonly phase: 'copy' | 'cleanup';
  readonly sourceId: string;
  readonly previousSourceId: string;
  readonly generation: number;
  readonly sourceBinding: string;
  readonly previousSourceBinding: string;
  readonly cutoffAt: string;
  readonly copyAfter: CopyCursor | null;
  readonly receiptCount: number;
  readonly pendingCopyIds: readonly string[];
  readonly cleanupPage: number;
  readonly cleanupOffset: number;
}
export interface CalendarActivationCopyReceipt {
  readonly version: 1;
  readonly sourceId: string;
  readonly previousSourceId: string;
  readonly generation: number;
  readonly sourceBinding: string;
  readonly previousSourceBinding: string;
  readonly pageIndex: number;
  readonly recordIds: readonly string[];
}
export type CalendarActivationReceiptChange =
  | { readonly kind: 'create'; readonly value: CalendarActivationCopyReceipt }
  | { readonly kind: 'delete'; readonly pageIndex: number };
export interface CalendarActivationCheckpoint {
  readonly expected: CalendarActivationProgress | undefined;
  readonly next: CalendarActivationProgress;
  readonly receipt?: CalendarActivationReceiptChange;
  readonly release: boolean;
}

function invalid(): never {
  throw new Error('CAL-PILOT activation progress or copy receipt is invalid.');
}
function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return invalid();
  return value as Record<string, unknown>;
}
function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    return invalid();
  return value;
}
function documentId(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 1500 ||
    value.trim() === '' ||
    !value.isWellFormed() ||
    value.includes('/') ||
    value === '.' ||
    value === '..' ||
    Buffer.byteLength(value, 'utf8') > 1500
  )
    return invalid();
  return value;
}
function binding(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
    return invalid();
  return value;
}
function timestamp(value: unknown): string {
  if (typeof value !== 'string') return invalid();
  assertUtcTimestamp(value, 'activation timestamp');
  return value;
}
function ids(value: unknown, minimum: number, maximum: number): string[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum)
    return invalid();
  return value.map(documentId);
}

export function parseCalendarActivationProgress(
  value: unknown
): CalendarActivationProgress | undefined {
  if (value === undefined) return undefined; // Existing jobs need no migration.
  const data = record(value);
  if (
    data['version'] !== 1 ||
    (data['phase'] !== 'copy' && data['phase'] !== 'cleanup')
  )
    return invalid();
  const cursor = data['copyAfter'] === null ? null : record(data['copyAfter']);
  const progress: CalendarActivationProgress = {
    version: 1,
    phase: data['phase'],
    sourceId: documentId(data['sourceId']),
    previousSourceId: documentId(data['previousSourceId']),
    generation: integer(data['generation']),
    sourceBinding: binding(data['sourceBinding']),
    previousSourceBinding: binding(data['previousSourceBinding']),
    cutoffAt: timestamp(data['cutoffAt']),
    copyAfter:
      cursor === null
        ? null
        : {
            startsAt: timestamp(cursor['startsAt']),
            localRecordId: documentId(cursor['localRecordId'])
          },
    receiptCount: integer(data['receiptCount']),
    pendingCopyIds: ids(data['pendingCopyIds'], 0, ACTIVATION_PAGE_SIZE - 1),
    cleanupPage: integer(data['cleanupPage']),
    cleanupOffset: integer(data['cleanupOffset'])
  };
  const copiedAny =
    progress.receiptCount > 0 || progress.pendingCopyIds.length > 0;
  if (
    progress.sourceId === progress.previousSourceId ||
    progress.sourceBinding === progress.previousSourceBinding ||
    copiedAny !== (progress.copyAfter !== null) ||
    progress.cleanupPage > progress.receiptCount ||
    progress.cleanupOffset > ACTIVATION_PAGE_SIZE ||
    (progress.cleanupPage === progress.receiptCount &&
      progress.cleanupOffset !== 0) ||
    (progress.phase === 'copy' &&
      (progress.cleanupPage !== 0 || progress.cleanupOffset !== 0)) ||
    (progress.phase === 'cleanup' && progress.pendingCopyIds.length !== 0) ||
    (progress.copyAfter !== null &&
      progress.copyAfter.startsAt < progress.cutoffAt) ||
    (progress.pendingCopyIds.length > 0 &&
      progress.pendingCopyIds.at(-1) !== progress.copyAfter?.localRecordId)
  )
    return invalid();
  return progress;
}

export function parseCalendarActivationReceipt(
  value: unknown
): CalendarActivationCopyReceipt {
  const data = record(value);
  if (data['version'] !== 1) return invalid();
  return {
    version: 1,
    sourceId: documentId(data['sourceId']),
    previousSourceId: documentId(data['previousSourceId']),
    generation: integer(data['generation']),
    sourceBinding: binding(data['sourceBinding']),
    previousSourceBinding: binding(data['previousSourceBinding']),
    pageIndex: integer(data['pageIndex']),
    recordIds: ids(data['recordIds'], 1, ACTIVATION_PAGE_SIZE)
  };
}

export function activationCopyPageId(index: number): string {
  return String(integer(index)).padStart(16, '0');
}
export function assertSameCalendarActivationProgress(
  expected: CalendarActivationProgress | undefined,
  current: unknown
): void {
  // Parse both into the same field order; Firestore maps need not retain the
  // insertion order used by the local object. Unknown fields confer no authority.
  if (
    JSON.stringify(parseCalendarActivationProgress(expected)) !==
    JSON.stringify(parseCalendarActivationProgress(current))
  )
    throw new Error('CAL-PILOT activation progress changed.');
}

interface ActivationStep {
  readonly db: Firestore;
  readonly document: DocumentSnapshot;
  readonly sourceId: string;
  readonly previousSourceId: string;
  readonly generation: number;
  readonly sourceBinding: string;
  readonly previousSourceBinding: string;
  readonly now: () => string;
  readonly progress: unknown;
  readonly copy: (
    localRecordId: string,
    data: Record<string, unknown>
  ) => Promise<void>;
  readonly removeOld: (localRecordId: string) => Promise<void>;
  /** Must compare expected progress and stage writes inside the live job fence. */
  readonly checkpoint: (change: CalendarActivationCheckpoint) => Promise<void>;
}

function receipt(
  progress: CalendarActivationProgress,
  recordIds: readonly string[]
): CalendarActivationCopyReceipt {
  return {
    version: 1,
    sourceId: progress.sourceId,
    previousSourceId: progress.previousSourceId,
    generation: progress.generation,
    sourceBinding: progress.sourceBinding,
    previousSourceBinding: progress.previousSourceBinding,
    pageIndex: progress.receiptCount,
    recordIds
  };
}
function assertBinding(
  progress: CalendarActivationProgress,
  input: ActivationStep
): void {
  if (
    progress.sourceId !== input.sourceId ||
    progress.previousSourceId !== input.previousSourceId ||
    progress.generation !== input.generation ||
    progress.sourceBinding !== input.sourceBinding ||
    progress.previousSourceBinding !== input.previousSourceBinding
  )
    return invalid();
}

/**
 * One bounded step. New-copy ACKs/cursors precede every old-calendar removal.
 * No Calendar effect is performed by checkpoint transactions. A lost in-flight
 * ACK can be retried idempotently; already checkpointed prefixes are retained.
 * A mutable source collection is not an atomic historical snapshot.
 */
export async function runCalendarActivationStep(
  input: ActivationStep
): Promise<'completed' | 'in_progress'> {
  const loaded = parseCalendarActivationProgress(input.progress);
  if (loaded === undefined) {
    const initial: CalendarActivationProgress = {
      version: 1,
      phase: 'copy',
      sourceId: input.sourceId,
      previousSourceId: input.previousSourceId,
      generation: input.generation,
      sourceBinding: input.sourceBinding,
      previousSourceBinding: input.previousSourceBinding,
      cutoffAt: timestamp(input.now()),
      copyAfter: null,
      receiptCount: 0,
      pendingCopyIds: [],
      cleanupPage: 0,
      cleanupOffset: 0
    };
    // Validate initial identity and persist the cutoff before the first query.
    parseCalendarActivationProgress(initial);
    await input.checkpoint({
      expected: undefined,
      next: initial,
      release: true
    });
    return 'in_progress';
  }
  let current = loaded;
  assertBinding(current, input);
  if (current.phase === 'copy') {
    const query = input.db
      .collection('calendar_pilot_appointments')
      .where('status', '==', 'confirmed')
      .where('startsAt', '>=', current.cutoffAt)
      .orderBy('startsAt', 'asc')
      .orderBy(FieldPath.documentId(), 'asc')
      .limit(ACTIVATION_PAGE_SIZE);
    const page = await (
      current.copyAfter === null
        ? query
        : query.startAfter(
            current.copyAfter.startsAt,
            current.copyAfter.localRecordId
          )
    ).get();
    for (const document of page.docs) {
      const data: Record<string, unknown> = document.data();
      const startsAt = timestamp(data['startsAt']);
      const localRecordId = documentId(document.id);
      await input.copy(localRecordId, data);
      const pending = [...current.pendingCopyIds, localRecordId];
      const fullReceipt =
        pending.length === ACTIVATION_PAGE_SIZE
          ? receipt(current, pending)
          : undefined;
      const next: CalendarActivationProgress = {
        ...current,
        copyAfter: { startsAt, localRecordId },
        receiptCount:
          current.receiptCount + (fullReceipt === undefined ? 0 : 1),
        pendingCopyIds: fullReceipt === undefined ? pending : []
      };
      await input.checkpoint({
        expected: current,
        next,
        release: false,
        ...(fullReceipt === undefined
          ? {}
          : { receipt: { kind: 'create', value: fullReceipt } as const })
      });
      current = next;
    }
    if (page.size < ACTIVATION_PAGE_SIZE) {
      const finalReceipt =
        current.pendingCopyIds.length === 0
          ? undefined
          : receipt(current, current.pendingCopyIds);
      const next: CalendarActivationProgress = {
        ...current,
        phase: 'cleanup',
        receiptCount:
          current.receiptCount + (finalReceipt === undefined ? 0 : 1),
        pendingCopyIds: []
      };
      await input.checkpoint({
        expected: current,
        next,
        release: true,
        ...(finalReceipt === undefined
          ? {}
          : { receipt: { kind: 'create', value: finalReceipt } as const })
      });
    } else
      await input.checkpoint({
        expected: current,
        next: current,
        release: true
      });
    return 'in_progress';
  }
  if (current.cleanupPage === current.receiptCount) return 'completed';
  const document = await input.document.ref
    .collection(ACTIVATION_COPY_PAGES)
    .doc(activationCopyPageId(current.cleanupPage))
    .get();
  const acknowledged = parseCalendarActivationReceipt(document.data());
  if (
    acknowledged.sourceId !== input.sourceId ||
    acknowledged.previousSourceId !== input.previousSourceId ||
    acknowledged.generation !== input.generation ||
    acknowledged.sourceBinding !== input.sourceBinding ||
    acknowledged.previousSourceBinding !== input.previousSourceBinding ||
    acknowledged.pageIndex !== current.cleanupPage ||
    current.cleanupOffset > acknowledged.recordIds.length
  )
    return invalid();
  for (
    let index = current.cleanupOffset;
    index < acknowledged.recordIds.length;
    index += 1
  ) {
    await input.removeOld(acknowledged.recordIds[index]!);
    const next = { ...current, cleanupOffset: index + 1 };
    await input.checkpoint({ expected: current, next, release: false });
    current = next;
  }
  const next = {
    ...current,
    cleanupPage: current.cleanupPage + 1,
    cleanupOffset: 0
  };
  const completed = next.cleanupPage === next.receiptCount;
  await input.checkpoint({
    expected: current,
    next,
    receipt: { kind: 'delete', pageIndex: current.cleanupPage },
    release: !completed
  });
  return completed ? 'completed' : 'in_progress';
}
