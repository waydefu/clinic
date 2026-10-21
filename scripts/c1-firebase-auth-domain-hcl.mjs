import {
  directAttributeExpressions,
  findHclBlocks,
  tokenizeHcl
} from './terraform-sha-gate.mjs';

// Conservative live-declaration admission, not a complete HCL evaluator.
// Reuse the existing lexer so comments, quoted strings and heredocs cannot
// supply code tokens. Unsupported syntax fails closed; nothing is executed.
function blocks(tokens, kind) {
  const result = [];
  const stack = [];
  const close = { '{': '}', '[': ']', '(': ')' };
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (
      stack.length === 0 &&
      token.kind === 'identifier' &&
      token.value === kind &&
      (index === 0 || tokens[index - 1].kind === 'newline')
    ) {
      let cursor = index + 1;
      const labels = [];
      while (tokens[cursor]?.kind === 'string') {
        if (/[\\]|\$\{|%\{/.test(tokens[cursor].value))
          throw new Error('Unsupported label');
        labels.push(tokens[cursor++].value);
      }
      if (tokens[cursor]?.kind === 'symbol' && tokens[cursor].value === '{') {
        const start = cursor + 1;
        let depth = 1;
        while (++cursor < tokens.length && depth > 0) {
          if (tokens[cursor].kind !== 'symbol') continue;
          if (tokens[cursor].value === '{') depth += 1;
          if (tokens[cursor].value === '}') depth -= 1;
        }
        if (depth !== 0) throw new Error('Unterminated block');
        result.push({ labels, body: tokens.slice(start, cursor - 1) });
        index = cursor - 1;
        continue;
      }
    }
    if (token.kind === 'symbol' && close[token.value]) stack.push(token.value);
    else if (
      token.kind === 'symbol' &&
      Object.values(close).includes(token.value)
    ) {
      if (close[stack.pop()] !== token.value)
        throw new Error('Unbalanced declaration');
    }
  }
  if (stack.length !== 0) throw new Error('Unterminated declaration');
  return result;
}

const code = (tokens) =>
  tokens
    .filter(({ kind }) => kind !== 'newline')
    .map(({ kind, value }) => [kind, value]);
const equalExpression = (actual, expected) =>
  JSON.stringify(code(actual)) === JSON.stringify(code(tokenizeHcl(expected)));
function attribute(body, name, expected) {
  const values = directAttributeExpressions(body, name);
  return values.length === 1 && equalExpression(values[0], expected);
}
function named(tokens, kind, label) {
  const matches = blocks(tokens, kind).filter(
    ({ labels }) => labels.length === 1 && labels[0] === label
  );
  if (matches.length !== 1)
    throw new Error('Missing or duplicate named declaration');
  return matches[0].body;
}
function onlyBlock(tokens, kind) {
  const matches = blocks(tokens, kind);
  if (matches.length !== 1 || matches[0].labels.length !== 0)
    throw new Error('Missing or duplicate block');
  return matches[0].body;
}

function literalEnvName(body) {
  const expressions = directAttributeExpressions(body, 'name');
  if (expressions.length !== 1) return undefined;
  const tokens = expressions[0].filter(({ kind }) => kind !== 'newline');
  if (
    tokens.length !== 1 ||
    tokens[0].kind !== 'string' ||
    !/^[A-Za-z_][A-Za-z0-9_]*$/.test(tokens[0].value)
  )
    return undefined;
  return tokens[0].value;
}

// Discover only a constant-key, literal-value object; do not evaluate HCL.
function constantMapKeys(expression) {
  const tokens = expression.filter(({ kind }) => kind !== 'newline');
  if (
    tokens[0]?.kind !== 'symbol' ||
    tokens[0].value !== '{' ||
    tokens.at(-1)?.kind !== 'symbol' ||
    tokens.at(-1).value !== '}'
  )
    return undefined;
  const keys = [];
  for (let index = 1; index < tokens.length - 1;) {
    const key = tokens[index++];
    const equals = tokens[index++];
    if (
      !['identifier', 'string'].includes(key.kind) ||
      !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key.value) ||
      equals?.kind !== 'symbol' ||
      equals.value !== '='
    )
      return undefined;
    const value = tokens[index++];
    if (value?.kind !== 'string' || /[\\]|\$\{|%\{/.test(value.value))
      return undefined;
    keys.push(key.value);
    if (tokens[index]?.value === ',') index += 1;
  }
  return new Set(keys).size === keys.length ? keys : undefined;
}

function dynamicEnvCannotOverrideAuthDomain(block, mainTokens) {
  const content = onlyBlock(block.body, 'content');
  const literal = literalEnvName(content);
  if (literal !== undefined)
    return literal !== 'CALENDAR_PILOT_FIREBASE_AUTH_DOMAIN';
  if (
    !attribute(content, 'name', 'env.key') ||
    directAttributeExpressions(block.body, 'iterator').length !== 0 ||
    !attribute(
      block.body,
      'for_each',
      'local.apply_enabled ? local.api_secret_env_when_mounted : {}'
    )
  )
    return false;

  const locals = blocks(mainTokens, 'locals');
  const definitions = (name) =>
    locals.flatMap((local) => directAttributeExpressions(local.body, name));
  const mounted = definitions('api_secret_env_when_mounted');
  const maps = definitions('api_secret_env');
  if (
    mounted.length !== 1 ||
    maps.length !== 1 ||
    !equalExpression(
      mounted[0],
      `local.apply_enabled ? {
      for env_name, secret_id in local.api_secret_env :
      env_name => secret_id
      if can(regex(local.numeric_secret_version, var.api_secret_versions[env_name]))
    } : {}`
    )
  )
    return false;
  const keys = constantMapKeys(maps[0]);
  return (
    keys !== undefined && !keys.includes('CALENDAR_PILOT_FIREBASE_AUTH_DOMAIN')
  );
}

export function inspectC1AuthDomainHcl({
  variables,
  main,
  example,
  tftest,
  approvedHost
}) {
  const issues = [];
  const check = (label, inspect) => {
    try {
      if (inspect()) return;
    } catch {
      // Do not echo source text from a lexical/shape failure.
    }
    issues.push(
      `C1 authDomain requires live ${label} syntax; comments and inert strings are not evidence.`
    );
  };

  check('variable/default/blocking validation', () => {
    const body = named(
      tokenizeHcl(variables),
      'variable',
      'firebase_auth_domain'
    );
    const validations = blocks(body, 'validation');
    const whitelist = `(var.firebase_auth_domain == "" || (
      var.firebase_auth_domain == ${JSON.stringify(approvedHost)} &&
      !strcontains(var.firebase_auth_domain, "://") &&
      !strcontains(var.firebase_auth_domain, "*") &&
      !strcontains(var.firebase_auth_domain, "/") &&
      !strcontains(var.firebase_auth_domain, "firebaseapp.com") &&
      !strcontains(var.firebase_auth_domain, "beauessence-clinic-staging") &&
      !strcontains(var.firebase_auth_domain, "beauessence.com.tw")
    ))`;
    const required = `(!local.apply_enabled || (
      var.firebase_auth_domain != "" &&
      !strcontains(var.firebase_auth_domain, "firebaseapp.com")
    ))`;
    return (
      attribute(body, 'type', 'string') &&
      attribute(body, 'default', '""') &&
      validations.some((block) =>
        attribute(block.body, 'condition', whitelist)
      ) &&
      validations.some((block) => attribute(block.body, 'condition', required))
    );
  });

  check('API env wiring', () => {
    const resources = findHclBlocks(main).filter(
      (block) =>
        block.kind === 'resource' &&
        block.type === 'google_cloud_run_v2_service' &&
        block.name === 'api'
    );
    if (resources.length !== 1) return false;
    const template = onlyBlock(resources[0].bodyTokens, 'template');
    const container = onlyBlock(template, 'containers');
    const direct = blocks(container, 'env');
    if (direct.some((block) => literalEnvName(block.body) === undefined))
      return false;
    const dynamic = blocks(container, 'dynamic').filter(
      (block) => block.labels.length === 1 && block.labels[0] === 'env'
    );
    const mainTokens = tokenizeHcl(main);
    if (
      dynamic.some(
        (block) => !dynamicEnvCannotOverrideAuthDomain(block, mainTokens)
      )
    )
      return false;
    const env = direct.filter(
      (block) =>
        literalEnvName(block.body) === 'CALENDAR_PILOT_FIREBASE_AUTH_DOMAIN'
    );
    return (
      env.length === 1 &&
      attribute(env[0].body, 'value', 'var.firebase_auth_domain')
    );
  });

  check('example assignment', () =>
    attribute(
      tokenizeHcl(example),
      'firebase_auth_domain',
      JSON.stringify(approvedHost)
    )
  );

  check('noop and denied-case test declarations', () => {
    const tokens = tokenizeHcl(tftest);
    const noop = named(tokens, 'run', 'default_sha_is_noop');
    const noopVariables = onlyBlock(noop, 'variables');
    if (
      !attribute(noop, 'command', 'plan') ||
      !attribute(noopVariables, 'exact_apply_authority_sha', '"not_granted"') ||
      !attribute(noopVariables, 'firebase_auth_domain', '""')
    )
      return false;
    const cases = [
      ['named_sha_without_auth_domain_is_rejected', '""'],
      [
        'firebaseapp_auth_domain_is_rejected',
        '"beauessence-clinic-stg-c1a01.firebaseapp.com"'
      ]
    ];
    return cases.every(([label, value]) => {
      const run = named(tokens, 'run', label);
      return (
        attribute(run, 'command', 'plan') &&
        attribute(onlyBlock(run, 'variables'), 'firebase_auth_domain', value) &&
        attribute(run, 'expect_failures', '[var.firebase_auth_domain]')
      );
    });
  });
  return issues;
}
