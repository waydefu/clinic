import { DomainError, isUtcIsoTimestamp } from '@beauessence/domain';

import type { AppointmentListPosition } from '../patients/patient-directory.js';

const OPAQUE_ID = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Response header carrying the cursor of the next page, present only when rows
 * remain. The body stays `{ appointments }`. Same-origin callers can read it;
 * a cross-origin caller would need it exposed first.
 */
export const LIST_NEXT_CURSOR_HEADER = 'x-next-cursor';

/**
 * Continuation token for the appointment list: the `(startsAt, appointmentId)`
 * of the last row a page returned. It is only a position. The scope filter and
 * the time window are applied on every page whatever the cursor says, so a
 * forged or borrowed cursor can move the start point but never widen what the
 * caller may read.
 */
export function encodeListCursor(position: AppointmentListPosition): string {
  return Buffer.from(
    JSON.stringify([position.startsAt, position.appointmentId])
  ).toString('base64url');
}

export function decodeListCursor(cursor: string): AppointmentListPosition {
  try {
    const decoded: unknown = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8')
    );
    if (Array.isArray(decoded) && decoded.length === 2) {
      const [startsAt, appointmentId] = decoded as unknown[];
      if (
        typeof startsAt === 'string' &&
        isUtcIsoTimestamp(startsAt) &&
        typeof appointmentId === 'string' &&
        OPAQUE_ID.test(appointmentId)
      ) {
        const position = { startsAt, appointmentId };
        // One spelling per position: refuses padded or re-encoded variants.
        if (encodeListCursor(position) === cursor) return position;
      }
    }
  } catch {
    // Not JSON: falls through to the same refusal as any other bad cursor.
  }
  throw new DomainError('INVALID_VALUE', 'The list cursor is not valid.');
}
