import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { runTerraformMockTests, TERRAFORM_MODULES } from './terraform-ci.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const suites = [
  'c1-foundation/noop.tftest.hcl',
  'c1-internal-test-run/noop.tftest.hcl',
  'c2-identity/noop.tftest.hcl',
  'c5-firestore/noop.tftest.hcl',
  'c6-calendar/noop.tftest.hcl',
  'wp-b4-alerting/noop.tftest.hcl',
  'wp-b4-alerting/recovery.tftest.hcl'
];

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

describe('Terraform mock tests are part of required verify CI', () => {
  it('runs every existing mock suite with a disabled GCS backend and plan-only runs', () => {
    expect(TERRAFORM_MODULES).toEqual([
      'c1-foundation',
      'c1-internal-test-run',
      'c2-identity',
      'c5-firestore',
      'c6-calendar',
      'wp-b4-alerting'
    ]);

    const foundSuites = TERRAFORM_MODULES.flatMap((module) =>
      readdirSync(join(root, 'infra/terraform', module))
        .filter((file) => file.endsWith('.tftest.hcl'))
        .map((file) => `${module}/${file}`)
    ).sort();
    expect(foundSuites).toEqual([...suites].sort());

    for (const suite of suites) {
      const source = read(`infra/terraform/${suite}`);
      expect(source, suite).toContain('mock_provider "google" {}');
      expect(source, suite).toMatch(/command\s*=\s*plan\b/);
      expect(source, suite).not.toMatch(/command\s*=\s*apply\b/);
    }

    for (const module of TERRAFORM_MODULES) {
      const versions = read(`infra/terraform/${module}/versions.tf`);
      expect(versions, module).toContain('backend "gcs" {}');
      expect(versions, module).not.toMatch(
        /credentials|access_token|impersonate_service_account/i
      );
    }
  });

  it('prints the exact successful Terraform test-run count', () => {
    const calls = [];
    const output = [];
    const expectedPassed = TERRAFORM_MODULES.length * 4;
    const result = runTerraformMockTests({
      cwd: root,
      spawn: (_command, args) => {
        calls.push(args);
        return args.includes('init')
          ? { status: 0, stdout: '', stderr: '' }
          : {
              status: 0,
              stdout: 'Success! 4 passed, 0 failed.\n',
              stderr: ''
            };
      },
      write: (text) => output.push(text),
      writeError: (text) => output.push(text)
    });

    expect(calls).toHaveLength(TERRAFORM_MODULES.length * 2);
    for (let index = 0; index < calls.length; index += 2) {
      expect(calls[index]).toContain('init');
      expect(calls[index]).toContain('-backend=false');
      expect(calls[index]).toContain('-input=false');
      expect(calls[index]).toContain('-lockfile=readonly');
      expect(calls[index + 1]).toContain('test');
      expect(calls[index + 1]).toContain('-no-color');
      expect(calls[index + 1]).not.toContain('apply');
    }
    expect(result).toEqual({
      modules: TERRAFORM_MODULES.length,
      passed: expectedPassed,
      failed: 0
    });
    expect(output.join('')).toContain(
      `Terraform mock/noop tests: ${expectedPassed} passed, 0 failed across ${TERRAFORM_MODULES.length} modules.`
    );
  });

  it('propagates a failed mock assertion instead of continuing or swallowing it', () => {
    const calls = [];
    const output = [];

    expect(() =>
      runTerraformMockTests({
        root,
        spawn: (_command, args) => {
          calls.push(args);
          return args.includes('init')
            ? { status: 0, stdout: '', stderr: '' }
            : {
                status: 1,
                stdout: 'Failure! 0 passed, 1 failed.\n',
                stderr: 'mock assertion failed\n'
              };
        },
        write: (text) => output.push(text),
        writeError: (text) => output.push(text)
      })
    ).toThrow(/terraform test.*failed/i);

    expect(calls).toHaveLength(2);
    expect(output.join('')).toContain('mock assertion failed');
  });

  it.each([
    ['missing summary', ''],
    ['zero tests', 'Success! 0 passed, 0 failed.\n'],
    ['failed assertion', 'Success! 2 passed, 1 failed.\n'],
    [
      'ambiguous summary',
      'Success! 2 passed, 0 failed.\nSuccess! 2 passed, 0 failed.\n'
    ]
  ])('rejects a false-green Terraform result: %s', (_name, stdout) => {
    expect(() =>
      runTerraformMockTests({
        cwd: root,
        spawn: (_command, args) => ({
          status: 0,
          stdout: args.includes('init') ? '' : stdout,
          stderr: ''
        }),
        write: () => {},
        writeError: () => {}
      })
    ).toThrow(/terraform test/);
  });

  it('returns a failing CLI status when Terraform cannot start', () => {
    // This exercises the actual entry point without resolving any Terraform
    // executable, provider, backend or credential outside the test process.
    const result = spawnSync(process.execPath, ['scripts/terraform-ci.mjs'], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, PATH: '' }
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/terraform init.*failed/);
  });

  it('installs a fixed, checksum-verified CLI and runs inside the existing required job', () => {
    const workflow = read('.github/workflows/verify.yml');
    const verifyJob = workflow.slice(
      workflow.indexOf('  verify:\n'),
      workflow.indexOf('  rules:\n')
    );

    expect(verifyJob).toContain('Install Terraform CLI 1.9.8');
    expect(verifyJob).toContain("version='1.9.8'");
    expect(verifyJob).toContain(
      "checksum='186e0145f5e5f2eb97cbd785bc78f21bae4ef15119349f6ad4fa535b83b10df8'"
    );
    expect(verifyJob).toContain('sha256sum -c -');
    expect(verifyJob).toContain('node scripts/terraform-ci.mjs');
    expect(verifyJob).not.toContain('continue-on-error');
    expect(verifyJob).not.toMatch(/terraform\s+apply\b/);
    expect(verifyJob).not.toMatch(
      /GOOGLE_APPLICATION_CREDENTIALS|GOOGLE_CREDENTIALS/
    );
    expect(workflow).toContain('permissions:\n  contents: read');
    expect(workflow).toContain(
      'needs: [verify, rules, e2e, supply-chain, sast, gitleaks]'
    );
  });
});
