import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./calendar-pilot.module.ts', import.meta.url),
  'utf8'
);

describe('CalendarPilotModule Firebase wiring', () => {
  it('does not initialize Firebase at import time', () => {
    const runtime = readFileSync(
      new URL('../platform/runtime/firebase-admin-app.ts', import.meta.url),
      'utf8'
    );
    expect(source).toContain('export { defaultFirebaseApp');
    expect(runtime).toMatch(/export function defaultFirebaseApp\(\): App \{/);
    expect(source).not.toMatch(
      /^if \(getApps\(\)\.length === 0\) initializeApp\(\);$/m
    );
    expect(source).not.toMatch(/^const firestore = getFirestore\(\);$/m);
    expect(source).not.toMatch(/^const firebaseAuth = getAuth\(\);$/m);
  });

  it('keeps Vitest AppModule denial audits off Cloud Firestore', () => {
    const shared = readFileSync(
      new URL('../firestore/api-safety.module.ts', import.meta.url),
      'utf8'
    );
    expect(source).toContain('ApiSafetyModule');
    expect(shared).toContain('InMemoryDeniedAccessAuditSink');
    expect(source).toContain('vitestWithoutFirestoreEmulator');
    expect(shared).toContain('FirestoreDeniedAccessAuditStore');
    expect(source).toContain('ClinicCalendarReviewApplicationService');
  });
});
