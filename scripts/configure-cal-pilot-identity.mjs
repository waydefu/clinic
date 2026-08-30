import { getApps, initializeApp } from 'firebase-admin/app';

const projectId = process.env['GOOGLE_CLOUD_PROJECT'];
const previewDomain = process.env['CALENDAR_PILOT_PREVIEW_DOMAIN'];
if (projectId !== 'beauessence-clinic-staging')
  throw new Error(
    'Refusing to configure Identity outside beauessence-clinic-staging.'
  );
if (
  previewDomain === undefined ||
  !/^beauessence-clinic-staging--cal-pilot-[a-z0-9-]+\.web\.app$/.test(
    previewDomain
  )
)
  throw new Error(
    'CALENDAR_PILOT_PREVIEW_DOMAIN is not an exact pilot preview domain.'
  );

const app = getApps()[0] ?? initializeApp({ projectId });
const credential = app.options.credential;
if (credential === undefined)
  throw new Error('Application Default Credentials are required.');

async function identityRequest(
  path,
  init = {},
  allowedErrorStatuses = [],
  allowedErrorMessages = []
) {
  const accessToken = await credential.getAccessToken();
  const response = await fetch(
    `https://identitytoolkit.googleapis.com${path}`,
    {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken.access_token}`,
        'Content-Type': 'application/json',
        'x-goog-user-project': projectId,
        ...(init.headers ?? {})
      }
    }
  );
  const payload = await response.json().catch(() => ({}));
  if (response.ok) return payload;
  const status = payload?.error?.status;
  const message = payload?.error?.message;
  if (
    allowedErrorStatuses.includes(status) ||
    allowedErrorMessages.includes(message)
  )
    return payload;
  throw new Error(
    `Identity Toolkit request failed (${response.status}${status === undefined ? '' : ` ${status}`}).`
  );
}

await identityRequest(
  `/v2/projects/${projectId}/identityPlatform:initializeAuth`,
  { method: 'POST', body: '{}' },
  ['ALREADY_EXISTS', 'FAILED_PRECONDITION'],
  [
    'INVALID_PROJECT_ID : Identity Platform has already been enabled for this project.'
  ]
);

const current = await identityRequest(`/admin/v2/projects/${projectId}/config`);
const authorizedDomains = new Set(current.authorizedDomains ?? []);
authorizedDomains.add('beauessence-clinic-staging.firebaseapp.com');
authorizedDomains.add('beauessence-clinic-staging.web.app');
authorizedDomains.add(previewDomain);

const existingMfa = current.mfa ?? {};
const providerConfigs = (existingMfa.providerConfigs ?? []).filter(
  (provider) => provider.totpProviderConfig === undefined
);
providerConfigs.push({
  state: 'ENABLED',
  totpProviderConfig: { adjacentIntervals: 1 }
});

await identityRequest(
  `/admin/v2/projects/${projectId}/config?updateMask=authorizedDomains,mfa`,
  {
    method: 'PATCH',
    body: JSON.stringify({
      authorizedDomains: [...authorizedDomains].sort(),
      mfa: {
        ...existingMfa,
        state: 'ENABLED',
        providerConfigs
      }
    })
  }
);

const googleProvider = await identityRequest(
  `/admin/v2/projects/${projectId}/defaultSupportedIdpConfigs/google.com`
);
if (googleProvider.enabled !== true)
  throw new Error(
    'Google Identity provider is not enabled by the reviewed Firebase Auth configuration.'
  );
process.stdout.write(
  'Identity Platform Google provider verified; TOTP enabled.\n'
);
