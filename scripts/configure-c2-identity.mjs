import { pathToFileURL } from 'node:url';

export const C2_FORBIDDEN_PROJECT = 'beauessence-clinic-staging';
export const C2_UNAPPLIED_PLACEHOLDER = 'beauessence-clinic-stg-unapplied';
export const C2_TOTP_ADJACENT_INTERVALS = 1;

export function assertC2IdentityProjectId(projectId) {
  if (projectId === C2_FORBIDDEN_PROJECT) {
    throw new Error(
      'C2 identity refuses beauessence-clinic-staging; that project is CAL-PILOT, not C1.'
    );
  }
  if (projectId === C2_UNAPPLIED_PLACEHOLDER) {
    throw new Error(
      'C2 identity refuses the unapplied placeholder project id.'
    );
  }
  if (
    typeof projectId !== 'string' ||
    !/^beauessence-clinic-stg-[a-z0-9-]+$/.test(projectId)
  ) {
    throw new Error(
      'C2 identity only targets an isolated beauessence-clinic-stg-* project.'
    );
  }
}

export function assertC2IdentityApplyGate(env) {
  if (env.C2_IDENTITY_APPLY !== 'granted') {
    throw new Error(
      'C2 identity configurator is inert until C2_IDENTITY_APPLY=granted after C1 PASS.'
    );
  }
}

export function c2TotpConfigPatch() {
  return {
    mfa: {
      state: 'ENABLED',
      providerConfigs: [
        {
          state: 'ENABLED',
          totpProviderConfig: {
            adjacentIntervals: C2_TOTP_ADJACENT_INTERVALS
          }
        }
      ]
    }
  };
}

function isDirectRun() {
  const invoked = process.argv[1];
  if (typeof invoked !== 'string' || invoked === '') return false;
  return import.meta.url === pathToFileURL(invoked).href;
}

if (isDirectRun()) {
  assertC2IdentityApplyGate(process.env);
  assertC2IdentityProjectId(process.env.GOOGLE_CLOUD_PROJECT);
  process.stdout.write(`${JSON.stringify(c2TotpConfigPatch(), null, 2)}\n`);
  process.stdout.write(
    'Dry-run only. Identity Platform mutation waits for C2 apply after C1 PASS.\n'
  );
}
