import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

describe('C1 internal-test Cloud Run Terraform source', () => {
  const main = read('infra/terraform/c1-internal-test-run/main.tf');
  const variables = read('infra/terraform/c1-internal-test-run/variables.tf');
  const example = read(
    'infra/terraform/c1-internal-test-run/terraform.tfvars.example'
  );

  it('defaults to a no-op SHA and refuses staging, latest, and production names', () => {
    expect(variables).toContain('default     = "not_granted"');
    expect(variables).toContain(
      'var.project_id != "beauessence-clinic-staging"'
    );
    expect(variables).toContain('var.region == "asia-east1"');
    expect(variables).toContain('internal-test-api');
    expect(variables).toContain('internal-test-outbox');
    expect(variables).toContain(':latest');
    expect(main).toContain(
      'apply_enabled = var.exact_apply_authority_sha != "not_granted"'
    );
    expect(main).not.toMatch(/roles\/owner/);
    expect(main).not.toMatch(/roles\/editor/);
    expect(main).not.toContain('google_secret_manager_secret_version');
    expect(main).toContain('internal-test-api');
    expect(main).toContain('internal-test-outbox');
    expect(main).toContain('/v1/health/live');
    expect(main).toContain('INGRESS_TRAFFIC_ALL');
    expect(main).not.toContain(
      'INGRESS_TRAFFIC_INTERNAL_AND_CLOUD_LOAD_BALANCING'
    );
    expect(main).toContain('GOOGLE_CALENDAR_INTEGRATION_MODE');
    expect(main).toContain('value = "test"');
    expect(main).toContain('GOOGLE_CALENDAR_AUTH');
    expect(main).toContain('CLOUD_ADC');
    expect(main).not.toMatch(
      /GOOGLE_SERVICE_ACCOUNT_JSON\s*=\s*"c1-calendar-service-account-json"/
    );
    expect(main).not.toMatch(/name\s*=\s*"PORT"/);
    expect(main).toContain('Cloud Run v2 reserves PORT');
    expect(main).toContain('ignore_changes = [traffic]');
    expect(main).toContain('GOOGLE_CALENDAR_ID = "c1-synthetic-calendar-id"');
    expect(main).toContain('c1-calendar-service-account-json');
    expect(
      read('infra/terraform/c1-internal-test-run/terraform.tfvars.example')
    ).toContain('exact_apply_authority_sha            = "not_granted"');
  });

  it('parameterizes firebase_auth_domain and does not hardcode firebaseapp.com', () => {
    expect(variables).toContain('variable "firebase_auth_domain"');
    expect(variables).toContain(
      'beauessence-clinic-stg-c1a01--internal-preproduction-3u85hkcz.web.app'
    );
    expect(variables).toContain('firebaseapp.com');
    expect(variables).toContain('beauessence-clinic-staging');
    expect(variables).toContain('beauessence.com.tw');
    expect(main).toContain('value = var.firebase_auth_domain');
    expect(main).toContain('auth_domain_required_on_apply');
    expect(main).not.toContain('${var.project_id}.firebaseapp.com');
    expect(example).toContain(
      'firebase_auth_domain                 = "beauessence-clinic-stg-c1a01--internal-preproduction-3u85hkcz.web.app"'
    );
    expect(example).toContain(
      'Do not substitute ${project_id}.firebaseapp.com.'
    );
    expect(example).toContain('worker_processing_enabled            = false');
    expect(example).toContain('worker_schedule_paused               = true');
    expect(
      read('infra/terraform/c1-internal-test-run/noop.tftest.hcl')
    ).toContain('exact_apply_authority_sha = "not_granted"');
    expect(
      read('infra/terraform/c1-internal-test-run/noop.tftest.hcl')
    ).toContain('named_sha_without_auth_domain_is_rejected');
  });
});
