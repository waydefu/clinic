import { isUtcIsoTimestamp } from './timestamp.js';

export type MaintenanceControlReader = () => Promise<unknown>;

export function isMaintenanceWriteAllowed(
  control: unknown,
  nowUtc: string
): boolean {
  if (typeof control !== 'object' || control === null) return false;
  if (Array.isArray(control)) return false;
  const state = control as Record<string, unknown>;
  return (
    state['underMaintenance'] === false &&
    typeof state['expiresAtUtc'] === 'string' &&
    isUtcIsoTimestamp(state['expiresAtUtc']) &&
    isUtcIsoTimestamp(nowUtc) &&
    Date.parse(state['expiresAtUtc']) > Date.parse(nowUtc)
  );
}

/** Callback accounting is not distributed quiescence or provider cancellation. */
export class SharedMaintenanceControl {
  private active = 0;
  private readonly readControl: MaintenanceControlReader;
  private readonly clock: () => string;

  public constructor(
    readControl: MaintenanceControlReader = () => Promise.resolve(undefined),
    clock: () => string = () => new Date().toISOString()
  ) {
    this.readControl = readControl;
    this.clock = clock;
  }

  public get inFlightCallbacks(): number {
    return this.active;
  }

  public async assertAvailable(): Promise<void> {
    try {
      if (isMaintenanceWriteAllowed(await this.readControl(), this.clock()))
        return;
    } catch {
      // Failed reads are not evidence that admission is safe.
    }
    throw new Error('Maintenance control is unavailable.');
  }

  public track(): () => void {
    this.active += 1;
    let active = true;
    return () => {
      if (active) {
        active = false;
        this.active -= 1;
      }
    };
  }

  public async run<T>(work: () => Promise<T>): Promise<T> {
    const finish = this.track();
    try {
      await this.assertAvailable();
      return await work();
    } finally {
      finish();
    }
  }
}
