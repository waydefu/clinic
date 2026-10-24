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
  it('drains before activating a successor', async () => {
    const coordinator = new CalendarPilotSyntheticLeaseCoordinator('worker_a');
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

  it('waits for the in-flight stub to settle', async () => {
    const coordinator = new CalendarPilotSyntheticLeaseCoordinator('worker_a');
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
    const coordinator = new CalendarPilotSyntheticLeaseCoordinator('worker_a');
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
    const coordinator = new CalendarPilotSyntheticLeaseCoordinator('worker_a');
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
    const first = new CalendarPilotSyntheticLeaseCoordinator('worker_a');
    const second = new CalendarPilotSyntheticLeaseCoordinator('worker_a');
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
    const coordinator = new CalendarPilotSyntheticLeaseCoordinator('worker_a');
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
    'unverifiable_isolation'
  ] as const)('keeps %s quarantined', async (reason) => {
    const coordinator = new CalendarPilotSyntheticLeaseCoordinator('worker_a');
    const admission = coordinator.admit(coordinator.currentLease, 'uncertain');
    const completion = deferred<void>();
    const dispatch = coordinator.dispatch(admission, () => completion.promise);
    coordinator.quarantine(reason);
    expect(coordinator.snapshot().inFlight).toBe(1);
    completion.resolve();
    await dispatch;
    expect(coordinator.snapshot()).toMatchObject({
      phase: 'quarantined',
      inFlight: 0,
      quarantineReason: reason
    });
    expect(() => coordinator.commit()).toThrow();
    expect(() => coordinator.activate()).toThrow();
  });

  it('settles a failed stub without starting it twice', async () => {
    const coordinator = new CalendarPilotSyntheticLeaseCoordinator('worker_a');
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
});
