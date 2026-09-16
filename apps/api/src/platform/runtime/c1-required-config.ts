import {
  isAuthorizedC1FirebaseAuthDomain,
  isIsolatedC1ProjectId
} from './c1-firebase-auth-domain.js';

export const API_CLOUD_ALWAYS_REQUIRED_ENV = [
  'GOOGLE_CLOUD_PROJECT',
  'HOST',
  'PORT',
  'ALLOW_NON_LOOPBACK_BIND',
  'TRUSTED_PROXY_HOPS',
  'INTERNAL_TEST_BOOKING_ENABLED',
  'INTERNAL_TEST_SOURCE_SHA',
  'CALENDAR_PILOT_FIREBASE_AUTH_DOMAIN',
  'CALENDAR_PILOT_FIREBASE_WEB_API_KEY',
  'CALENDAR_PILOT_MANAGER_EMAILS',
  'CALENDAR_PILOT_FRONT_DESK_EMAILS'
] as const;

/** Names that Stage F cloud readiness inspects. Expiry is required only when booking writes are on. */
export const API_CLOUD_REQUIRED_ENV = [
  ...API_CLOUD_ALWAYS_REQUIRED_ENV,
  'INTERNAL_TEST_BOOKING_EXPIRES_AT_UTC'
] as const;

export function apiCloudRequiredConfigPresent(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const emulator = (env['FIRESTORE_EMULATOR_HOST'] ?? '').trim();
  if (emulator !== '') return true;
  const project = (
    env['GOOGLE_CLOUD_PROJECT'] ??
    env['GCLOUD_PROJECT'] ??
    env['GCLOUD_PROJECT_ID'] ??
    ''
  ).trim();
  if (!isIsolatedC1ProjectId(project)) return true;
  if (
    !API_CLOUD_ALWAYS_REQUIRED_ENV.every(
      (name) => (env[name] ?? '').trim() !== ''
    )
  ) {
    return false;
  }
  if (
    !isAuthorizedC1FirebaseAuthDomain(
      env['CALENDAR_PILOT_FIREBASE_AUTH_DOMAIN']
    )
  ) {
    return false;
  }
  const enabled = (env['INTERNAL_TEST_BOOKING_ENABLED'] ?? '').trim();
  if (enabled !== 'true' && enabled !== 'false') return false;
  if (enabled !== 'true') return true;
  return (env['INTERNAL_TEST_BOOKING_EXPIRES_AT_UTC'] ?? '').trim() !== '';
}
