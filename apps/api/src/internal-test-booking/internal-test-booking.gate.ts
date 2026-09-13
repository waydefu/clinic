import { ServiceUnavailableError } from '../platform/errors/api-error.js';

/**
 * IP-001 fail-closed internal-test booking gate. Public production stays
 * off: missing flag, missing/unparsable expiry, forbidden project, or a
 * project outside the isolated allowlist (unless the Firestore emulator is
 * bound) all refuse the write.
 */
export const INTERNAL_TEST_BOOKING_PROJECT_ALLOWLIST = new Set([
  'beauessence-clinic-stg-c1a01'
]);

export const INTERNAL_TEST_BOOKING_FORBIDDEN_PROJECTS = new Set([
  'beauessence-clinic-staging'
]);

export interface InternalTestBookingSettings {
  readonly enabled: boolean;
  readonly expiresAtUtc: string | undefined;
  readonly projectId: string | undefined;
  readonly emulatorHost: string | undefined;
}

export function internalTestBookingSettingsFromEnv(
  env: NodeJS.ProcessEnv = process.env
): InternalTestBookingSettings {
  return {
    enabled: env['INTERNAL_TEST_BOOKING_ENABLED'] === 'true',
    expiresAtUtc: env['INTERNAL_TEST_BOOKING_EXPIRES_AT_UTC'],
    projectId:
      env['GOOGLE_CLOUD_PROJECT'] ??
      env['GCLOUD_PROJECT'] ??
      env['GCLOUD_PROJECT_ID'],
    emulatorHost: env['FIRESTORE_EMULATOR_HOST']
  };
}

export function assertInternalTestBookingWritable(
  nowUtc: string,
  settings: InternalTestBookingSettings
): void {
  if (!settings.enabled) throw new ServiceUnavailableError();
  const expiresAtMs = Date.parse(settings.expiresAtUtc ?? '');
  if (!Number.isFinite(expiresAtMs)) throw new ServiceUnavailableError();
  const nowMs = Date.parse(nowUtc);
  if (!Number.isFinite(nowMs) || nowMs >= expiresAtMs) {
    throw new ServiceUnavailableError();
  }

  const projectId = settings.projectId?.trim() ?? '';
  if (INTERNAL_TEST_BOOKING_FORBIDDEN_PROJECTS.has(projectId)) {
    throw new ServiceUnavailableError();
  }
  if ((settings.emulatorHost ?? '').trim() !== '') return;
  if (!INTERNAL_TEST_BOOKING_PROJECT_ALLOWLIST.has(projectId)) {
    throw new ServiceUnavailableError();
  }
}
