import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * AUD-14. A Terraform `check` block only reports a warning: `terraform plan`
 * still exits 0 and the configuration can be applied. A REQUIRED condition must
 * therefore be a blocking construct (variable `validation`, resource/data
 * `precondition`, or output `precondition`) and its `*.tftest.hcl` run must
 * expect that construct, because `expect_failures = [var.x]` fails with
 * "Missing expected failure" when the construct stops blocking, whereas
 * `expect_failures = [check.x]` passes on a warning.
 *
 * ADVISORY_CHECKS lists the only `check` blocks that may exist, keyed
 * `<module>/<check name>` with the reason the condition is advisory. It is
 * empty today: the six conditions that were `check` blocks (five in
 * c1-internal-test-run, one in wp-b4-alerting) are all required, so none was
 * kept as advisory.
 */
const ADVISORY_CHECKS = new Map();

const TERRAFORM_ROOT = 'infra/terraform';
const root = dirname(dirname(fileURLToPath(import.meta.url)));

function walk(dir, suffix, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.terraform') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, suffix, found);
    } else if (entry.name.endsWith(suffix)) {
      found.push(full);
    }
  }
  return found;
}

function moduleOf(file) {
  return relative(join(root, TERRAFORM_ROOT), file).split(/[\\/]/)[0];
}

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

function blockOf(source, opener) {
  const start = source.indexOf(opener);
  if (start < 0) return undefined;
  const end = source.indexOf('\n}', start);
  return end < 0 ? undefined : source.slice(start, end + 2);
}

function checkBlocks(source) {
  return [...source.matchAll(/^check\s+"([^"]+)"\s*\{/gm)].map(
    (match) => match[1]
  );
}

const REQUIRED_CONDITIONS = [
  {
    module: 'c1-internal-test-run',
    variable: 'api_image',
    message:
      'Applying C1 internal-test Cloud Run requires a digest-pinned api_image for this project_id.',
    run: 'named_sha_without_images_is_rejected'
  },
  {
    module: 'c1-internal-test-run',
    variable: 'worker_image',
    message:
      'Applying C1 internal-test Cloud Run requires a digest-pinned worker_image for this project_id.',
    run: 'named_sha_with_worker_image_from_another_project_is_rejected'
  },
  {
    module: 'c1-internal-test-run',
    variable: 'project_id',
    message:
      'Inbound Calendar sync is restricted to the exact isolated C1 project.',
    run: 'calendar_sync_refuses_another_staging_project'
  },
  {
    module: 'c1-internal-test-run',
    variable: 'project_id',
    message:
      'Inbound Calendar sync is restricted to the exact isolated C1 project.',
    run: 'calendar_sync_prerequisites_without_sha_on_another_project_are_rejected'
  },
  {
    module: 'c1-internal-test-run',
    variable: 'internal_test_booking_expires_at_utc',
    message:
      'Enabling isolated booking writes requires INTERNAL_TEST_BOOKING_EXPIRES_AT_UTC.',
    run: 'booking_enabled_without_expiry_is_rejected'
  },
  {
    module: 'c1-internal-test-run',
    variable: 'firebase_auth_domain',
    message:
      'Applying C1 internal-test Cloud Run requires firebase_auth_domain set to an authorized isolated Hosting host.',
    run: 'named_sha_without_auth_domain_is_rejected'
  },
  {
    module: 'c1-internal-test-run',
    variable: 'api_secret_versions',
    message:
      'Applying C1 internal-test Cloud Run requires a numeric Secret Manager version pin for every API mount',
    run: 'missing_api_pin_on_apply_is_rejected'
  },
  {
    module: 'c1-internal-test-run',
    variable: 'worker_secret_versions',
    message:
      'Applying C1 internal-test Cloud Run requires a numeric Secret Manager version pin for every worker mount',
    run: 'missing_calendar_pin_on_apply_is_rejected'
  },
  {
    module: 'c1-internal-test-run',
    variable: 'calendar_sync_pseudonym_secret_version',
    message:
      'Applying C1 internal-test Cloud Run with calendar_sync_enabled requires a numeric Secret Manager version pin',
    run: 'missing_calendar_sync_pseudonym_pin_is_rejected'
  },
  {
    module: 'wp-b4-alerting',
    variable: 'alert_email_address',
    message:
      'Applying WP-B4 requires alert_email_address from secret/tfvar. Recipients never land in git.',
    run: 'named_sha_without_alert_email_is_rejected'
  }
];

describe('Terraform required conditions block plan (AUD-14)', () => {
  it('has no check block that is not declared advisory', () => {
    const undeclared = [];
    for (const file of walk(join(root, TERRAFORM_ROOT), '.tf')) {
      for (const name of checkBlocks(readFileSync(file, 'utf8'))) {
        if (!ADVISORY_CHECKS.has(`${moduleOf(file)}/${name}`)) {
          undeclared.push(`${relative(root, file)}: check "${name}"`);
        }
      }
    }
    expect(undeclared).toEqual([]);
  });

  it('never expects a check block in a tftest unless it is declared advisory', () => {
    const undeclared = [];
    for (const file of walk(join(root, TERRAFORM_ROOT), '.tftest.hcl')) {
      const source = readFileSync(file, 'utf8');
      for (const list of source.matchAll(
        /expect_failures\s*=\s*\[([^\]]*)\]/g
      )) {
        for (const ref of list[1].matchAll(/\bcheck\.([A-Za-z0-9_-]+)/g)) {
          if (!ADVISORY_CHECKS.has(`${moduleOf(file)}/${ref[1]}`)) {
            undeclared.push(`${relative(root, file)}: check.${ref[1]}`);
          }
        }
      }
    }
    expect(undeclared).toEqual([]);
  });

  it.each(REQUIRED_CONDITIONS)(
    '$module blocks plan on $variable and a tftest expects it ($run)',
    ({ module, variable, message, run }) => {
      const variables = read(`${TERRAFORM_ROOT}/${module}/variables.tf`);
      const block = blockOf(variables, `variable "${variable}" {`);
      expect(block, `variable "${variable}" block`).toBeDefined();
      const validations = [
        ...block.matchAll(/validation\s*\{[\s\S]*?\n {2}\}/g)
      ].map((match) => match[0]);
      expect(
        validations.some((validation) => validation.includes(message)),
        `a validation block on ${variable} carrying the required message`
      ).toBe(true);

      const tftest = read(`${TERRAFORM_ROOT}/${module}/noop.tftest.hcl`);
      const runBlock = blockOf(tftest, `run "${run}" {`);
      expect(runBlock, `run "${run}"`).toBeDefined();
      expect(runBlock).toMatch(
        new RegExp(
          `expect_failures\\s*=\\s*\\[[^\\]]*\\bvar\\.${variable}\\b[^\\]]*\\]`
        )
      );
      expect(runBlock).toContain('command = plan');
    }
  );

  it('requires a Terraform version that supports cross-variable validation', () => {
    for (const module of new Set(REQUIRED_CONDITIONS.map((c) => c.module))) {
      const versions = read(`${TERRAFORM_ROOT}/${module}/versions.tf`);
      const match = versions.match(
        /required_version\s*=\s*">=\s*(\d+)\.(\d+)\.\d+"/
      );
      expect(match, `${module} required_version`).not.toBeNull();
      const [major, minor] = [Number(match[1]), Number(match[2])];
      expect(major > 1 || (major === 1 && minor >= 9)).toBe(true);
    }
  });
});
