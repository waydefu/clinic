export const LOCAL_FIREBASE_PROJECT_ID = 'beauessence-appointment-local';

export interface FirestoreEmulatorTarget {
  readonly host: string;
  readonly port: number;
}

/**
 * Parses only a local Emulator Suite target.  Production Firestore endpoints
 * cannot be selected through this Phase 0 helper.
 */
export function parseFirestoreEmulatorTarget(
  value: string | undefined
): FirestoreEmulatorTarget {
  const target = value ?? '127.0.0.1:8080';
  const [host, rawPort, ...rest] = target.split(':');
  const port = Number(rawPort);

  if (
    rest.length > 0 ||
    host === undefined ||
    host.length === 0 ||
    !['127.0.0.1', 'localhost', '::1'].includes(host) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65_535
  ) {
    throw new Error('FIRESTORE_EMULATOR_HOST must be a local host:port value.');
  }

  return { host, port };
}
