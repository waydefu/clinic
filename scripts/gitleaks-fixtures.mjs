import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Non-secret probes exercise real scanner captures and allowlist scopes. These
// rules exist ONLY in isolated fixture configs, never in the repository scan.
const fixtureRules = String.raw`
[[rules]]
id = "fixture-value"
description = "Non-secret fixture assignment"
regex = '''(?i)\b(?:idempotencyKey|apiKey|probe)\s*[:=]\s*['"]([^'"\r\n]+)['"]'''
secretGroup = 1

[[rules]]
id = "fixture-vendor"
description = "Public fixture digest"
regex = '''"[A-Za-z0-9.-]+\.js": "([a-f0-9]{64})"'''
secretGroup = 1

[[rules]]
id = "fixture-canary"
description = "Non-secret companion finding"
regex = '''LEAK_CANARY_[A-Z0-9_]+'''
`;

export function fixtureCases() {
  const values = [
    'payroll-close-key-1234',
    'schedule_publish_1234',
    'schedule_publish_occupancy_1234',
    'schedule-publish-key-1234',
    'booking-idempotency-1234',
    'arrive-idempotency-1234',
    'complete-idempotency-1234',
    'follow-up-idempotency-1234',
    'stagef_c1_schedule_publish_v0'
  ];
  const cases = values.flatMap((value, index) => [
    {
      id: `value-${index}-positive`,
      input: `probe = '${value}'`,
      control: ['fixture-value'],
      expected: []
    },
    {
      id: `value-${index}-mixed`,
      input: `probe = '${value}'; LEAK_CANARY_COMPANION`,
      control: ['fixture-canary', 'fixture-value'],
      expected: ['fixture-canary']
    },
    ...['prefix_', '_suffix'].map((affix) => ({
      id: `value-${index}-${affix}`,
      input: `probe = '${affix === 'prefix_' ? affix + value : value + affix}'`,
      control: ['fixture-value'],
      expected: ['fixture-value']
    }))
  ]);
  const key = ['synthetic', 'key', '1234567890'].join('_');
  const body = `  body: { idempotencyKey: '${key}', format: 'csv' },`;
  const vendor = `  "auth.js": "${'ab'.repeat(32)}",`;
  return [
    ...cases,
    {
      id: 'body-positive',
      input: body,
      control: ['fixture-value'],
      expected: []
    },
    {
      id: 'body-mixed',
      input: body.replace(
        "format: 'csv'",
        "format: 'csv', note: LEAK_CANARY_BODY"
      ),
      control: ['fixture-canary', 'fixture-value'],
      expected: ['fixture-canary', 'fixture-value']
    },
    {
      id: 'vendor-positive',
      input: vendor,
      control: ['fixture-vendor'],
      expected: []
    },
    {
      id: 'vendor-mixed',
      input: `${vendor} LEAK_CANARY_VENDOR`,
      control: ['fixture-canary', 'fixture-vendor'],
      expected: ['fixture-canary', 'fixture-vendor']
    },
    {
      id: 'vendor-prefix',
      input: `prefix ${vendor}`,
      control: ['fixture-vendor'],
      expected: ['fixture-vendor']
    },
    {
      id: 'standalone-canary',
      input: 'LEAK_CANARY_STANDALONE',
      control: ['fixture-canary'],
      expected: ['fixture-canary']
    }
  ];
}

export function assessScan(
  result,
  findings,
  expected,
  { allowGeneric = false } = {}
) {
  if (
    result.error ||
    ![0, 1].includes(result.status) ||
    !Array.isArray(findings)
  ) {
    throw new Error('Fixture scanner execution/report failed.');
  }
  const actual = findings.map((finding) => finding.RuleID).sort();
  // Default generic-api-key may additionally recognise a fixture assignment.
  // It is never tolerated for a candidate's allowed/mixed-only-canary result.
  const generic = allowGeneric
    ? actual.filter((id) => id === 'generic-api-key')
    : [];
  const required = allowGeneric
    ? actual.filter((id) => id !== 'generic-api-key')
    : actual;
  if (
    result.status !== (expected.length === 0 ? 0 : 1) ||
    generic.length > 1 ||
    JSON.stringify(required) !== JSON.stringify([...expected].sort())
  ) {
    // Never echo scanner output or matched values, even on failure.
    throw new Error('Fixture detection/exit-code assertion failed.');
  }
  return actual;
}

export function runFixtureProof({
  binary = 'gitleaks',
  config,
  output,
  source
}) {
  const version = spawnSync(binary, ['version'], { encoding: 'utf8' });
  if (
    version.error ||
    version.status !== 0 ||
    version.stdout.trim() !== '8.30.1'
  ) {
    throw new Error('Expected pinned Gitleaks 8.30.1.');
  }
  const root = mkdtempSync(path.join(os.tmpdir(), 'gitleaks-fixture-'));
  try {
    const candidate = path.join(root, 'candidate.toml');
    const control = path.join(root, 'control.toml');
    writeFileSync(candidate, `${config}\n${fixtureRules}`);
    writeFileSync(control, `[extend]\nuseDefault = true\n${fixtureRules}`);
    const assertions = [];
    for (const fixture of fixtureCases()) {
      const directory = path.join(root, fixture.id);
      mkdirSync(directory);
      writeFileSync(path.join(directory, 'fixture.txt'), `${fixture.input}\n`);
      for (const [mode, configuration] of [
        ['control', control],
        ['candidate', candidate]
      ]) {
        const report = path.join(root, `${fixture.id}-${mode}.json`);
        const result = spawnSync(
          binary,
          [
            'dir',
            directory,
            '--config',
            configuration,
            '--redact',
            '--report-format',
            'json',
            '--report-path',
            report,
            '--exit-code',
            '1',
            '--no-banner'
          ],
          { encoding: 'utf8' }
        );
        let findings;
        try {
          findings = JSON.parse(readFileSync(report, 'utf8'));
        } catch {
          throw new Error(`Fixture report unavailable: ${fixture.id}/${mode}`);
        }
        const expected =
          mode === 'control' ? fixture.control : fixture.expected;
        assessScan(result, findings, expected, {
          allowGeneric:
            expected.includes('fixture-value') ||
            expected.includes('fixture-vendor')
        });
      }
      assertions.push({ id: fixture.id, status: 'PASS' });
    }
    const summary = {
      schemaVersion: 1,
      source,
      scannerVersion: '8.30.1',
      cases: assertions.length,
      assertions,
      scope:
        'isolated non-secret fixtures; not repository-history or real-credential proof'
    };
    mkdirSync(path.dirname(output), { recursive: true });
    writeFileSync(output, `${JSON.stringify(summary, null, 2)}\n`);
    return summary;
  } finally {
    // Only this function's freshly created non-secret fixture directory.
    rmSync(root, { recursive: true, force: true });
  }
}
