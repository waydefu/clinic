import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

import {
  assertAuthorizationShape,
  DomainError,
  type DelegatedAuthorization
} from '@beauessence/domain';

/**
 * Server-only storage adapter for D-006 delegated authorization codes.
 *
 * The domain owns the decision rules; this adapter owns the Node cryptography.
 * The KDF parameters are explicit so a later security review can change them
 * without changing the domain policy or the stored-record shape.
 */
const SECRET_SALT_BYTES = 16;
const SECRET_HASH_BYTES = 32;
const SCRYPT_OPTIONS = {
  N: 32_768,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024
} as const;

export interface CreateDelegatedAuthorizationInput {
  readonly id: string;
  readonly label: unknown;
  readonly secret: unknown;
}

function assertOpaqueAuthorizationId(id: string): void {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    throw new DomainError(
      'INVALID_VALUE',
      'authorization id must be an opaque identifier'
    );
  }
}

function encode(value: Buffer): string {
  return value.toString('base64url');
}

function decode(value: string): Buffer {
  return Buffer.from(value, 'base64url');
}

export function createDelegatedAuthorization(
  input: CreateDelegatedAuthorizationInput
): DelegatedAuthorization {
  assertOpaqueAuthorizationId(input.id);
  const { label, secret } = assertAuthorizationShape(input.label, input.secret);
  const salt = randomBytes(SECRET_SALT_BYTES);
  const hash = scryptSync(secret, salt, SECRET_HASH_BYTES, SCRYPT_OPTIONS);

  return {
    id: input.id,
    label,
    secretKdf: 'scrypt',
    secretSalt: encode(salt),
    secretHash: encode(hash),
    enabled: true
  };
}

/**
 * Verifies an in-memory request against a stored record. Malformed, disabled,
 * or unknown KDF records fail closed and expose no distinction to the caller.
 */
export function verifyDelegatedSecret(
  authorization: DelegatedAuthorization,
  presentedSecret: unknown
): boolean {
  if (
    !authorization.enabled ||
    authorization.secretKdf !== 'scrypt' ||
    typeof presentedSecret !== 'string' ||
    presentedSecret === ''
  ) {
    return false;
  }

  try {
    const salt = decode(authorization.secretSalt);
    const expected = decode(authorization.secretHash);
    if (
      salt.length !== SECRET_SALT_BYTES ||
      expected.length !== SECRET_HASH_BYTES
    ) {
      return false;
    }

    const actual = scryptSync(
      presentedSecret,
      salt,
      SECRET_HASH_BYTES,
      SCRYPT_OPTIONS
    );
    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
