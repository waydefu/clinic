import type { CalendarWriteEvent } from './google-sync-client.js';

export interface ReconcileEvent {
  readonly id: string;
  readonly etag: string;
  readonly linkId: string;
  readonly status: 'confirmed' | 'cancelled';
  readonly title?: string;
  readonly startsAt?: string;
  readonly endsAt?: string;
}

export interface ReconcileSnapshot {
  readonly linkId: string;
  readonly blockedByOwner: boolean;
  readonly inventoryComplete: boolean;
  readonly mirrorEventId?: string;
  readonly projectionEventId: string;
  readonly projectionOwned: boolean;
  readonly desired?: CalendarWriteEvent | undefined;
  readonly events: readonly ReconcileEvent[];
}

export type ReconcileAction =
  | { readonly kind: 'no-op' }
  | { readonly kind: 'conflict' }
  | { readonly kind: 'blocked' }
  | { readonly kind: 'insert'; readonly event: CalendarWriteEvent }
  | { readonly kind: 'patch'; readonly event: CalendarWriteEvent; readonly etag: string }
  | { readonly kind: 'delete'; readonly id: string; readonly etag: string };

function sameInstant(left: string | undefined, right: string): boolean {
  if (left === undefined || !/(?:Z|[+-]\d{2}:\d{2})$/u.test(left) || !/(?:Z|[+-]\d{2}:\d{2})$/u.test(right))
    return false;
  const instant = Date.parse(left);
  return Number.isFinite(instant) && instant === Date.parse(right);
}

function sameEvent(event: ReconcileEvent, desired: CalendarWriteEvent): boolean {
  return (
    event.status === 'confirmed' &&
    event.title === desired.title &&
    'startsAt' in desired &&
    sameInstant(event.startsAt, desired.startsAt) &&
    sameInstant(event.endsAt, desired.endsAt)
  );
}

export function planCalendarPilotReconciliation(snapshot: ReconcileSnapshot): ReconcileAction {
  if (snapshot.blockedByOwner) return { kind: 'blocked' };
  if (!snapshot.inventoryComplete) return { kind: 'conflict' };
  const canonicalId = snapshot.mirrorEventId ?? snapshot.projectionEventId;
  if (snapshot.mirrorEventId === undefined && !snapshot.projectionOwned)
    return { kind: 'conflict' };
  if (snapshot.desired !== undefined &&
      (snapshot.desired.eventId !== canonicalId || snapshot.desired.linkId !== snapshot.linkId))
    return { kind: 'conflict' };
  if (snapshot.desired !== undefined && !('startsAt' in snapshot.desired))
    return { kind: 'conflict' };
  const seen = new Set<string>();
  for (const event of snapshot.events) {
    if (event.linkId !== snapshot.linkId || seen.has(event.id) ||
        !/^"[\x21\x23-\x7e]*"$/u.test(event.etag) ||
        (event.id !== canonicalId &&
          (event.id !== snapshot.projectionEventId || !snapshot.projectionOwned)))
      return { kind: 'conflict' };
    seen.add(event.id);
  }
  const canonical = snapshot.events.find((event) => event.id === canonicalId);
  const duplicate = snapshot.events.find((event) => event.id !== canonicalId && event.status !== 'cancelled');
  if (snapshot.desired !== undefined) {
    if (canonical === undefined) {
      if (snapshot.mirrorEventId !== undefined) return { kind: 'conflict' };
      return { kind: 'insert', event: snapshot.desired };
    }
    if (!sameEvent(canonical, snapshot.desired))
      return { kind: 'patch', event: snapshot.desired, etag: canonical.etag };
  } else if (canonical !== undefined && canonical.status !== 'cancelled') {
    if (snapshot.mirrorEventId !== undefined || !snapshot.projectionOwned)
      return { kind: 'conflict' };
    return { kind: 'delete', id: canonical.id, etag: canonical.etag };
  }
  if (duplicate !== undefined)
    return { kind: 'delete', id: duplicate.id, etag: duplicate.etag };
  return { kind: 'no-op' };
}

export interface CalendarPilotReconciliationPort {
  scan(limit: number): Promise<readonly string[]>;
  read(linkId: string): Promise<ReconcileSnapshot>;
  apply(linkId: string, action: Extract<ReconcileAction, { kind: 'insert' | 'patch' | 'delete' }>): Promise<void>;
  settleIfUnchanged(snapshot: ReconcileSnapshot): Promise<boolean>;
  recordConflict(snapshot: ReconcileSnapshot): Promise<void>;
}

export async function runCalendarPilotReconciliation(
  port: CalendarPilotReconciliationPort,
  options: { readonly maxItems: number; readonly deadline: number; readonly now: () => number }
): Promise<{ processed: number; converged: number; conflicts: number; blocked: number }> {
  if (!Number.isSafeInteger(options.maxItems) || options.maxItems < 1 || !Number.isFinite(options.deadline))
    throw new Error('Invalid calendar reconciliation bounds.');
  const result = { processed: 0, converged: 0, conflicts: 0, blocked: 0 };
  let lastTime = Number.NEGATIVE_INFINITY;
  const expired = (): boolean => {
    const now = options.now();
    if (!Number.isFinite(now) || now < lastTime)
      throw new Error('Invalid calendar reconciliation clock.');
    lastTime = now;
    return now >= options.deadline;
  };
  if (expired()) return result;
  const ids = await port.scan(options.maxItems);
  if (ids.length > options.maxItems || new Set(ids).size !== ids.length)
    throw new Error('Invalid calendar reconciliation scan.');
  for (const linkId of ids) {
    if (expired()) break;
    const snapshot = await port.read(linkId);
    if (snapshot.linkId !== linkId) throw new Error('Calendar reconciliation link changed.');
    const action = planCalendarPilotReconciliation(snapshot);
    result.processed += 1;
    if (action.kind === 'blocked') {
      result.blocked += 1;
      continue;
    }
    if (action.kind === 'conflict') {
      if (expired()) break;
      await port.recordConflict(snapshot);
      result.conflicts += 1;
      continue;
    }
    if (action.kind !== 'no-op') {
      if (expired()) break;
      await port.apply(linkId, action);
      continue;
    }
    if (!expired() && await port.settleIfUnchanged(snapshot))
      result.converged += 1;
  }
  return result;
}
