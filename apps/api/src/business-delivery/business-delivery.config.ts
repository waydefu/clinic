import {
  isBusinessDeliveryMilestoneTimestamp,
  resolveApprovedBusinessDeliveryPolicy,
  type ApprovedBusinessDeliveryPolicy,
  type BusinessReportScope
} from '@beauessence/domain';

/**
 * Runtime configuration for the CP-03 routes. Everything must be present and
 * valid, or the routes stay off. There is no default policy, scope or
 * observation start: guessing any of them would turn missing evidence into a
 * billing statement.
 *
 * - `BUSINESS_DELIVERY_ENABLED=true`
 * - `BUSINESS_DELIVERY_POLICY_VERSION` — an approved version, e.g. `BD-POLICY-2026-09-29`
 * - `BUSINESS_DELIVERY_SCOPE` — a scope that version is approved for
 * - `BUSINESS_DELIVERY_OBSERVED_SINCE` — UTC instant ingress was first deployed
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
  return {
    enabled: true,
    policy,
    scope: scope as BusinessReportScope,
    observedSince
  };
}
