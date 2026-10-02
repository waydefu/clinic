import { accessSync, constants, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { ISOLATED_C1_FIREBASE_AUTH_DOMAIN } from './internal-test-c1-identity.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function hasCli(name) {
  const dirs = (process.env.PATH ?? '').split(':').filter(Boolean);
  for (const dir of dirs) {
    try {
      accessSync(join(dir, name), constants.X_OK);
      return true;
    } catch {
      /* keep scanning PATH */
    }
  }
  return false;
}

function terraformCliStatus() {
  return {
    gcloud: hasCli('gcloud'),
    terraform: hasCli('terraform'),
    firebase: hasCli('firebase')
  };
}

export const C_SLICE_TERRAFORM_MODULES = [
  {
    slice: 'C1',
    directory: 'infra/terraform/c1-foundation',
    allowedServiceSubstrings: [
      'billingbudgets.googleapis.com',
      'cloudbilling.googleapis.com',
      'cloudresourcemanager.googleapis.com',
      'iam.googleapis.com',
      'iamcredentials.googleapis.com',
      'logging.googleapis.com',
      'monitoring.googleapis.com',
      'pubsub.googleapis.com',
      'secretmanager.googleapis.com',
      'storage.googleapis.com',
      'sts.googleapis.com'
    ],
    forbiddenSubstrings: [
      'identitytoolkit.googleapis.com',
      'firestore.googleapis.com',
      'calendar-json.googleapis.com',
      'run.googleapis.com',
      'cloudscheduler.googleapis.com',
      'artifactregistry.googleapis.com',
      'google_firestore_database',
      'google_secret_manager_secret_version'
    ]
  },
  {
    slice: 'C2',
    directory: 'infra/terraform/c2-identity',
    allowedServiceSubstrings: ['identitytoolkit.googleapis.com'],
    forbiddenSubstrings: [
      'firestore.googleapis.com',
      'calendar-json.googleapis.com',
      'google_firestore_database'
    ]
  },
  {
    slice: 'C5',
    directory: 'infra/terraform/c5-firestore',
    allowedServiceSubstrings: ['firestore.googleapis.com'],
    forbiddenSubstrings: [
      'identitytoolkit.googleapis.com',
      'calendar-json.googleapis.com'
    ]
  },
  {
    slice: 'C6',
    directory: 'infra/terraform/c6-calendar',
    allowedServiceSubstrings: ['calendar-json.googleapis.com'],
    forbiddenSubstrings: [
      'identitytoolkit.googleapis.com',
      'firestore.googleapis.com',
      'google_firestore_database'
    ]
  }
];

function lineEnd(source, start) {
  let end = start;
  while (end < source.length && source[end] !== '\n' && source[end] !== '\r')
    end += 1;
  return end;
}

function skipBlockComment(source, start) {
  for (let index = start + 2; index < source.length; index += 1) {
    if (source.startsWith('/*', index))
      throw new Error('nested block comments are unsupported');
    if (source.startsWith('*/', index)) return index + 2;
  }
  throw new Error('unterminated block comment');
}

function skipTemplateExpression(source, start) {
  let braceDepth = 1;
  let index = start + 2;
  while (index < source.length) {
    if (source.startsWith('/*', index)) {
      index = skipBlockComment(source, index);
      continue;
    }
    if (source[index] === '#' || source.startsWith('//', index)) {
      index = lineEnd(source, index);
      continue;
    }
    if (source[index] === '"') {
      index = scanQuotedString(source, index);
      continue;
    }
    if (source[index] === '{') braceDepth += 1;
    else if (source[index] === '}') {
      braceDepth -= 1;
      if (braceDepth === 0) return index + 1;
    }
    index += 1;
  }
  throw new Error('unterminated template expression');
}

function scanQuotedString(source, start) {
  let index = start + 1;
  while (index < source.length) {
    const char = source[index];
    if (char === '\\') {
      index += 2;
      continue;
    }
    if (char === '"') return index + 1;
    if (char === '\n' || char === '\r')
      throw new Error('raw newlines in quoted strings are unsupported');
    if (source.startsWith('$${', index) || source.startsWith('%%{', index)) {
      index += 3;
      continue;
    }
    if (source.startsWith('${', index) || source.startsWith('%{', index)) {
      index = skipTemplateExpression(source, index);
      continue;
    }
    index += 1;
  }
  throw new Error('unterminated quoted string');
}

function scanHeredoc(source, start) {
  const opener = /^<<(-?)([A-Za-z_][A-Za-z0-9_]*)[ \t]*(?:\r\n|\n|\r)/.exec(
    source.slice(start)
  );
  if (opener === null)
    throw new Error('unsupported or malformed heredoc opener');
  const indented = opener[1] === '-';
  const delimiter = opener[2];
  let lineStart = start + opener[0].length;
  while (lineStart <= source.length) {
    const end = lineEnd(source, lineStart);
    const line = source.slice(lineStart, end);
    const candidate = indented ? line.replace(/^[ \t]*/, '') : line;
    if (
      candidate === delimiter ||
      new RegExp(`^${delimiter}[ \\t]*$`).test(candidate)
    )
      return end;
    if (end === source.length) break;
    lineStart = end + (source.startsWith('\r\n', end) ? 2 : 1);
  }
  throw new Error(`unterminated heredoc ${delimiter}`);
}

// This is a narrow lexer for block/attribute discovery, not an HCL parser.
// Anything outside the supported lexical forms raises and makes the gate fail closed.
function tokenizeHcl(source) {
  const tokens = [];
  let index = 0;
  const push = (kind, value, start, end, raw = source.slice(start, end)) =>
    tokens.push({ kind, value, start, end, raw });

  while (index < source.length) {
    const char = source[index];
    if (char === ' ' || char === '\t' || char === '\v' || char === '\f') {
      index += 1;
      continue;
    }
    if (char === '\n' || char === '\r') {
      const start = index;
      index += source.startsWith('\r\n', index) ? 2 : 1;
      push('newline', '\n', start, index);
      continue;
    }
    if (char === '#' || source.startsWith('//', index)) {
      index = lineEnd(source, index);
      continue;
    }
    if (source.startsWith('/*', index)) {
      const start = index;
      const end = skipBlockComment(source, index);
      for (let cursor = start; cursor < end; cursor += 1) {
        if (source[cursor] === '\n' || source[cursor] === '\r') {
          const newlineStart = cursor;
          if (source.startsWith('\r\n', cursor)) cursor += 1;
          push('newline', '\n', newlineStart, cursor + 1);
        }
      }
      index = end;
      continue;
    }
    if (char === '"') {
      const end = scanQuotedString(source, index);
      push('string', source.slice(index + 1, end - 1), index, end);
      index = end;
      continue;
    }
    if (source.startsWith('<<', index)) {
      const start = index;
      index = scanHeredoc(source, index);
      push('heredoc', '', start, index);
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      const start = index;
      index += 1;
      while (index < source.length && /[A-Za-z0-9_-]/.test(source[index]))
        index += 1;
      push('identifier', source.slice(start, index), start, index);
      continue;
    }
    if (/[0-9]/.test(char)) {
      const start = index;
      const number = /^[0-9]+(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(
        source.slice(index)
      );
      if (number === null) throw new Error('unsupported numeric literal');
      index += number[0].length;
      push('number', number[0], start, index);
      continue;
    }
    const operator = ['!=', '==', '&&', '||', '=>', '>=', '<=', '...'].find(
      (candidate) => source.startsWith(candidate, index)
    );
    if (operator !== undefined) {
      push('symbol', operator, index, index + operator.length);
      index += operator.length;
      continue;
    }
    if ('{}[]().,:?=<>!+-*/%&|^~;'.includes(char)) {
      push('symbol', char, index, index + 1);
      index += 1;
      continue;
    }
    throw new Error(`unsupported HCL character at offset ${index}`);
  }
  return tokens;
}

function nextNonNewline(tokens, start) {
  let index = start;
  while (tokens[index]?.kind === 'newline') index += 1;
  return index;
}

function isSymbol(token, value) {
  return token?.kind === 'symbol' && token.value === value;
}

function findMatchingBrace(tokens, start) {
  if (!isSymbol(tokens[start], '{'))
    throw new Error('expected an HCL block opener');
  let depth = 0;
  for (let index = start; index < tokens.length; index += 1) {
    if (isSymbol(tokens[index], '{')) depth += 1;
    else if (isSymbol(tokens[index], '}')) {
      depth -= 1;
      if (depth === 0) return index;
      if (depth < 0) throw new Error('unbalanced HCL block braces');
    }
  }
  throw new Error('unterminated HCL block');
}

function parseStringLabel(token, description) {
  if (token?.kind !== 'string' || token.raw.includes('\\'))
    throw new Error(`unsupported ${description} label`);
  if (token.raw.includes('${') || token.raw.includes('%{'))
    throw new Error(`templated ${description} labels are unsupported`);
  return token.value;
}

function parseTopLevelHcl(source, tokens) {
  const localsBlocks = [];
  const resourceBlocks = [];
  let depth = 0;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (depth === 0 && token.kind === 'identifier') {
      if (token.value === 'locals') {
        const openIndex = nextNonNewline(tokens, index + 1);
        if (!isSymbol(tokens[openIndex], '{'))
          throw new Error('could not parse top-level locals block');
        const closeIndex = findMatchingBrace(tokens, openIndex);
        localsBlocks.push(tokens.slice(openIndex + 1, closeIndex));
      }
      if (token.value === 'resource' || token.value === 'data') {
        const typeIndex = nextNonNewline(tokens, index + 1);
        const nameIndex = nextNonNewline(tokens, typeIndex + 1);
        const openIndex = nextNonNewline(tokens, nameIndex + 1);
        const type = parseStringLabel(tokens[typeIndex], 'resource type');
        const name = parseStringLabel(tokens[nameIndex], 'resource name');
        if (!isSymbol(tokens[openIndex], '{'))
          throw new Error(`could not parse top-level ${token.value} block`);
        const closeIndex = findMatchingBrace(tokens, openIndex);
        resourceBlocks.push({
          kind: token.value,
          type,
          name,
          body: source.slice(tokens[openIndex].start, tokens[closeIndex].end),
          bodyTokens: tokens.slice(openIndex + 1, closeIndex)
        });
      }
    }
    if (isSymbol(token, '{')) depth += 1;
    else if (isSymbol(token, '}')) {
      depth -= 1;
      if (depth < 0) throw new Error('unbalanced HCL block braces');
    }
  }
  if (depth !== 0) throw new Error('unterminated HCL block');
  return { localsBlocks, resourceBlocks };
}

function readAttributeExpression(tokens, start) {
  const nesting = [];
  const matchingClose = { '(': ')', '[': ']', '{': '}' };
  const closers = new Set(Object.values(matchingClose));
  const expression = [];
  for (let index = start; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.kind === 'newline' && nesting.length === 0)
      return { expression, endIndex: index };
    if (isSymbol(token, '}') && nesting.length === 0)
      return { expression, endIndex: index };
    if (
      token.kind === 'newline' &&
      nesting.length > 0 &&
      token.value === '\n'
    ) {
      expression.push(token);
      continue;
    }
    if (token.kind === 'symbol' && matchingClose[token.value] !== undefined)
      nesting.push(token.value);
    else if (token.kind === 'symbol' && closers.has(token.value)) {
      const opener = nesting.pop();
      if (opener === undefined || matchingClose[opener] !== token.value)
        throw new Error('unbalanced HCL expression delimiters');
    }
    expression.push(token);
  }
  if (nesting.length > 0) throw new Error('unterminated HCL expression');
  return { expression, endIndex: tokens.length };
}

function directAttributeExpressions(bodyTokens, name) {
  const expressions = [];
  const nesting = [];
  const matchingClose = { '(': ')', '[': ']', '{': '}' };
  const closers = new Set(Object.values(matchingClose));
  for (let index = 0; index < bodyTokens.length; index += 1) {
    const token = bodyTokens[index];
    if (
      nesting.length === 0 &&
      token.kind === 'identifier' &&
      token.value === name
    ) {
      const equalsIndex = nextNonNewline(bodyTokens, index + 1);
      if (isSymbol(bodyTokens[equalsIndex], '=')) {
        const { expression } = readAttributeExpression(
          bodyTokens,
          equalsIndex + 1
        );
        expressions.push(expression);
      }
    }
    if (token.kind === 'symbol' && matchingClose[token.value] !== undefined)
      nesting.push(token.value);
    else if (token.kind === 'symbol' && closers.has(token.value)) {
      const opener = nesting.pop();
      if (opener === undefined || matchingClose[opener] !== token.value)
        throw new Error('unbalanced HCL block expression delimiters');
    }
  }
  if (nesting.length > 0) throw new Error('unterminated HCL block expression');
  return expressions;
}

function hasExactApplyEnabled(localsBlocks) {
  const definitions = localsBlocks.flatMap((block) =>
    directAttributeExpressions(block, 'apply_enabled')
  );
  if (definitions.length !== 1) return false;
  const [expression] = definitions;
  return (
    expression.length === 5 &&
    expression[0].kind === 'identifier' &&
    expression[0].value === 'var' &&
    isSymbol(expression[1], '.') &&
    expression[2].kind === 'identifier' &&
    expression[2].value === 'exact_apply_authority_sha' &&
    isSymbol(expression[3], '!=') &&
    expression[4].kind === 'string' &&
    expression[4].raw === '"not_granted"'
  );
}

function withoutNewlines(tokens) {
  return tokens.filter((token) => token.kind !== 'newline');
}

function isExactCountGate(expression) {
  const tokens = withoutNewlines(expression);
  return (
    tokens.length === 7 &&
    tokens[0].kind === 'identifier' &&
    tokens[0].value === 'local' &&
    isSymbol(tokens[1], '.') &&
    tokens[2].kind === 'identifier' &&
    tokens[2].value === 'apply_enabled' &&
    isSymbol(tokens[3], '?') &&
    tokens[4].kind === 'number' &&
    tokens[4].value === '1' &&
    isSymbol(tokens[5], ':') &&
    tokens[6].kind === 'number' &&
    tokens[6].value === '0'
  );
}

function isEmptyCollectionForEachGate(expression) {
  const tokens = withoutNewlines(expression);
  if (
    tokens.length < 10 ||
    tokens[0].kind !== 'identifier' ||
    tokens[0].value !== 'local' ||
    !isSymbol(tokens[1], '.') ||
    tokens[2].kind !== 'identifier' ||
    tokens[2].value !== 'apply_enabled' ||
    !isSymbol(tokens[3], '?')
  )
    return false;

  let nestingDepth = 0;
  let pendingTernaries = 1;
  let separator = -1;
  for (let index = 4; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.kind === 'symbol' && ['(', '[', '{'].includes(token.value))
      nestingDepth += 1;
    else if (token.kind === 'symbol' && [')', ']', '}'].includes(token.value))
      nestingDepth -= 1;
    else if (
      token.kind === 'symbol' &&
      nestingDepth === 0 &&
      token.value === '?'
    )
      pendingTernaries += 1;
    else if (
      token.kind === 'symbol' &&
      nestingDepth === 0 &&
      token.value === ':'
    ) {
      pendingTernaries -= 1;
      if (pendingTernaries === 0) {
        separator = index;
        break;
      }
    }
    if (nestingDepth < 0) return false;
  }
  if (separator <= 4) return false;
  const fallback = tokens.slice(separator + 1);
  if (
    fallback.length === 2 &&
    isSymbol(fallback[0], '{') &&
    isSymbol(fallback[1], '}')
  )
    return true;
  return (
    fallback.length === 5 &&
    fallback[0].kind === 'identifier' &&
    fallback[0].value === 'toset' &&
    isSymbol(fallback[1], '(') &&
    isSymbol(fallback[2], '[') &&
    isSymbol(fallback[3], ']') &&
    isSymbol(fallback[4], ')')
  );
}

export function findHclBlocks(source) {
  const tokens = tokenizeHcl(source);
  return parseTopLevelHcl(source, tokens).resourceBlocks;
}

export function blockIsApplyGated(block) {
  if (!Array.isArray(block?.bodyTokens)) return false;
  const countExpressions = directAttributeExpressions(
    block.bodyTokens,
    'count'
  );
  const forEachExpressions = directAttributeExpressions(
    block.bodyTokens,
    'for_each'
  );
  if (countExpressions.length + forEachExpressions.length !== 1) return false;
  if (countExpressions.length === 1)
    return isExactCountGate(countExpressions[0]);
  return isEmptyCollectionForEachGate(forEachExpressions[0]);
}

export function terraformValidateCommands(directory) {
  const planVars = ['-var=exact_apply_authority_sha=not_granted'];
  if (directory === 'infra/terraform/c1-internal-test-run') {
    planVars.push(
      `-var=firebase_auth_domain=${ISOLATED_C1_FIREBASE_AUTH_DOMAIN}`
    );
  }
  return [
    `terraform -chdir=${directory} init -backend=false -input=false`,
    `terraform -chdir=${directory} validate`,
    `terraform -chdir=${directory} test`,
    `terraform -chdir=${directory} plan -input=false -lock=false -refresh=false ${planVars.join(' ')}`
  ];
}

export function evaluateCSliceTerraformSource(module, files) {
  const issues = [];
  const main = files.main ?? '';
  const variables = files.variables ?? '';
  const tftest = files.tftest ?? '';
  let parsedMain;
  try {
    parsedMain = parseTopLevelHcl(main, tokenizeHcl(main));
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : 'unknown lexer error';
    issues.push(`${module.slice} main.tf cannot be scanned safely: ${reason}.`);
  }
  let applyEnabledIsExact = false;
  if (parsedMain !== undefined) {
    try {
      applyEnabledIsExact = hasExactApplyEnabled(parsedMain.localsBlocks);
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : 'unknown parser error';
      issues.push(
        `${module.slice} main.tf cannot be scanned safely: ${reason}.`
      );
    }
  }
  if (!applyEnabledIsExact) {
    issues.push(`${module.slice} must SHA-gate apply_enabled.`);
  }
  if (!variables.includes('default     = "not_granted"')) {
    issues.push(
      `${module.slice} exact_apply_authority_sha must default to not_granted.`
    );
  }
  if (!variables.includes('beauessence-clinic-staging')) {
    issues.push(`${module.slice} must reject beauessence-clinic-staging.`);
  }
  if (!variables.includes('beauessence-clinic-stg-[a-z0-9]{1,7}')) {
    issues.push(
      `${module.slice} project_id must enforce a 1-7 character suffix (GCP max 30).`
    );
  }
  if (!tftest.includes('mock_provider "google"')) {
    issues.push(`${module.slice} must ship a mock_provider terraform test.`);
  }
  if (!tftest.includes('command = plan')) {
    issues.push(`${module.slice} terraform test must plan, not apply.`);
  }
  if (tftest.includes('command = apply')) {
    issues.push(`${module.slice} terraform test must not apply.`);
  }
  if (!tftest.includes('length(') || !tftest.includes('== 0')) {
    issues.push(`${module.slice} terraform test must assert zero resources.`);
  }
  if (!tftest.includes('beauessence-clinic-staging')) {
    issues.push(`${module.slice} terraform test must reject existing staging.`);
  }
  for (const forbidden of module.forbiddenSubstrings) {
    if (main.includes(forbidden)) {
      issues.push(`${module.slice} source contains forbidden ${forbidden}.`);
    }
  }
  for (const allowed of module.allowedServiceSubstrings) {
    if (!main.includes(allowed)) {
      issues.push(`${module.slice} must declare ${allowed}.`);
    }
  }
  const blocks = parsedMain?.resourceBlocks ?? [];
  if (blocks.length === 0) {
    issues.push(`${module.slice} main.tf has no resource or data blocks.`);
  }
  for (const block of blocks) {
    let gated = false;
    try {
      gated = blockIsApplyGated(block);
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : 'unknown parser error';
      issues.push(
        `${module.slice} ${block.kind} ${block.type}.${block.name} cannot be scanned safely: ${reason}.`
      );
    }
    if (!gated) {
      issues.push(
        `${module.slice} ${block.kind} ${block.type}.${block.name} is not SHA-gated.`
      );
    }
  }
  return { ok: issues.length === 0, issues, blockCount: blocks.length };
}

export function evaluateAllCSliceTerraform(repoRoot = root) {
  const results = C_SLICE_TERRAFORM_MODULES.map((module) => {
    const directory = join(repoRoot, module.directory);
    const files = {
      main: readFileSync(join(directory, 'main.tf'), 'utf8'),
      variables: readFileSync(join(directory, 'variables.tf'), 'utf8'),
      tftest: readFileSync(join(directory, 'noop.tftest.hcl'), 'utf8')
    };
    const evaluation = evaluateCSliceTerraformSource(module, files);
    return {
      slice: module.slice,
      directory: module.directory,
      validateCommands: terraformValidateCommands(module.directory),
      ...evaluation
    };
  });
  const issues = results.flatMap((result) => result.issues);
  return {
    ok: issues.length === 0,
    issues,
    results,
    terraformCli: terraformCliStatus(),
    apply: 'NOT_RUN'
  };
}

export const STAGE_F_TERRAFORM_MODULES = [
  {
    slice: 'F-RUN',
    directory: 'infra/terraform/c1-internal-test-run',
    allowedServiceSubstrings: [
      'run.googleapis.com',
      'artifactregistry.googleapis.com',
      'cloudbuild.googleapis.com',
      'cloudscheduler.googleapis.com',
      'GOOGLE_CALENDAR_AUTH',
      'CLOUD_ADC',
      'ignore_changes = [traffic]',
      'value = var.firebase_auth_domain'
    ],
    forbiddenSubstrings: [
      'identitytoolkit.googleapis.com',
      'firestore.googleapis.com',
      'calendar-json.googleapis.com',
      'google_firestore_database',
      'google_secret_manager_secret_version',
      'roles/owner',
      'roles/editor',
      ':latest',
      '/cal-pilot/',
      'GOOGLE_APPLICATION_CREDENTIALS',
      'name  = "PORT"',
      '${var.project_id}.firebaseapp.com'
    ]
  },
  {
    slice: 'F-WP-B4',
    directory: 'infra/terraform/wp-b4-alerting',
    allowedServiceSubstrings: [
      'c1-application-alerts',
      'DISTRIBUTION',
      'ALIGN_PERCENTILE_99',
      'duration                = "60s"',
      'evaluation_missing_data = "EVALUATION_MISSING_DATA_INACTIVE"',
      'auto_close           = "1800s"',
      'notification_prompts = ["OPENED", "CLOSED"]'
    ],
    forbiddenSubstrings: [
      'google_secret_manager_secret_version',
      'roles/owner',
      'roles/editor',
      'beauessence-clinic-staging.firebaseapp.com'
    ]
  }
];

export function evaluateAllStageFTerraform(repoRoot = root) {
  const results = STAGE_F_TERRAFORM_MODULES.map((module) => {
    const directory = join(repoRoot, module.directory);
    const files = {
      main: readFileSync(join(directory, 'main.tf'), 'utf8'),
      variables: readFileSync(join(directory, 'variables.tf'), 'utf8'),
      tftest: readFileSync(join(directory, 'noop.tftest.hcl'), 'utf8')
    };
    const evaluation = evaluateCSliceTerraformSource(module, files);
    return {
      slice: module.slice,
      directory: module.directory,
      validateCommands: terraformValidateCommands(module.directory),
      ...evaluation
    };
  });
  const issues = results.flatMap((result) => result.issues);
  return {
    ok: issues.length === 0,
    issues,
    results,
    terraformCli: terraformCliStatus(),
    apply: 'NOT_RUN'
  };
}

function isDirectRun() {
  const invoked = process.argv[1];
  if (typeof invoked !== 'string' || invoked === '') return false;
  return import.meta.url === pathToFileURL(invoked).href;
}

if (isDirectRun()) {
  const cSlices = evaluateAllCSliceTerraform();
  const stageF = evaluateAllStageFTerraform();
  const report = {
    ok: cSlices.ok && stageF.ok,
    apply: 'NOT_RUN',
    issues: [...cSlices.issues, ...stageF.issues],
    results: [...cSlices.results, ...stageF.results],
    terraformCli: cSlices.terraformCli
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(report.ok ? 0 : 1);
}
