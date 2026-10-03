import { randomUUID } from 'node:crypto';

import {
  isBusinessDeliveryMilestoneTimestamp,
  resolveApprovedBusinessDeliveryPolicy,
  sanitizeStructuredLog,
  type ApprovedBusinessDeliveryPolicy,
  type BusinessReportScope,
  type StructuredLog
} from '@beauessence/domain';
import type { StructuredLogger } from '../platform/runtime/structured-logger.js';
import { hasValidMaintenanceEmailAllowlist } from './usage-events.js';

/**
 * Runtime configuration for the CP-03 routes. Everything must be present and
 * valid, or the routes stay off. There is no default policy, scope or
 * observation start: guessing any of them would turn missing evidence into a
 * billing statement.
 *
 * - `BUSINESS_DELIVERY_ENABLED=true`
 * - `BUSINESS_DELIVERY_POLICY_VERSION` — an approved version, e.g. `BD-POLICY-2026-09-29`
 * - `BUSINESS_DELIVERY_SCOPE` — a scope that version is approved for
 * - `BUSINESS_DELIVERY_OBSERVED_SINCE` — UTC instant complete classified capture began;
 *   a deployment date alone is insufficient when the maintenance allowlist was not ready
 * - `BUSINESS_DELIVERY_MAINTENANCE_EMAILS` — non-empty comma-separated email allowlist
 */
export type BusinessDeliveryConfig =
  | { readonly enabled: false }
  | {
      readonly enabled: true;
      readonly policy: ApprovedBusinessDeliveryPolicy;
      readonly scope: BusinessReportScope;
      readonly observedSince: string;
    };

export function readBusinessDeliveryConfig(
  environment: NodeJS.ProcessEnv
): BusinessDeliveryConfig {
  if (environment['BUSINESS_DELIVERY_ENABLED'] !== 'true') {
    return { enabled: false };
  }
  const scope = environment['BUSINESS_DELIVERY_SCOPE'];
  const observedSince = environment['BUSINESS_DELIVERY_OBSERVED_SINCE'] ?? '';
  let policy: ApprovedBusinessDeliveryPolicy;
  try {
    policy = resolveApprovedBusinessDeliveryPolicy(
      environment['BUSINESS_DELIVERY_POLICY_VERSION'],
      scope
    );
  } catch {
    return { enabled: false };
  }
  if (!isBusinessDeliveryMilestoneTimestamp(observedSince)) {
    return { enabled: false };
  }
  if (
    !hasValidMaintenanceEmailAllowlist(
      environment['BUSINESS_DELIVERY_MAINTENANCE_EMAILS']
    )
  ) {
    return { enabled: false };
  }
  return {
    enabled: true,
    policy,
    scope: scope as BusinessReportScope,
    observedSince
  };
}

/** Stable code: the feature was requested but is off because the allowlist is unusable. */
export const BUSINESS_DELIVERY_ALLOWLIST_INVALID_CODE =
  'BUSINESS_DELIVERY_DISABLED_ALLOWLIST_INVALID';

/**
 * `readBusinessDeliveryConfig` fails closed and every route then answers 404,
 * which looks the same as "feature not deployed". When the report routes are
 * requested (`BUSINESS_DELIVERY_ENABLED=true`) but the maintenance allowlist
 * is missing or malformed, this returns the one structured entry that says
 * so. It carries a stable code only: never the payload, an address or a count.
 */
export function businessDeliveryAllowlistNotice(
  environment: NodeJS.ProcessEnv,
  now: () => string = () => new Date().toISOString()
): StructuredLog | undefined {
  if (environment['BUSINESS_DELIVERY_ENABLED'] !== 'true') return undefined;
  if (
    hasValidMaintenanceEmailAllowlist(
      environment['BUSINESS_DELIVERY_MAINTENANCE_EMAILS']
    )
  ) {
    return undefined;
  }
  return {
    timestamp: now(),
    environment: 'internal_test',
    service: 'api',
    correlationId: randomUUID(),
    operation: 'business_delivery_config',
    result: 'error',
    errorCode: BUSINESS_DELIVERY_ALLOWLIST_INVALID_CODE,
    durationMs: 0,
    retryState: 'none'
  };
}

/** Emits the notice once. A logging failure must never change boot. */
export function reportBusinessDeliveryAllowlistNotice(
  environment: NodeJS.ProcessEnv,
  logger: StructuredLogger
): void {
  try {
    const notice = businessDeliveryAllowlistNotice(environment);
    if (notice !== undefined) logger.emit(sanitizeStructuredLog(notice));
  } catch {
    // Logging must never turn a fail-closed feature into a boot failure.
  }
}
