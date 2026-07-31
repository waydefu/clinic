import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  assertFails,
  initializeTestEnvironment
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, type Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, describe, it } from 'vitest';
import {
  LOCAL_FIREBASE_PROJECT_ID,
  requireLocalFirestoreEmulatorTarget
} from '../../packages/config/src/index.js';

const emulatorTarget = requireLocalFirestoreEmulatorTarget(
  process.env['FIRESTORE_EMULATOR_HOST']
);
const projectId = LOCAL_FIREBASE_PROJECT_ID;
const rulesPath = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let unauthenticatedFirestore: Firestore;
let testEnvironment: Awaited<ReturnType<typeof initializeTestEnvironment>>;

beforeAll(async () => {
  testEnvironment = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: emulatorTarget.host,
      port: emulatorTarget.port,
      rules: await readFile(rulesPath, 'utf8')
    }
  });
  unauthenticatedFirestore = testEnvironment
    .unauthenticatedContext()
    .firestore();
});

afterAll(async () => {
  await testEnvironment.cleanup();
});

describe('Firestore direct-client deny-by-default baseline', () => {
  it('denies browser or mobile writes', async () => {
    await assertFails(
      setDoc(doc(unauthenticatedFirestore, 'appointments', 'appointment-001'), {
        status: 'confirmed'
      })
    );
  });

  it('denies browser or mobile reads', async () => {
    await assertFails(
      getDoc(doc(unauthenticatedFirestore, 'appointments', 'appointment-001'))
    );
  });
});
