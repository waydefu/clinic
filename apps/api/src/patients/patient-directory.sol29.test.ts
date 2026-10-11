import { describe, expect, it } from 'vitest';
import { InMemoryPatientDirectory } from './patient-directory.js';

describe('SOL29 synthetic return-session authority seam', () => {
  const NOW = '2026-10-01T00:00:00.000Z';
  const EXPIRES = '2026-10-01T00:15:00.000Z';
  it('does not return a patient identity after the authoritative record disappears', async () => {
    const directory = new InMemoryPatientDirectory();
    directory.sessions.set('opaque_session', {
      patientId: 'opaque_missing',
      expiresAt: EXPIRES
    });
    await expect(
      directory.readReturnSession('opaque_session', NOW)
    ).resolves.toBeUndefined();
  });
  it('keeps an existing active patient session and denies archived or expired sessions', async () => {
    const directory = new InMemoryPatientDirectory();
    directory.patients.set('opaque_patient', { name: 'opaque_fixture' });
    directory.sessions.set('opaque_session', {
      patientId: 'opaque_patient',
      expiresAt: EXPIRES
    });
    await expect(
      directory.readReturnSession('opaque_session', NOW)
    ).resolves.toBe('opaque_patient');
    await expect(
      directory.readReturnSession('opaque_session', EXPIRES)
    ).resolves.toBeUndefined();
    directory.patients.set('opaque_patient', {
      name: 'opaque_fixture',
      archivedAt: NOW
    });
    await expect(
      directory.readReturnSession('opaque_session', NOW)
    ).resolves.toBeUndefined();
  });
});
