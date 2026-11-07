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

/** Structural subset of the Admin SDK Firestore so domain stays SDK-free. */
export interface MaintenanceControlFirestore {
  doc(path: string): {
    get(): Promise<{ data(): unknown }>;
  };
}

export const MAINTENANCE_CONTROL_DOC_PATH = 'platform_controls/maintenance';

/** No cache: every admission re-reads. Missing doc yields undefined (closed). */
export function firestoreMaintenanceControlReader(
  db: MaintenanceControlFirestore
): MaintenanceControlReader {
  return async () => (await db.doc(MAINTENANCE_CONTROL_DOC_PATH).get()).data();
}

/** Production composition roots only; defaults elsewhere stay fail-closed. */
export function createFirestoreMaintenanceControl(
  db: MaintenanceControlFirestore
): SharedMaintenanceControl {
  return new SharedMaintenanceControl(firestoreMaintenanceControlReader(db));
}
