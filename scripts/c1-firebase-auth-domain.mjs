import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  C1_AUTHORIZED_FIREBASE_AUTH_DOMAINS,
  ISOLATED_C1_FIREBASE_AUTH_DOMAIN,
  ISOLATED_C1_FIREBASE_AUTH_HANDLER
} from './internal-test-c1-identity.mjs';

const CONFIG_CONTRACT_PATH =
  'infra/config/c1-internal-test-config-contract.json';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

export {
  C1_AUTHORIZED_FIREBASE_AUTH_DOMAINS,
  ISOLATED_C1_FIREBASE_AUTH_DOMAIN,
  ISOLATED_C1_FIREBASE_AUTH_HANDLER
};

export const C1_FIREBASE_AUTH_DOMAIN_FORBIDDEN_MARKERS = Object.freeze([
  '://',
  '*',
  'firebaseapp.com',
  'beauessence-clinic-staging',
  'beauessence.com.tw'
]);

const TERRAFORM_DIR = 'infra/terraform/c1-internal-test-run';
const API_AUTH_DOMAIN_SOURCE =
  'apps/api/src/platform/runtime/c1-firebase-auth-domain.ts';

function asHost(value) {
  return String(value ?? '').trim();
}

export function isAuthorizedC1FirebaseAuthDomain(value) {
  const host = asHost(value);
  if (host === '') return false;
  if (host.includes('/')) return false;
  for (const marker of C1_FIREBASE_AUTH_DOMAIN_FORBIDDEN_MARKERS) {
    if (host.includes(marker)) return false;
  }
  return C1_AUTHORIZED_FIREBASE_AUTH_DOMAINS.includes(host);
}

export function evaluateC1FirebaseAuthDomain(value) {
  const host = asHost(value);
  const issues = [];
  if (host === '') {
    issues.push('firebase_auth_domain is missing.');
    return { ok: false, issues };
  }
  if (host.includes('/')) {
    issues.push('firebase_auth_domain must be a host with no path or scheme.');
  }
  for (const marker of C1_FIREBASE_AUTH_DOMAIN_FORBIDDEN_MARKERS) {
    if (host.includes(marker)) {
      issues.push(`firebase_auth_domain must not contain ${marker}.`);
    }
  }
  if (!C1_AUTHORIZED_FIREBASE_AUTH_DOMAINS.includes(host)) {
    issues.push(
      'firebase_auth_domain is not an explicitly authorized isolated C1 Hosting host.'
    );
  }
  return { ok: issues.length === 0, issues };
}

export function inspectC1FirebaseAuthDomainSource(repoRoot = root) {
  const issues = [];
  const main = readFileSync(join(repoRoot, TERRAFORM_DIR, 'main.tf'), 'utf8');
  const variables = readFileSync(
    join(repoRoot, TERRAFORM_DIR, 'variables.tf'),
    'utf8'
  );
  const example = readFileSync(
    join(repoRoot, TERRAFORM_DIR, 'terraform.tfvars.example'),
    'utf8'
  );
  const tftest = readFileSync(
    join(repoRoot, TERRAFORM_DIR, 'noop.tftest.hcl'),
    'utf8'
  );
  const apiSource = readFileSync(
    join(repoRoot, API_AUTH_DOMAIN_SOURCE),
    'utf8'
  );
  const contract = JSON.parse(
    readFileSync(join(repoRoot, CONFIG_CONTRACT_PATH), 'utf8')
  );
  const entry = (contract.entries ?? []).find(
    (item) => item.name === 'CALENDAR_PILOT_FIREBASE_AUTH_DOMAIN'
  );

  if (!variables.includes('variable "firebase_auth_domain"')) {
    issues.push('C1 Terraform must declare firebase_auth_domain.');
  }
  if (!variables.includes(`default     = ""`)) {
    issues.push(
      'C1 firebase_auth_domain must default empty so noop SHA stays a no-op.'
    );
  }
  if (!variables.includes(ISOLATED_C1_FIREBASE_AUTH_DOMAIN)) {
    issues.push(
      'C1 firebase_auth_domain validation must name the authorized isolated preview host.'
    );
  }
  for (const marker of [
    'firebaseapp.com',
    'beauessence-clinic-staging',
    'beauessence.com.tw',
    '://',
    '*'
  ]) {
    if (!variables.includes(marker)) {
      issues.push(
        `C1 firebase_auth_domain validation must explicitly refuse ${marker}.`
      );
    }
  }
  if (!main.includes('value = var.firebase_auth_domain')) {
    issues.push(
      'C1 API CALENDAR_PILOT_FIREBASE_AUTH_DOMAIN must be var.firebase_auth_domain.'
    );
  }
  if (main.includes('${var.project_id}.firebaseapp.com')) {
    issues.push(
      'C1 Terraform must not hardcode project_id.firebaseapp.com as runtime authDomain.'
    );
  }
  if (!main.includes('auth_domain_required_on_apply')) {
    issues.push(
      'C1 Terraform must fail closed when apply is missing firebase_auth_domain.'
    );
  }
  if (
    !/firebase_auth_domain\s*=\s*"beauessence-clinic-stg-c1a01--internal-preproduction-3u85hkcz\.web\.app"/.test(
      example
    )
  ) {
    issues.push(
      'terraform.tfvars.example must set the intended isolated preview firebase_auth_domain.'
    );
  }
  if (
    example.includes('${project_id}.firebaseapp.com') &&
    !example.includes('Do not substitute')
  ) {
    issues.push(
      'terraform.tfvars.example must not silently fall back to project_id.firebaseapp.com.'
    );
  }
  if (!tftest.includes('named_sha_without_auth_domain_is_rejected')) {
    issues.push(
      'C1 terraform tests must reject a missing authDomain on apply.'
    );
  }
  if (!tftest.includes('firebaseapp_auth_domain_is_rejected')) {
    issues.push(
      'C1 terraform tests must reject firebaseapp.com as authDomain.'
    );
  }
  if (entry?.class !== 'NON_SECRET_CONFIG' || entry?.cloudRequired !== true) {
    issues.push(
      'CALENDAR_PILOT_FIREBASE_AUTH_DOMAIN must remain NON_SECRET_CONFIG cloudRequired api.'
    );
  }
  if (
    !Array.isArray(entry?.requiredFor) ||
    !entry.requiredFor.includes('api')
  ) {
    issues.push(
      'CALENDAR_PILOT_FIREBASE_AUTH_DOMAIN requiredFor must include api.'
    );
  }
  const authorized = entry?.authorizedHosts ?? [];
  if (
    authorized.length !== C1_AUTHORIZED_FIREBASE_AUTH_DOMAINS.length ||
    C1_AUTHORIZED_FIREBASE_AUTH_DOMAINS.some(
      (host) => !authorized.includes(host)
    )
  ) {
    issues.push(
      'C1 config contract authorizedHosts must match the exact isolated preview allowlist.'
    );
  }
  if (!apiSource.includes(ISOLATED_C1_FIREBASE_AUTH_DOMAIN)) {
    issues.push(
      'API runtime allowlist must include the authorized isolated preview host.'
    );
  }
  if (
    apiSource.includes('headers.host') ||
    apiSource.includes("headers['host']")
  ) {
    issues.push(
      'API runtime must not infer firebase authDomain from request Host.'
    );
  }

  return { ok: issues.length === 0, issues };
}

function isDirectRun() {
  const invoked = process.argv[1];
  if (typeof invoked !== 'string' || invoked === '') return false;
  return import.meta.url === pathToFileURL(invoked).href;
}

if (isDirectRun()) {
  const result = inspectC1FirebaseAuthDomainSource();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.ok ? 0 : 1);
}
