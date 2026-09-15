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

export interface WatchLifecycleState {
  readonly current?: WatchChannelRecord;
  readonly overlapping?: WatchChannelRecord;
  readonly seenNotifications: ReadonlySet<string>;
  readonly seenEvents: ReadonlySet<string>;
}

export function emptyWatchLifecycleState(): WatchLifecycleState {
  return {
    seenNotifications: new Set(),
    seenEvents: new Set()
  };
}

export async function renewWatchChannelWithOverlap(input: {
  readonly adapter: SyntheticWatchAdapter;
  readonly current: WatchChannelRecord;
  readonly nextChannelId: string;
  readonly nowMs: number;
  readonly nextExpirationMs: number;
}): Promise<{
  readonly state: WatchLifecycleState;
  readonly renewed: boolean;
}> {
  const plan = planWatchChannelReplacement(
    input.current,
    input.nextChannelId,
    input.nowMs
  );
  if (!plan.renew) {
    return {
      renewed: false,
      state: {
        current: input.current,
        seenNotifications: new Set(),
        seenEvents: new Set()
      }
    };
  }
  const next = await input.adapter.watch({
    channelId: plan.nextChannelId,
    expirationMs: input.nextExpirationMs
  });
  return {
    renewed: true,
    state: {
      current: {
        channelId: next.channelId,
        resourceId: next.resourceId,
        calendarId: input.current.calendarId,
        expirationMs: next.expirationMs,
        token: input.current.token
      },
      overlapping: input.current,
      seenNotifications: new Set(),
      seenEvents: new Set()
    }
  };
}

export async function retireOverlappingWatchChannel(input: {
  readonly adapter: SyntheticWatchAdapter;
  readonly state: WatchLifecycleState;
}): Promise<WatchLifecycleState> {
  if (input.state.overlapping === undefined) return input.state;
  await input.adapter.stop(input.state.overlapping.channelId);
  return {
    ...(input.state.current === undefined
      ? {}
      : { current: input.state.current }),
    seenNotifications: input.state.seenNotifications,
    seenEvents: input.state.seenEvents
  };
}

export function acceptWatchNotification(input: {
  readonly state: WatchLifecycleState;
  readonly channelId: string;
  readonly messageNumber: string;
  readonly calendarId: string;
  readonly eventId: string;
  readonly etag: string;
}): {
  readonly state: WatchLifecycleState;
  readonly duplicate: boolean;
  readonly knownChannel: boolean;
} {
  const knownChannel =
    input.state.current?.channelId === input.channelId ||
    input.state.overlapping?.channelId === input.channelId;
  if (!knownChannel) {
    return { state: input.state, duplicate: false, knownChannel: false };
  }
  const notificationKey = notificationDedupeKey(
    input.channelId,
    input.messageNumber
  );
  const eventKey = eventDedupeKey(input.calendarId, input.eventId, input.etag);
  const duplicate =
    input.state.seenNotifications.has(notificationKey) ||
    input.state.seenEvents.has(eventKey);
  const seenNotifications = new Set(input.state.seenNotifications);
  const seenEvents = new Set(input.state.seenEvents);
  seenNotifications.add(notificationKey);
  seenEvents.add(eventKey);
  return {
    duplicate,
    knownChannel: true,
    state: {
      ...(input.state.current === undefined
        ? {}
        : { current: input.state.current }),
      ...(input.state.overlapping === undefined
        ? {}
        : { overlapping: input.state.overlapping }),
      seenNotifications,
      seenEvents
    }
  };
}

export function watchChannelNeedsRenewal(
  channel: WatchChannelRecord,
  nowMs: number
): boolean {
  return shouldRenewWatchChannel(channel, nowMs);
}
