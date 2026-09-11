import { describe, expect, it } from 'vitest';

import {
  C_SLICE_TERRAFORM_MODULES,
  blockIsApplyGated,
  evaluateAllCSliceTerraform,
  evaluateCSliceTerraformSource,
  findHclBlocks,
  terraformValidateCommands
} from './terraform-sha-gate.mjs';

describe('C-slice Terraform SHA gate (static dry-run, no apply)', () => {
  it('gates every live C1/C2/C5/C6 resource and data block', () => {
    const report = evaluateAllCSliceTerraform();
    expect(report.ok).toBe(true);
    expect(report.apply).toBe('NOT_RUN');
    expect(report.issues).toEqual([]);
    expect(report.results.map((result) => result.slice)).toEqual([
      'C1',
      'C2',
      'C5',
      'C6'
    ]);
    expect(report.results[0].blockCount).toBeGreaterThan(5);
  });

  it('prints validate/plan commands that never apply and fail closed without a SHA', () => {
    const commands = terraformValidateCommands('infra/terraform/c1-foundation');
    expect(commands.join('\n')).toContain('init -backend=false');
    expect(commands.join('\n')).toContain('validate');
    expect(commands.join('\n')).toContain(
      'exact_apply_authority_sha=not_granted'
    );
    expect(commands.join('\n')).not.toMatch(/\bapply\b/);
    expect(commands.join('\n')).not.toContain('beauessence-clinic-staging');
  });

  it('rejects an ungated resource or a C1 Firestore bleed', () => {
    const c1 = C_SLICE_TERRAFORM_MODULES[0];
    const ungated = evaluateCSliceTerraformSource(c1, {
      main: `
locals { apply_enabled = var.exact_apply_authority_sha != "not_granted" }
resource "google_project_service" "open" {
  project = var.project_id
  service = "iam.googleapis.com"
}
`,
      variables: 'default     = "not_granted"\nbeauessence-clinic-staging\n'
    });
    expect(ungated.ok).toBe(false);
    expect(ungated.issues.join('\n')).toMatch(/not SHA-gated/);

    const firestore = evaluateCSliceTerraformSource(c1, {
      main: `
locals { apply_enabled = var.exact_apply_authority_sha != "not_granted" }
resource "google_firestore_database" "bad" {
  count = local.apply_enabled ? 1 : 0
}
`,
      variables: 'default     = "not_granted"\nbeauessence-clinic-staging\n'
    });
    expect(firestore.ok).toBe(false);
    expect(firestore.issues.join('\n')).toMatch(/google_firestore_database/);
  });

  it('parses nested HCL braces without treating inner blocks as resources', () => {
    const blocks = findHclBlocks(`
resource "google_billing_budget" "c1" {
  count = local.apply_enabled ? 1 : 0
  amount {
    specified_amount { units = "2000" }
  }
}
`);
    expect(blocks).toHaveLength(1);
    expect(blockIsApplyGated(blocks[0])).toBe(true);
  });
});
