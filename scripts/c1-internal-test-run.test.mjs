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
    expect(
      read('infra/terraform/c1-internal-test-run/terraform.tfvars.example')
    ).toContain('exact_apply_authority_sha         = "not_granted"');
  });
});
