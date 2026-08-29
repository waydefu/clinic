import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

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

if (getApps().length === 0) initializeApp({ projectId });
const manager = getAuth().projectConfigManager();
const current = await manager.getProjectConfig();
const authorizedDomains = new Set(current.authorizedDomains ?? []);
authorizedDomains.add('beauessence-clinic-staging.firebaseapp.com');
authorizedDomains.add('beauessence-clinic-staging.web.app');
authorizedDomains.add(previewDomain);

await manager.updateProjectConfig({
  authorizedDomains: [...authorizedDomains].sort(),
  multiFactorConfig: {
    state: 'ENABLED',
    providerConfigs: [
      {
        state: 'ENABLED',
        totpProviderConfig: { adjacentIntervals: 1 }
      }
    ]
  }
});

const providerManager = getAuth().projectConfigManager();
const googleProvider = await providerManager
  .getProviderConfig('google.com')
  .catch(() => undefined);
if (googleProvider === undefined || googleProvider.enabled !== true)
  throw new Error(
    'Google Identity provider is not enabled. Enable the existing project Google provider before release.'
  );
process.stdout.write(
  'Identity Platform Google provider verified; TOTP enabled.\n'
);
