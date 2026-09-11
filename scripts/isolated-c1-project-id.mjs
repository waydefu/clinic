export const FORBIDDEN_STAGING_PROJECT = 'beauessence-clinic-staging';
export const UNAPPLIED_PLACEHOLDER = 'beauessence-clinic-stg-unapplied';
export const ISOLATED_C1_PROJECT_PREFIX = 'beauessence-clinic-stg-';

/**
 * GCP project IDs are 6–30 characters. The isolated prefix is 23 characters,
 * so the suffix must be 1–7 lowercase alphanumeric characters.
 */
export const ISOLATED_PROJECT_PATTERN =
  /^beauessence-clinic-stg-[a-z0-9]{1,7}$/;
export const GCP_PROJECT_ID_MAX_LENGTH = 30;

export function isIsolatedC1ProjectId(projectId) {
  return (
    typeof projectId === 'string' &&
    projectId !== FORBIDDEN_STAGING_PROJECT &&
    projectId !== UNAPPLIED_PLACEHOLDER &&
    ISOLATED_PROJECT_PATTERN.test(projectId) &&
    projectId.length <= GCP_PROJECT_ID_MAX_LENGTH
  );
}

export function isolatedC1ProjectIdError(projectId, context) {
  if (projectId === FORBIDDEN_STAGING_PROJECT) {
    return `${context} refuses beauessence-clinic-staging; that project is CAL-PILOT, not C1.`;
  }
  if (projectId === UNAPPLIED_PLACEHOLDER) {
    return `${context} refuses the unapplied placeholder project id.`;
  }
  return `${context} requires an isolated beauessence-clinic-stg- plus 1-7 lowercase alphanumeric chars (GCP project id max ${GCP_PROJECT_ID_MAX_LENGTH}).`;
}
