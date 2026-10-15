export interface CalendarPilotWorkerLease {
  readonly owner: string;
  readonly generation: number;
  /** Read at the boundary, not captured when the run starts. */
  readonly now: () => string;
}

interface ConfigurationLeaseState {
  readonly version?: unknown;
  readonly expiresAt?: unknown;
  readonly inboundEnabled?: unknown;
  readonly outboundEnabled?: unknown;
  readonly workerLeaseOwner?: unknown;
  readonly workerLeaseExpiresAt?: unknown;
}
interface JobLeaseState {
  readonly status?: unknown;
  readonly leaseOwner?: unknown;
  readonly leaseExpiresAt?: unknown;
}

export class CalendarPilotLeaseLostError extends Error {
  public readonly name = 'CalendarPilotLeaseLostError';

  public constructor() {
    super('CAL-PILOT worker lease is no longer valid.');
  }
}

function timestamp(value: unknown): number {
  return typeof value === 'string' ? Date.parse(value) : Number.NaN;
}

/**
 * Stop rather than renew. Call after transaction reads, immediately before a
 * write or HTTP dispatch; a timestamp supplied to run() is not a frozen permit.
 * This cannot cancel a provider request already sent under a valid lease.
 */
export function assertCalendarPilotWorkerLease(
  configuration: ConfigurationLeaseState,
  lease: CalendarPilotWorkerLease,
  job?: JobLeaseState
): string {
  const now = lease.now();
  const time = timestamp(now);
  const expiresAt = timestamp(configuration.expiresAt);
  const workerDeadline = timestamp(configuration.workerLeaseExpiresAt);
  if (
    !Number.isFinite(time) ||
    !Number.isFinite(expiresAt) ||
    !Number.isFinite(workerDeadline) ||
    lease.owner.trim() === '' ||
    !Number.isSafeInteger(lease.generation) ||
    lease.generation < 0 ||
    configuration.version !== lease.generation ||
    configuration.inboundEnabled !== true ||
    configuration.outboundEnabled !== true ||
    configuration.workerLeaseOwner !== lease.owner ||
    expiresAt <= time ||
    workerDeadline <= time
  )
    throw new CalendarPilotLeaseLostError();
  if (job !== undefined) {
    const jobDeadline = timestamp(job.leaseExpiresAt);
    if (
      job.status !== 'processing' ||
      job.leaseOwner !== lease.owner ||
      !Number.isFinite(jobDeadline) ||
      jobDeadline <= time
    )
      throw new CalendarPilotLeaseLostError();
  }
  return now;
}
