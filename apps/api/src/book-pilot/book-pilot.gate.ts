import { ServiceUnavailableError } from '../platform/errors/api-error.js';

/**
 * Isolated BOOK-PILOT write gate. Missing or unparsable expiry is expired.
 * Kill switch off or past expiresAtUtc refuses the write (fail closed).
 */
export interface BookPilotSettings {
  readonly enabled: boolean;
  readonly expiresAtUtc: string | undefined;
}

export function assertBookPilotWritable(
  nowUtc: string,
  settings: BookPilotSettings
): void {
  if (!settings.enabled) throw new ServiceUnavailableError();
  const expiresAtMs = Date.parse(settings.expiresAtUtc ?? '');
  if (!Number.isFinite(expiresAtMs)) throw new ServiceUnavailableError();
  const nowMs = Date.parse(nowUtc);
  if (!Number.isFinite(nowMs) || nowMs >= expiresAtMs)
    throw new ServiceUnavailableError();
}
