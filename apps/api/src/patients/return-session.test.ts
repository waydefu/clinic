import { Timestamp } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import { describe, expect, it, vi } from 'vitest';

import {
  FirestorePatientDirectory,
  InMemoryPatientDirectory,
  returnSessionPurgeAt
} from './patient-directory.js';

// A05 / NEW-05 (SOL-TTL). `expiresAt` stays the ISO string the service checks;
// it alone decides whether a return session can be used, however late any TTL
// deletion runs. `purgeAt` is the typed field a Firestore TTL policy can act on,
// set to the decided retention (the row stays 24 hours after expiry).

const NOW = '2030-03-01T01:00:00.000Z';
const EXPIRES_AT = '2030-03-01T01:15:00.000Z';
const HOUR_MS = 60 * 60 * 1000;

describe('returnSessionPurgeAt', () => {
  it('is a Firestore Timestamp 24 hours after the session expiry', () => {
    const purgeAt = returnSessionPurgeAt(EXPIRES_AT);
    expect(purgeAt).toBeInstanceOf(Timestamp);
    expect(purgeAt.toMillis()).toBe(Date.parse(EXPIRES_AT) + 24 * HOUR_MS);
    expect(purgeAt.toMillis()).toBeGreaterThan(Date.parse(EXPIRES_AT));
  });

  it.each(['', 'not-a-time', '2030-03-01', '2030-03-01T01:15:00+08:00'])(
    'refuses a missing or malformed expiry (%j) instead of guessing one',
    (expiresAt) => {
      expect(() => returnSessionPurgeAt(expiresAt)).toThrow();
    }
  );
});

describe('return session expiry does not depend on TTL deletion', () => {
  async function setup() {
    const directory = new InMemoryPatientDirectory();
    directory.patients.set('patient_ttl_001', { name: '合成患者甲' });
    directory.sessions.set('rs_ttl_001', {
      patientId: 'patient_ttl_001',
      expiresAt: EXPIRES_AT
    });
    return directory;
  }

  it('is usable until the expiry instant and unusable at and after it', async () => {
    const directory = await setup();
    await expect(directory.readReturnSession('rs_ttl_001', NOW)).resolves.toBe(
      'patient_ttl_001'
    );
    await expect(
      directory.readReturnSession('rs_ttl_001', '2030-03-01T01:14:59.999Z')
    ).resolves.toBe('patient_ttl_001');
    for (const now of [
      EXPIRES_AT,
      '2030-03-01T01:15:00.001Z',
      // The row would still exist inside the 24-hour retention; it is dead.
      '2030-03-01T09:00:00.000Z'
    ])
      await expect(
        directory.readReturnSession('rs_ttl_001', now)
      ).resolves.toBeUndefined();
  });

  it.each([
    undefined,
    '',
    'not-a-time',
    '2030-03-01T01:15:00+08:00',
    1900000000
  ])(
    'treats a missing or malformed expiresAt (%j) as unusable',
    async (expiresAt) => {
      const directory = await setup();
      directory.sessions.set('rs_ttl_bad', {
        patientId: 'patient_ttl_001',
        expiresAt: expiresAt as unknown as string
      });
      await expect(
        directory.readReturnSession('rs_ttl_bad', NOW)
      ).resolves.toBeUndefined();
    }
  );

  it.each([
    '../patients/patient_ttl_001',
    'a/b',
    '',
    'x'.repeat(129),
    'é',
    'a b'
  ])(
    'answers unknown for a non-opaque session id (%j) without using it as a path',
    async (sessionId) => {
      const directory = await setup();
      await expect(
        directory.readReturnSession(sessionId, NOW)
      ).resolves.toBeUndefined();
    }
  );
});

describe('FirestorePatientDirectory.readReturnSession', () => {
  it.each(['../patients/patient_ttl_001', 'a/b', '', 'x'.repeat(129), 'é'])(
    'does not build a document path from a non-opaque id (%j)',
    async (sessionId) => {
      const doc = vi.fn(() => {
        throw new Error('a document path was built from untrusted text');
      });
      const directory = new FirestorePatientDirectory({
        collection: () => ({ doc })
      } as unknown as Firestore);

      await expect(
        directory.readReturnSession(sessionId, NOW)
      ).resolves.toBeUndefined();
      expect(doc).not.toHaveBeenCalled();
    }
  );
});
