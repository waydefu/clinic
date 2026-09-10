/**
 * Google Calendar watch-channel lifecycle helpers.
 *
 * Unwired by policy. Calendar-pilot runtime still uses the five-minute
 * Scheduler only. Do not import this module from calendar-pilot-runtime.ts
 * until an exact-SHA C6 (or later) authority names this path. Product
 * direction is CAL-SYNC-DIR-2026-09-11; production D-009/D-016 remain
 * pending.
 *
 * Official constraints (Google Calendar Push, 2026-08-27):
 * - notifications have no event body;
 * - channels are not auto-renewed;
 * - overlap between old and new channels is expected;
 * - delivery is not 100% reliable, so a 1–5 minute compensating poll remains.
 */
export const COMPENSATION_SYNC_MIN_MS = 60_000;
export const COMPENSATION_SYNC_MAX_MS = 5 * 60_000;
export const DEFAULT_RENEWAL_LEAD_MS = 24 * 60 * 60 * 1000;

export type InboundReviewReason =
  | 'unmatched'
  | 'simultaneous_edit'
  | 'slot_conflict'
  | 'ambiguous_delete'
  | 'incomplete'
  | 'illegal_schema'
  | 'authorization_failed';

export interface WatchChannelRecord {
  readonly channelId: string;
  readonly resourceId: string;
  readonly calendarId: string;
  readonly expirationMs: number;
  readonly token: string;
}

export function isCompensatingIntervalMs(intervalMs: number): boolean {
  return (
    Number.isInteger(intervalMs) &&
    intervalMs >= COMPENSATION_SYNC_MIN_MS &&
    intervalMs <= COMPENSATION_SYNC_MAX_MS
  );
}

export function shouldRenewWatchChannel(
  channel: WatchChannelRecord,
  nowMs: number,
  leadMs = DEFAULT_RENEWAL_LEAD_MS
): boolean {
  return nowMs + leadMs >= channel.expirationMs;
}

export function eventDedupeKey(
  calendarId: string,
  googleEventId: string,
  etag: string
): string {
  return `${calendarId}\u001f${googleEventId}\u001f${etag}`;
}

export function notificationDedupeKey(
  channelId: string,
  messageNumber: string
): string {
  return `${channelId}\u001f${messageNumber}`;
}

export function nextWatchChannelId(previousChannelId: string): string {
  if (previousChannelId.trim() === '') {
    throw new Error('Previous watch channel id must be a non-empty string.');
  }
  return `${previousChannelId}:next`;
}

/**
 * Replacement must use a new channel id. The previous channel stays
 * receivable until stop() so overlap notifications can be deduped.
 */
export function planWatchChannelReplacement(
  current: WatchChannelRecord,
  nextChannelId: string,
  nowMs: number,
  leadMs = DEFAULT_RENEWAL_LEAD_MS
): {
  readonly renew: boolean;
  readonly stopAfterOverlap: boolean;
  readonly nextChannelId: string;
} {
  const renew = shouldRenewWatchChannel(current, nowMs, leadMs);
  if (!renew) {
    return { renew: false, stopAfterOverlap: false, nextChannelId };
  }
  if (nextChannelId === current.channelId) {
    throw new Error(
      'Replacement watch channel id must differ from the current id.'
    );
  }
  return { renew: true, stopAfterOverlap: true, nextChannelId };
}

export function inboundRequiresHumanReview(
  reason: InboundReviewReason | 'unique_match_only'
): boolean {
  return reason !== 'unique_match_only';
}
