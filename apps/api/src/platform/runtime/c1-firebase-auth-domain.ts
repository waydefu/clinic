const ISOLATED_C1_PROJECT_ID = 'beauessence-clinic-stg-c1a01';

export const C1_AUTHORIZED_FIREBASE_AUTH_DOMAINS = [
  'beauessence-clinic-stg-c1a01--internal-preproduction-3u85hkcz.web.app'
] as const;

const FORBIDDEN_AUTH_DOMAIN_MARKERS = [
  '://',
  '*',
  'firebaseapp.com',
  'beauessence-clinic-staging',
  'beauessence.com.tw'
] as const;

export function isAuthorizedC1FirebaseAuthDomain(
  value: string | undefined
): boolean {
  const host = (value ?? '').trim();
  if (host === '') return false;
  if (host.includes('/')) return false;
  if (FORBIDDEN_AUTH_DOMAIN_MARKERS.some((marker) => host.includes(marker))) {
    return false;
  }
  return (C1_AUTHORIZED_FIREBASE_AUTH_DOMAINS as readonly string[]).includes(
    host
  );
}

export function isIsolatedC1ProjectId(projectId: string | undefined): boolean {
  return (projectId ?? '').trim() === ISOLATED_C1_PROJECT_ID;
}
