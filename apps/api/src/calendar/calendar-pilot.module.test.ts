import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./calendar-pilot.module.ts', import.meta.url),
  'utf8'
);

describe('CalendarPilotModule Firebase wiring', () => {
  it('does not initialize Firebase at import time', () => {
    expect(source).toMatch(/export function defaultFirebaseApp\(\): App \{/);
    expect(source).not.toMatch(
      /^if \(getApps\(\)\.length === 0\) initializeApp\(\);$/m
    );
    expect(source).not.toMatch(/^const firestore = getFirestore\(\);$/m);
    expect(source).not.toMatch(/^const firebaseAuth = getAuth\(\);$/m);
  });

  it('keeps Vitest AppModule denial audits off Cloud Firestore', () => {
    expect(source).toContain('InMemoryDeniedAccessAuditSink');
    expect(source).toContain('vitestWithoutFirestoreEmulator');
    expect(source).toContain('FirestoreDeniedAccessAuditStore');
  });
});
