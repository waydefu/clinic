import { describe, expect, it } from 'vitest';

import { parseFirestoreEmulatorTarget } from './index.js';

describe('local Firebase configuration', () => {
  it('defaults to the local Firestore Emulator port', () => {
    expect(parseFirestoreEmulatorTarget(undefined)).toEqual({
      host: '127.0.0.1',
      port: 8080
    });
  });

  it('rejects non-local hosts', () => {
    expect(() =>
      parseFirestoreEmulatorTarget('firestore.googleapis.com:443')
    ).toThrow('FIRESTORE_EMULATOR_HOST');
  });
});
