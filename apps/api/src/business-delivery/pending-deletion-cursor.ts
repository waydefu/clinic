import { DomainError, isUtcIsoTimestamp } from '@beauessence/domain';

import type { PendingDeletionPosition } from '../firestore/business-delivery-retention.repository.js';

const OPAQUE_ID = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Response header carrying the cursor of the next page of the pending-deletion
 * list, present only when more records follow. The body stays `{ patients }`.
 */
export const PENDING_DELETION_NEXT_CURSOR_HEADER = 'x-next-cursor';

/**
 * Continuation token for the pending-deletion list: the
 * `(restorableUntil, patientId)` of the last record a page returned. It is only
 * a position. The list's own condition (archived and past `restorableUntil`)
 * and the manager-only access check run on every page, so a forged cursor can
 * move the start point but never widen what is listed.
 */
export function encodePendingDeletionCursor(
  position: PendingDeletionPosition
): string {
  return Buffer.from(
    JSON.stringify([position.restorableUntil, position.patientId])
  ).toString('base64url');
}

export function decodePendingDeletionCursor(
  cursor: string
): PendingDeletionPosition {
  try {
    const decoded: unknown = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8')
    );
    if (Array.isArray(decoded) && decoded.length === 2) {
      const [restorableUntil, patientId] = decoded as unknown[];
      if (
        typeof restorableUntil === 'string' &&
        isUtcIsoTimestamp(restorableUntil) &&
        typeof patientId === 'string' &&
        OPAQUE_ID.test(patientId)
      ) {
        const position = { restorableUntil, patientId };
        // One spelling per position: refuses padded or re-encoded variants.
        if (encodePendingDeletionCursor(position) === cursor) return position;
      }
    }
  } catch {
    // Not JSON: falls through to the same refusal as any other bad cursor.
  }
  throw new DomainError('INVALID_VALUE', 'The list cursor is not valid.');
}
