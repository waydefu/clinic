import { ServiceUnavailableError } from '../errors/api-error.js';

export const MAINTENANCE_GATE = 'ApiMaintenanceGate';

/**
 * The gate a controller checks before doing work, so a maintenance window is a
 * clean 503 rather than a half-applied write. The production gate reads a shared
 * flag whose ownership target was approved in D-010; the shared store still
 * requires C0 review, separate C1 deployment authority and routed evidence.
 * This static implementation only fixes the boundary and mapping.
 */
export interface MaintenanceGate {
  assertAvailable(): void | Promise<void>;
}

export class StaticMaintenanceGate implements MaintenanceGate {
  public constructor(private readonly underMaintenance: boolean) {}

  public assertAvailable(): void {
    if (this.underMaintenance) {
      throw new ServiceUnavailableError();
    }
  }
}

/** Read boundary only: this does not create or wire an operational shared store. */
export class ReadThroughMaintenanceGate implements MaintenanceGate {
  public constructor(private readonly readControl: () => Promise<unknown>) {}

  public async assertAvailable(): Promise<void> {
    try {
      if ((await this.readControl()) === false) return;
    } catch {
      // A failed control read is not evidence that writes are safe.
    }
    throw new ServiceUnavailableError();
  }
}
