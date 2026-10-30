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
  readonly sourceBinding?: string;
}

export type CalendarPilotSyntheticQuarantineReason =
  | 'unknown_worker'
  | 'unknown_in_flight'
  | 'unverifiable_isolation'
  | 'invalid_lease_time';

export type CalendarPilotSyntheticCoordinatorPhase =
  | 'active'
  | 'renewing'
  | 'draining'
  | 'quiescent'
  | 'committed'
  | 'quarantined';

/** `switch` exists only for a two-binding migration: copy is done, the registry source is not yet switched. */
export type CalendarPilotSyntheticMigrationStage =
  'copy' | 'switch' | 'cleanup' | 'done';

export interface CalendarPilotSyntheticMigrationBatch {
  readonly batchKey: string;
  readonly stage: 'copy' | 'cleanup';
  readonly itemIds: readonly string[];
  /** The binding the lease authorizes this batch under. */
  readonly sourceBinding: string;
  /** Two-binding migration only: copy writes to the new binding, cleanup removes from the old one. */
  readonly targetBinding?: string;
  readonly generation: number;
}

/** Synthetic receipt; it is accepted only if it echoes the batch exactly. */
export interface CalendarPilotSyntheticMigrationReceipt {
  readonly batchKey: string;
  readonly sourceBinding: string;
  readonly targetBinding?: string;
  readonly generation: number;
  readonly itemIds: readonly string[];
}

/** What a fake durable store keeps; the cursor is saved only after an exact receipt. */
export interface CalendarPilotSyntheticMigrationRecord {
  readonly id: string;
  readonly itemIds: readonly string[];
  readonly batchLimit: number;
  readonly fromBinding: string;
  readonly toBinding?: string;
  readonly stage: CalendarPilotSyntheticMigrationStage;
  readonly cursor: number;
  readonly generation: number;
}

/**
 * Synchronous on purpose. save() must throw for a record that does not advance
 * the stored one (lower generation, or same generation with less progress), so
 * a stale instance cannot roll the cursor back. Real durability, async races
 * and compare-and-set are Gate 2 evidence.
 */
export interface CalendarPilotSyntheticMigrationStore {
  load(): CalendarPilotSyntheticMigrationRecord | undefined;
  save(record: CalendarPilotSyntheticMigrationRecord): void;
}

export interface CalendarPilotSyntheticMigrationSnapshot {
  readonly id: string;
  readonly stage: CalendarPilotSyntheticMigrationStage;
  readonly cursor: number;
  readonly total: number;
  readonly batchLimit: number;
  readonly attempts: number;
  readonly toBinding?: string;
}

export interface CalendarPilotSyntheticCoordinatorSnapshot {
  readonly phase: CalendarPilotSyntheticCoordinatorPhase;
  readonly lease: CalendarPilotSyntheticLease;
  readonly leaseExpiresAtMillis: number;
  readonly sourceBinding?: string;
  readonly pendingAdmissions: number;
  readonly inFlight: number;
  readonly syntheticDispatchStarts: number;
  readonly intentId?: string;
  readonly quarantineReason?: CalendarPilotSyntheticQuarantineReason;
  readonly migration?: CalendarPilotSyntheticMigrationSnapshot;
}

interface MigrationState {
  readonly id: string;
  readonly itemIds: readonly string[];
  readonly batchLimit: number;
  readonly fromBinding: string;
  readonly toBinding: string | undefined;
  readonly store: CalendarPilotSyntheticMigrationStore | undefined;
  stage: CalendarPilotSyntheticMigrationStage;
  cursor: number;
  attempts: number;
  busy: boolean;
}

interface ChangeIntent {
  readonly id: string;
  readonly nextOwner: string;
  readonly nextBinding: string | undefined;
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
  private leaseExpiresAtMillis: number;
  private sourceBinding: string | undefined;
  private readonly admissions = new Map<string, AdmissionRecord>();
  private readonly segmentIds = new Set<string>();
  private readonly intentIds = new Set<string>();
  private migration: MigrationState | undefined;

  public constructor(
    owner: string,
    generation: number,
    private readonly expiresAtMillis: number,
    private readonly now: () => number,
    workerLease?: {
      readonly sourceBinding: string;
      readonly expiresAtMillis: number;
    }
  ) {
    if (owner.trim() === '') {
      throw new Error('Synthetic lease owner is missing.');
    }
    if (!Number.isSafeInteger(generation) || generation < 0)
      throw new Error('Synthetic lease generation is invalid.');
    if (!Number.isFinite(expiresAtMillis))
      throw new Error('Synthetic lease deadline is invalid.');
    if (
      workerLease !== undefined &&
      (typeof workerLease.sourceBinding !== 'string' ||
        workerLease.sourceBinding.trim() === '' ||
        !Number.isFinite(workerLease.expiresAtMillis) ||
        workerLease.expiresAtMillis > expiresAtMillis)
    )
      throw new Error('Synthetic worker lease binding or deadline is invalid.');
    this.sourceBinding = workerLease?.sourceBinding;
    this.leaseExpiresAtMillis =
      workerLease === undefined ? expiresAtMillis : workerLease.expiresAtMillis;
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
      leaseExpiresAtMillis: this.leaseExpiresAtMillis,
      ...(this.sourceBinding === undefined
        ? {}
        : { sourceBinding: this.sourceBinding }),
      pendingAdmissions,
      inFlight,
      syntheticDispatchStarts: this.syntheticDispatchStarts,
      ...(this.intent === undefined ? {} : { intentId: this.intent.id }),
      ...(this.quarantineReason === undefined
        ? {}
        : { quarantineReason: this.quarantineReason }),
      ...(this.migration === undefined
        ? {}
        : { migration: this.migrationView(this.migration) })
    });
  }

  /**
   * Bound mode only; one synthetic migration per coordinator. Items are test
   * input. With options.toBinding the migration spans two bindings: copy (under
   * the current lease) writes to toBinding, then a source switch to toBinding
   * (beginChange/commit) must happen before cleanup removes from this binding.
   */
  public beginMigration(
    lease: CalendarPilotSyntheticLease,
    sourceBinding: string,
    migrationId: string,
    itemIds: readonly string[],
    batchLimit: number,
    options: {
      readonly toBinding?: string;
      readonly store?: CalendarPilotSyntheticMigrationStore;
    } = {}
  ): void {
    if (this.phase !== 'active')
      throw new Error('Calendar migration cannot start in this phase.');
    this.assertBoundLease(lease, sourceBinding);
    this.assertMigrationInput(
      migrationId,
      itemIds,
      batchLimit,
      sourceBinding,
      options.toBinding
    );
    if (this.migration !== undefined)
      throw new Error('Synthetic Calendar migration input is invalid.');
    if (options.store?.load() !== undefined)
      throw new Error(
        'Calendar migration store already holds a cursor; resume it.'
      );
    this.migration = {
      id: migrationId,
      itemIds: Object.freeze([...itemIds]),
      batchLimit,
      fromBinding: sourceBinding,
      toBinding: options.toBinding,
      store: options.store,
      stage: 'copy',
      cursor: 0,
      attempts: 0,
      busy: false
    };
  }

  /**
   * Simulated process restart: a new coordinator picks the migration up from the
   * store. It needs a strictly newer generation than the record (a restart is
   * not proof the old process stopped, so it must come through a fresh lease),
   * and the registry binding it was built with decides which side of a source
   * switch it is on. Batches are replayed from the saved cursor by batchKey.
   */
  public resumeMigration(
    lease: CalendarPilotSyntheticLease,
    sourceBinding: string,
    migrationId: string,
    store: CalendarPilotSyntheticMigrationStore
  ): void {
    if (this.phase !== 'active')
      throw new Error('Calendar migration cannot start in this phase.');
    this.assertBoundLease(lease, sourceBinding);
    const record = store.load();
    if (this.migration !== undefined || record === undefined)
      throw new Error('Synthetic Calendar migration cannot be resumed.');
    this.assertMigrationInput(
      record.id,
      record.itemIds,
      record.batchLimit,
      record.fromBinding,
      record.toBinding
    );
    const { stage, toBinding } = record;
    const onOldSide = sourceBinding === record.fromBinding;
    const onNewSide = toBinding !== undefined && sourceBinding === toBinding;
    const bindingFits =
      toBinding === undefined || stage === 'copy'
        ? onOldSide
        : stage === 'switch'
          ? onOldSide || onNewSide
          : onNewSide;
    if (
      record.id !== migrationId ||
      record.generation >= this.lease.generation ||
      !['copy', 'switch', 'cleanup', 'done'].includes(stage) ||
      (stage === 'switch' && toBinding === undefined) ||
      !Number.isSafeInteger(record.cursor) ||
      record.cursor < 0 ||
      record.cursor >= record.itemIds.length ||
      (stage === 'done' && record.cursor !== 0) ||
      !bindingFits
    )
      throw new Error(
        'Synthetic Calendar migration record does not match this lease.'
      );
    // Registry already points at the new binding: the switch happened, cleanup starts at 0.
    const switched = stage === 'switch' && onNewSide;
    this.migration = {
      id: record.id,
      itemIds: Object.freeze([...record.itemIds]),
      batchLimit: record.batchLimit,
      fromBinding: record.fromBinding,
      toBinding,
      store,
      stage: switched ? 'cleanup' : stage,
      cursor: switched ? 0 : record.cursor,
      attempts: 0,
      busy: false
    };
  }

  private assertMigrationInput(
    migrationId: string,
    itemIds: readonly string[],
    batchLimit: number,
    fromBinding: string,
    toBinding: string | undefined
  ): void {
    if (
      migrationId.trim() === '' ||
      itemIds.length === 0 ||
      itemIds.some((id) => typeof id !== 'string' || id.trim() === '') ||
      new Set(itemIds).size !== itemIds.length ||
      !Number.isSafeInteger(batchLimit) ||
      batchLimit < 1 ||
      (toBinding !== undefined &&
        (typeof toBinding !== 'string' ||
          toBinding.trim() === '' ||
          toBinding === fromBinding))
    )
      throw new Error('Synthetic Calendar migration input is invalid.');
  }

  /**
   * Runs the batch at the cursor through admit/dispatch, the same boundary as
   * any other synthetic dispatch. The cursor moves only after an exact receipt
   * for this binding, generation and batch; any other outcome leaves the batch
   * pending, so calling again replays the same stable batchKey (the effect must
   * be idempotent on it). Copy finishes before cleanup starts.
   */
  public async migrateBatch(
    lease: CalendarPilotSyntheticLease,
    sourceBinding: string,
    syntheticEffect: (
      batch: CalendarPilotSyntheticMigrationBatch
    ) =>
      | CalendarPilotSyntheticMigrationReceipt
      | Promise<CalendarPilotSyntheticMigrationReceipt>
  ): Promise<CalendarPilotSyntheticMigrationSnapshot> {
    const migration = this.migration;
    if (migration === undefined || migration.stage === 'done')
      throw new Error('Calendar migration is not pending.');
    if (migration.stage === 'switch')
      throw new Error('Calendar migration awaits a source switch.');
    if (migration.busy)
      throw new Error('Calendar migration batch is already running.');
    migration.busy = true;
    try {
      const stage = migration.stage;
      const cursor = migration.cursor;
      const targetBinding =
        migration.toBinding === undefined
          ? undefined
          : stage === 'copy'
            ? migration.toBinding
            : migration.fromBinding;
      const batchKey = `${migration.id}:${stage}:${cursor}`;
      const admission = this.admit(
        lease,
        `${batchKey}#${migration.attempts + 1}`,
        sourceBinding
      );
      migration.attempts += 1;
      const batch: CalendarPilotSyntheticMigrationBatch = Object.freeze({
        batchKey,
        stage: stage === 'copy' ? 'copy' : 'cleanup',
        itemIds: Object.freeze(
          migration.itemIds.slice(cursor, cursor + migration.batchLimit)
        ),
        sourceBinding,
        ...(targetBinding === undefined ? {} : { targetBinding }),
        generation: admission.generation
      });
      const receipt = await this.dispatch(admission, () =>
        syntheticEffect(batch)
      );
      // A receipt that lost a race with commit is replayed by the successor, not trusted.
      if (
        !sameLease(admission, this.lease) ||
        receipt?.batchKey !== batchKey ||
        receipt.sourceBinding !== sourceBinding ||
        receipt.targetBinding !== batch.targetBinding ||
        receipt.generation !== batch.generation ||
        receipt.itemIds?.length !== batch.itemIds.length ||
        receipt.itemIds.some((id, i) => id !== batch.itemIds[i])
      )
        throw new CalendarPilotLeaseLostError();
      let nextCursor = cursor + batch.itemIds.length;
      let nextStage: CalendarPilotSyntheticMigrationStage = stage;
      if (nextCursor === migration.itemIds.length) {
        nextCursor = 0;
        nextStage =
          stage === 'cleanup'
            ? 'done'
            : migration.toBinding === undefined
              ? 'cleanup'
              : 'switch';
      }
      // Save first: if the store refuses, memory stays at the old cursor and the batch replays.
      migration.store?.save(
        Object.freeze({
          id: migration.id,
          itemIds: migration.itemIds,
          batchLimit: migration.batchLimit,
          fromBinding: migration.fromBinding,
          ...(migration.toBinding === undefined
            ? {}
            : { toBinding: migration.toBinding }),
          stage: nextStage,
          cursor: nextCursor,
          generation: batch.generation
        })
      );
      migration.cursor = nextCursor;
      migration.stage = nextStage;
      migration.attempts = 0;
      return this.migrationView(migration);
    } finally {
      migration.busy = false;
    }
  }

  private migrationView(
    migration: MigrationState
  ): CalendarPilotSyntheticMigrationSnapshot {
    return Object.freeze({
      id: migration.id,
      stage: migration.stage,
      cursor: migration.cursor,
      total: migration.itemIds.length,
      batchLimit: migration.batchLimit,
      attempts: migration.attempts,
      ...(migration.toBinding === undefined
        ? {}
        : { toBinding: migration.toBinding })
    });
  }

  public renew(
    lease: CalendarPilotSyntheticLease,
    sourceBinding: string,
    expiresAtMillis: number
  ): CalendarPilotSyntheticLease {
    if (this.phase !== 'active')
      throw new Error('Calendar lease renewal is closed.');
    this.applyRenewal(lease, sourceBinding, expiresAtMillis);
    return this.currentLease;
  }

  // shortcut: synthetic acknowledgements only, prove external authority before runtime wiring.
  public async renewWith(
    lease: CalendarPilotSyntheticLease,
    sourceBinding: string,
    syntheticRenewal: () => Promise<
      CalendarPilotSyntheticLease & {
        readonly sourceBinding: string;
        readonly expiresAtMillis: number;
      }
    >
  ): Promise<CalendarPilotSyntheticLease> {
    if (this.phase !== 'active')
      throw new Error('Calendar lease renewal is closed.');
    this.assertBoundLease(lease, sourceBinding);
    this.phase = 'renewing';
    try {
      const reply = await syntheticRenewal();
      if (this.phase !== 'renewing' || !sameLease(reply, this.lease))
        throw new CalendarPilotLeaseLostError();
      this.applyRenewal(lease, reply.sourceBinding, reply.expiresAtMillis);
      this.phase = 'active';
      return this.currentLease;
    } catch (error) {
      this.quarantine('unknown_worker');
      throw error;
    }
  }

  public admit(
    lease: CalendarPilotSyntheticLease,
    segmentId: string,
    sourceBinding?: string
  ): CalendarPilotSyntheticAdmission {
    if (this.phase !== 'active')
      throw new Error('Calendar lease admission is closed.');
    this.assertCurrentLease(lease);
    if (sourceBinding !== this.sourceBinding)
      throw new CalendarPilotLeaseLostError();
    if (segmentId.trim() === '' || this.segmentIds.has(segmentId))
      throw new Error('Synthetic Calendar segment ID is invalid or repeated.');

    const admission = Object.freeze({
      ...this.currentLease,
      admissionId: `admission-${++this.admissionSequence}`,
      segmentId,
      ...(this.sourceBinding === undefined
        ? {}
        : { sourceBinding: this.sourceBinding })
    });
    this.segmentIds.add(segmentId);
    this.admissions.set(admission.admissionId, {
      admission,
      state: 'admitted'
    });
    return admission;
  }

  /**
   * nextSourceBinding is a registry source change: bound mode only, a different
   * binding, and with an unfinished migration only to its toBinding once copy is
   * done. It takes effect at commit, together with the new generation.
   */
  public beginChange(
    intentId: string,
    nextOwner: string,
    nextSourceBinding?: string
  ): void {
    if (this.phase !== 'active')
      throw new Error('Calendar lease change cannot start in this phase.');
    if (!this.hasLiveLeaseTime()) throw new CalendarPilotLeaseLostError();
    if (
      intentId.trim() === '' ||
      nextOwner.trim() === '' ||
      nextOwner === this.lease.owner ||
      this.intentIds.has(intentId) ||
      (nextSourceBinding !== undefined &&
        (this.sourceBinding === undefined ||
          typeof nextSourceBinding !== 'string' ||
          nextSourceBinding.trim() === '' ||
          nextSourceBinding === this.sourceBinding))
    )
      throw new Error('Synthetic Calendar lease change intent is invalid.');
    const pending = this.migration;
    if (
      nextSourceBinding !== undefined &&
      pending !== undefined &&
      pending.stage !== 'done' &&
      !(pending.stage === 'switch' && pending.toBinding === nextSourceBinding)
    )
      throw new Error('Calendar source switch does not fit the migration.');

    this.intentIds.add(intentId);
    this.intent = { id: intentId, nextOwner, nextBinding: nextSourceBinding };
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
    if (this.intent.nextBinding !== undefined) {
      this.sourceBinding = this.intent.nextBinding;
      const migration = this.migration;
      if (migration?.stage === 'switch') {
        migration.stage = 'cleanup';
        migration.cursor = 0;
        migration.attempts = 0;
      }
    }
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
      now >= this.expiresAtMillis ||
      now >= this.leaseExpiresAtMillis
    ) {
      this.quarantine('invalid_lease_time');
      return false;
    }
    this.lastClock = now;
    return true;
  }

  private assertBoundLease(
    lease: CalendarPilotSyntheticLease,
    sourceBinding: string
  ): void {
    this.assertCurrentLease(lease);
    if (
      this.sourceBinding === undefined ||
      sourceBinding !== this.sourceBinding
    )
      throw new CalendarPilotLeaseLostError();
  }

  private applyRenewal(
    lease: CalendarPilotSyntheticLease,
    sourceBinding: string,
    expiresAtMillis: number
  ): void {
    this.assertBoundLease(lease, sourceBinding);
    if (
      !Number.isFinite(expiresAtMillis) ||
      expiresAtMillis <= this.leaseExpiresAtMillis ||
      expiresAtMillis > this.expiresAtMillis
    )
      throw new Error('Synthetic Calendar renewal deadline is invalid.');
    this.leaseExpiresAtMillis = expiresAtMillis;
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
