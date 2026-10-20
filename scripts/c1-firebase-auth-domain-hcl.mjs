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
    const env = blocks(container, 'env').filter((block) =>
      attribute(block.body, 'name', '"CALENDAR_PILOT_FIREBASE_AUTH_DOMAIN"')
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
