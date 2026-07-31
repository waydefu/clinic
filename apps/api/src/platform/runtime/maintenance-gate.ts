import { ServiceUnavailableError } from '../errors/api-error.js';

/**
 * The gate a controller checks before doing work, so a maintenance window is a
 * clean 503 rather than a half-applied write. The production gate reads a shared
 * flag whose ownership target was approved in D-010; the shared store still
 * requires C0 review, separate C1 deployment authority and routed evidence.
 * This static implementation only fixes the boundary and mapping.
 */
export interface MaintenanceGate {
  assertAvailable(): void;
}

export class StaticMaintenanceGate implements MaintenanceGate {
  public constructor(private readonly underMaintenance: boolean) {}

  public assertAvailable(): void {
    if (this.underMaintenance) {
      throw new ServiceUnavailableError();
    }
  }
}
