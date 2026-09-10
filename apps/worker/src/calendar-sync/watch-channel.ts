import { timingSafeEqual } from 'node:crypto';

import type { CalendarCandidateKind } from './sync-engine.js';

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

export type GooglePushResourceState = 'sync' | 'exists' | 'not_exists';

export interface CalendarPushNotification {
  readonly channelId: string;
  readonly resourceId: string;
  readonly resourceState: GooglePushResourceState;
  readonly messageNumber: string;
  readonly token: string;
}

export type InboundNotificationPlan =
  | { readonly action: 'ack_only'; readonly channelId: string }
  | {
      readonly action: 'incremental_sync';
      readonly channelId: string;
      readonly resourceId: string;
      readonly messageNumber: string;
      readonly compensationIntervalMs: number;
    }
  | {
      readonly action: 'reject';
      readonly httpStatus: 400 | 404;
      readonly reason: 'unrecognized_headers' | 'token_mismatch';
    };

function headerLine(
  headers: Record<string, unknown>,
  name: string
): string | undefined {
  const raw: unknown = headers[name] ?? headers[name.toLowerCase()];
  const candidate: unknown = Array.isArray(raw) ? raw[0] : raw;
  if (typeof candidate !== 'string') return undefined;
  const trimmed = candidate.trim();
  return trimmed === '' ? undefined : trimmed;
}

export function parseCalendarPushHeaders(
  headers: Record<string, unknown>
): CalendarPushNotification | undefined {
  const channelId = headerLine(headers, 'x-goog-channel-id');
  const resourceId = headerLine(headers, 'x-goog-resource-id');
  const resourceState = headerLine(headers, 'x-goog-resource-state');
  const messageNumber = headerLine(headers, 'x-goog-message-number');
  const token = headerLine(headers, 'x-goog-channel-token');
  if (
    channelId === undefined ||
    resourceId === undefined ||
    messageNumber === undefined ||
    token === undefined ||
    (resourceState !== 'sync' &&
      resourceState !== 'exists' &&
      resourceState !== 'not_exists')
  ) {
    return undefined;
  }
  return {
    channelId,
    resourceId,
    resourceState,
    messageNumber,
    token
  };
}

export function tokensMatch(expected: string, provided: string): boolean {
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function planInboundNotificationWork(input: {
  readonly headers: Record<string, unknown>;
  readonly expectedToken: string | undefined;
  readonly compensationIntervalMs?: number;
}): InboundNotificationPlan {
  const notification = parseCalendarPushHeaders(input.headers);
  if (notification === undefined) {
    return {
      action: 'reject',
      httpStatus: 400,
      reason: 'unrecognized_headers'
    };
  }
  if (
    input.expectedToken === undefined ||
    !tokensMatch(input.expectedToken, notification.token)
  ) {
    return { action: 'reject', httpStatus: 404, reason: 'token_mismatch' };
  }
  if (notification.resourceState === 'sync') {
    return { action: 'ack_only', channelId: notification.channelId };
  }
  const compensationIntervalMs =
    input.compensationIntervalMs ?? COMPENSATION_SYNC_MIN_MS;
  if (!isCompensatingIntervalMs(compensationIntervalMs)) {
    throw new Error('Compensation interval must be between 1 and 5 minutes.');
  }
  return {
    action: 'incremental_sync',
    channelId: notification.channelId,
    resourceId: notification.resourceId,
    messageNumber: notification.messageNumber,
    compensationIntervalMs
  };
}

export function reviewReasonForInboundCandidate(input: {
  readonly kind: CalendarCandidateKind;
  readonly uniquelyMatched: boolean;
}): InboundReviewReason | 'unique_match_only' {
  if (input.kind === 'invalid_format') return 'illegal_schema';
  if (input.kind === 'conflict') return 'simultaneous_edit';
  if (!input.uniquelyMatched) {
    if (input.kind === 'cancel_appointment' || input.kind === 'release_block') {
      return 'ambiguous_delete';
    }
    return 'unmatched';
  }
  return 'unique_match_only';
}

export function googleEventsWatchBody(input: {
  readonly channelId: string;
  readonly address: string;
  readonly token: string;
  readonly expirationMs: number;
}): {
  readonly id: string;
  readonly type: 'web_hook';
  readonly address: string;
  readonly token: string;
  readonly expiration: number;
} {
  if (input.channelId.trim() === '' || input.address.trim() === '') {
    throw new Error('Watch channel id and address must be non-empty.');
  }
  return {
    id: input.channelId,
    type: 'web_hook',
    address: input.address,
    token: input.token,
    expiration: input.expirationMs
  };
}

export function googleChannelsStopBody(input: {
  readonly channelId: string;
  readonly resourceId: string;
}): { readonly id: string; readonly resourceId: string } {
  if (input.channelId.trim() === '' || input.resourceId.trim() === '') {
    throw new Error('Stop requires a channel id and resource id.');
  }
  return { id: input.channelId, resourceId: input.resourceId };
}
