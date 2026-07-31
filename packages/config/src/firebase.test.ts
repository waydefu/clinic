import { describe, expect, it } from 'vitest';

import {
  parseFirestoreEmulatorTarget,
  requireLocalFirestoreEmulatorTarget
} from './index.js';

describe('local Firebase configuration', () => {
  it('defaults to the local Firestore Emulator port', () => {
    expect(parseFirestoreEmulatorTarget(undefined)).toEqual({
      host: '127.0.0.1',
      port: 8080
    });
  });

  it.each([
    ['localhost:8080', { host: 'localhost', port: 8080 }],
    ['127.0.0.1:9090', { host: '127.0.0.1', port: 9090 }],
    ['[::1]:8080', { host: '::1', port: 8080 }]
  ])('accepts the loopback target %s', (target, expected) => {
    expect(requireLocalFirestoreEmulatorTarget(target)).toEqual(expected);
  });

  it.each([undefined, '', '   '])(
    'requires an explicit target for a mutating harness (%s)',
    (target) => {
      expect(() => requireLocalFirestoreEmulatorTarget(target)).toThrow(
        'FIRESTORE_EMULATOR_HOST'
      );
    }
  );

  it('rejects non-local hosts', () => {
    expect(() =>
      parseFirestoreEmulatorTarget('firestore.googleapis.com:443')
    ).toThrow('FIRESTORE_EMULATOR_HOST');
  });

  it.each([
    'localhost',
    'localhost:',
    'localhost:not-a-port',
    'localhost:8080:extra',
    '::1:8080',
    '[127.0.0.1]:8080'
  ])('rejects the invalid target %s', (target) => {
    expect(() => parseFirestoreEmulatorTarget(target)).toThrow(
      'FIRESTORE_EMULATOR_HOST'
    );
  });

  it.each(['localhost:0', 'localhost:65536', 'localhost:-1'])(
    'rejects the out-of-range port in %s',
    (target) => {
      expect(() => parseFirestoreEmulatorTarget(target)).toThrow(
        'FIRESTORE_EMULATOR_HOST'
      );
    }
  );
});
