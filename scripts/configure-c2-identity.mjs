import { pathToFileURL } from 'node:url';

import {
  FORBIDDEN_STAGING_PROJECT,
  UNAPPLIED_PLACEHOLDER,
  isIsolatedC1ProjectId,
  isolatedC1ProjectIdError
} from './isolated-c1-project-id.mjs';

export const C2_FORBIDDEN_PROJECT = FORBIDDEN_STAGING_PROJECT;
export const C2_UNAPPLIED_PLACEHOLDER = UNAPPLIED_PLACEHOLDER;
export const C2_TOTP_ADJACENT_INTERVALS = 1;

export function assertC2IdentityProjectId(projectId) {
  if (!isIsolatedC1ProjectId(projectId)) {
    throw new Error(isolatedC1ProjectIdError(projectId, 'C2 identity'));
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

export function c2IdentityConfigUrl(projectId) {
  assertC2IdentityProjectId(projectId);
  return `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config`;
}

export function c2IdentityInitializeUrl(projectId) {
  assertC2IdentityProjectId(projectId);
  return `https://identitytoolkit.googleapis.com/v2/projects/${projectId}/identityPlatform:initializeAuth`;
}

export function c2IdentityMutatePlan(projectId) {
  return {
    execute: false,
    note: 'Dry-run only. A local ADC host runs these after C1 PASS and C2 terraform apply. This sandbox never sends the request. Do not target beauessence-clinic-staging.',
    steps: [
      {
        method: 'POST',
        url: c2IdentityInitializeUrl(projectId),
        body: {},
        allowedErrorStatuses: ['ALREADY_EXISTS', 'FAILED_PRECONDITION']
      },
      {
        method: 'PATCH',
        url: `${c2IdentityConfigUrl(projectId)}?updateMask=mfa`,
        body: c2TotpConfigPatch()
      }
    ]
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
  const plan = c2IdentityMutatePlan(process.env.GOOGLE_CLOUD_PROJECT);
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  process.stdout.write(
    'Dry-run only. Identity Platform mutation waits for C2 apply after C1 PASS.\n'
  );
}
