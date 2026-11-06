export interface FullScanCalendarEvent {
  readonly id: string;
  readonly linkId?: string;
  readonly recurring: boolean;
}

type ScanOutcome = 'no-op' | 'changed' | 'conflict' | 'blocked';
type ScanItem =
  | { readonly kind: 'calendar'; readonly event: FullScanCalendarEvent }
  | { readonly kind: 'firestore'; readonly linkId: string };

export interface CalendarPilotFullScanState {
  readonly scope: string;
  readonly pageSize: number;
  readonly phase: 'calendar' | 'firestore' | 'complete';
  readonly pageToken?: string;
  readonly pageLoaded: boolean;
  readonly pending: readonly ScanItem[];
  readonly clean: boolean;
}

export function isCalendarPilotFullScanState(
  value: unknown
): value is CalendarPilotFullScanState {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false;
  const state = value as Record<string, unknown>;
  if (
    typeof state['scope'] !== 'string' ||
    !Number.isSafeInteger(state['pageSize']) ||
    (state['phase'] !== 'calendar' &&
      state['phase'] !== 'firestore' &&
      state['phase'] !== 'complete') ||
    typeof state['pageLoaded'] !== 'boolean' ||
    typeof state['clean'] !== 'boolean' ||
    (state['pageToken'] !== undefined &&
      (typeof state['pageToken'] !== 'string' ||
        state['pageToken'].length > 4096)) ||
    !Array.isArray(state['pending']) ||
    state['pending'].length > 100
  )
    return false;
  return state['pending'].every((item: unknown) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item))
      return false;
    const entry = item as Record<string, unknown>;
    if (entry['kind'] === 'firestore')
      return typeof entry['linkId'] === 'string';
    if (
      entry['kind'] !== 'calendar' ||
      typeof entry['event'] !== 'object' ||
      entry['event'] === null ||
      Array.isArray(entry['event'])
    )
      return false;
    const event = entry['event'] as Record<string, unknown>;
    return (
      typeof event['id'] === 'string' &&
      typeof event['recurring'] === 'boolean' &&
      (event['linkId'] === undefined || typeof event['linkId'] === 'string')
    );
  });
}

export interface CalendarPilotFullScanPort {
  calendarPage(
    limit: number,
    pageToken?: string
  ): Promise<{
    readonly events: readonly FullScanCalendarEvent[];
    readonly nextPageToken?: string;
  }>;
  firestorePage(
    limit: number,
    cursor?: string
  ): Promise<{
    readonly linkIds: readonly string[];
    readonly nextCursor?: string;
  }>;
  reconcileCalendarEvent(event: FullScanCalendarEvent): Promise<ScanOutcome>;
  reconcileFirestoreLink(linkId: string): Promise<ScanOutcome>;
}

export async function runCalendarPilotFullScanRound(
  port: CalendarPilotFullScanPort,
  options: {
    readonly scope: string;
    readonly maxItems: number;
    readonly deadline: number;
    readonly now: () => number;
  },
  previous?: CalendarPilotFullScanState
): Promise<{
  readonly state: CalendarPilotFullScanState;
  readonly processed: number;
  readonly converged: boolean;
}> {
  if (
    options.scope.trim() === '' ||
    !Number.isSafeInteger(options.maxItems) ||
    options.maxItems < 1 ||
    options.maxItems > 100 ||
    !Number.isFinite(options.deadline) ||
    (previous !== undefined &&
      (previous.scope !== options.scope ||
        previous.pageSize !== options.maxItems))
  )
    throw new Error('Invalid full-scan bounds or scope.');
  let phase = previous?.phase ?? 'calendar';
  let pageToken = previous?.pageToken;
  let pageLoaded = previous?.pageLoaded ?? false;
  let pending = [...(previous?.pending ?? [])];
  let clean = previous?.clean ?? true;
  if (
    phase === 'complete' ||
    pending.length > 100 ||
    (!pageLoaded && pending.length > 0) ||
    pending.some((item) => item.kind !== phase)
  )
    throw new Error('Invalid full-scan resume state.');
  let processed = 0;
  let pageRequests = 0;
  let lastTime = Number.NEGATIVE_INFINITY;
  const expired = (): boolean => {
    const now = options.now();
    if (!Number.isFinite(now) || now < lastTime)
      throw new Error('Invalid full-scan clock.');
    lastTime = now;
    return now >= options.deadline;
  };
  while (!expired()) {
    if (!pageLoaded) {
      if (pageRequests > 0 || processed > 0) break;
      // Calendar page tokens require the same request parameters across pages.
      const limit = options.maxItems;
      const requested = pageToken;
      if (phase === 'calendar') {
        const page = await port.calendarPage(limit, requested);
        if (
          page.events.length > limit ||
          page.events.some(
            (event) => typeof event.id !== 'string' || event.id.trim() === ''
          )
        )
          throw new Error('Invalid full-calendar inventory page.');
        pending = page.events.map((event) => ({ kind: 'calendar', event }));
        pageToken = page.nextPageToken;
      } else {
        const page = await port.firestorePage(limit, requested);
        if (
          page.linkIds.length > limit ||
          page.linkIds.some((id) => typeof id !== 'string' || id.trim() === '')
        )
          throw new Error('Invalid Firestore link page.');
        pending = page.linkIds.map((linkId) => ({ kind: 'firestore', linkId }));
        pageToken = page.nextCursor;
      }
      if (
        pageToken !== undefined &&
        (pageToken.trim() === '' || pageToken === requested)
      )
        throw new Error('Invalid full-scan page token.');
      pageLoaded = true;
      pageRequests += 1;
      continue;
    }
    const item = pending[0];
    if (item !== undefined) {
      if (processed >= options.maxItems) break;
      const outcome =
        item.kind === 'calendar'
          ? await port.reconcileCalendarEvent(item.event)
          : await port.reconcileFirestoreLink(item.linkId);
      if (!['no-op', 'changed', 'conflict', 'blocked'].includes(outcome))
        throw new Error('Invalid full-scan outcome.');
      if (outcome !== 'no-op') clean = false;
      pending = pending.slice(1);
      processed += 1;
      continue;
    }
    if (pageToken !== undefined) {
      pageLoaded = false;
    } else if (phase === 'calendar') {
      phase = 'firestore';
      pageLoaded = false;
    } else {
      phase = 'complete';
      break;
    }
  }
  const state: CalendarPilotFullScanState = {
    scope: options.scope,
    pageSize: options.maxItems,
    phase,
    ...(pageToken !== undefined ? { pageToken } : {}),
    pageLoaded,
    pending,
    clean
  };
  return { state, processed, converged: phase === 'complete' && clean };
}
