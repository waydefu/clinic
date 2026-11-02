import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { C1_TERRAFORM_CI_ROLES } from './c1-smoke-evidence.mjs';
import { describe, expect, it } from 'vitest';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

const recs = JSON.parse(
  read('docs/architecture/c0-engineering-recommendations.json')
);
const main = read('infra/terraform/c1-foundation/main.tf');
const variables = read('infra/terraform/c1-foundation/variables.tf');
const versions = read('infra/terraform/c1-foundation/versions.tf');

// Test-only source drift checks complement the evaluated Terraform mock plan.
function expectCiGrantBoundary(source) {
  const block =
    source.match(
      /^resource "google_project_iam_member" "terraform_ci" \{([\s\S]*?)^\}/m
    )?.[1] ?? '';
  expect(
    [
      ...source.matchAll(
        /^resource "google_project_iam_(?:member|binding|policy)" "([^"]+)"/gm
      )
    ].map((match) => match[1])
  ).toEqual(['terraform_ci']);
  expect(
    [...block.matchAll(/"roles\/[^"]+"/g)]
      .map(([role]) => JSON.parse(role))
      .sort()
  ).toEqual([...C1_TERRAFORM_CI_ROLES].sort());
  expect(block).toMatch(/for_each\s*=\s*local\.apply_enabled \? toset\(\[/);
  expect(block).toMatch(/project\s*=\s*var\.project_id\s*$/m);
  expect(block).toMatch(/role\s*=\s*each\.value\s*$/m);
  expect(block).toMatch(
    /member\s*=\s*"serviceAccount:\$\{google_service_account\.terraform_ci\[0\]\.email\}"\s*$/m
  );
}

describe('C1 isolated foundation Terraform source', () => {
  it('defaults to a no-op apply SHA and rejects the existing staging project', () => {
    expect(variables).toContain('default     = "not_granted"');
    expect(variables).toContain('beauessence-clinic-stg-unapplied');
    expect(variables).toContain(
      'var.project_id != "beauessence-clinic-staging"'
    );
    expect(variables).toContain('var.region == "asia-east1"');
    expect(variables).toContain('var.budget_amount_twd == 2000');
    expect(variables).toContain('beauessence-clinic-stg-[a-z0-9]{1,7}');
    expect(main).toContain(
      'apply_enabled = var.exact_apply_authority_sha != "not_granted"'
    );
    expect(main).toContain(
      'for_each           = local.apply_enabled ? local.allowed_services : toset([])'
    );
  });

  it('keeps the C1 API allowlist and excludes C2–C6 cloud products', () => {
    for (const api of recs.c1.apiAllowlist) {
      expect(main).toContain(`"${api}"`);
    }
    for (const api of recs.c1.excludedApis) {
      expect(main).not.toContain(api);
    }
    expect(main).not.toContain('google_firestore_database');
    expect(main).not.toContain('identitytoolkit');
    expect(main).not.toContain('google_cloud_run');
    expect(main).not.toContain('google_cloud_scheduler');
    expect(main).not.toContain('google_artifact_registry');
    expect(main).not.toContain('google_secret_manager_secret_version');
    expect(main).not.toMatch(/roles\/owner/);
    expect(main).not.toMatch(/roles\/editor/);
    expect(main).not.toMatch(/roles\/datastore\.user/);
    for (const role of C1_TERRAFORM_CI_ROLES) {
      expect(main).toContain(`"${role}"`);
    }
  });

  it('pins project IAM grants to the current inventory, SHA gate and CI principal (B-41)', () => {
    expectCiGrantBoundary(main);
  });

  it.each([
    [
      'an additional role',
      main.replace(
        '"roles/storage.admin"',
        '"roles/storage.admin", "roles/compute.admin"'
      )
    ],
    ['a missing role', main.replace('"roles/storage.admin"', '')],
    [
      'an unconditional grant',
      main.replace(
        'for_each = local.apply_enabled ? toset([',
        'for_each = true ? toset(['
      )
    ],
    [
      'another project',
      main.replace(
        /(resource "google_project_iam_member" "terraform_ci" \{[\s\S]*?project\s*=\s*)var\.project_id/,
        '$1"synthetic-other-project"'
      )
    ],
    [
      'a role value outside the manifest key',
      main.replace(/role\s*=\s*each\.value/, 'role = "roles/compute.admin"')
    ],
    [
      'another principal',
      main.replace(
        '"serviceAccount:${google_service_account.terraform_ci[0].email}"',
        '"serviceAccount:unapproved@fixture.invalid"'
      )
    ],
    [
      'another project IAM resource',
      `${main}\nresource "google_project_iam_member" "unexpected" {}\n`
    ]
  ])('rejects source drift: %s (B-41)', (_name, source) => {
    expect(source).not.toBe(main);
    expect(() => expectCiGrantBoundary(source)).toThrow();
  });

  it('binds the mock-plan inventory to the same current role manifest (B-41)', () => {
    const noop = read('infra/terraform/c1-foundation/noop.tftest.hcl');
    const manifest =
      noop.match(
        /condition\s*=\s*toset\(keys\(google_project_iam_member\.terraform_ci\)\)\s*==\s*toset\(\[([\s\S]*?)\]\)/
      )?.[1] ?? '';
    expect(
      [...manifest.matchAll(/"roles\/[^"]+"/g)]
        .map(([role]) => JSON.parse(role))
        .sort()
    ).toEqual([...C1_TERRAFORM_CI_ROLES].sort());
    expect(noop).toContain('length(google_project_iam_member.terraform_ci) == 0');
    expect(noop).toContain(
      'grant.role == role && grant.project == var.project_id'
    );
  });

  it('provisions WIF, empty secrets, budget 50/80/100 Pub/Sub, and logging only when apply is enabled', () => {
    expect(main).toContain('google_iam_workload_identity_pool');
    expect(main).toContain('c1-terraform-ci');
    expect(main).toContain('c1-bootstrap-reserved');
    expect(main).toContain('toset([0.5, 0.8, 1.0])');
    expect(main).toContain('google_pubsub_topic');
    expect(main).toContain('c1-foundation');
    expect(main).toContain('google_pubsub_topic_iam_member.budget_publisher');
    expect(main).toContain('billing-budget-alert@system.gserviceaccount.com');
    expect(main).not.toMatch(
      /service-\$\{data\.google_project\.c1\[0\]\.number\}@gcp-sa-billingbudgets/
    );
    expect(main).toContain(
      'google_pubsub_topic_iam_member.monitoring_publisher'
    );
    expect(main).toContain('google_monitoring_alert_policy');
    expect(main).toContain('c1-iam-setiampolicy');
    expect(main).toContain(
      'google_monitoring_notification_channel.budget_pubsub[0].name'
    );
    expect(main).not.toMatch(/type\s*=\s*"email"/);
    expect(read('infra/terraform/c1-foundation/noop.tftest.hcl')).toContain(
      'google_monitoring_alert_policy.iam_setiampolicy'
    );
    expect(read('scripts/c1-smoke-evidence.mjs')).not.toContain('alertPolicy');
    expect(read('scripts/c1-smoke-evidence.mjs')).not.toContain(
      'google_monitoring_alert_policy'
    );
    expect(read('infra/terraform/c1-foundation/README.md')).toContain(
      'docs/runbooks/c1-local-execution-packet.md'
    );
    expect(read('infra/terraform/c1-foundation/README.md')).not.toContain(
      'docs/reviews/'
    );
    expect(versions).toContain('backend "gcs"');
    expect(
      read('infra/terraform/c1-foundation/terraform.tfvars.example')
    ).toContain('exact_apply_authority_sha   = "not_granted"');
    const packet = read('docs/runbooks/c1-local-execution-packet.md');
    expect(packet).toContain('git rev-parse HEAD');
    expect(packet).not.toContain(
      'git log -1 --format=%H -- infra/terraform/c1-foundation'
    );
    expect(packet).toContain('storage.googleapis.com');
    expect(packet).toContain('${PROJECT_ID}-tfstate');
    expect(packet).toContain('gcloud billing budgets list');
    expect(packet).toContain(
      'gcloud auth application-default print-access-token'
    );
    expect(packet).toContain('ADC_TOKEN_OK');
    expect(packet).toContain(
      'gcloud resource-manager folders list --organization='
    );
    expect(packet).not.toMatch(/^gcloud resource-manager folders list$/m);
    expect(packet).toContain('GCP project ids are max **30**');
    expect(packet).toContain('user_project_override');
    expect(packet).toContain('billingbudgets.googleapis.com');
    expect(packet).toContain('beauessence-clinic-stg-replace-me');
    expect(
      read('infra/terraform/c1-foundation/terraform.tfvars.example')
    ).toContain('beauessence-clinic-stg-c1tmp');
    expect(
      read('infra/terraform/c1-foundation/terraform.tfvars.example')
    ).not.toContain('replace-me');
    expect(packet).not.toContain(
      'Required snapshot fields that gcloud does not infer'
    );
    expect(read('firebase.json')).not.toContain('beauessence-clinic-stg-');
  });

  it('pins the WIF trust to immutable numeric ids and approved refs, required before apply (B-02)', () => {
    expect(main).toContain(
      "assertion.repository_id == '${var.github_repository_id}'"
    );
    expect(main).toContain(
      "assertion.repository_owner_id == '${var.github_repository_owner_id}'"
    );
    expect(main).toContain('assertion.ref in [');
    expect(main).toContain('var.github_allowed_refs');
    expect(main).toContain(
      'attribute.repository_id/${var.github_repository_id}'
    );
    expect(main).not.toContain('attribute.repository/${var.github_repository}');
    for (const id of ['github_repository_id', 'github_repository_owner_id']) {
      const block = variables.slice(variables.indexOf(`variable "${id}"`));
      expect(block).toContain('default     = "not_granted"');
    }
    expect(variables).toContain('refs/heads/main');
    // An exact ref list: a wildcard or quote would widen or break the CEL condition.
    expect(variables).toContain('^refs/(heads|tags)/[A-Za-z0-9._/-]+$');
    expect(
      read('infra/terraform/c1-foundation/terraform.tfvars.example')
    ).toContain('github_repository_id        = "not_granted"');
  });
});
