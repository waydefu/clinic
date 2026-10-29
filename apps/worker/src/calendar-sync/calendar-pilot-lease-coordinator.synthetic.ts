import {
  CalendarPilotLeaseLostError,
  type CalendarPilotWorkerLease
} from './calendar-pilot-worker-lease.js';

export interface CalendarPilotSyntheticLease extends Pick<
  CalendarPilotWorkerLease,
  'owner' | 'generation'
> {
  readonly token: string;
}

export interface CalendarPilotSyntheticAdmission extends CalendarPilotSyntheticLease {
  readonly admissionId: string;
  readonly segmentId: string;
}

export type CalendarPilotSyntheticQuarantineReason =
  | 'unknown_worker'
  | 'unknown_in_flight'
  | 'unverifiable_isolation'
  | 'invalid_lease_time';

export type CalendarPilotSyntheticCoordinatorPhase =
  'active' | 'draining' | 'quiescent' | 'committed' | 'quarantined';

export interface CalendarPilotSyntheticCoordinatorSnapshot {
  readonly phase: CalendarPilotSyntheticCoordinatorPhase;
  readonly lease: CalendarPilotSyntheticLease;
  readonly pendingAdmissions: number;
  readonly inFlight: number;
  readonly syntheticDispatchStarts: number;
  readonly intentId?: string;
  readonly quarantineReason?: CalendarPilotSyntheticQuarantineReason;
}

interface ChangeIntent {
  readonly id: string;
  readonly nextOwner: string;
}

interface AdmissionRecord {
  readonly admission: CalendarPilotSyntheticAdmission;
  state: 'admitted' | 'in_flight' | 'settled';
}

function leaseIdentity(owner: string, generation: number, token: string) {
  return Object.freeze({ owner, generation, token });
}

function sameLease(
  left: CalendarPilotSyntheticLease,
  right: CalendarPilotSyntheticLease
): boolean {
  return (
    left.owner === right.owner &&
    left.generation === right.generation &&
    left.token === right.token
  );
}

/**
 * In-memory coordination model only. It is deliberately not imported by the
 * provider runtime and its callback represents a synthetic dispatch stub, not
 * a network or provider boundary.
 */
export class CalendarPilotSyntheticLeaseCoordinator {
  private phase: CalendarPilotSyntheticCoordinatorPhase = 'active';
  private lease: CalendarPilotSyntheticLease;
  private intent: ChangeIntent | undefined;
  private quarantineReason: CalendarPilotSyntheticQuarantineReason | undefined;
  private tokenSequence = 0;
  private admissionSequence = 0;
  private syntheticDispatchStarts = 0;
  private lastClock = -Infinity;
  private readonly admissions = new Map<string, AdmissionRecord>();
  private readonly segmentIds = new Set<string>();
  private readonly intentIds = new Set<string>();

  public constructor(
    owner: string,
    generation: number,
    private readonly expiresAtMillis: number,
    private readonly now: () => number
  ) {
    if (owner.trim() === '') {
      throw new Error('Synthetic lease owner is missing.');
    }
    if (!Number.isSafeInteger(generation) || generation < 0)
      throw new Error('Synthetic lease generation is invalid.');
    if (!Number.isFinite(expiresAtMillis))
      throw new Error('Synthetic lease deadline is invalid.');
    this.lease = this.newLease(owner, generation);
  }

  public get currentLease(): CalendarPilotSyntheticLease {
    // An issued, frozen in-memory handle, not a serializable authority claim.
    return this.lease;
  }

  public snapshot(): CalendarPilotSyntheticCoordinatorSnapshot {
    const pendingAdmissions = [...this.admissions.values()].filter(
      ({ state }) => state !== 'settled'
    ).length;
    const inFlight = [...this.admissions.values()].filter(
      ({ state }) => state === 'in_flight'
    ).length;
    return Object.freeze({
      phase: this.phase,
      lease: this.currentLease,
      pendingAdmissions,
      inFlight,
      syntheticDispatchStarts: this.syntheticDispatchStarts,
      ...(this.intent === undefined ? {} : { intentId: this.intent.id }),
      ...(this.quarantineReason === undefined
        ? {}
        : { quarantineReason: this.quarantineReason })
    });
  }

  public admit(
    lease: CalendarPilotSyntheticLease,
    segmentId: string
  ): CalendarPilotSyntheticAdmission {
    if (this.phase !== 'active')
      throw new Error('Calendar lease admission is closed.');
    this.assertCurrentLease(lease);
    if (segmentId.trim() === '' || this.segmentIds.has(segmentId))
      throw new Error('Synthetic Calendar segment ID is invalid or repeated.');

    const admission = Object.freeze({
      ...this.currentLease,
      admissionId: `admission-${++this.admissionSequence}`,
      segmentId
    });
    this.segmentIds.add(segmentId);
    this.admissions.set(admission.admissionId, {
      admission,
      state: 'admitted'
    });
    return admission;
  }

  public beginChange(intentId: string, nextOwner: string): void {
    if (this.phase !== 'active')
      throw new Error('Calendar lease change cannot start in this phase.');
    if (!this.hasLiveLeaseTime()) throw new CalendarPilotLeaseLostError();
    if (
      intentId.trim() === '' ||
      nextOwner.trim() === '' ||
      nextOwner === this.lease.owner ||
      this.intentIds.has(intentId)
    )
      throw new Error('Synthetic Calendar lease change intent is invalid.');

    this.intentIds.add(intentId);
    this.intent = { id: intentId, nextOwner };
    this.phase = 'draining';
    this.advanceQuiescence();
  }

  /**
   * The callback is entered only after this model records the dispatch start.
   * A real transport must not be passed here; the model can prove only its own
   * in-memory ordering and the stub's returned-promise settlement.
   */
  public async dispatch<T>(
    admission: CalendarPilotSyntheticAdmission,
    syntheticEffect: () => T | Promise<T>
  ): Promise<T> {
    const record = this.admissionRecord(admission);
    const mayStart =
      this.phase === 'active' &&
      sameLease(record.admission, this.lease) &&
      this.hasLiveLeaseTime();
    if (!mayStart) {
      if (record.state === 'admitted') {
        record.state = 'settled';
        this.advanceQuiescence();
      }
      throw new CalendarPilotLeaseLostError();
    }
    if (record.state !== 'admitted')
      throw new Error('Synthetic Calendar admission was already consumed.');

    record.state = 'in_flight';
    this.syntheticDispatchStarts += 1;
    try {
      const result = await syntheticEffect();
      if (!this.hasLiveLeaseTime()) throw new CalendarPilotLeaseLostError();
      return result;
    } finally {
      record.state = 'settled';
      this.advanceQuiescence();
    }
  }

  /**
   * Release only a segment that this model itself still records as not started.
   * No caller-supplied boolean, timeout, or evidence reference grants authority.
   */
  public releaseUndispatched(admission: CalendarPilotSyntheticAdmission): void {
    const record = this.admissionRecord(admission);
    if (record.state !== 'admitted')
      throw new Error(
        'Synthetic Calendar admission is already settled or in flight.'
      );
    record.state = 'settled';
    this.advanceQuiescence();
  }

  public commit(): CalendarPilotSyntheticLease {
    if (this.phase !== 'quiescent' || this.intent === undefined)
      throw new Error('Calendar lease cannot commit before quiescence.');
    if (!this.hasLiveLeaseTime()) throw new CalendarPilotLeaseLostError();
    if ([...this.admissions.values()].some(({ state }) => state !== 'settled'))
      throw new Error('Calendar lease has unsettled synthetic admissions.');
    const generation = this.lease.generation + 1;
    if (!Number.isSafeInteger(generation))
      throw new Error('Synthetic Calendar generation cannot be advanced.');

    this.lease = this.newLease(this.intent.nextOwner, generation);
    this.phase = 'committed';
    return this.currentLease;
  }

  public activate(): CalendarPilotSyntheticLease {
    if (this.phase !== 'committed')
      throw new Error('Calendar lease cannot activate before commit.');
    if (!this.hasLiveLeaseTime()) throw new CalendarPilotLeaseLostError();
    this.phase = 'active';
    this.intent = undefined;
    return this.currentLease;
  }

  /** Quarantine is sticky: this model has no evidence-free recovery method. */
  public quarantine(reason: CalendarPilotSyntheticQuarantineReason): void {
    if (
      ![
        'unknown_worker',
        'unknown_in_flight',
        'unverifiable_isolation',
        'invalid_lease_time'
      ].includes(reason)
    )
      throw new Error('Synthetic Calendar quarantine reason is invalid.');
    if (this.phase === 'quarantined') return;
    this.phase = 'quarantined';
    this.quarantineReason = reason;
  }

  private newLease(
    owner: string,
    generation: number
  ): CalendarPilotSyntheticLease {
    return leaseIdentity(
      owner,
      generation,
      `synthetic-token-${++this.tokenSequence}`
    );
  }

  private hasLiveLeaseTime(): boolean {
    if (this.phase === 'quarantined') return false;
    let now: number;
    try {
      now = this.now();
    } catch {
      this.quarantine('invalid_lease_time');
      return false;
    }
    if (
      !Number.isFinite(now) ||
      now < this.lastClock ||
      now >= this.expiresAtMillis
    ) {
      this.quarantine('invalid_lease_time');
      return false;
    }
    this.lastClock = now;
    return true;
  }

  private assertCurrentLease(lease: CalendarPilotSyntheticLease): void {
    if (lease !== this.lease || !this.hasLiveLeaseTime())
      throw new CalendarPilotLeaseLostError();
  }

  private admissionRecord(
    admission: CalendarPilotSyntheticAdmission
  ): AdmissionRecord {
    const record =
      typeof admission === 'object' && admission !== null
        ? this.admissions.get(admission.admissionId)
        : undefined;
    if (record === undefined || record.admission !== admission)
      throw new CalendarPilotLeaseLostError();
    return record;
  }

  private advanceQuiescence(): void {
    if (
      this.phase === 'draining' &&
      [...this.admissions.values()].every(({ state }) => state === 'settled')
    )
      this.phase = 'quiescent';
  }
}
