import { SharedMaintenanceControl } from '@beauessence/domain/maintenance-control.node';

/** Synthetic fixture only; never an operational control or environment fallback. */
export function syntheticOpenMaintenanceControl(): SharedMaintenanceControl {
  return new SharedMaintenanceControl(() =>
    Promise.resolve({
      underMaintenance: false,
      expiresAtUtc: new Date(Date.now() + 60_000).toISOString()
    })
  );
}
