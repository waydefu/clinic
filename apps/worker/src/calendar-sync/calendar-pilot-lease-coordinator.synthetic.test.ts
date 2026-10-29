import { describe, expect, it, vi } from 'vitest';

import { CalendarPilotLeaseLostError } from './calendar-pilot-worker-lease.js';
import { CalendarPilotSyntheticLeaseCoordinator } from './calendar-pilot-lease-coordinator.synthetic.js';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('synthetic Calendar lease coordination model', () => {
  it('returns a synthetic result before hard expiry', async () => {
    const coordinator = new CalendarPilotSyntheticLeaseCoordinator(
      'worker_a',
      0,
      10,
      () => 9
    );
    const admission = coordinator.admit(
      coordinator.currentLease,
      'before_expiry'
    );
    await expect(
      coordinator.dispatch(admission, () => 'receipt')
    ).resolves.toBe('receipt');
    expect(coordinator.snapshot().syntheticDispatchStarts).toBe(1);
  });

  it.each([10, 11])('rejects new admissions at time %s', (now) => {
    const coordinator = new CalendarPilotSyntheticLeaseCoordinator(
      'worker_a',
      0,
      10,
      () => now
    );
    expect(() =>
      coordinator.admit(coordinator.currentLease, 'expired')
    ).toThrow(CalendarPilotLeaseLostError);
    expect(coordinator.snapshot()).toMatchObject({
      phase: 'quarantined',
      syntheticDispatchStarts: 0
    });
  });

  it.each([10, 11])(
    'never starts an admitted stub at time %s',
    async (expiredAt) => {
      let now = 0;
      const coordinator = new CalendarPilotSyntheticLeaseCoordinator(
        'worker_a',
        0,
        10,
        () => now
      );
      const admission = coordinator.admit(coordinator.currentLease, 'delayed');
      const stub = vi.fn(() => 'receipt');
      now = expiredAt;
      await expect(coordinator.dispatch(admission, stub)).rejects.toThrow(
        CalendarPilotLeaseLostError
      );
      expect(stub).not.toHaveBeenCalled();
      expect(coordinator.snapshot()).toMatchObject({
        phase: 'quarantined',
        pendingAdmissions: 0,
        syntheticDispatchStarts: 0
      });
    }
  );

  it('does not return success when a started stub settles at expiry', async () => {
    let now = 0;
    const coordinator = new CalendarPilotSyntheticLeaseCoordinator(
      'worker_a',
      0,
      10,
      () => now
    );
    const admission = coordinator.admit(coordinator.currentLease, 'in_flight');
    const completion = deferred<string>();
    const dispatch = coordinator.dispatch(admission, () => completion.promise);
    now = 10;
    completion.resolve('receipt');
    await expect(dispatch).rejects.toThrow(CalendarPilotLeaseLostError);
    expect(coordinator.snapshot()).toMatchObject({
      phase: 'quarantined',
      inFlight: 0,
      syntheticDispatchStarts: 1
    });
    now = 0;
    expect(() =>
      coordinator.admit(coordinator.currentLease, 'clock_rollback')
    ).toThrow();
  });

  it.each(['throws', 'NaN', 'Infinity', '-Infinity', 'regresses'] as const)(
    'quarantines an invalid clock when a started stub settles: %s',
    async (mode) => {
      let fail = false;
      const coordinator = new CalendarPilotSyntheticLeaseCoordinator(
        'worker_a',
        0,
        10,
        () => {
          if (!fail) return 2;
          if (mode === 'throws') throw new Error('synthetic_clock_failure');
          if (mode === 'regresses') return 1;
          return Number(mode);
        }
      );
      const inFlight = coordinator.admit(
        coordinator.currentLease,
        'settling_in_flight'
      );
      const pending = coordinator.admit(
        coordinator.currentLease,
        'still_pending'
      );
      const completion = deferred<string>();
      const stub = vi.fn(() => completion.promise);
      const dispatch = coordinator.dispatch(inFlight, stub);
      expect(stub).toHaveBeenCalledTimes(1);
      expect(coordinator.snapshot()).toMatchObject({
        pendingAdmissions: 2,
        inFlight: 1,
        syntheticDispatchStarts: 1
      });

      fail = true;
      completion.resolve('receipt');
      await expect(dispatch).rejects.toThrow(CalendarPilotLeaseLostError);
      expect(stub).toHaveBeenCalledTimes(1);
      expect(coordinator.snapshot()).toMatchObject({
        phase: 'quarantined',
        quarantineReason: 'invalid_lease_time',
        pendingAdmissions: 1,
        inFlight: 0,
        syntheticDispatchStarts: 1,
        lease: { generation: 0 }
      });

      fail = false;
      const pendingStub = vi.fn();
      await expect(coordinator.dispatch(pending, pendingStub)).rejects.toThrow(
        CalendarPilotLeaseLostError
      );
      expect(pendingStub).not.toHaveBeenCalled();
      expect(coordinator.snapshot()).toMatchObject({
        phase: 'quarantined',
        pendingAdmissions: 0,
        inFlight: 0,
        syntheticDispatchStarts: 1
      });
      expect(() => coordinator.commit()).toThrow();
      expect(() => coordinator.activate()).toThrow();
      expect(() =>
        coordinator.admit(coordinator.currentLease, 'after_clock_recovery')
      ).toThrow();
    }
  );

  it('fails closed when its supplied clock regresses', async () => {
    let now = 2;
    const coordinator = new CalendarPilotSyntheticLeaseCoordinator(
      'worker_a',
      0,
      10,
      () => now
    );
    const admission = coordinator.admit(
      coordinator.currentLease,
      'clock_regression'
    );
    const stub = vi.fn();
    now = 1;
    await expect(coordinator.dispatch(admission, stub)).rejects.toThrow(
      CalendarPilotLeaseLostError
    );
    expect(stub).not.toHaveBeenCalled();
    expect(coordinator.snapshot().phase).toBe('quarantined');
  });

  it.each([NaN, Infinity, -Infinity])(
    'rejects non-finite clock time %s',
    (now) => {
      const coordinator = new CalendarPilotSyntheticLeaseCoordinator(
        'worker_a',
        0,
        10,
        () => now
      );
      expect(() =>
        coordinator.admit(coordinator.currentLease, 'invalid_clock')
      ).toThrow(CalendarPilotLeaseLostError);
      expect(coordinator.snapshot().syntheticDispatchStarts).toBe(0);
    }
  );

  it('quarantines a supplied clock failure without starting a stub', () => {
    const coordinator = new CalendarPilotSyntheticLeaseCoordinator(
      'worker_a',
      0,
      10,
      () => {
        throw new Error('synthetic_clock_failure');
      }
    );
    expect(() =>
      coordinator.admit(coordinator.currentLease, 'failed_clock')
    ).toThrow(CalendarPilotLeaseLostError);
    expect(coordinator.snapshot()).toMatchObject({
      phase: 'quarantined',
      syntheticDispatchStarts: 0
    });
  });

  it.each([NaN, Infinity, -Infinity])(
    'rejects a non-finite deadline %s',
    (deadline) => {
      expect(
        () =>
          new CalendarPilotSyntheticLeaseCoordinator(
            'worker_a',
            0,
            deadline,
            () => 0
          )
      ).toThrow();
    }
  );

  it('refuses to begin a change at hard expiry', () => {
    const coordinator = new CalendarPilotSyntheticLeaseCoordinator(
      'worker_a',
      0,
      10,
      () => 10
    );
    expect(() => coordinator.beginChange('expired_change', 'worker_b')).toThrow(
      CalendarPilotLeaseLostError
    );
    expect(coordinator.snapshot()).toMatchObject({
      phase: 'quarantined',
      syntheticDispatchStarts: 0
    });
  });

  it('refuses commit after hard expiry without advancing the generation', () => {
    let now = 0;
    const coordinator = new CalendarPilotSyntheticLeaseCoordinator(
      'worker_a',
      0,
      10,
      () => now
    );
    coordinator.beginChange('expiry_before_commit', 'worker_b');
    now = 10;
    expect(() => coordinator.commit()).toThrow(CalendarPilotLeaseLostError);
    expect(coordinator.snapshot().lease.generation).toBe(0);
  });

  it('refuses successor activation after hard expiry', () => {
    let now = 0;
    const coordinator = new CalendarPilotSyntheticLeaseCoordinator(
      'worker_a',
      0,
      10,
      () => now
    );
    coordinator.beginChange('expiry_before_activation', 'worker_b');
    coordinator.commit();
    now = 10;
    expect(() => coordinator.activate()).toThrow(CalendarPilotLeaseLostError);
    expect(coordinator.snapshot().phase).toBe('quarantined');
  });

  it('drains before activating a successor', async () => {
    const coordinator = new CalendarPilotSyntheticLeaseCoordinator(
      'worker_a',
      0,
      10,
      () => 0
    );
    const oldLease = coordinator.currentLease;
    const delayed = coordinator.admit(oldLease, 'segment_delayed');

    coordinator.beginChange('intent_source_change', 'worker_b');
    expect(coordinator.snapshot()).toMatchObject({
      phase: 'draining',
      pendingAdmissions: 1,
      inFlight: 0,
      syntheticDispatchStarts: 0
    });
    expect(() => coordinator.admit(oldLease, 'segment_new')).toThrow(
      /admission is closed/u
    );

    let stubCalls = 0;
    await expect(
      coordinator.dispatch(delayed, () => {
        stubCalls += 1;
      })
    ).rejects.toBeInstanceOf(CalendarPilotLeaseLostError);
    expect(stubCalls).toBe(0);
    expect(coordinator.snapshot()).toMatchObject({
      phase: 'quiescent',
      pendingAdmissions: 0,
      syntheticDispatchStarts: 0
    });

    const successorLease = coordinator.commit();
    expect(successorLease).toMatchObject({
      owner: 'worker_b',
      generation: 1
    });
    expect(coordinator.snapshot().phase).toBe('committed');
    await expect(
      coordinator.dispatch(delayed, () => ++stubCalls)
    ).rejects.toThrow(CalendarPilotLeaseLostError);
    expect(stubCalls).toBe(0);
    expect(coordinator.activate()).toEqual(successorLease);

    expect(() => coordinator.admit(oldLease, 'segment_old_owner')).toThrow(
      CalendarPilotLeaseLostError
    );
    expect(() =>
      coordinator.admit(
        { ...successorLease, generation: 0 },
        'segment_old_generation'
      )
    ).toThrow(CalendarPilotLeaseLostError);
    expect(() =>
      coordinator.admit(
        { ...successorLease, owner: 'worker_a' },
        'segment_old_owner_token'
      )
    ).toThrow(CalendarPilotLeaseLostError);

    const successorAdmission = coordinator.admit(
      successorLease,
      'segment_successor'
    );
    await coordinator.dispatch(successorAdmission, () => {
      stubCalls += 1;
    });
    expect(stubCalls).toBe(1);
  });

  it('serializes two synthetic workers through one coordinator during handoff', async () => {
    const coordinator = new CalendarPilotSyntheticLeaseCoordinator(
      'worker_a',
      0,
      10,
      () => 0
    );
    const oldLease = coordinator.currentLease;
    const workerAInFlight = coordinator.admit(oldLease, 'worker_a_in_flight');
    const workerAPending = coordinator.admit(oldLease, 'worker_a_pending');
    const workerACompletion = deferred<string>();
    const workerAStub = vi.fn(() => workerACompletion.promise);
    const workerADispatch = coordinator.dispatch(workerAInFlight, workerAStub);

    expect(workerAStub).toHaveBeenCalledTimes(1);
    coordinator.beginChange('intent_two_workers', 'worker_b');

    const staleStub = vi.fn(() => 'stale_receipt');
    await expect(
      coordinator.dispatch(workerAPending, staleStub)
    ).rejects.toBeInstanceOf(CalendarPilotLeaseLostError);
    expect(staleStub).not.toHaveBeenCalled();
    expect(coordinator.snapshot()).toMatchObject({
      phase: 'draining',
      pendingAdmissions: 1,
      inFlight: 1,
      syntheticDispatchStarts: 1
    });
    expect(() => coordinator.commit()).toThrow(/before quiescence/u);
    expect(() => coordinator.activate()).toThrow(/before commit/u);

    workerACompletion.resolve('worker_a_receipt');
    await expect(workerADispatch).resolves.toBe('worker_a_receipt');
    expect(coordinator.snapshot()).toMatchObject({
      phase: 'quiescent',
      pendingAdmissions: 0,
      inFlight: 0,
      syntheticDispatchStarts: 1
    });

    const successorLease = coordinator.commit();
    expect(successorLease).toMatchObject({ owner: 'worker_b', generation: 1 });
    expect(successorLease.token).not.toBe(oldLease.token);
    expect(coordinator.activate()).toEqual(successorLease);

    const workerBAdmission = coordinator.admit(
      successorLease,
      'worker_b_in_flight'
    );
    const workerBCompletion = deferred<string>();
    const workerBStub = vi.fn(() => workerBCompletion.promise);
    const workerBDispatch = coordinator.dispatch(workerBAdmission, workerBStub);
    expect(workerBStub).toHaveBeenCalledTimes(1);

    await expect(
      coordinator.dispatch(workerAPending, staleStub)
    ).rejects.toBeInstanceOf(CalendarPilotLeaseLostError);
    await expect(
      coordinator.dispatch(workerAInFlight, workerAStub)
    ).rejects.toBeInstanceOf(CalendarPilotLeaseLostError);
    expect(() => coordinator.admit(oldLease, 'worker_a_after_handoff')).toThrow(
      CalendarPilotLeaseLostError
    );
    expect(coordinator.snapshot()).toMatchObject({
      phase: 'active',
      pendingAdmissions: 1,
      inFlight: 1,
      syntheticDispatchStarts: 2
    });
    expect(coordinator.currentLease).toMatchObject({
      owner: 'worker_b',
      generation: 1
    });
    expect(workerAStub).toHaveBeenCalledTimes(1);
    expect(staleStub).not.toHaveBeenCalled();
    expect(workerBStub).toHaveBeenCalledTimes(1);

    workerBCompletion.resolve('worker_b_receipt');
    await expect(workerBDispatch).resolves.toBe('worker_b_receipt');
    expect(coordinator.snapshot()).toMatchObject({
      pendingAdmissions: 0,
      inFlight: 0,
      syntheticDispatchStarts: 2
    });
    await expect(
      coordinator.dispatch(workerBAdmission, workerBStub)
    ).rejects.toThrow(/already consumed/u);
    expect(coordinator.snapshot()).toMatchObject({
      pendingAdmissions: 0,
      inFlight: 0,
      syntheticDispatchStarts: 2
    });
    expect(workerAStub).toHaveBeenCalledTimes(1);
    expect(staleStub).not.toHaveBeenCalled();
    expect(workerBStub).toHaveBeenCalledTimes(1);
  });

  it('waits for the in-flight stub to settle', async () => {
    const coordinator = new CalendarPilotSyntheticLeaseCoordinator(
      'worker_a',
      0,
      10,
      () => 0
    );
    const lease = coordinator.currentLease;
    const admission = coordinator.admit(lease, 'segment_in_flight');
    const completion = deferred<void>();
    const stub = vi.fn(() => completion.promise);
    const dispatch = coordinator.dispatch(admission, stub);

    expect(stub).toHaveBeenCalledTimes(1);
    coordinator.beginChange('intent_wait_for_settle', 'worker_b');
    expect(coordinator.snapshot()).toMatchObject({
      phase: 'draining',
      pendingAdmissions: 1,
      inFlight: 1,
      syntheticDispatchStarts: 1
    });
    expect(() => coordinator.commit()).toThrow(/before quiescence/u);

    completion.resolve();
    await dispatch;
    expect(coordinator.snapshot()).toMatchObject({
      phase: 'quiescent',
      pendingAdmissions: 0,
      inFlight: 0,
      syntheticDispatchStarts: 1
    });
    expect(coordinator.commit()).toMatchObject({
      owner: 'worker_b',
      generation: 1
    });
  });

  it('quarantines unknown in-flight state without proof', () => {
    const coordinator = new CalendarPilotSyntheticLeaseCoordinator(
      'worker_a',
      0,
      10,
      () => 0
    );
    const lease = coordinator.currentLease;
    const admission = coordinator.admit(lease, 'segment_uncertain');
    coordinator.beginChange('intent_unknown_state', 'worker_b');
    coordinator.quarantine('unknown_in_flight');

    expect(coordinator.snapshot()).toMatchObject({
      phase: 'quarantined',
      pendingAdmissions: 1,
      quarantineReason: 'unknown_in_flight'
    });
    expect(() => coordinator.commit()).toThrow(/before quiescence/u);
    expect(() => coordinator.activate()).toThrow(/before commit/u);
    expect(() => coordinator.admit(lease, 'segment_after_quarantine')).toThrow(
      /admission is closed/u
    );

    coordinator.releaseUndispatched(admission);
    expect(coordinator.snapshot()).toMatchObject({
      phase: 'quarantined',
      pendingAdmissions: 0,
      lease: { owner: 'worker_a', generation: 0 }
    });
    expect(() => coordinator.commit()).toThrow(/before quiescence/u);
  });

  it('rejects release and completed dispatch replay', async () => {
    const coordinator = new CalendarPilotSyntheticLeaseCoordinator(
      'worker_a',
      0,
      10,
      () => 0
    );
    const lease = coordinator.currentLease;
    const released = coordinator.admit(lease, 'segment_released');
    coordinator.releaseUndispatched(released);
    expect(() => coordinator.releaseUndispatched(released)).toThrow(
      /already settled/u
    );

    const completed = coordinator.admit(lease, 'segment_completed');
    const stub = vi.fn(() => 'settled');
    const firstDispatch = coordinator.dispatch(completed, stub);
    await expect(firstDispatch).resolves.toBe('settled');
    expect(stub).toHaveBeenCalledTimes(1);
    await expect(coordinator.dispatch(completed, stub)).rejects.toThrow(
      /already consumed/u
    );
    expect(() =>
      coordinator.admit(
        { ...lease, token: 'synthetic-token-replayed' },
        'segment_token_replay'
      )
    ).toThrow(CalendarPilotLeaseLostError);
    expect(stub).toHaveBeenCalledTimes(1);
  });

  it('rejects cloned and foreign authority handles', async () => {
    const first = new CalendarPilotSyntheticLeaseCoordinator(
      'worker_a',
      0,
      10,
      () => 0
    );
    const second = new CalendarPilotSyntheticLeaseCoordinator(
      'worker_a',
      0,
      10,
      () => 0
    );
    const lease = first.currentLease;
    expect(second.currentLease).toEqual(lease);
    expect(() => first.admit(second.currentLease, 'cross_instance')).toThrow(
      CalendarPilotLeaseLostError
    );
    expect(() => first.admit({ ...lease }, 'copied_lease')).toThrow(
      CalendarPilotLeaseLostError
    );
    const admission = first.admit(lease, 'original_handle');
    const stub = vi.fn();
    await expect(first.dispatch({ ...admission }, stub)).rejects.toThrow(
      CalendarPilotLeaseLostError
    );
    expect(() => first.releaseUndispatched({ ...admission })).toThrow(
      CalendarPilotLeaseLostError
    );
    expect(stub).not.toHaveBeenCalled();
    expect(first.snapshot().pendingAdmissions).toBe(1);
    first.beginChange('wait_for_original', 'worker_b');
    expect(() => first.commit()).toThrow(/before quiescence/u);
    first.releaseUndispatched(admission);
    expect(first.commit().owner).toBe('worker_b');
  });

  it('never mistakes replay for quiescence', async () => {
    const coordinator = new CalendarPilotSyntheticLeaseCoordinator(
      'worker_a',
      0,
      10,
      () => 0
    );
    const admission = coordinator.admit(coordinator.currentLease, 'pending');
    const completion = deferred<void>();
    const stub = vi.fn(() => completion.promise);
    const dispatch = coordinator.dispatch(admission, stub);
    expect(() => coordinator.releaseUndispatched(admission)).toThrow();
    await expect(coordinator.dispatch(admission, stub)).rejects.toThrow();
    coordinator.beginChange('real_settlement_required', 'worker_b');
    expect(() => coordinator.commit()).toThrow();
    expect(coordinator.snapshot().inFlight).toBe(1);
    expect(stub).toHaveBeenCalledTimes(1);
    completion.resolve();
    await dispatch;
    expect(coordinator.snapshot().phase).toBe('quiescent');
  });

  it.each([
    'unknown_worker',
    'unknown_in_flight',
    'unverifiable_isolation',
    'invalid_lease_time'
  ] as const)('keeps %s quarantined', async (reason) => {
    const coordinator = new CalendarPilotSyntheticLeaseCoordinator(
      'worker_a',
      0,
      10,
      () => 0
    );
    const admission = coordinator.admit(coordinator.currentLease, 'uncertain');
    const completion = deferred<void>();
    const dispatch = coordinator.dispatch(admission, () => completion.promise);
    coordinator.quarantine(reason);
    expect(coordinator.snapshot().inFlight).toBe(1);
    completion.resolve();
    await expect(dispatch).rejects.toThrow(CalendarPilotLeaseLostError);
    expect(coordinator.snapshot()).toMatchObject({
      phase: 'quarantined',
      inFlight: 0,
      quarantineReason: reason
    });
    expect(() => coordinator.commit()).toThrow();
    expect(() => coordinator.activate()).toThrow();
  });

  it('settles a failed stub without starting it twice', async () => {
    const coordinator = new CalendarPilotSyntheticLeaseCoordinator(
      'worker_a',
      0,
      10,
      () => 0
    );
    const admission = coordinator.admit(coordinator.currentLease, 'failed');
    const stub = vi.fn(() => {
      coordinator.beginChange('drain_failed_stub', 'worker_b');
      throw new Error('synthetic_failure');
    });
    await expect(coordinator.dispatch(admission, stub)).rejects.toThrow(
      'synthetic_failure'
    );
    expect(stub).toHaveBeenCalledTimes(1);
    expect(coordinator.snapshot()).toMatchObject({
      phase: 'quiescent',
      pendingAdmissions: 0,
      inFlight: 0
    });
    coordinator.commit();
    await expect(coordinator.dispatch(admission, stub)).rejects.toThrow();
    expect(stub).toHaveBeenCalledTimes(1);
  });

  it('renews a bound lease without changing its handle or existing admission', async () => {
    let now = 1;
    const binding = 'a'.repeat(64);
    const coordinator = new CalendarPilotSyntheticLeaseCoordinator(
      'worker_a',
      0,
      10,
      () => now,
      { sourceBinding: binding, expiresAtMillis: 5 }
    );
    const lease = coordinator.currentLease;
    const admission = coordinator.admit(lease, 'before_renewal', binding);
    expect(admission.sourceBinding).toBe(binding);
    expect(coordinator.renew(lease, binding, 8)).toBe(lease);

    now = 6;
    const stub = vi.fn(() => 'receipt');
    await expect(coordinator.dispatch(admission, stub)).resolves.toBe(
      'receipt'
    );
    expect(stub).toHaveBeenCalledTimes(1);
    expect(coordinator.currentLease).toBe(lease);
    expect(coordinator.renew(lease, binding, 10)).toBe(lease);

    now = 10;
    expect(() => coordinator.admit(lease, 'at_hard_expiry', binding)).toThrow(
      CalendarPilotLeaseLostError
    );
    expect(coordinator.snapshot()).toMatchObject({
      phase: 'quarantined',
      leaseExpiresAtMillis: 10,
      sourceBinding: binding,
      quarantineReason: 'invalid_lease_time',
      syntheticDispatchStarts: 1
    });
    expect(coordinator.currentLease).toBe(lease);

    let renewNow = 1;
    const renewCoordinator = new CalendarPilotSyntheticLeaseCoordinator(
      'worker_a',
      0,
      10,
      () => renewNow,
      { sourceBinding: binding, expiresAtMillis: 5 }
    );
    const renewLease = renewCoordinator.currentLease;
    expect(renewCoordinator.renew(renewLease, binding, 10)).toBe(renewLease);
    renewNow = 10;
    expect(() => renewCoordinator.renew(renewLease, binding, 10)).toThrow(
      CalendarPilotLeaseLostError
    );
    expect(renewCoordinator.snapshot()).toMatchObject({
      phase: 'quarantined',
      leaseExpiresAtMillis: 10,
      quarantineReason: 'invalid_lease_time',
      syntheticDispatchStarts: 0
    });
  });

  it('rejects missing or mismatched source bindings without changing state', () => {
    const binding = 'a'.repeat(64);
    const otherBinding = 'b'.repeat(64);
    const coordinator = new CalendarPilotSyntheticLeaseCoordinator(
      'worker_a',
      0,
      10,
      () => 1,
      { sourceBinding: binding, expiresAtMillis: 5 }
    );
    const lease = coordinator.currentLease;

    expect(() => coordinator.admit(lease, 'missing_binding')).toThrow(
      CalendarPilotLeaseLostError
    );
    expect(() =>
      coordinator.admit(lease, 'other_binding', otherBinding)
    ).toThrow(CalendarPilotLeaseLostError);
    expect(() => coordinator.renew(lease, otherBinding, 8)).toThrow(
      CalendarPilotLeaseLostError
    );
    expect(coordinator.snapshot()).toMatchObject({
      phase: 'active',
      leaseExpiresAtMillis: 5,
      sourceBinding: binding,
      pendingAdmissions: 0,
      syntheticDispatchStarts: 0
    });
  });

  it('does not bind an existing unbound coordinator through renewal', () => {
    const coordinator = new CalendarPilotSyntheticLeaseCoordinator(
      'worker_a',
      0,
      10,
      () => 1
    );
    const lease = coordinator.currentLease;

    expect(() => coordinator.renew(lease, 'a'.repeat(64), 8)).toThrow(
      CalendarPilotLeaseLostError
    );
    expect(coordinator.snapshot()).toMatchObject({
      phase: 'active',
      leaseExpiresAtMillis: 10
    });
    expect(coordinator.snapshot()).not.toHaveProperty('sourceBinding');
  });

  it.each(['cloned', 'stale'])('rejects renewing a %s lease handle', (kind) => {
    const binding = 'a'.repeat(64);
    const coordinator = new CalendarPilotSyntheticLeaseCoordinator(
      'worker_a',
      0,
      10,
      () => 1,
      { sourceBinding: binding, expiresAtMillis: 5 }
    );
    const lease = coordinator.currentLease;
    const handle = kind === 'cloned' ? { ...lease } : lease;

    if (kind === 'stale') {
      coordinator.beginChange('renew_handle', 'worker_b');
      coordinator.commit();
      coordinator.activate();
    }
    const deadlineBeforeRenewal = coordinator.snapshot().leaseExpiresAtMillis;

    expect(() => coordinator.renew(handle, binding, 8)).toThrow(
      CalendarPilotLeaseLostError
    );
    expect(coordinator.snapshot()).toMatchObject({
      phase: 'active',
      lease: { owner: kind === 'stale' ? 'worker_b' : 'worker_a' },
      leaseExpiresAtMillis: deadlineBeforeRenewal,
      syntheticDispatchStarts: 0
    });
  });

  it.each([NaN, Infinity, -Infinity, 5, 4, 11])(
    'rejects renewal deadline %s without changing state',
    (newDeadline) => {
      const binding = 'a'.repeat(64);
      const coordinator = new CalendarPilotSyntheticLeaseCoordinator(
        'worker_a',
        0,
        10,
        () => 1,
        { sourceBinding: binding, expiresAtMillis: 5 }
      );
      const lease = coordinator.currentLease;
      coordinator.admit(lease, 'pending', binding);

      expect(() => coordinator.renew(lease, binding, newDeadline)).toThrow(
        Error
      );
      expect(coordinator.snapshot()).toMatchObject({
        phase: 'active',
        leaseExpiresAtMillis: 5,
        sourceBinding: binding,
        pendingAdmissions: 1,
        inFlight: 0,
        syntheticDispatchStarts: 0
      });
    }
  );

  it.each([
    { sourceBinding: '', expiresAtMillis: 5 },
    { sourceBinding: 'a'.repeat(64), expiresAtMillis: NaN },
    { sourceBinding: 'a'.repeat(64), expiresAtMillis: 11 }
  ])('rejects invalid initial binding options %o', (options) => {
    expect(
      () =>
        new CalendarPilotSyntheticLeaseCoordinator(
          'worker_a',
          0,
          10,
          () => 1,
          options
        )
    ).toThrow(Error);
  });

  it('does not revive a worker lease at its expiry time', () => {
    let now = 1;
    const binding = 'a'.repeat(64);
    const coordinator = new CalendarPilotSyntheticLeaseCoordinator(
      'worker_a',
      0,
      10,
      () => now,
      { sourceBinding: binding, expiresAtMillis: 5 }
    );
    const lease = coordinator.currentLease;
    now = 5;

    expect(() => coordinator.renew(lease, binding, 8)).toThrow(
      CalendarPilotLeaseLostError
    );
    expect(coordinator.snapshot()).toMatchObject({
      phase: 'quarantined',
      leaseExpiresAtMillis: 5,
      syntheticDispatchStarts: 0
    });
  });

  it.each(['draining', 'quarantined'] as const)(
    'does not renew a %s coordinator or unlock its admissions',
    (phase) => {
      const binding = 'a'.repeat(64);
      const coordinator = new CalendarPilotSyntheticLeaseCoordinator(
        'worker_a',
        0,
        10,
        () => 1,
        { sourceBinding: binding, expiresAtMillis: 5 }
      );
      const lease = coordinator.currentLease;
      coordinator.admit(lease, 'pending', binding);
      if (phase === 'draining') {
        coordinator.beginChange('renew_closed_phase', 'worker_b');
      } else {
        coordinator.quarantine('unknown_worker');
      }

      expect(() => coordinator.renew(lease, binding, 8)).toThrow(Error);
      expect(coordinator.snapshot()).toMatchObject({
        phase,
        leaseExpiresAtMillis: 5,
        sourceBinding: binding,
        pendingAdmissions: 1,
        syntheticDispatchStarts: 0
      });
    }
  );

  it('keeps an in-flight dispatch within the old lease while renewal is pending', async () => {
    let now = 1;
    const binding = 'a'.repeat(64);
    const coordinator = new CalendarPilotSyntheticLeaseCoordinator(
      'worker_a',
      0,
      10,
      () => now,
      { sourceBinding: binding, expiresAtMillis: 5 }
    );
    const lease = coordinator.currentLease;
    const inFlight = coordinator.admit(lease, 'in_flight', binding);
    const queued = coordinator.admit(lease, 'queued', binding);
    const normalFlight = deferred<string>();
    const normalStub = vi.fn(() => normalFlight.promise);
    const receipt = coordinator.dispatch(inFlight, normalStub);
    const ack = deferred<
      typeof lease & { sourceBinding: string; expiresAtMillis: number }
    >();
    const renewalCallback = vi.fn(() => ack.promise);
    const renewal = coordinator.renewWith(lease, binding, renewalCallback);

    expect(renewalCallback).toHaveBeenCalledTimes(1);
    expect(coordinator.snapshot()).toMatchObject({
      phase: 'renewing',
      leaseExpiresAtMillis: 5,
      pendingAdmissions: 2,
      inFlight: 1,
      syntheticDispatchStarts: 1
    });
    expect(() => coordinator.admit(lease, 'blocked', binding)).toThrow();
    expect(() => coordinator.renew(lease, binding, 8)).toThrow();
    const duplicateCallback = vi.fn(() =>
      Promise.resolve({
        ...lease,
        sourceBinding: binding,
        expiresAtMillis: 9
      })
    );
    await expect(
      coordinator.renewWith(lease, binding, duplicateCallback)
    ).rejects.toThrow();
    expect(duplicateCallback).not.toHaveBeenCalled();
    expect(() => coordinator.beginChange('blocked', 'worker_b')).toThrow();
    expect(() => coordinator.commit()).toThrow();
    expect(() => coordinator.activate()).toThrow();
    const queuedStub = vi.fn(() => 'queued');
    await expect(coordinator.dispatch(queued, queuedStub)).rejects.toThrow(
      CalendarPilotLeaseLostError
    );
    expect(queuedStub).not.toHaveBeenCalled();

    normalFlight.resolve('in-flight receipt');
    await expect(receipt).resolves.toBe('in-flight receipt');
    expect(coordinator.snapshot()).toMatchObject({
      phase: 'renewing',
      pendingAdmissions: 0,
      inFlight: 0,
      syntheticDispatchStarts: 1
    });

    now = 2;
    ack.resolve({ ...lease, sourceBinding: binding, expiresAtMillis: 8 });
    await expect(renewal).resolves.toBe(lease);
    expect(coordinator.snapshot()).toMatchObject({
      phase: 'active',
      leaseExpiresAtMillis: 8,
      sourceBinding: binding
    });
    now = 6;
    const later = coordinator.admit(lease, 'after_renewal', binding);
    await expect(
      coordinator.dispatch(later, () => 'later receipt')
    ).resolves.toBe('later receipt');
    await expect(coordinator.dispatch(queued, queuedStub)).rejects.toThrow(
      'Synthetic Calendar admission was already consumed.'
    );
    expect(queuedStub).not.toHaveBeenCalled();
    expect(coordinator.snapshot()).toMatchObject({
      syntheticDispatchStarts: 2,
      pendingAdmissions: 0,
      inFlight: 0
    });
  });

  it.each([
    { sourceBinding: 'b'.repeat(64) },
    { owner: 'worker_b' },
    { generation: 1 },
    { token: 'not-issued' },
    { expiresAtMillis: Number.NaN },
    { expiresAtMillis: 11 }
  ])('quarantines an invalid renewal acknowledgement %#', async (override) => {
    const now = 1;
    const binding = 'a'.repeat(64);
    const coordinator = new CalendarPilotSyntheticLeaseCoordinator(
      'worker_a',
      0,
      10,
      () => now,
      { sourceBinding: binding, expiresAtMillis: 5 }
    );
    const lease = coordinator.currentLease;
    coordinator.admit(lease, 'retained', binding);
    const callback = vi.fn(() =>
      Promise.resolve({
        ...lease,
        sourceBinding: binding,
        expiresAtMillis: 8,
        ...override
      })
    );

    await expect(
      coordinator.renewWith(lease, binding, callback)
    ).rejects.toThrow();
    expect(callback).toHaveBeenCalledTimes(1);
    expect(coordinator.snapshot()).toMatchObject({
      phase: 'quarantined',
      leaseExpiresAtMillis: 5,
      sourceBinding: binding,
      pendingAdmissions: 1,
      inFlight: 0,
      syntheticDispatchStarts: 0,
      lease
    });
    expect(coordinator.currentLease).toBe(lease);
  });

  it('does not accept a renewal acknowledgement at the old deadline', async () => {
    let now = 1;
    const binding = 'a'.repeat(64);
    const coordinator = new CalendarPilotSyntheticLeaseCoordinator(
      'worker_a',
      0,
      10,
      () => now,
      { sourceBinding: binding, expiresAtMillis: 5 }
    );
    const lease = coordinator.currentLease;
    coordinator.admit(lease, 'retained', binding);
    const ack = deferred<
      typeof lease & { sourceBinding: string; expiresAtMillis: number }
    >();
    const renewal = coordinator.renewWith(lease, binding, () => ack.promise);

    now = 5;
    ack.resolve({ ...lease, sourceBinding: binding, expiresAtMillis: 8 });
    await expect(renewal).rejects.toThrow(CalendarPilotLeaseLostError);
    expect(coordinator.snapshot()).toMatchObject({
      phase: 'quarantined',
      quarantineReason: 'invalid_lease_time',
      leaseExpiresAtMillis: 5,
      sourceBinding: binding,
      pendingAdmissions: 1,
      syntheticDispatchStarts: 0,
      lease
    });
  });

  it('keeps callback failure quarantined without clearing retained admissions', async () => {
    const now = 1;
    const binding = 'a'.repeat(64);
    const coordinator = new CalendarPilotSyntheticLeaseCoordinator(
      'worker_a',
      0,
      10,
      () => now,
      { sourceBinding: binding, expiresAtMillis: 5 }
    );
    const lease = coordinator.currentLease;
    coordinator.admit(lease, 'retained', binding);
    const lostReplyError = new Error('synthetic reply unavailable');
    const callback = deferred<
      typeof lease & { sourceBinding: string; expiresAtMillis: number }
    >();
    const renewal = coordinator.renewWith(
      lease,
      binding,
      () => callback.promise
    );
    callback.resolve(Promise.reject(lostReplyError));

    await expect(renewal).rejects.toBe(lostReplyError);
    expect(coordinator.snapshot()).toMatchObject({
      phase: 'quarantined',
      quarantineReason: 'unknown_worker',
      leaseExpiresAtMillis: 5,
      sourceBinding: binding,
      pendingAdmissions: 1,
      syntheticDispatchStarts: 0,
      lease
    });
    const laterCallback = vi.fn(() =>
      Promise.resolve({
        ...lease,
        sourceBinding: binding,
        expiresAtMillis: 8
      })
    );
    await expect(
      coordinator.renewWith(lease, binding, laterCallback)
    ).rejects.toThrow();
    expect(laterCallback).not.toHaveBeenCalled();
  });

  it('keeps explicit quarantine sticky when a pending renewal later acknowledges', async () => {
    const now = 1;
    const binding = 'a'.repeat(64);
    const coordinator = new CalendarPilotSyntheticLeaseCoordinator(
      'worker_a',
      0,
      10,
      () => now,
      { sourceBinding: binding, expiresAtMillis: 5 }
    );
    const lease = coordinator.currentLease;
    coordinator.admit(lease, 'retained', binding);
    const ack = deferred<
      typeof lease & { sourceBinding: string; expiresAtMillis: number }
    >();
    const renewal = coordinator.renewWith(lease, binding, () => ack.promise);

    coordinator.quarantine('unknown_worker');
    ack.resolve({ ...lease, sourceBinding: binding, expiresAtMillis: 8 });
    await expect(renewal).rejects.toThrow(CalendarPilotLeaseLostError);
    expect(coordinator.snapshot()).toMatchObject({
      phase: 'quarantined',
      quarantineReason: 'unknown_worker',
      leaseExpiresAtMillis: 5,
      sourceBinding: binding,
      pendingAdmissions: 1,
      syntheticDispatchStarts: 0,
      lease
    });
    expect(coordinator.currentLease).toBe(lease);
  });

  it.each(['unbound', 'wrong_binding', 'cloned', 'stale'] as const)(
    'rejects renewal before callback for %s handles',
    async (kind) => {
      const now = 1;
      const binding = 'a'.repeat(64);
      const coordinator =
        kind === 'unbound'
          ? new CalendarPilotSyntheticLeaseCoordinator(
              'worker_a',
              0,
              10,
              () => now
            )
          : new CalendarPilotSyntheticLeaseCoordinator(
              'worker_a',
              0,
              10,
              () => now,
              { sourceBinding: binding, expiresAtMillis: 5 }
            );
      const lease = coordinator.currentLease;
      if (kind === 'stale') {
        coordinator.beginChange('change-1', 'worker_b');
        coordinator.commit();
        coordinator.activate();
      }
      const issuedLease = kind === 'cloned' ? { ...lease } : lease;
      const requestedBinding =
        kind === 'wrong_binding' ? 'b'.repeat(64) : binding;
      const callback = vi.fn(() =>
        Promise.resolve({
          ...lease,
          sourceBinding: binding,
          expiresAtMillis: 8
        })
      );

      await expect(
        coordinator.renewWith(issuedLease, requestedBinding, callback)
      ).rejects.toThrow(CalendarPilotLeaseLostError);
      expect(callback).not.toHaveBeenCalled();
      expect(coordinator.snapshot()).toMatchObject({
        phase: 'active',
        leaseExpiresAtMillis: kind === 'unbound' ? 10 : 5,
        ...(kind === 'unbound' ? {} : { sourceBinding: binding }),
        syntheticDispatchStarts: 0
      });
    }
  );

  it('copies initial binding options instead of retaining the caller object', () => {
    let now = 1;
    const binding = 'a'.repeat(64);
    const options = { sourceBinding: binding, expiresAtMillis: 5 };
    const coordinator = new CalendarPilotSyntheticLeaseCoordinator(
      'worker_a',
      0,
      10,
      () => now,
      options
    );
    options.sourceBinding = 'b'.repeat(64);
    options.expiresAtMillis = 9;

    expect(coordinator.snapshot()).toMatchObject({
      leaseExpiresAtMillis: 5,
      sourceBinding: binding
    });
    now = 6;
    expect(() =>
      coordinator.admit(
        coordinator.currentLease,
        'after_original_expiry',
        binding
      )
    ).toThrow(CalendarPilotLeaseLostError);
    expect(coordinator.snapshot()).toMatchObject({
      leaseExpiresAtMillis: 5,
      sourceBinding: binding,
      phase: 'quarantined'
    });
  });
});
