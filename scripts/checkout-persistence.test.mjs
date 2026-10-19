import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

// Read actual job/step mappings, including flow syntax and resolved aliases.
// A neighboring step, shell string or overridden inherited input is not proof.
function checkoutSettings(text) {
  const workflow = parse(text, { merge: true });
  if (
    !workflow?.jobs ||
    Array.isArray(workflow.jobs) ||
    typeof workflow.jobs !== 'object'
  ) {
    throw new Error('Expected a workflow jobs mapping');
  }
  return Object.entries(workflow.jobs).flatMap(([job, definition]) => {
    if (!definition || typeof definition !== 'object')
      throw new Error('Expected a job mapping');
    if (definition.steps === undefined) return []; // reusable-workflow job
    if (!Array.isArray(definition.steps))
      throw new Error('Expected a steps sequence');
    return definition.steps.flatMap((step, index) => {
      if (!step || typeof step !== 'object')
        throw new Error('Expected a step mapping');
      if (step.uses === undefined) return []; // run step
      if (typeof step.uses !== 'string')
        throw new Error('Expected a literal action reference');
      if (!step.uses.startsWith('actions/checkout@')) return [];
      return [
        {
          job,
          step: index + 1,
          values: Object.hasOwn(step.with ?? {}, 'persist-credentials')
            ? [step.with['persist-credentials']]
            : []
        }
      ];
    });
  });
}

const violations = (steps) =>
  steps.filter(
    ({ values }) =>
      values.length !== 1 || (values[0] !== false && values[0] !== 'false')
  );

const checkout = (...lines) =>
  [
    'jobs:',
    '  verify:',
    '    steps:',
    '      - uses: actions/checkout@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    ...lines
  ].join('\n');

const explicitFalse = ['        with:', '          persist-credentials: false'];

describe('checkout source policy', () => {
  it('accepts only an explicit false in the checkout step', () => {
    expect(checkoutSettings(checkout(...explicitFalse))).toEqual([
      { job: 'verify', step: 1, values: [false] }
    ]);
  });

  it('also reads a named checkout with another existing input', () => {
    const source = [
      'jobs:',
      '  verify:',
      '    steps:',
      '      - name: Read the candidate',
      '        uses: actions/checkout@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      '        with:',
      '          fetch-depth: 0',
      '          persist-credentials: false # explicit boolean'
    ].join('\n');
    expect(checkoutSettings(source)).toEqual([
      { job: 'verify', step: 1, values: [false] }
    ]);
  });

  it.each(['true', '"true"', '${{ inputs.persist }}'])(
    'does not treat %s as a declared false',
    (value) => {
      const steps = checkoutSettings(
        checkout('        with:', `          persist-credentials: ${value}`)
      );
      expect(violations(steps)).toHaveLength(1);
    }
  );

  it('rejects omission even when a later step declares false', () => {
    const steps = checkoutSettings(
      checkout(
        '      - uses: actions/checkout@bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        ...explicitFalse
      )
    );
    expect(steps.map((step) => step.values)).toEqual([[], [false]]);
    expect(violations(steps)).toHaveLength(1);
  });

  it('does not accept false from env or duplicate input keys', () => {
    expect(
      checkoutSettings(
        checkout('        env:', '          persist-credentials: false')
      )[0].values
    ).toEqual([]);
    expect(() =>
      checkoutSettings(
        checkout(...explicitFalse, '          persist-credentials: true')
      )
    ).toThrow();
  });

  it('accepts flow mappings and resolved boolean aliases', () => {
    expect(
      violations(
        checkoutSettings(
          checkout('        with: { persist-credentials: false }')
        )
      )
    ).toEqual([]);
    expect(
      violations(
        checkoutSettings(
          checkout('        with: { persist-credentials: "false" }')
        )
      )
    ).toEqual([]);
    expect(
      violations(
        checkoutSettings(
          'shared: &shared false\n' +
            checkout('        with:', '          persist-credentials: *shared')
        )
      )
    ).toEqual([]);
  });

  it('checks aliased checkout steps and merged input overrides', () => {
    const anchor =
      'checkout: &checkout\n  uses: actions/checkout@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n  with: { persist-credentials: false }\n';
    const alias = anchor + 'jobs:\n  verify:\n    steps:\n      - *checkout\n';
    expect(violations(checkoutSettings(alias))).toEqual([]);
    expect(
      violations(
        checkoutSettings(
          alias.replace(
            'persist-credentials: false',
            'persist-credentials: true'
          )
        )
      )
    ).toHaveLength(1);
    const override =
      anchor +
      'jobs:\n  verify:\n    steps:\n      - <<: *checkout\n        with: { persist-credentials: true }\n';
    expect(violations(checkoutSettings(override))).toHaveLength(1);
  });

  it('does not silently accept malformed structure or an unresolved alias', () => {
    expect(() => checkoutSettings('jobs: []')).toThrow();
    expect(() => checkoutSettings('unrelated: value')).toThrow();
    expect(() =>
      checkoutSettings(
        checkout('        with:', '          persist-credentials: *missing')
      )
    ).toThrow();
  });

  it('requires explicit false in every checkout across the actual workflows', () => {
    const directory = new URL('../.github/workflows/', import.meta.url);
    const files = readdirSync(directory).filter((name) =>
      /\.ya?ml$/.test(name)
    );
    const steps = files.flatMap((file) =>
      checkoutSettings(readFileSync(new URL(file, directory), 'utf8')).map(
        (step) => ({ file, ...step })
      )
    );
    expect(files.length).toBeGreaterThan(0);
    expect(steps.length).toBeGreaterThan(0);
    expect(violations(steps)).toEqual([]);
    const first = steps[0];
    expect(violations([{ ...first, values: [true] }])).toHaveLength(1);
    expect(violations([{ ...first, values: [] }])).toHaveLength(1);
  });
});
