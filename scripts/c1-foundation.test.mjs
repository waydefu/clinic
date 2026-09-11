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

describe('C1 isolated foundation Terraform source', () => {
  it('defaults to a no-op apply SHA and rejects the existing staging project', () => {
    expect(variables).toContain('default     = "not_granted"');
    expect(variables).toContain('beauessence-clinic-stg-unapplied');
    expect(variables).toContain(
      'var.project_id != "beauessence-clinic-staging"'
    );
    expect(variables).toContain('var.region == "asia-east1"');
    expect(variables).toContain('var.budget_amount_twd == 2000');
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

  it('provisions WIF, empty secrets, budget 50/80/100 Pub/Sub, and logging only when apply is enabled', () => {
    expect(main).toContain('google_iam_workload_identity_pool');
    expect(main).toContain('c1-terraform-ci');
    expect(main).toContain('c1-bootstrap-reserved');
    expect(main).toContain('toset([0.5, 0.8, 1.0])');
    expect(main).toContain('google_pubsub_topic');
    expect(main).toContain('c1-foundation');
    expect(main).toContain('google_pubsub_topic_iam_member.budget_publisher');
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
    expect(packet).not.toContain(
      'Required snapshot fields that gcloud does not infer'
    );
    expect(read('firebase.json')).not.toContain('beauessence-clinic-stg-');
  });
});
