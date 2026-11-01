import type { Firestore } from 'firebase-admin/firestore';
import { describe, expect, it, vi } from 'vitest';
import { SharedMaintenanceControl } from '@beauessence/domain/maintenance-control.node';
import { createInternalTestOutboxRuntime } from './internal-test-outbox-runtime.js';
import { OutboxProcessor } from './outbox-processor.js';

const NOW = '2026-11-02T00:00:00Z';
const OPEN = {
  underMaintenance: false,
  expiresAtUtc: '2026-11-02T01:00:00Z'
};

function database() {
  const collection = vi.fn(() => {
    throw new Error('Unexpected database access.');
  });
  return { collection, db: { collection } as unknown as Firestore };
}

describe('outbox runtime and scheduled drain maintenance boundary', () => {
  it('keeps the real runtime closed when no reader is wired', async () => {
    const { db, collection } = database();
    const runtime = createInternalTestOutboxRuntime({ db });
    await expect(runtime.run(NOW)).rejects.toThrow(/Maintenance/);
    await expect(runtime.calendarReady()).rejects.toThrow(/Maintenance/);
    expect(collection).not.toHaveBeenCalled();
    expect(runtime.maintenanceControl?.inFlightCallbacks).toBe(0);
  });

  it.each([
    { ...OPEN, underMaintenance: true },
    { ...OPEN, expiresAtUtc: NOW },
    undefined,
    false
  ])('denies a scheduled drain for control %j', async (state: unknown) => {
    const { db, collection } = database();
    const runtime = createInternalTestOutboxRuntime({
      db,
      maintenanceControl: new SharedMaintenanceControl(
        () => Promise.resolve(state),
        () => NOW
      )
    });
    await expect(runtime.run(NOW)).rejects.toThrow(/Maintenance/);
    expect(collection).not.toHaveBeenCalled();
  });

  it('holds admitted work until it settles and refuses the next scheduled run', async () => {
    const { db, collection } = database();
    let state: unknown = OPEN;
    const control = new SharedMaintenanceControl(
      () => Promise.resolve(state),
      () => NOW
    );
    const started = Promise.withResolvers<void>();
    const finish = Promise.withResolvers<never>();
    const process = vi
      .spyOn(OutboxProcessor.prototype, 'processDue')
      .mockImplementation(async () => {
        started.resolve();
        return finish.promise;
      });
    try {
      const runtime = createInternalTestOutboxRuntime({
        db,
        maintenanceControl: control
      });
      const admitted = runtime.run(NOW);
      await started.promise;
      state = { ...OPEN, underMaintenance: true };
      await expect(runtime.run(NOW)).rejects.toThrow(/Maintenance/);
      expect(process).toHaveBeenCalledOnce();
      expect(control.inFlightCallbacks).toBe(1);
      finish.reject(new Error('synthetic callback ended'));
      await expect(admitted).rejects.toThrow('synthetic callback ended');
      expect(control.inFlightCallbacks).toBe(0);
      expect(collection).not.toHaveBeenCalled();
    } finally {
      process.mockRestore();
    }
  });
});
