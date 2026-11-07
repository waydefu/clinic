import { describe, expect, it, vi } from 'vitest';
import { ServiceUnavailableError } from '../errors/api-error.js';
import { ReadThroughMaintenanceGate } from './maintenance-gate.js';

describe('read-through maintenance control (synthetic source model only)', () => {
  it('reads the same control afresh across separate gate instances', async () => {
    let underMaintenance = false;
    const readControl = vi.fn(() => Promise.resolve(underMaintenance));
    const first = new ReadThroughMaintenanceGate(readControl);
    const second = new ReadThroughMaintenanceGate(readControl);

    await expect(first.assertAvailable()).resolves.toBeUndefined();
    await expect(second.assertAvailable()).resolves.toBeUndefined();
    underMaintenance = true;
    await expect(first.assertAvailable()).rejects.toBeInstanceOf(
      ServiceUnavailableError
    );
    await expect(second.assertAvailable()).rejects.toBeInstanceOf(
      ServiceUnavailableError
    );
    expect(readControl).toHaveBeenCalledTimes(4);
  });

  it.each([[true], [undefined], [null], [0], ['false'], [{}], [[]]])(
    'fails closed for a control value other than explicit false: %j',
    async (value) => {
      const gate = new ReadThroughMaintenanceGate(() => Promise.resolve(value));
      await expect(gate.assertAvailable()).rejects.toBeInstanceOf(
        ServiceUnavailableError
      );
    }
  );

  it('maps a synchronous reader failure to the same unavailable error', async () => {
    const gate = new ReadThroughMaintenanceGate(() => {
      throw new Error('synthetic synchronous control failure');
    });
    await expect(gate.assertAvailable()).rejects.toBeInstanceOf(
      ServiceUnavailableError
    );
  });

  it('rejects a failed read and only allows a later fresh explicit false', async () => {
    const readControl = vi
      .fn()
      .mockRejectedValueOnce(new Error('synthetic control read failure'))
      .mockResolvedValueOnce(false);
    const gate = new ReadThroughMaintenanceGate(readControl);
    await expect(gate.assertAvailable()).rejects.toBeInstanceOf(
      ServiceUnavailableError
    );
    await expect(gate.assertAvailable()).resolves.toBeUndefined();
    expect(readControl).toHaveBeenCalledTimes(2);
  });
});
