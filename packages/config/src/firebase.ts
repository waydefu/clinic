export const LOCAL_FIREBASE_PROJECT_ID = 'beauessence-appointment-local';

export interface FirestoreEmulatorTarget {
  readonly host: string;
  readonly port: number;
}

const DEFAULT_FIRESTORE_EMULATOR_TARGET = '127.0.0.1:8080';

/**
 * Parses only a local Emulator Suite target.  Production Firestore endpoints
 * cannot be selected through this Phase 0 helper. Brackets are required around
 * the IPv6 loopback address so the port remains unambiguous.
 *
 * This parser keeps the local development default. Code that can mutate data
 * must use `requireLocalFirestoreEmulatorTarget` so a missing environment
 * variable fails closed instead of silently selecting a target.
 */
export function parseFirestoreEmulatorTarget(
  value: string | undefined
): FirestoreEmulatorTarget {
  const target = value ?? DEFAULT_FIRESTORE_EMULATOR_TARGET;
  const bracketedIpv6 = /^\[([^\]]+)\]:(\d+)$/.exec(target);
  const hostAndPort = /^([^:[\]]+):(\d+)$/.exec(target);
  const match = bracketedIpv6 ?? hostAndPort;
  const host = match?.[1];
  const rawPort = match?.[2];
  const port = Number(rawPort);

  if (
    host === undefined ||
    !(
      (bracketedIpv6 !== null && host === '::1') ||
      (bracketedIpv6 === null && (host === '127.0.0.1' || host === 'localhost'))
    ) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65_535
  ) {
    throw new Error('FIRESTORE_EMULATOR_HOST must be a local host:port value.');
  }

  return { host, port };
}

/**
 * Requires an explicit loopback Emulator target before any data-mutating
 * harness initializes a Firebase SDK.
 */
export function requireLocalFirestoreEmulatorTarget(
  value: string | undefined
): FirestoreEmulatorTarget {
  if (value === undefined || value.trim() === '') {
    throw new Error(
      'FIRESTORE_EMULATOR_HOST must be set to a local host:port value.'
    );
  }

  return parseFirestoreEmulatorTarget(value);
}
