/**
 * Read-only CAL-PILOT `/health` inspect. Does not call Google Calendar and
 * does not mount CalendarWatchController. Labels stay low-cardinality: no
 * appointment, patient, event, or calendar ids.
 */

export type CalendarPilotHealthCode =
  'ok' | 'expired' | 'degraded' | 'disabled' | 'missing';

export type CalendarPilotHealthAlertSeverity = 'weekday' | 'immediate';

export type CalendarPilotHealthAlertCode =
  | 'configuration_missing'
  | 'configuration_expired'
  | 'inbound_outbound_disabled'
  | 'sync_degraded'
  | 'failed_jobs_present';

export interface CalendarPilotHealthAlert {
  readonly code: CalendarPilotHealthAlertCode;
  readonly severity: CalendarPilotHealthAlertSeverity;
}

export interface CalendarPilotJobSnapshot {
  readonly pending: number;
  readonly processing: number;
  readonly failed: number;
}

export interface CalendarPilotHealthInspection {
  readonly health: CalendarPilotHealthCode;
  readonly snapshot: CalendarPilotJobSnapshot;
  readonly alerts: readonly CalendarPilotHealthAlert[];
  readonly inboundEnabled: boolean | null;
  readonly outboundEnabled: boolean | null;
}

export interface CalendarPilotHttpRuntime {
  run(): Promise<unknown>;
  inspect(nowUtc?: string): Promise<CalendarPilotHealthInspection>;
}

export interface CalendarPilotHealthStore {
  collection(name: string): {
    doc(id: string): {
      get(): Promise<{ exists: boolean; data(): unknown }>;
    };
    where(
      field: string,
      op: string,
      value: unknown
    ): { get(): Promise<{ size: number }> };
  };
}

export interface CalendarPilotHealthInput {
  readonly exists: boolean;
  readonly nowUtc: string;
  readonly health: unknown;
  readonly expiresAt: unknown;
  readonly inboundEnabled: unknown;
  readonly outboundEnabled: unknown;
  readonly failedJobs: number;
}

function immediate(
  code: CalendarPilotHealthAlertCode
): CalendarPilotHealthAlert {
  return { code, severity: 'immediate' };
}

export function evaluateCalendarPilotHealth(input: CalendarPilotHealthInput): {
  readonly health: CalendarPilotHealthCode;
  readonly alerts: readonly CalendarPilotHealthAlert[];
} {
  if (!input.exists) {
    return {
      health: 'missing',
      alerts: [immediate('configuration_missing')]
    };
  }

  const alerts: CalendarPilotHealthAlert[] = [];
  const expiredByField = input.health === 'expired';
  const expiredByTime =
    typeof input.expiresAt === 'string' &&
    Number.isFinite(Date.parse(input.expiresAt)) &&
    Date.parse(input.nowUtc) >= Date.parse(input.expiresAt);
  if (expiredByField || expiredByTime)
    alerts.push(immediate('configuration_expired'));
  if (input.inboundEnabled !== true || input.outboundEnabled !== true)
    alerts.push(immediate('inbound_outbound_disabled'));
  if (input.health === 'degraded') alerts.push(immediate('sync_degraded'));
  if (input.failedJobs > 0) alerts.push(immediate('failed_jobs_present'));

  const health: CalendarPilotHealthCode = alerts.some(
    (alert) => alert.code === 'configuration_expired'
  )
    ? 'expired'
    : alerts.some((alert) => alert.code === 'inbound_outbound_disabled')
      ? 'disabled'
      : alerts.length > 0
        ? 'degraded'
        : 'ok';
  return { health, alerts };
}

function recordField(data: unknown, field: string): unknown {
  if (typeof data !== 'object' || data === null) return undefined;
  return Reflect.get(data, field);
}

export async function inspectCalendarPilotHealth(
  db: CalendarPilotHealthStore,
  nowUtc: string
): Promise<CalendarPilotHealthInspection> {
  const outbox = db.collection('calendar_pilot_outbox');
  const [configuration, pending, processing, failed] = await Promise.all([
    db.collection('calendar_pilot_configuration').doc('active').get(),
    outbox.where('status', '==', 'pending').get(),
    outbox.where('status', '==', 'processing').get(),
    outbox.where('status', '==', 'failed').get()
  ]);
  const data = configuration.exists ? configuration.data() : undefined;
  const inboundEnabled = recordField(data, 'inboundEnabled');
  const outboundEnabled = recordField(data, 'outboundEnabled');
  const evaluated = evaluateCalendarPilotHealth({
    exists: configuration.exists,
    nowUtc,
    health: recordField(data, 'health'),
    expiresAt: recordField(data, 'expiresAt'),
    inboundEnabled,
    outboundEnabled,
    failedJobs: failed.size
  });
  return {
    health: evaluated.health,
    alerts: evaluated.alerts,
    inboundEnabled: typeof inboundEnabled === 'boolean' ? inboundEnabled : null,
    outboundEnabled:
      typeof outboundEnabled === 'boolean' ? outboundEnabled : null,
    snapshot: {
      pending: pending.size,
      processing: processing.size,
      failed: failed.size
    }
  };
}
