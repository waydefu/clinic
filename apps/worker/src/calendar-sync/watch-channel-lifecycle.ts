import {
  eventDedupeKey,
  notificationDedupeKey,
  planWatchChannelReplacement,
  shouldRenewWatchChannel,
  type WatchChannelRecord
} from './watch-channel.js';

/**
 * Synthetic watch-channel lifecycle. Unwired from calendar-pilot-runtime and
 * production routing. Production `events.watch` stays GO_LIVE_DEFERRED.
 */
export interface SyntheticWatchRegistration {
  readonly channelId: string;
  readonly resourceId: string;
  readonly expirationMs: number;
  readonly retired: boolean;
}

export interface SyntheticWatchAdapter {
  readonly registrations: SyntheticWatchRegistration[];
  watch(input: {
    readonly channelId: string;
    readonly expirationMs: number;
  }): Promise<SyntheticWatchRegistration>;
  stop(channelId: string): Promise<void>;
}

export class InMemoryWatchAdapter implements SyntheticWatchAdapter {
  public readonly registrations: SyntheticWatchRegistration[] = [];
  public watchCalls = 0;
  public stopCalls = 0;

  public watch(input: {
    readonly channelId: string;
    readonly expirationMs: number;
  }): Promise<SyntheticWatchRegistration> {
    this.watchCalls += 1;
    const record: SyntheticWatchRegistration = {
      channelId: input.channelId,
      resourceId: `resource_${input.channelId}`,
      expirationMs: input.expirationMs,
      retired: false
    };
    this.registrations.push(record);
    return Promise.resolve(record);
  }

  public stop(channelId: string): Promise<void> {
    this.stopCalls += 1;
    const record = this.registrations.find(
      (item) => item.channelId === channelId && !item.retired
    );
    if (record !== undefined) {
      this.registrations[this.registrations.indexOf(record)] = {
        ...record,
        retired: true
      };
    }
    return Promise.resolve();
  }
}

export interface WatchDedupeCapacity {
  readonly maxEntries: number;
  readonly warningAtEntries: number;
}

export interface WatchLifecycleState {
  readonly current?: WatchChannelRecord;
  readonly overlapping?: WatchChannelRecord;
  readonly seenNotifications: ReadonlySet<string>;
  readonly seenEvents: ReadonlySet<string>;
  readonly notificationEvents: ReadonlyMap<string, string>;
  readonly inFlightEvents: ReadonlySet<string>;
  /** Keep the latest registered expiry even after overlap retirement. */
  readonly retentionExpirationMs: number;
  readonly capacity?: WatchDedupeCapacity;
}

export function emptyWatchLifecycleState(
  capacity?: WatchDedupeCapacity
): WatchLifecycleState {
  if (
    capacity !== undefined &&
    (!Number.isSafeInteger(capacity.maxEntries) ||
      capacity.maxEntries < 2 ||
      !Number.isSafeInteger(capacity.warningAtEntries) ||
      capacity.warningAtEntries < 1 ||
      capacity.warningAtEntries >= capacity.maxEntries)
  )
    throw new Error('Watch dedupe capacity requires finite explicit limits.');
  return {
    seenNotifications: new Set(),
    seenEvents: new Set(),
    notificationEvents: new Map(),
    inFlightEvents: new Set(),
    retentionExpirationMs: 0,
    ...(capacity === undefined ? {} : { capacity: { ...capacity } })
  };
}

export async function renewWatchChannelWithOverlap(input: {
  readonly adapter: SyntheticWatchAdapter;
  readonly state: WatchLifecycleState;
  readonly current: WatchChannelRecord;
  readonly nextChannelId: string;
  readonly nowMs: number;
  readonly nextExpirationMs: number;
}): Promise<{
  readonly state: WatchLifecycleState;
  readonly renewed: boolean;
}> {
  if (
    input.state.current !== undefined &&
    (input.state.current.channelId !== input.current.channelId ||
      input.state.current.calendarId !== input.current.calendarId ||
      input.state.current.expirationMs !== input.current.expirationMs)
  )
    throw new Error('Watch renewal must use the current state.');
  const plan = planWatchChannelReplacement(
    input.current,
    input.nextChannelId,
    input.nowMs
  );
  const retentionExpirationMs = Math.max(
    input.state.retentionExpirationMs,
    input.current.expirationMs
  );
  if (!plan.renew) {
    return {
      renewed: false,
      state: { ...input.state, current: input.current, retentionExpirationMs }
    };
  }
  if (input.state.overlapping !== undefined)
    throw new Error('Retire the existing overlap before renewing again.');
  if (
    !Number.isSafeInteger(input.nowMs) ||
    !Number.isSafeInteger(input.nextExpirationMs) ||
    input.nextExpirationMs <= input.nowMs
  )
    throw new Error('Replacement watch expiry must be a future timestamp.');
  const next = await input.adapter.watch({
    channelId: plan.nextChannelId,
    expirationMs: input.nextExpirationMs
  });
  return {
    renewed: true,
    state: {
      ...input.state,
      current: {
        channelId: next.channelId,
        resourceId: next.resourceId,
        calendarId: input.current.calendarId,
        expirationMs: next.expirationMs,
        token: input.current.token
      },
      overlapping: input.current,
      retentionExpirationMs: Math.max(retentionExpirationMs, next.expirationMs)
    }
  };
}

export async function retireOverlappingWatchChannel(input: {
  readonly adapter: SyntheticWatchAdapter;
  readonly state: WatchLifecycleState;
}): Promise<WatchLifecycleState> {
  if (input.state.overlapping === undefined) return input.state;
  await input.adapter.stop(input.state.overlapping.channelId);
  const { overlapping, ...state } = input.state;
  return {
    ...state,
    retentionExpirationMs: Math.max(
      state.retentionExpirationMs,
      overlapping.expirationMs
    )
  };
}

export function acceptWatchNotification(input: {
  readonly state: WatchLifecycleState;
  readonly nowMs: number;
  readonly channelId: string;
  readonly messageNumber: string;
  readonly calendarId: string;
  readonly eventId: string;
  readonly etag: string;
}): {
  readonly state: WatchLifecycleState;
  readonly duplicate: boolean;
  readonly knownChannel: boolean;
  readonly accepted: boolean;
  readonly httpStatus: 200 | 404 | 503;
  /** The future ingress must emit this alert before acknowledging new work. */
  readonly capacityWarning: boolean;
} {
  const state = input.state;
  const channel = [state.current, state.overlapping].find(
    (item) =>
      item?.channelId === input.channelId && item.calendarId === input.calendarId
  );
  const notificationKey = notificationDedupeKey(
    input.channelId,
    input.messageNumber
  );
  const eventKey = eventDedupeKey(input.calendarId, input.eventId, input.etag);
  const duplicate =
    state.seenNotifications.has(notificationKey) || state.seenEvents.has(eventKey);
  const count = state.seenNotifications.size + state.seenEvents.size;
  const capacityWarning =
    state.capacity === undefined || count >= state.capacity.warningAtEntries;
  const result = {
    state,
    duplicate,
    knownChannel: channel !== undefined,
    capacityWarning
  };
  if (channel === undefined)
    return { ...result, accepted: false, httpStatus: 404 };
  if (duplicate) {
    const bound = state.notificationEvents.get(notificationKey);
    const pending =
      state.inFlightEvents.has(eventKey) ||
      !state.seenEvents.has(eventKey) ||
      (bound !== undefined && bound !== eventKey);
    return { ...result, accepted: !pending, httpStatus: pending ? 503 : 200 };
  }
  if (
    !Number.isSafeInteger(input.nowMs) ||
    !Number.isSafeInteger(channel.expirationMs) ||
    input.nowMs >= channel.expirationMs
  )
    return { ...result, accepted: false, httpStatus: 404 };
  if (state.capacity === undefined || count + 2 > state.capacity.maxEntries)
    return { ...result, accepted: false, httpStatus: 503, capacityWarning: true };
  return {
    ...result,
    accepted: true,
    httpStatus: 200,
    capacityWarning: count + 2 >= state.capacity.warningAtEntries,
    state: {
      ...state,
      seenNotifications: new Set([...state.seenNotifications, notificationKey]),
      seenEvents: new Set([...state.seenEvents, eventKey]),
      notificationEvents: new Map([
        ...state.notificationEvents,
        [notificationKey, eventKey]
      ]),
      inFlightEvents: new Set([...state.inFlightEvents, eventKey]),
      retentionExpirationMs: Math.max(
        state.retentionExpirationMs,
        channel.expirationMs
      )
    }
  };
}

/** Only successful processing settles a reservation; failure retains it for retry. */
export function completeWatchEvent(input: {
  readonly state: WatchLifecycleState;
  readonly calendarId: string;
  readonly eventId: string;
  readonly etag: string;
}): WatchLifecycleState {
  const key = eventDedupeKey(input.calendarId, input.eventId, input.etag);
  if (!input.state.seenEvents.has(key))
    throw new Error('Only admitted watch work can be completed.');
  if (!input.state.inFlightEvents.has(key)) return input.state;
  const inFlightEvents = new Set(input.state.inFlightEvents);
  inFlightEvents.delete(key);
  return { ...input.state, inFlightEvents };
}

/** No unconditional TTL: an authorised, evidenced retry bound is required. */
export function pruneWatchDedupe(input: {
  readonly state: WatchLifecycleState;
  readonly nowMs: number;
  readonly retryHorizon?: {
    readonly maxRetryMs: number;
    readonly evidenceRef: string;
  };
}): WatchLifecycleState {
  const proof = input.retryHorizon;
  if (proof === undefined) return input.state;
  if (
    !Number.isSafeInteger(input.nowMs) ||
    !Number.isSafeInteger(proof.maxRetryMs) ||
    proof.maxRetryMs < 0 ||
    !/^[A-Za-z0-9_-]{1,128}$/u.test(proof.evidenceRef)
  )
    throw new Error('Watch retry horizon requires a valid evidenced bound.');
  const expiry = Math.max(
    input.state.retentionExpirationMs,
    input.state.current?.expirationMs ?? 0,
    input.state.overlapping?.expirationMs ?? 0
  );
  const horizon = expiry + proof.maxRetryMs;
  if (
    expiry === 0 ||
    !Number.isSafeInteger(horizon) ||
    input.nowMs <= horizon ||
    input.state.inFlightEvents.size !== 0
  )
    return input.state;
  return {
    ...input.state,
    seenNotifications: new Set(),
    seenEvents: new Set(),
    notificationEvents: new Map()
  };
}

export function watchChannelNeedsRenewal(
  channel: WatchChannelRecord,
  nowMs: number
): boolean {
  return shouldRenewWatchChannel(channel, nowMs);
}
