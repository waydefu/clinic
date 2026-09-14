import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  C1_APPLY_DIRECTORY,
  C5_APPLY_DIRECTORY,
  PLAN_USAGE,
  planInternalTestC1IamApply,
  planInternalTestC5Apply,
  runInternalTestApplyPlanCli
} from './internal-test-apply-plan.mjs';

const HEAD = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const PACKET = {
  sha: HEAD,
  projectId: 'beauessence-clinic-stg-c1a01',
  operator: 'clinic-operator',
  approver: 'clinic-owner'
};

describe('planInternalTestC5Apply', () => {
  it('prints execute:false SHA-gated C5 apply and refuses destroy', () => {
    const plan = planInternalTestC5Apply(PACKET, HEAD);
    expect(plan.execute).toBe(false);
    expect(plan.target).toBe('c5');
    expect(plan.workingDirectory).toBe(C5_APPLY_DIRECTORY);
    expect(plan.applyCommand).toContain(`-chdir=${C5_APPLY_DIRECTORY}`);
    expect(plan.applyCommand).toContain(
      `-var=exact_apply_authority_sha=${HEAD}`
    );
    expect(plan.applyCommand).toContain(
      '-var=project_id=beauessence-clinic-stg-c1a01'
    );
    expect(plan.applyCommand).not.toContain('beauessence-clinic-staging');
    expect(plan.applyCommand).not.toMatch(/destroy|not_granted/);
    expect(plan.inspectCommand).toContain('inspect:internal-test-backup');
    expect(plan.rollbackReminder).toMatch(/not_granted/);
    expect(plan.rollbackReminder).toMatch(/Do not destroy/);
  });

  it('refuses staging and a stale SHA', () => {
    expect(() =>
      planInternalTestC5Apply(
        { ...PACKET, projectId: 'beauessence-clinic-staging' },
        HEAD
      )
    ).toThrow(/beauessence-clinic-staging/);
    expect(() =>
      planInternalTestC5Apply(
        { ...PACKET, sha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' },
        HEAD
      )
    ).toThrow(/not this HEAD/);
  });
});

describe('planInternalTestC1IamApply', () => {
  it('prints execute:false Pub/Sub-only C1 IAM apply', () => {
    const plan = planInternalTestC1IamApply(PACKET, HEAD);
    expect(plan.execute).toBe(false);
    expect(plan.target).toBe('c1-iam');
    expect(plan.workingDirectory).toBe(C1_APPLY_DIRECTORY);
    expect(plan.applyCommand).toContain(`-chdir=${C1_APPLY_DIRECTORY}`);
    expect(plan.applyCommand).toContain(
      `-var=exact_apply_authority_sha=${HEAD}`
    );
    expect(plan.applyCommand).not.toMatch(/destroy|not_granted|@/);
    expect(plan.inspectCommand).toContain('inspect:internal-test-monitoring');
    expect(plan.packetReminder).toMatch(/Pub\/Sub/);
    expect(plan.packetReminder).toMatch(/email recipients/);
  });
});

describe('runInternalTestApplyPlanCli', () => {
  it('exits 2 without applying when the packet is missing', () => {
    let stderr = '';
    const code = runInternalTestApplyPlanCli({
      argv: [],
      env: {},
      stdout: { write() {} },
      stderr: {
        write(chunk) {
          stderr += chunk;
        }
      }
    });
    expect(code).toBe(2);
    expect(stderr).toBe(PLAN_USAGE);
  });

  it('prints execute:false when pnpm injects --', () => {
    let stdout = '';
    const code = runInternalTestApplyPlanCli({
      argv: ['--', 'c5', HEAD],
      env: {
        INTERNAL_TEST_APPLY_SHA: HEAD,
        INTERNAL_TEST_APPLY_PROJECT: PACKET.projectId,
        INTERNAL_TEST_APPLY_OPERATOR: PACKET.operator,
        INTERNAL_TEST_APPLY_APPROVER: PACKET.approver
      },
      stdout: {
        write(chunk) {
          stdout += chunk;
        }
      },
      stderr: { write() {} }
    });
    expect(code).toBe(0);
    const plan = JSON.parse(stdout);
    expect(plan.execute).toBe(false);
    expect(plan.target).toBe('c5');
  });
});

describe('internal-test apply plan source', () => {
  it('does not apply, destroy, or shell out', () => {
    const source = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        'internal-test-apply-plan.mjs'
      ),
      'utf8'
    );
    expect(source).not.toMatch(/execFile|spawnSync/);
    expect(source).not.toMatch(/terraform destroy/);
    expect(source).toContain('execute: false');
  });
});
