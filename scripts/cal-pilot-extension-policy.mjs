export const CAL_PILOT_PROJECT_ID = 'beauessence-clinic-staging';
export const CAL_PILOT_ORIGINAL_EXPIRY = '2026-09-29T04:51:37Z';
export const CAL_PILOT_EXTENDED_EXPIRY = '2026-11-28T04:51:37Z';
export const CAL_PILOT_SOURCE_IDS = [
  'calendar_source_primary',
  'calendar_source_secondary'
];

const PREVIEW_RENEWAL_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const PREVIEW_MAX_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

function timestamp(value, field) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    throw new Error(`${field} must be an exact UTC timestamp.`);
  return Date.parse(value);
}

export function validateExtensionRequest({
  projectId,
  expectedCurrentExpiry,
  requestedExpiry
}) {
  if (projectId !== CAL_PILOT_PROJECT_ID)
    throw new Error('Refusing to extend outside beauessence-clinic-staging.');
  timestamp(expectedCurrentExpiry, 'expectedCurrentExpiry');
  timestamp(requestedExpiry, 'requestedExpiry');
  if (expectedCurrentExpiry !== CAL_PILOT_ORIGINAL_EXPIRY)
    throw new Error(
      'The expected current expiry is not the approved baseline.'
    );
  if (requestedExpiry !== CAL_PILOT_EXTENDED_EXPIRY)
    throw new Error('The requested expiry is not the approved extension.');
}

export function validateExtensionState({
  expiresAt,
  inboundEnabled,
  outboundEnabled,
  health,
  sourceGeneration,
  expectedSourceGeneration,
  enabledSourceIds,
  activeSourceEnabled
}) {
  if (expiresAt !== CAL_PILOT_ORIGINAL_EXPIRY)
    throw new Error('CAL-PILOT expiry drifted from the approved baseline.');
  if (inboundEnabled !== true || outboundEnabled !== true)
    throw new Error('CAL-PILOT inbound and outbound must both be enabled.');
  if (health !== 'healthy')
    throw new Error('CAL-PILOT must be healthy before extension.');
  if (
    !Number.isInteger(expectedSourceGeneration) ||
    expectedSourceGeneration < 1 ||
    sourceGeneration !== expectedSourceGeneration
  )
    throw new Error('CAL-PILOT source generation drifted from the candidate.');
  const approvedSourceIds = [...CAL_PILOT_SOURCE_IDS].sort();
  const actualSourceIds = Array.isArray(enabledSourceIds)
    ? [...enabledSourceIds].sort()
    : [];
  if (
    actualSourceIds.length !== approvedSourceIds.length ||
    actualSourceIds.some(
      (sourceId, index) => sourceId !== approvedSourceIds[index]
    ) ||
    activeSourceEnabled !== true
  )
    throw new Error('The two-source allowlist boundary is not intact.');
}

export function nextHostingExpiry({ now, currentExpiry, targetExpiry }) {
  const nowMs = timestamp(now, 'now');
  const currentMs = timestamp(currentExpiry, 'currentExpiry');
  const targetMs = timestamp(targetExpiry, 'targetExpiry');
  if (targetExpiry !== CAL_PILOT_EXTENDED_EXPIRY)
    throw new Error('The Hosting target is not the approved extension.');
  if (currentMs <= nowMs)
    throw new Error('The Hosting preview is already expired.');
  if (targetMs <= nowMs)
    throw new Error('The approved extension is already expired.');
  if (currentMs - nowMs > PREVIEW_RENEWAL_WINDOW_MS)
    throw new Error('Hosting renewal is allowed only in the final seven days.');
  const nextMs = Math.min(nowMs + PREVIEW_MAX_LIFETIME_MS, targetMs);
  if (nextMs <= currentMs)
    throw new Error(
      'The Hosting preview already reaches the next safe expiry.'
    );
  return new Date(nextMs).toISOString();
}
