import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { inspectC1AuthDomainHcl } from './c1-firebase-auth-domain-hcl.mjs';
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
  try {
    return inspectC1FirebaseAuthDomainSourceImpl(repoRoot);
  } catch {
    return {
      ok: false,
      issues: [
        'C1 source inspection could not read required inputs; proof is unproven.'
      ]
    };
  }
}

function inspectC1FirebaseAuthDomainSourceImpl(repoRoot) {
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
  issues.push(
    ...inspectC1AuthDomainHcl({
      variables,
      main,
      example,
      tftest,
      approvedHost: ISOLATED_C1_FIREBASE_AUTH_DOMAIN
    })
  );
  return { ok: issues.length === 0, issues };
}

/**
 * Admits only a small, non-executing AST shape with literal provenance,
 * parameter-derived normalization, pure deny guards, and reachable exact
 * allowlist membership. The real comparator's behaviour is exercised by its
 * own module-imported unit test; this check never executes source text.
 */
function inspectApiComparatorSyntax(apiSource) {
  const sourceFile = ts.createSourceFile(
    'c1-firebase-auth-domain.ts',
    apiSource,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TS
  );
  const comparatorIssue =
    'API runtime authDomain comparator must be an exported function whose returns either deny or allow only by exported allowlist membership.';
  if (sourceFile.parseDiagnostics.length > 0) return [comparatorIssue];

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
  const isString = (node, value) =>
    node !== undefined &&
    ts.isStringLiteral(unwrap(node)) &&
    (value === undefined || unwrap(node).text === value);
  const onlyExportModifier = (node) =>
    (node.modifiers ?? []).every(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
    );
  const bindings = new Map();
  const bindingCounts = new Map();
  const constants = new Map();
  const exportedConstants = new Set();
  const functions = new Map();
  let moduleShapeValid = true;

  const registerBinding = (name) => {
    const count = (bindingCounts.get(name) ?? 0) + 1;
    bindingCounts.set(name, count);
    if (count > 1) moduleShapeValid = false;
    bindings.set(name, true);
  };

  for (const statement of sourceFile.statements) {
    if (ts.isVariableStatement(statement)) {
      if (
        (statement.declarationList.flags & ts.NodeFlags.BlockScoped) !==
          ts.NodeFlags.Const ||
        !onlyExportModifier(statement)
      ) {
        moduleShapeValid = false;
        continue;
      }
      for (const declaration of statement.declarationList.declarations) {
        if (
          !ts.isIdentifier(declaration.name) ||
          declaration.initializer === undefined
        ) {
          moduleShapeValid = false;
          continue;
        }
        const name = declaration.name.text;
        registerBinding(name);
        const value = unwrap(declaration.initializer);
        const frozen =
          ts.isCallExpression(value) &&
          value.questionDotToken === undefined &&
          value.arguments.length === 1 &&
          ts.isPropertyAccessExpression(value.expression) &&
          value.expression.questionDotToken === undefined &&
          ts.isIdentifier(unwrap(value.expression.expression)) &&
          unwrap(value.expression.expression).text === 'Object' &&
          value.expression.name.text === 'freeze';
        const initializer = frozen ? unwrap(value.arguments[0]) : value;
        if (ts.isStringLiteral(initializer)) {
          constants.set(name, { kind: 'string', value: initializer.text });
        } else if (ts.isArrayLiteralExpression(initializer)) {
          const values = [];
          let valid = true;
          for (const element of initializer.elements) {
            const literal = unwrap(element);
            if (!ts.isStringLiteral(literal)) {
              valid = false;
              break;
            }
            values.push(literal.text);
          }
          if (valid)
            constants.set(name, { kind: 'array', value: values, frozen });
          else moduleShapeValid = false;
        } else {
          moduleShapeValid = false;
        }
        if (
          statement.modifiers?.some(
            (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
          )
        )
          exportedConstants.add(name);
      }
      continue;
    }
    if (ts.isFunctionDeclaration(statement)) {
      if (
        statement.name === undefined ||
        statement.body === undefined ||
        !onlyExportModifier(statement)
      ) {
        moduleShapeValid = false;
        continue;
      }
      const name = statement.name.text;
      registerBinding(name);
      const declarations = functions.get(name) ?? [];
      declarations.push(statement);
      functions.set(name, declarations);
      continue;
    }
    moduleShapeValid = false;
  }

  const issues = [];
  const allowlist = constants.get('C1_AUTHORIZED_FIREBASE_AUTH_DOMAINS');
  const hosts = allowlist?.kind === 'array' ? allowlist.value : undefined;
  if (
    hosts === undefined ||
    bindingCounts.get('C1_AUTHORIZED_FIREBASE_AUTH_DOMAINS') !== 1 ||
    !exportedConstants.has('C1_AUTHORIZED_FIREBASE_AUTH_DOMAINS') ||
    hosts.length !== C1_AUTHORIZED_FIREBASE_AUTH_DOMAINS.length ||
    hosts.some(
      (host, index) => host !== C1_AUTHORIZED_FIREBASE_AUTH_DOMAINS[index]
    )
  ) {
    issues.push(
      'API runtime allowlist must be an exported array literal of exactly the authorized isolated preview hosts.'
    );
  }

  if (allowlist?.frozen !== true || bindings.has('Object')) {
    issues.push(
      'API runtime allowlist must use intrinsic Object.freeze on its literal array; mutable or shadowed initializers are unproven.'
    );
  }

  const comparator = functions.get('isAuthorizedC1FirebaseAuthDomain');
  const projectHelper = functions.get('isIsolatedC1ProjectId');
  const markerList = constants.get('FORBIDDEN_AUTH_DOMAIN_MARKERS');
  if (
    exportedConstants.has('FORBIDDEN_AUTH_DOMAIN_MARKERS') &&
    markerList?.frozen !== true
  ) {
    moduleShapeValid = false;
  }
  const approvedHost = C1_AUTHORIZED_FIREBASE_AUTH_DOMAINS[0];
  const topLevelNames = new Set(bindings.keys());

  const getSingleParameterName = (fn) => {
    if (
      fn === undefined ||
      fn.parameters.length !== 1 ||
      fn.asteriskToken !== undefined ||
      fn.modifiers?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword
      )
    )
      return undefined;
    const parameter = fn.parameters[0];
    if (
      !ts.isIdentifier(parameter.name) ||
      parameter.dotDotDotToken !== undefined ||
      parameter.questionToken !== undefined ||
      parameter.initializer !== undefined ||
      topLevelNames.has(parameter.name.text)
    )
      return undefined;
    return parameter.name.text;
  };
  const isTrimmedInput = (expression, inputName) => {
    const call = unwrap(expression);
    if (
      !ts.isCallExpression(call) ||
      call.questionDotToken !== undefined ||
      call.arguments.length !== 0 ||
      !ts.isPropertyAccessExpression(call.expression) ||
      call.expression.questionDotToken !== undefined ||
      call.expression.name.text !== 'trim'
    )
      return false;
    const base = unwrap(call.expression.expression);
    return (
      ts.isBinaryExpression(base) &&
      base.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken &&
      ts.isIdentifier(unwrap(base.left)) &&
      unwrap(base.left).text === inputName &&
      isString(base.right, '')
    );
  };
  const isMembershipReturn = (expression, hostName) => {
    const call = unwrap(expression);
    if (
      !ts.isCallExpression(call) ||
      call.questionDotToken !== undefined ||
      call.arguments.length !== 1 ||
      !ts.isIdentifier(unwrap(call.arguments[0])) ||
      unwrap(call.arguments[0]).text !== hostName ||
      !ts.isPropertyAccessExpression(call.expression) ||
      call.expression.questionDotToken !== undefined ||
      call.expression.name.text !== 'includes'
    )
      return false;
    const list = unwrap(call.expression.expression);
    return (
      ts.isIdentifier(list) &&
      list.text === 'C1_AUTHORIZED_FIREBASE_AUTH_DOMAINS'
    );
  };
  const isFalseReturnBranch = (statement) => {
    if (ts.isReturnStatement(statement))
      return unwrap(statement.expression)?.kind === ts.SyntaxKind.FalseKeyword;
    return (
      ts.isBlock(statement) &&
      statement.statements.length === 1 &&
      ts.isReturnStatement(statement.statements[0]) &&
      unwrap(statement.statements[0].expression)?.kind ===
        ts.SyntaxKind.FalseKeyword
    );
  };

  const isEmptyGuard = (expression, hostName) => {
    const condition = unwrap(expression);
    return (
      ts.isBinaryExpression(condition) &&
      condition.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken &&
      ts.isIdentifier(unwrap(condition.left)) &&
      unwrap(condition.left).text === hostName &&
      isString(condition.right, '')
    );
  };
  const getHostIncludesLiteral = (expression, hostName) => {
    const call = unwrap(expression);
    if (
      !ts.isCallExpression(call) ||
      call.questionDotToken !== undefined ||
      call.arguments.length !== 1 ||
      !ts.isPropertyAccessExpression(call.expression) ||
      call.expression.questionDotToken !== undefined ||
      call.expression.name.text !== 'includes' ||
      !ts.isIdentifier(unwrap(call.expression.expression)) ||
      unwrap(call.expression.expression).text !== hostName ||
      !ts.isStringLiteral(unwrap(call.arguments[0]))
    )
      return undefined;
    return unwrap(call.arguments[0]).text;
  };
  const isMarkerSomeGuard = (expression, hostName) => {
    const call = unwrap(expression);
    if (
      !ts.isCallExpression(call) ||
      call.questionDotToken !== undefined ||
      call.arguments.length !== 1 ||
      !ts.isPropertyAccessExpression(call.expression) ||
      call.expression.questionDotToken !== undefined ||
      call.expression.name.text !== 'some' ||
      !ts.isIdentifier(unwrap(call.expression.expression)) ||
      unwrap(call.expression.expression).text !==
        'FORBIDDEN_AUTH_DOMAIN_MARKERS' ||
      markerList?.kind !== 'array' ||
      bindingCounts.get('FORBIDDEN_AUTH_DOMAIN_MARKERS') !== 1
    )
      return false;
    const callback = unwrap(call.arguments[0]);
    if (
      !ts.isArrowFunction(callback) ||
      callback.modifiers?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword
      ) ||
      callback.parameters.length !== 1
    )
      return false;
    const parameter = callback.parameters[0];
    if (
      !ts.isIdentifier(parameter.name) ||
      parameter.dotDotDotToken !== undefined ||
      parameter.questionToken !== undefined ||
      parameter.initializer !== undefined ||
      parameter.name.text === hostName ||
      topLevelNames.has(parameter.name.text) ||
      ts.isBlock(callback.body)
    )
      return false;
    const includes = unwrap(callback.body);
    if (
      !ts.isCallExpression(includes) ||
      includes.questionDotToken !== undefined ||
      includes.arguments.length !== 1 ||
      !ts.isPropertyAccessExpression(includes.expression) ||
      includes.expression.questionDotToken !== undefined ||
      includes.expression.name.text !== 'includes' ||
      !ts.isIdentifier(unwrap(includes.expression.expression)) ||
      unwrap(includes.expression.expression).text !== hostName ||
      !ts.isIdentifier(unwrap(includes.arguments[0])) ||
      unwrap(includes.arguments[0]).text !== parameter.name.text
    )
      return false;
    return !markerList.value.some((marker) => approvedHost.includes(marker));
  };

  const isPureProjectHelper = () => {
    const fn = projectHelper?.length === 1 ? projectHelper[0] : undefined;
    const parameterName = getSingleParameterName(fn);
    if (
      fn === undefined ||
      !onlyExportModifier(fn) ||
      !fn.modifiers?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
      ) ||
      parameterName === undefined ||
      fn.body.statements.length !== 1 ||
      !ts.isReturnStatement(fn.body.statements[0])
    )
      return false;
    const comparison = unwrap(fn.body.statements[0].expression);
    if (
      !ts.isBinaryExpression(comparison) ||
      comparison.operatorToken.kind !== ts.SyntaxKind.EqualsEqualsEqualsToken ||
      !isTrimmedInput(comparison.left, parameterName) ||
      !ts.isIdentifier(unwrap(comparison.right)) ||
      unwrap(comparison.right).text !== 'ISOLATED_C1_PROJECT_ID'
    )
      return false;
    return (
      constants.get('ISOLATED_C1_PROJECT_ID')?.kind === 'string' &&
      bindingCounts.get('ISOLATED_C1_PROJECT_ID') === 1
    );
  };

  const fn = comparator?.length === 1 ? comparator[0] : undefined;
  const parameterName = getSingleParameterName(fn);
  let comparatorValid =
    moduleShapeValid &&
    functions.size === 2 &&
    comparator?.length === 1 &&
    projectHelper?.length === 1 &&
    fn !== undefined &&
    onlyExportModifier(fn) &&
    fn.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
    ) &&
    parameterName !== undefined &&
    isPureProjectHelper();
  if (comparatorValid) {
    const statements = fn.body.statements;
    const first = statements[0];
    if (
      !ts.isVariableStatement(first) ||
      (first.declarationList.flags & ts.NodeFlags.BlockScoped) !==
        ts.NodeFlags.Const ||
      (first.modifiers?.length ?? 0) !== 0 ||
      first.declarationList.declarations.length !== 1
    ) {
      comparatorValid = false;
    } else {
      const declaration = first.declarationList.declarations[0];
      if (
        !ts.isIdentifier(declaration.name) ||
        declaration.initializer === undefined ||
        topLevelNames.has(declaration.name.text) ||
        declaration.name.text === parameterName ||
        !isTrimmedInput(declaration.initializer, parameterName)
      ) {
        comparatorValid = false;
      } else {
        const hostName = declaration.name.text;
        const guardKinds = new Set();
        for (let index = 1; index < statements.length - 1; index += 1) {
          const statement = statements[index];
          if (
            !ts.isIfStatement(statement) ||
            statement.elseStatement !== undefined ||
            !isFalseReturnBranch(statement.thenStatement)
          ) {
            comparatorValid = false;
            break;
          }
          if (isEmptyGuard(statement.expression, hostName)) {
            guardKinds.add('empty');
          } else {
            const literal = getHostIncludesLiteral(
              statement.expression,
              hostName
            );
            if (literal !== undefined) {
              if (approvedHost.includes(literal)) comparatorValid = false;
              guardKinds.add('includes');
            } else if (isMarkerSomeGuard(statement.expression, hostName)) {
              guardKinds.add('markers');
            } else {
              comparatorValid = false;
            }
          }
        }
        const final = statements.at(-1);
        comparatorValid &&=
          guardKinds.has('empty') &&
          guardKinds.has('includes') &&
          guardKinds.has('markers') &&
          ts.isReturnStatement(final) &&
          final.expression !== undefined &&
          isMembershipReturn(final.expression, hostName);
      }
    }
  }
  if (!comparatorValid) issues.push(comparatorIssue);
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
