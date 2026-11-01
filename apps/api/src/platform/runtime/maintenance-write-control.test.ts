import { describe, expect, it, vi } from 'vitest';
import { ServiceUnavailableError } from '../errors/api-error.js';
import {
  ReadThroughMaintenanceGate,
  setMaintenanceControl,
  type MaintenanceControlPort
} from './maintenance-gate.js';

const expectGenericUnavailable = async (action: Promise<unknown>) => {
  const error = await action.then(
    () => undefined,
    (reason: unknown) => reason
  );
  expect(error).toBeInstanceOf(ServiceUnavailableError);
  expect(error).toMatchObject({
    message: new ServiceUnavailableError().message
  });
  expect((error as Error & { cause?: unknown }).cause).toBeUndefined();
};

describe('source-only shared maintenance write control', () => {
  it('updates two fake gates through one fresh-read boolean control', async () => {
    let underMaintenance = false;
    const control: MaintenanceControlPort = {
      read: vi.fn(() => Promise.resolve(underMaintenance)),
      write: vi.fn((value: boolean) => {
        underMaintenance = value;
        return Promise.resolve();
      })
    };
    const fakeApiGate = new ReadThroughMaintenanceGate(() => control.read());
    const fakeWorkerGate = new ReadThroughMaintenanceGate(() => control.read());

    await expect(fakeApiGate.assertAvailable()).resolves.toBeUndefined();
    await expect(fakeWorkerGate.assertAvailable()).resolves.toBeUndefined();
    await setMaintenanceControl(control, true);
    await expectGenericUnavailable(fakeApiGate.assertAvailable());
    await expectGenericUnavailable(fakeWorkerGate.assertAvailable());
    await setMaintenanceControl(control, false);
    await expect(fakeApiGate.assertAvailable()).resolves.toBeUndefined();
    await expect(fakeWorkerGate.assertAvailable()).resolves.toBeUndefined();

    expect(control.read).toHaveBeenCalledTimes(10);
    expect(control.write).toHaveBeenNthCalledWith(1, true);
    expect(control.write).toHaveBeenNthCalledWith(2, false);
  });

  it('rejects a non-boolean request without reading or writing', async () => {
    const control: MaintenanceControlPort = {
      read: vi.fn(() => Promise.resolve(false)),
      write: vi.fn(() => Promise.resolve())
    };

    await expectGenericUnavailable(
      setMaintenanceControl(control, 'true' as unknown as boolean)
    );
    expect(control.read).not.toHaveBeenCalled();
    expect(control.write).not.toHaveBeenCalled();
  });

  it.each(['unknown initial value', 'initial read failure'] as const)(
    'rejects an %s without writing',
    async (caseName) => {
      const read = vi.fn<MaintenanceControlPort['read']>();
      if (caseName === 'initial read failure') {
        read.mockRejectedValueOnce(new Error('synthetic source read failure'));
      } else {
        read.mockResolvedValueOnce(null);
      }
      const write = vi.fn<MaintenanceControlPort['write']>();

      await expectGenericUnavailable(
        setMaintenanceControl({ read, write }, true)
      );
      expect(read).toHaveBeenCalledTimes(1);
      expect(write).not.toHaveBeenCalled();
    }
  );

  it('maps a failed write to a generic error and does not roll it back', async () => {
    let underMaintenance = false;
    const sourceError = new Error('synthetic lost write reply');
    const control: MaintenanceControlPort = {
      read: vi.fn(() => Promise.resolve(underMaintenance)),
      write: vi.fn((value: boolean) => {
        underMaintenance = value;
        return Promise.reject(sourceError);
      })
    };

    await expectGenericUnavailable(setMaintenanceControl(control, true));
    expect(underMaintenance).toBe(true);
    expect(control.read).toHaveBeenCalledTimes(1);
    expect(control.write).toHaveBeenCalledTimes(1);
  });

  it.each([
    { result: 'unknown', value: null },
    { result: 'mismatch', value: false },
    { result: 'read failure', value: undefined }
  ])(
    'rejects a $result readback after one write',
    async ({ result, value }) => {
      const read = vi
        .fn<MaintenanceControlPort['read']>()
        .mockResolvedValueOnce(false);
      if (result === 'read failure') {
        read.mockRejectedValueOnce(new Error('synthetic readback failure'));
      } else {
        read.mockResolvedValueOnce(value);
      }
      const write = vi
        .fn<MaintenanceControlPort['write']>()
        .mockResolvedValue(undefined);

      await expectGenericUnavailable(
        setMaintenanceControl({ read, write }, true)
      );
      expect(read).toHaveBeenCalledTimes(2);
      expect(write).toHaveBeenCalledTimes(1);
    }
  );

  it('lets an in-flight fake job finish while pause rejects only a new claim', async () => {
    let underMaintenance = false;
    let inFlight = 0;
    let releaseJob!: () => void;
    let signalClaim!: () => void;
    const heldJob = new Promise<void>((resolve) => {
      releaseJob = resolve;
    });
    const claimed = new Promise<void>((resolve) => {
      signalClaim = resolve;
    });
    const control: MaintenanceControlPort = {
      read: vi.fn(() => Promise.resolve(underMaintenance)),
      write: vi.fn((value: boolean) => {
        underMaintenance = value;
        return Promise.resolve();
      })
    };
    const fakeGate = new ReadThroughMaintenanceGate(() => control.read());
    const fakeWorkerClaim = async () => {
      await fakeGate.assertAvailable();
      inFlight += 1;
      signalClaim();
      try {
        await heldJob;
      } finally {
        inFlight -= 1;
      }
    };

    const activeJob = fakeWorkerClaim();
    await claimed;
    expect(inFlight).toBe(1);
    await setMaintenanceControl(control, true);
    await expectGenericUnavailable(fakeWorkerClaim());
    expect(inFlight).toBe(1);
    releaseJob();
    await activeJob;
    expect(inFlight).toBe(0);
  });
});
