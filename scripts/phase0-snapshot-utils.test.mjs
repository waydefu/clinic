import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  parseFirebaseLoginAccount,
  redactAccount
} from './phase0-snapshot-utils.mjs';

describe('Phase 0 account snapshot parsing', () => {
  it('parses the supported Firebase login:list text output', () => {
    expect(
      parseFirebaseLoginAccount('Logged in as operator@example.invalid')
    ).toBe('operator@example.invalid');
  });

  it('returns no account when Firebase has no authorized account', () => {
    expect(
      parseFirebaseLoginAccount(
        '⚠  No authorized accounts, run "firebase login"'
      )
    ).toBe('');
  });

  it('redacts account values to their domain', () => {
    expect(redactAccount('operator@example.invalid')).toBe(
      'domain=example.invalid'
    );
    expect(redactAccount('UNVERIFIED')).toBe('UNVERIFIED');
  });

  it('requires the gcloud configuration to be active', () => {
    const source = readFileSync(
      new URL('./phase0-snapshot.mjs', import.meta.url),
      'utf8'
    );
    expect(source).toContain('--filter="is_active=true"');
  });
});
