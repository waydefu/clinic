import { describe, expect, it, vi } from 'vitest';
import {
  SharedMaintenanceControl,
  isMaintenanceWriteAllowed
} from './maintenance-control.node.js';

const NOW = '2026-11-02T00:00:00Z';
const OPEN = {
  underMaintenance: false,
  expiresAtUtc: '2026-11-02T01:00:00Z'
};

const DENIED = [
  undefined,
  null,
  false,
  true,
  {},
  [],
  { ...OPEN, underMaintenance: true },
  { ...OPEN, expiresAtUtc: NOW },
  { ...OPEN, expiresAtUtc: '2026-11-01T23:59:59Z' },
  { ...OPEN, expiresAtUtc: '2026-11-02T09:00:00+08:00' },
  { ...OPEN, expiresAtUtc: '2026-02-30T00:00:00Z' },
  { underMaintenance: false }
];

describe('shared expiring maintenance control', () => {
  it('admits only an explicit unexpired open UTC snapshot', async () => {
    expect(isMaintenanceWriteAllowed(OPEN, NOW)).toBe(true);
    const control = new SharedMaintenanceControl(
      () => Promise.resolve(OPEN),
      () => NOW
    );
    const write = vi.fn(() => Promise.resolve('synthetic'));
    await expect(control.run(write)).resolves.toBe('synthetic');
    expect(write).toHaveBeenCalledOnce();
    expect(control.inFlightCallbacks).toBe(0);
  });

  it.each(DENIED.map((state) => [state]))(
    'fails closed for control %j',
    async (state: unknown) => {
      const control = new SharedMaintenanceControl(
        () => Promise.resolve(state),
        () => NOW
      );
      const write = vi.fn(() => Promise.resolve());
      await expect(control.run(write)).rejects.toThrow(/Maintenance/);
      expect(write).not.toHaveBeenCalled();
      expect(control.inFlightCallbacks).toBe(0);
    }
  );

  it('refuses an absent reader, failed read or invalid clock', async () => {
    const unreadable = () => Promise.reject(new Error('unreadable'));
    const cases = [
      new SharedMaintenanceControl(),
      new SharedMaintenanceControl(unreadable),
      new SharedMaintenanceControl(
        () => Promise.resolve(OPEN),
        () => 'not-utc'
      )
    ];
    for (const control of cases) {
      await expect(control.assertAvailable()).rejects.toThrow(/Maintenance/);
    }
  });

  it('rechecks expiry instead of caching an earlier open state', async () => {
    let now = NOW;
    const control = new SharedMaintenanceControl(
      () => Promise.resolve(OPEN),
      () => now
    );
    await expect(control.assertAvailable()).resolves.toBeUndefined();
    now = OPEN.expiresAtUtc;
    await expect(control.assertAvailable()).rejects.toThrow(/Maintenance/);
  });

  it('drains old work while refusing new admissions', async () => {
    let state: unknown = OPEN;
    const reader = () => Promise.resolve(state);
    const api = new SharedMaintenanceControl(reader, () => NOW);
    const worker = new SharedMaintenanceControl(reader, () => NOW);
    const started = Promise.withResolvers<void>();
    const finish = Promise.withResolvers<void>();
    const admitted = api.run(async () => {
      started.resolve();
      await finish.promise;
      return 'drained';
    });
    await started.promise;
    state = { ...OPEN, underMaintenance: true };
    const scheduledWrite = vi.fn(() => Promise.resolve());
    await expect(worker.run(scheduledWrite)).rejects.toThrow(/Maintenance/);
    expect(scheduledWrite).not.toHaveBeenCalled();
    expect(api.inFlightCallbacks).toBe(1);
    finish.resolve();
    await expect(admitted).resolves.toBe('drained');
    expect(api.inFlightCallbacks).toBe(0);
  });

  it('tracks unresolved admissions and makes release idempotent', async () => {
    const read = Promise.withResolvers<unknown>();
    const control = new SharedMaintenanceControl(() => read.promise, () => NOW);
    const admission = control.run(() => Promise.resolve());
    expect(control.inFlightCallbacks).toBe(1);
    read.resolve(undefined);
    await expect(admission).rejects.toThrow(/Maintenance/);
    expect(control.inFlightCallbacks).toBe(0);
    const release = control.track();
    release();
    release();
    expect(control.inFlightCallbacks).toBe(0);
  });
});
