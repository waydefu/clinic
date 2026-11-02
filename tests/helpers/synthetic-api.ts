import { createApplication } from '../../apps/api/src/main.js';
import { syntheticOpenMaintenanceControl } from './synthetic-maintenance.js';

/** Explicit synthetic admission keeps unrelated auth/route tests independent. */
export function createSyntheticApplication() {
  return createApplication(syntheticOpenMaintenanceControl());
}
