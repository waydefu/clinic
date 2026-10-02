import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  C_SLICE_TERRAFORM_MODULES,
  blockIsApplyGated,
  evaluateAllCSliceTerraform,
  evaluateAllStageFTerraform,
  evaluateCSliceTerraformSource,
  findHclBlocks,
  terraformValidateCommands
} from './terraform-sha-gate.mjs';

const passingTftest = `mock_provider "google" {}
command = plan
length(google_project_service.c1) == 0
beauessence-clinic-staging
`;
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const exactApplyEnabled = 'var.exact_apply_authority_sha != "not_granted"';
const c1FixtureVariables =
  'default     = "not_granted"\nbeauessence-clinic-staging\nbeauessence-clinic-stg-[a-z0-9]{1,7}\n';

function c1FixtureMain(localsSource) {
  const services = C_SLICE_TERRAFORM_MODULES[0].allowedServiceSubstrings
    .map((service) => `    "${service}"`)
    .join(',\n');
  return `${localsSource}
locals {
  fixture_services = [
${services}
  ]
}
resource "google_project_service" "fixture" {
  count = local.apply_enabled ? 1 : 0
}
`;
}

function c1FixtureFiles(main) {
  return { main, variables: c1FixtureVariables, tftest: passingTftest };
}

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

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

  it('gates Stage F Cloud Run and WP-B4 source without applying', () => {
    const report = evaluateAllStageFTerraform();
    expect(report.ok).toBe(true);
    expect(report.apply).toBe('NOT_RUN');
    expect(report.issues).toEqual([]);
    expect(report.results.map((result) => result.slice)).toEqual([
      'F-RUN',
      'F-WP-B4'
    ]);
  });

  it('accepts Terraform alignment while still requiring the exact SHA comparison', () => {
    const files = {
      main: '',
      variables:
        'default     = "not_granted"\nbeauessence-clinic-staging\nbeauessence-clinic-stg-[a-z0-9]{1,7}\n',
      tftest: passingTftest
    };
    for (const [expression, expected] of [
      ['var.exact_apply_authority_sha != "not_granted"', true],
      ['var.exact_apply_authority_sha == "not_granted"', false],
      ['var.other_sha != "not_granted"', false],
      ['var.exact_apply_authority_sha != "not_granted" || true', false],
      ['true', false]
    ]) {
      const result = evaluateCSliceTerraformSource(
        C_SLICE_TERRAFORM_MODULES[0],
        {
          ...files,
          main: `locals {\n  apply_enabled                      = ${expression}\n}`
        }
      );
      const comparisonIssue = 'C1 must SHA-gate apply_enabled.';
      if (expected)
        expect(result.issues, expression).not.toContain(comparisonIssue);
      else expect(result.issues, expression).toContain(comparisonIssue);
    }
  });

  it('accepts the exact top-level local with Terraform line and block comments', () => {
    for (const comment of [
      '# trailing comment',
      '// trailing comment',
      '/* trailing comment */'
    ]) {
      const main = c1FixtureMain(`locals {
  apply_enabled = ${exactApplyEnabled} ${comment}
}`);
      const result = evaluateCSliceTerraformSource(
        C_SLICE_TERRAFORM_MODULES[0],
        c1FixtureFiles(main)
      );
      expect(result.issues).not.toContain('C1 must SHA-gate apply_enabled.');
      expect(result.blockCount).toBe(1);
    }
  });

  it('rejects a permissive real local even when a comment contains the exact SHA expression', () => {
    const main = c1FixtureMain(`locals {
  apply_enabled = true
  # { apply_enabled = ${exactApplyEnabled}
}`);
    const result = evaluateCSliceTerraformSource(
      C_SLICE_TERRAFORM_MODULES[0],
      c1FixtureFiles(main)
    );
    expect(result.issues).toContain('C1 must SHA-gate apply_enabled.');
  });

  it('rejects the actual C1 source mutated to true even with a comment decoy', () => {
    const relativeDirectory = 'infra/terraform/c1-foundation';
    const main = read(`${relativeDirectory}/main.tf`);
    const exactLine = `apply_enabled = ${exactApplyEnabled}\n`;
    expect(main.split(exactLine)).toHaveLength(2);
    const variables = read(`${relativeDirectory}/variables.tf`);
    const tftest = read(`${relativeDirectory}/noop.tftest.hcl`);
    const original = evaluateCSliceTerraformSource(
      C_SLICE_TERRAFORM_MODULES[0],
      { main, variables, tftest }
    );
    const mutatedMain = main.replace(
      exactLine,
      `apply_enabled = true\n  # { apply_enabled = ${exactApplyEnabled}\n`
    );
    const result = evaluateCSliceTerraformSource(C_SLICE_TERRAFORM_MODULES[0], {
      main: mutatedMain,
      variables,
      tftest
    });
    expect(result.ok).toBe(false);
    expect(result.issues).toContain('C1 must SHA-gate apply_enabled.');
    expect(result.blockCount).toBe(original.blockCount);
  });

  it('finds an actual C1 resource after quoted top-level braces', () => {
    const relativeDirectory = 'infra/terraform/c1-foundation';
    const main = read(`${relativeDirectory}/main.tf`);
    const variables = read(`${relativeDirectory}/variables.tf`);
    const tftest = read(`${relativeDirectory}/noop.tftest.hcl`);
    const original = evaluateCSliceTerraformSource(
      C_SLICE_TERRAFORM_MODULES[0],
      { main, variables, tftest }
    );
    const mutatedMain = `${main}
locals {
  hidden_open = "{"
}
resource "google_project_service" "unguarded_after_string_brace" {
  service = "logging.googleapis.com"
}
locals {
  hidden_close = "}"
}
`;
    const result = evaluateCSliceTerraformSource(C_SLICE_TERRAFORM_MODULES[0], {
      main: mutatedMain,
      variables,
      tftest
    });

    expect(original.blockCount).toBe(16);
    expect(result.ok).toBe(false);
    expect(result.blockCount).toBe(17);
    expect(result.issues).toContain(
      'C1 resource google_project_service.unguarded_after_string_brace is not SHA-gated.'
    );
  });

  it('does not accept literals, heredocs, nested maps or duplicate locals as the gate', () => {
    const stringDecoy = exactApplyEnabled.replaceAll('"', '\\"');
    const mainSources = [
      `locals {
  apply_enabled = true
  decoy = "apply_enabled = ${stringDecoy}"
}`,
      `locals {
  apply_enabled = true
  decoy = <<-EOT
    apply_enabled = ${exactApplyEnabled}
  EOT
}`,
      `locals {
  apply_enabled = true
  nested = { apply_enabled = ${exactApplyEnabled} }
}`,
      `locals {
  apply_enabled = ${exactApplyEnabled}
}
locals {
  apply_enabled = true
}`,
      `locals {
  apply_enabled = ${exactApplyEnabled} || true
}`,
      `locals {
  apply_enabled "=" ${exactApplyEnabled}
}`,
      `locals {
  apply_enabled = var "." exact_apply_authority_sha "!=" "not_granted"
}`
    ];
    for (const localsSource of mainSources) {
      const result = evaluateCSliceTerraformSource(
        C_SLICE_TERRAFORM_MODULES[0],
        c1FixtureFiles(c1FixtureMain(localsSource))
      );
      expect(result.issues).toContain('C1 must SHA-gate apply_enabled.');
    }

    const quotedCountSymbols = findHclBlocks(`
resource "google_project_service" "quoted_count_symbols" {
  count = local "." apply_enabled "?" 1 ":" 0
}
`);
    expect(blockIsApplyGated(quotedCountSymbols[0])).toBe(false);
  });

  it('prints validate/plan/test commands that never apply and fail closed without a SHA', () => {
    const commands = terraformValidateCommands('infra/terraform/c1-foundation');
    expect(commands.join('\n')).toContain('init -backend=false');
    expect(commands.join('\n')).toContain('validate');
    expect(commands.join('\n')).toContain(
      'terraform -chdir=infra/terraform/c1-foundation test'
    );
    expect(commands.join('\n')).toContain(
      'exact_apply_authority_sha=not_granted'
    );
    expect(commands.join('\n')).not.toMatch(/\bapply\b/);
    expect(commands.join('\n')).not.toContain('beauessence-clinic-staging');
    const c1Run = terraformValidateCommands(
      'infra/terraform/c1-internal-test-run'
    ).join('\n');
    expect(c1Run).toContain(
      '-var=firebase_auth_domain=beauessence-clinic-stg-c1a01--internal-preproduction-3u85hkcz.web.app'
    );
    expect(c1Run).not.toContain('firebaseapp.com');
    expect(c1Run).not.toMatch(/\bapply\b/);
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
      variables:
        'default     = "not_granted"\nbeauessence-clinic-staging\nbeauessence-clinic-stg-[a-z0-9]{1,7}\n',
      tftest: passingTftest
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
      variables:
        'default     = "not_granted"\nbeauessence-clinic-staging\nbeauessence-clinic-stg-[a-z0-9]{1,7}\n',
      tftest: passingTftest
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

  it('keeps quoted and heredoc delimiters out of block and expression nesting', () => {
    for (const [index, [open, close]] of [
      ['{', '}'],
      ['[', ']'],
      ['(', ')']
    ].entries()) {
      const blocks = findHclBlocks(`
resource "google_project_service" "quoted_openers" {
  delimiter_open = "${open}"
  count = local.apply_enabled ? 1 : 0
  delimiter_close = "${close}"
  script = <<-EOT
    }]) {[(
    resource "google_project_service" "heredoc_decoy" {
      count = local.apply_enabled ? 1 : 0
    }
  EOT
}
`);

      expect(
        blocks.map(({ name }) => name),
        `delimiter pair ${index}`
      ).toEqual(['quoted_openers']);
      expect(blockIsApplyGated(blocks[0]), `delimiter pair ${index}`).toBe(
        true
      );
    }
  });

  it('ignores comment and string resource/count decoys in the resource guard', () => {
    const stringDecoy = JSON.stringify(
      'resource "google_project_service" "string_decoy" { count = local.apply_enabled ? 1 : 0 }'
    );
    const blocks = findHclBlocks(`
# resource "google_project_service" "comment_decoy" {
#   count = local.apply_enabled ? 1 : 0
# }
locals {
  decoy = ${stringDecoy}
}
resource "google_project_service" "real" {
  # count = local.apply_enabled ? 1 : 0
  project = var.project_id
}
`);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      kind: 'resource',
      type: 'google_project_service',
      name: 'real'
    });
    expect(blockIsApplyGated(blocks[0])).toBe(false);
  });

  it('fails closed when HCL lexical structure cannot be scanned', () => {
    const malformedMain = 'locals { description = "unterminated }';
    expect(() => findHclBlocks(malformedMain)).toThrow(
      /unterminated quoted string/
    );
    const result = evaluateCSliceTerraformSource(
      C_SLICE_TERRAFORM_MODULES[0],
      c1FixtureFiles(malformedMain)
    );
    expect(result.ok).toBe(false);
    expect(result.issues).toContain(
      'C1 main.tf cannot be scanned safely: unterminated quoted string.'
    );
  });
});
