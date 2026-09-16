import {
  ALERT_WINDOW_MS,
  firingImmediateAlerts,
  isBookingWritePath,
  routeFamilyFromPath,
  type OperationalHealthInput,
  type SafeRouteFamily,
  type SignalCounts,
  type WpB4ImmediateAlert
} from '@beauessence/domain';

/**
 * Process-local rolling window for Stage E synthetic proof. Labels stay
 * low-cardinality: route family only, never actor, IP, phone, or session.
 */

export const API_METRICS = 'ApiMetricsPort';

export interface HttpMetric {
  readonly routeFamily: SafeRouteFamily;
  readonly status: number;
  readonly errorCode: string | null;
  readonly bookingWrite: boolean;
}

export interface ApiMetricsPort {
  recordHttp(metric: HttpMetric): void;
  recordSignal(
    name:
      | 'booking_transaction_failure'
      | 'backup_failure'
      | 'iam_setiampolicy'
      | 'calendar_projection_failure'
      | 'calendar_410_recovery'
      | 'denied_audit_append_failure'
  ): void;
  counts(): SignalCounts;
  firingAlerts(health: OperationalHealthInput): readonly WpB4ImmediateAlert[];
}

export const NOOP_API_METRICS: ApiMetricsPort = {
  recordHttp: () => undefined,
  recordSignal: () => undefined,
  counts: () => emptyCounts(),
  firingAlerts: () => []
};

function isSevere5xx(metric: HttpMetric): boolean {
  if (metric.status < 500) return false;
  // Fail-closed IP-001 gate returns SERVICE_UNAVAILABLE. That is not an outage.
  return metric.errorCode !== 'SERVICE_UNAVAILABLE';
}

function emptyCounts(): SignalCounts {
  return {
    http5xx: 0,
    bookingWriteFailure: 0,
    bookingTransactionFailure: 0,
    authFailure: 0,
    authzDenial: 0,
    returnLookupRateLimited: 0,
    deadLetter: 0,
    outboxOldestAgeSeconds: 0,
    backupFailure: 0,
    iamSetIamPolicy: 0
  };
}

export class InMemoryApiMetrics implements ApiMetricsPort {
  private readonly events: {
    readonly atMs: number;
    readonly metric: HttpMetric;
  }[] = [];
  private readonly extras: {
    readonly atMs: number;
    readonly name: Parameters<ApiMetricsPort['recordSignal']>[0];
  }[] = [];

  public constructor(private readonly nowMs: () => number = Date.now) {}

  public recordHttp(metric: HttpMetric): void {
    this.events.push({ atMs: this.nowMs(), metric });
    this.prune();
  }

  public recordSignal(
    name: Parameters<ApiMetricsPort['recordSignal']>[0]
  ): void {
    this.extras.push({ atMs: this.nowMs(), name });
    this.prune();
  }

  public counts(): SignalCounts {
    this.prune();
    const counts = {
      http5xx: 0,
      bookingWriteFailure: 0,
      bookingTransactionFailure: 0,
      authFailure: 0,
      authzDenial: 0,
      returnLookupRateLimited: 0,
      deadLetter: 0,
      outboxOldestAgeSeconds: 0,
      backupFailure: 0,
      iamSetIamPolicy: 0
    };
    for (const event of this.events) {
      const { metric } = event;
      if (isSevere5xx(metric)) {
        counts.http5xx += 1;
        if (metric.bookingWrite) counts.bookingWriteFailure += 1;
      }
      if (metric.errorCode === 'AUTHENTICATION_REQUIRED')
        counts.authFailure += 1;
      if (metric.errorCode === 'AUTHORIZATION_DENIED') counts.authzDenial += 1;
      if (
        metric.errorCode === 'RATE_LIMITED' &&
        metric.routeFamily === 'return_lookup'
      )
        counts.returnLookupRateLimited += 1;
    }
    for (const extra of this.extras) {
      if (extra.name === 'booking_transaction_failure')
        counts.bookingTransactionFailure += 1;
      if (extra.name === 'backup_failure') counts.backupFailure += 1;
      if (extra.name === 'iam_setiampolicy') counts.iamSetIamPolicy += 1;
    }
    return counts;
  }

  public firingAlerts(
    health: OperationalHealthInput
  ): readonly WpB4ImmediateAlert[] {
    return firingImmediateAlerts(health, this.counts());
  }

  private prune(): void {
    const cutoff = this.nowMs() - ALERT_WINDOW_MS;
    while (this.events[0] !== undefined && this.events[0].atMs < cutoff)
      this.events.shift();
    while (this.extras[0] !== undefined && this.extras[0].atMs < cutoff)
      this.extras.shift();
  }
}

export function httpMetricFromRequest(input: {
  readonly method: string;
  readonly path: string;
  readonly status: number;
  readonly errorCode: string | null;
}): HttpMetric {
  return {
    routeFamily: routeFamilyFromPath(input.path),
    status: input.status,
    errorCode: input.errorCode,
    bookingWrite: isBookingWritePath(input.method, input.path)
  };
}
