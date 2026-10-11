import { getApp, getApps, initializeApp, type App } from 'firebase-admin/app';

/** Lazy resolution avoids import-time races with named emulator apps. */
export function defaultFirebaseApp(): App {
  if (getApps().some((app) => app.name === '[DEFAULT]')) return getApp();
  return initializeApp();
}

export function vitestWithoutFirestoreEmulator(): boolean {
  return (
    process.env['VITEST'] !== undefined &&
    process.env['FIRESTORE_EMULATOR_HOST'] === undefined
  );
}
