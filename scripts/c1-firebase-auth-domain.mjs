import ts from 'typescript';
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
  if (
    !variables.includes(
      'Applying C1 internal-test Cloud Run requires firebase_auth_domain set to an authorized isolated Hosting host.'
    ) ||
    main.includes('check "auth_domain_required_on_apply"')
  ) {
    issues.push(
      'C1 Terraform must block apply (variable validation, not a warning-only check block) when firebase_auth_domain is missing.'
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
  if (
    !tftest.includes('exact_apply_authority_sha = "not_granted"') ||
    !tftest.includes('firebase_auth_domain      = ""')
  ) {
    issues.push(
      'C1 terraform noop test must pin not_granted SHA and empty firebase_auth_domain.'
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

  issues.push(...inspectApiComparatorSyntax(apiSource));
  return { ok: issues.length === 0, issues };
}

/**
 * Parses the owning API source instead of matching substrings, so policy text
 * that only exists in comments, or a stub that always allows, is rejected. The
 * real comparator's behaviour is exercised by its own module-imported unit test
 * (apps/api/src/platform/runtime/c1-firebase-auth-domain.test.ts); this check
 * never executes source text.
 */
function inspectApiComparatorSyntax(apiSource) {
  const sourceFile = ts.createSourceFile(
    'c1-firebase-auth-domain.ts',
    apiSource,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TS
  );
  const isExported = (node) =>
    (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export) !== 0;
  let allowlist;
  let comparator;
  for (const statement of sourceFile.statements) {
    if (ts.isVariableStatement(statement) && isExported(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (
          ts.isIdentifier(declaration.name) &&
          declaration.name.text === 'C1_AUTHORIZED_FIREBASE_AUTH_DOMAINS'
        )
          allowlist = declaration.initializer;
      }
    }
    if (
      ts.isFunctionDeclaration(statement) &&
      isExported(statement) &&
      statement.name?.text === 'isAuthorizedC1FirebaseAuthDomain'
    )
      comparator = statement;
  }

  const issues = [];
  while (allowlist !== undefined && ts.isAsExpression(allowlist))
    allowlist = allowlist.expression;
  const hosts =
    allowlist !== undefined && ts.isArrayLiteralExpression(allowlist)
      ? allowlist.elements.map((element) =>
          ts.isStringLiteral(element) ? element.text : undefined
        )
      : undefined;
  if (
    hosts === undefined ||
    hosts.length !== C1_AUTHORIZED_FIREBASE_AUTH_DOMAINS.length ||
    hosts.some(
      (host, index) => host !== C1_AUTHORIZED_FIREBASE_AUTH_DOMAINS[index]
    )
  ) {
    issues.push(
      'API runtime allowlist must be an exported array literal of exactly the authorized isolated preview hosts.'
    );
  }

  // Every return of the comparator itself must either deny (`return false`) or
  // allow only through allowlist membership (`ALLOWLIST.includes(host)`, casts
  // allowed). Any other return form, including `return true`, is rejected.
  // This is a structural rule, not a semantic proof: the comparator's actual
  // behaviour is proven only by its own module-imported unit test.
  const unwrap = (node) => {
    let current = node;
    while (
      current !== undefined &&
      (ts.isParenthesizedExpression(current) ||
        ts.isAsExpression(current) ||
        ts.isTypeAssertionExpression(current) ||
        ts.isNonNullExpression(current))
    )
      current = current.expression;
    return current;
  };
  const allowsByMembership = (expression) => {
    const call = unwrap(expression);
    if (
      call === undefined ||
      !ts.isCallExpression(call) ||
      call.arguments.length !== 1 ||
      !ts.isIdentifier(call.arguments[0]) ||
      !ts.isPropertyAccessExpression(call.expression) ||
      call.expression.name.text !== 'includes'
    )
      return false;
    const list = unwrap(call.expression.expression);
    return (
      list !== undefined &&
      ts.isIdentifier(list) &&
      list.text === 'C1_AUTHORIZED_FIREBASE_AUTH_DOMAINS'
    );
  };
  let denies = false;
  let allows = false;
  let otherReturns = 0;
  const visit = (node) => {
    if (ts.isFunctionLike(node)) return;
    if (ts.isReturnStatement(node)) {
      if (node.expression?.kind === ts.SyntaxKind.FalseKeyword) denies = true;
      else if (
        node.expression !== undefined &&
        allowsByMembership(node.expression)
      )
        allows = true;
      else otherReturns += 1;
    }
    ts.forEachChild(node, visit);
  };
  if (comparator?.body !== undefined) ts.forEachChild(comparator.body, visit);
  if (
    comparator?.body === undefined ||
    comparator.parameters.length !== 1 ||
    !denies ||
    !allows ||
    otherReturns !== 0
  ) {
    issues.push(
      'API runtime authDomain comparator must be an exported function whose returns either deny or allow only by exported allowlist membership.'
    );
  }
  return issues;
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
