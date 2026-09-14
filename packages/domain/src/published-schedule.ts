import {
  assertSlotMeetsEarliestLead,
  isSlotOccupied
} from './appointment-rules.js';
import {
  assertSlotNotInPast,
  assertSlotWithinBookingHorizon,
  bookingHorizonEndExclusive,
  taipeiCalendarDate
} from './booking-horizon.js';
import type { BookingKind, SlotSnapshot } from './booking-transaction.js';
import { DomainError } from './errors.js';
import {
  assertScheduleValid,
  planSlots,
  type Schedule,
  type SlotGenerationOptions
} from './schedule.js';

/** Inclusive days from Taipei today through the last bookable date. */
function bookingHorizonDayCount(taipeiToday: string): number {
  const startMs = Date.parse(`${taipeiToday}T00:00:00+08:00`);
  const endMs = Date.parse(
    `${bookingHorizonEndExclusive(taipeiToday)}T00:00:00+08:00`
  );
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    throw new DomainError('INVALID_VALUE', 'must be a real calendar date.');
  }
  return Math.round((endMs - startMs) / 86_400_000);
}

/** IP-001 internal-test window: Taipei today through the exclusive horizon. */
export function internalTestSlotGeneration(
  requestedAt: string
): SlotGenerationOptions {
  const startDate = taipeiCalendarDate(requestedAt);
  return { startDate, dayCount: bookingHorizonDayCount(startDate) };
}

/**
 * Persisted published grid. Version 0 means nothing has been published yet;
 * the schedule body is then absent rather than invented.
 */
export interface PublishedScheduleSnapshot {
  readonly publishedVersion: number;
  readonly publishedAt: string | null;
  readonly schedule: Schedule | null;
}

export const UNPUBLISHED_SCHEDULE: PublishedScheduleSnapshot = {
  publishedVersion: 0,
  publishedAt: null,
  schedule: null
};

function assertUtcIso(value: string, fieldName: string): void {
  if (!value.endsWith('Z') || Number.isNaN(Date.parse(value))) {
    throw new DomainError(
      'INVALID_TIMESTAMP',
      `${fieldName} must be a valid UTC ISO-8601 timestamp.`
    );
  }
}

export function parsePublishedScheduleSnapshot(
  data: unknown
): PublishedScheduleSnapshot {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new DomainError(
      'INVALID_VALUE',
      'The published schedule is unreadable.'
    );
  }
  const record = data as Record<string, unknown>;
  if (
    Object.prototype.hasOwnProperty.call(record, 'schemaVersion') &&
    record['schemaVersion'] !== 1
  ) {
    throw new DomainError(
      'INVALID_VALUE',
      'The published schedule is unreadable.'
    );
  }
  const publishedVersion = record['publishedVersion'];
  if (
    typeof publishedVersion !== 'number' ||
    !Number.isInteger(publishedVersion) ||
    publishedVersion < 0
  ) {
    throw new DomainError(
      'INVALID_VALUE',
      'The published schedule is unreadable.'
    );
  }
  if (publishedVersion === 0) {
    return UNPUBLISHED_SCHEDULE;
  }
  const publishedAt = record['publishedAt'];
  if (typeof publishedAt !== 'string') {
    throw new DomainError(
      'INVALID_VALUE',
      'The published schedule is unreadable.'
    );
  }
  assertUtcIso(publishedAt, 'publishedAt');
  assertScheduleValid(record['schedule'] as Schedule | undefined);
  return {
    publishedVersion,
    publishedAt,
    schedule: record['schedule'] as Schedule
  };
}

/**
 * Occupancy from an existing slot document overlays the published grid.
 * A fabricated id that is not on the grid is unavailable.
 */
export function resolvePublishedSlot(
  schedule: Schedule,
  slotId: string,
  existing: SlotSnapshot | undefined,
  requestedAt: string
): SlotSnapshot {
  const generated = planSlots(
    schedule,
    existing === undefined ? [] : [existing],
    internalTestSlotGeneration(requestedAt)
  );
  const onGrid = generated.find((slot) => slot.id === slotId);
  if (onGrid === undefined) {
    throw new DomainError(
      'SLOT_UNAVAILABLE',
      'The slot does not exist or is already reserved.'
    );
  }
  return onGrid;
}

/**
 * Internal-test bookable grid: horizon plus earliest-lead for free slots;
 * occupied slots stay visible so the workbench can show taken times.
 */
export function listPublishedGrid(
  schedule: Schedule,
  existingSlots: readonly SlotSnapshot[],
  requestedAt: string,
  kind?: BookingKind
): SlotSnapshot[] {
  return planSlots(
    schedule,
    existingSlots,
    internalTestSlotGeneration(requestedAt)
  ).filter((slot) => {
    if (kind !== undefined && slot.kind !== kind) return false;
    if (isSlotOccupied(slot.reservationId)) return true;
    try {
      assertSlotNotInPast(slot.startsAt, requestedAt);
      assertSlotMeetsEarliestLead(slot.startsAt, requestedAt);
      assertSlotWithinBookingHorizon(slot.startsAt, requestedAt);
      return true;
    } catch (error) {
      if (error instanceof DomainError && error.code === 'SLOT_UNAVAILABLE') {
        return false;
      }
      throw error;
    }
  });
}
