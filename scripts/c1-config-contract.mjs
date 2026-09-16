import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { evaluateC1FirebaseAuthDomain } from './c1-firebase-auth-domain.mjs';
import {
  C1_AUTHORIZED_FIREBASE_AUTH_DOMAINS,
  ISOLATED_C1_FIREBASE_AUTH_DOMAIN
} from './internal-test-c1-identity.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const SHA_PATTERN = /^[a-f0-9]{40}$/;
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

export const CONFIG_CONTRACT_PATH =
  'infra/config/c1-internal-test-config-contract.json';

export function loadC1ConfigContract(readFile = readFileSync) {
  return JSON.parse(readFile(join(root, CONFIG_CONTRACT_PATH), 'utf8'));
}

export function evaluateC1ConfigContract(contract = loadC1ConfigContract()) {
  const issues = [];
  if (contract?.status !== 'IMPLEMENTED_NOT_DEPLOYED') {
    issues.push('C1 config contract must remain IMPLEMENTED_NOT_DEPLOYED.');
  }
  if (contract?.secretValuesInRepo !== 'FORBIDDEN') {
    issues.push('C1 config contract must forbid secret values in the repo.');
  }
  const encoded = JSON.stringify(contract);
  if (EMAIL_PATTERN.test(encoded)) {
    issues.push('C1 config contract must not contain email addresses.');
  }
  const classes = new Set((contract.entries ?? []).map((entry) => entry.class));
  for (const required of [
    'NON_SECRET_CONFIG',
    'SECRET_REFERENCE',
    'RUNTIME_DERIVED',
    'FORBIDDEN_TO_STORE_IN_REPO'
  ]) {
    if (!classes.has(required)) {
      issues.push(`C1 config contract missing class ${required}.`);
    }
  }
  const authDomain = (contract.entries ?? []).find(
    (entry) => entry.name === 'CALENDAR_PILOT_FIREBASE_AUTH_DOMAIN'
  );
  if (
    authDomain?.class !== 'NON_SECRET_CONFIG' ||
    authDomain?.cloudRequired !== true ||
    !Array.isArray(authDomain?.requiredFor) ||
    !authDomain.requiredFor.includes('api')
  ) {
    issues.push(
      'CALENDAR_PILOT_FIREBASE_AUTH_DOMAIN must remain NON_SECRET_CONFIG requiredFor api cloudRequired true.'
    );
  }
  const authorized = authDomain?.authorizedHosts ?? [];
  if (
    authorized.length !== C1_AUTHORIZED_FIREBASE_AUTH_DOMAINS.length ||
    !authorized.includes(ISOLATED_C1_FIREBASE_AUTH_DOMAIN)
  ) {
    issues.push(
      'CALENDAR_PILOT_FIREBASE_AUTH_DOMAIN authorizedHosts must be the exact isolated C1 preview allowlist.'
    );
  }
  return { ok: issues.length === 0, issues };
}

export function requiredCloudConfigNames(
  surface,
  contract = loadC1ConfigContract()
) {
  return (contract.entries ?? [])
    .filter(
      (entry) =>
        entry.cloudRequired === true &&
        Array.isArray(entry.requiredFor) &&
        entry.requiredFor.includes(surface) &&
        entry.class !== 'FORBIDDEN_TO_STORE_IN_REPO'
    )
    .map((entry) => entry.name);
}

function requiredWhenSatisfied(entry, env) {
  if (!entry?.requiredWhen || typeof entry.requiredWhen !== 'object') {
    return true;
  }
  return Object.entries(entry.requiredWhen).every(
    ([name, expected]) => String(env?.[name] ?? '').trim() === String(expected)
  );
}

export function evaluateRequiredCloudConfig(env, surface, contract) {
  const loaded = contract ?? loadC1ConfigContract();
  const missing = [];
  for (const entry of loaded.entries ?? []) {
    if (
      entry.cloudRequired !== true ||
      !Array.isArray(entry.requiredFor) ||
      !entry.requiredFor.includes(surface) ||
      entry.class === 'FORBIDDEN_TO_STORE_IN_REPO'
    ) {
      continue;
    }
    if (!requiredWhenSatisfied(entry, env)) continue;
    const value = String(env?.[entry.name] ?? '').trim();
    if (value === '') {
      missing.push(entry.name);
      continue;
    }
    if (entry.name === 'CALENDAR_PILOT_FIREBASE_AUTH_DOMAIN') {
      const evaluation = evaluateC1FirebaseAuthDomain(value);
      if (!evaluation.ok)
        missing.push('CALENDAR_PILOT_FIREBASE_AUTH_DOMAIN_INVALID');
    }
  }
  const emulator = String(env?.FIRESTORE_EMULATOR_HOST ?? '').trim();
  const emulatorMustBeEmpty = (loaded.entries ?? []).some(
    (entry) =>
      entry.name === 'FIRESTORE_EMULATOR_HOST' && entry.cloudMustBeEmpty
  );
  if (emulatorMustBeEmpty && emulator !== '') {
    missing.push('FIRESTORE_EMULATOR_HOST_MUST_BE_EMPTY');
  }
  const sourceSha = String(env?.INTERNAL_TEST_SOURCE_SHA ?? '').trim();
  if (
    requiredCloudConfigNames(surface, loaded).includes(
      'INTERNAL_TEST_SOURCE_SHA'
    ) &&
    sourceSha !== '' &&
    !SHA_PATTERN.test(sourceSha)
  ) {
    missing.push('INTERNAL_TEST_SOURCE_SHA_INVALID');
  }
  return {
    ok: missing.length === 0,
    missing,
    requiredConfigPresent: missing.length === 0
  };
}

export function redactConfigForLogs(env) {
  const redacted = {};
  for (const [key, value] of Object.entries(env ?? {})) {
    const upper = key.toUpperCase();
    const secretLike =
      /SECRET|TOKEN|PASSWORD|JSON|API_KEY|ALLOWLIST|EMAILS|PRIVATE/.test(upper);
    redacted[key] = secretLike ? '[redacted]' : value;
  }
  return redacted;
}

function isDirectRun() {
  const invoked = process.argv[1];
  if (typeof invoked !== 'string' || invoked === '') return false;
  return import.meta.url === pathToFileURL(invoked).href;
}

if (isDirectRun()) {
  const result = evaluateC1ConfigContract();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.ok ? 0 : 1);
}
