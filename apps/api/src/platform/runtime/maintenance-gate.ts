import { ServiceUnavailableError } from '../errors/api-error.js';

/**
 * The gate a controller checks before doing work, so a maintenance window is a
 * clean 503 rather than a half-applied write. The production gate reads a shared
 * flag owned by D-010; this static one fixes the boundary and the mapping.
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
