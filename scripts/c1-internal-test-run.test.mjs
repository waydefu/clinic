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
    expect(main).toMatch(
      /apply_enabled\s*=\s*var\.exact_apply_authority_sha\s*!=\s*"not_granted"/
    );
    expect(main).not.toMatch(/roles\/owner/);
    expect(main).not.toMatch(/roles\/editor/);
    expect(main).toContain(
      'resource "google_project_iam_custom_role" "api_firebaseauth_session_runtime"'
    );
    expect(main).toContain(
      'resource "google_project_iam_member" "api_firebaseauth_session_runtime"'
    );
    expect(main).toContain('clinicC1FirebaseAuthSessionRuntime');
    expect(main).toContain('Clinic C1 Firebase Auth Session Runtime');
    expect(main).toContain('firebaseauth.users.get');
    expect(main).toContain('firebaseauth.users.createSession');
    expect(main).toContain('firebaseauth.users.update');
    expect(main).not.toContain('roles/firebaseauth.viewer');
    expect(main).not.toContain('roles/firebaseauth.editor');
    expect(main).not.toContain('roles/firebaseauth.admin');
    expect(main).not.toContain('roles/firebase.admin');
    expect(main).not.toContain('roles/identitytoolkit.editor');
    expect(main).not.toContain('roles/identitytoolkit.admin');
    expect(main).not.toContain('roles/identityplatform.admin');
    expect(main).not.toContain('firebaseauth.users.create"');
    expect(main).not.toContain('firebaseauth.users.delete');
    expect(main).not.toContain('firebaseauth.users.sendEmail');
    expect(main).not.toContain('firebaseauth.configs.');
    expect(main).not.toMatch(/["']identitytoolkit\./);
    expect(main).not.toContain('roles/identitytoolkit');
    const customRoleBlock = main.match(
      /resource "google_project_iam_custom_role" "api_firebaseauth_session_runtime" \{[\s\S]*?\n\}/
    )?.[0];
    expect(customRoleBlock).toBeDefined();
    expect(customRoleBlock).toContain('firebaseauth.users.get');
    expect(customRoleBlock).toContain('firebaseauth.users.createSession');
    expect(customRoleBlock).toContain('firebaseauth.users.update');
    expect(customRoleBlock.match(/firebaseauth\.[a-zA-Z.]+/g)?.sort()).toEqual([
      'firebaseauth.users.createSession',
      'firebaseauth.users.get',
      'firebaseauth.users.update'
    ]);
    const sessionMemberBlock = main.match(
      /resource "google_project_iam_member" "api_firebaseauth_session_runtime" \{[\s\S]*?\n\}/
    )?.[0];
    expect(sessionMemberBlock).toBeDefined();
    expect(sessionMemberBlock).toContain(
      'member  = "serviceAccount:${google_service_account.api[0].email}"'
    );
    expect(sessionMemberBlock).not.toContain('google_service_account.worker');
    expect(sessionMemberBlock).toContain(
      'google_project_iam_custom_role.api_firebaseauth_session_runtime[0].name'
    );
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
    expect(main).toMatch(
      /name\s*=\s*"TRUSTED_PROXY_HOPS"[\s\S]*?value\s*=\s*"2"/
    );
    expect(main).toContain(
      'Firebase Hosting rewrite and the Cloud Run frontend are the two'
    );
    expect(main).toContain(
      'resource "google_cloud_run_v2_service" "calendar_sync"'
    );
    expect(main).toContain(
      'calendar_sync_prerequisites_active = var.calendar_sync_prerequisites_enabled || var.calendar_sync_enabled'
    );
    expect(main).toContain('resource "google_service_account" "calendar_sync"');
    expect(main).toContain(
      'service_account                  = google_service_account.calendar_sync["enabled"].email'
    );
    expect(main).toContain(
      'resource "google_secret_manager_secret_iam_member" "calendar_sync_pseudonym"'
    );
    expect(main).toContain(
      'member    = "serviceAccount:${google_service_account.calendar_sync["enabled"].email}"'
    );
    expect(main).toContain('value = "C1_SYNTHETIC_ADC"');
    expect(main).toContain(
      'args    = ["dist/calendar-sync/calendar-pilot-main.js"]'
    );
    expect(main).toContain(
      'resource "google_cloud_scheduler_job" "calendar_sync"'
    );
    expect(main).toContain(
      'paused           = var.calendar_sync_schedule_paused'
    );
    expect(main).not.toContain('CALENDAR_PILOT_READER_SERVICE_ACCOUNT_JSON');
    expect(main).not.toContain('CALENDAR_PILOT_WRITER_SERVICE_ACCOUNT_JSON');
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
    expect(variables).toContain(
      'Applying C1 internal-test Cloud Run requires firebase_auth_domain set to an authorized isolated Hosting host.'
    );
    expect(main).not.toContain('check "auth_domain_required_on_apply"');
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

  it('pins secrets per service and does not let the retired shared input govern mounts', () => {
    const tftest = read('infra/terraform/c1-internal-test-run/noop.tftest.hcl');
    const readme = read('infra/terraform/c1-internal-test-run/README.md');

    expect(variables).toContain('variable "api_secret_versions"');
    expect(variables).toContain('variable "worker_secret_versions"');
    expect(variables).toContain('GOOGLE_CALENDAR_ID = "not_granted"');
    expect(variables).toContain('latest is refused');
    expect(variables).toContain('Retired shared pin');
    expect(variables).not.toMatch(
      /GOOGLE_CALENDAR_ID\s*==\s*"2"|GOOGLE_CALENDAR_ID\s*=\s*"2"/
    );

    expect(main).toContain('version = var.api_secret_versions[env.key]');
    expect(main).toContain('version = var.worker_secret_versions[env.key]');
    expect(main).toContain('resolved_google_calendar_id_secret_version');
    expect(variables).toContain(
      'Applying C1 internal-test Cloud Run requires a numeric Secret Manager version pin for every API mount'
    );
    expect(variables).toContain(
      'Applying C1 internal-test Cloud Run requires a numeric Secret Manager version pin for every worker mount'
    );
    expect(variables).toContain(
      'calendar_sync_pseudonym_secret_version. Missing pins fail closed'
    );
    expect(main).not.toContain('check "secret_pins_required_on_apply"');
    expect(main).not.toContain('version = var.secret_resource_version');
    expect(main).not.toContain(
      'mount_secrets = local.apply_enabled && var.secret_resource_version'
    );

    expect(example).toContain('api_secret_versions');
    expect(example).toContain('worker_secret_versions');
    expect(example).toContain('GOOGLE_CALENDAR_ID = "2"');
    expect(example).not.toMatch(/^\s*secret_resource_version\s*=/m);

    expect(readme).toContain('api_secret_versions');
    expect(readme).toContain('worker_secret_versions');
    expect(readme).toContain('secret_resource_version');
    expect(readme).toContain('input pin, not a permanent source invariant');

    expect(tftest).toContain(
      'current_c1_input_pins_calendar_to_explicit_approved_version'
    );
    expect(tftest).toContain('changing_another_pin_cannot_alter_calendar');
    expect(tftest).toContain('future_calendar_pin_follows_explicit_input_only');
    expect(tftest).toContain('GOOGLE_CALENDAR_ID = "3"');
    expect(tftest).toContain('retired_shared_pin_cannot_govern_all_mounts');
    expect(tftest).toContain('secret_resource_version   = "1"');
    expect(tftest).toContain('missing_calendar_pin_on_apply_is_rejected');
    expect(tftest).toContain('latest_calendar_pin_is_rejected');
    expect(tftest).toContain('GOOGLE_CALENDAR_ID = "latest"');
    expect(tftest).not.toMatch(
      /condition\s*=\s*var\.worker_secret_versions\.GOOGLE_CALENDAR_ID\s*==\s*"2"\s*\n\s*error_message = ".*must remain 2/
    );
  });

  it('wires fail-closed Business Delivery inputs and secret-backed maintenance identities', () => {
    const readme = read('infra/terraform/c1-internal-test-run/README.md');
    const outputs = read('infra/terraform/c1-internal-test-run/outputs.tf');

    expect(variables).toMatch(
      /variable "business_delivery_enabled" \{[\s\S]*?type\s*=\s*bool[\s\S]*?default\s*=\s*false/
    );
    expect(variables).toContain(
      'var.business_delivery_policy_version == "BD-POLICY-2026-09-29"'
    );
    expect(variables).toContain(
      'can(formatdate("YYYY-MM-DD\'T\'hh:mm:ssZ", var.business_delivery_observed_since))'
    );
    expect(variables).toContain('\\\\.[0-9]+)?Z$');
    expect(variables).toContain(
      'var.business_delivery_scope == "internal_synthetic"'
    );
    expect(variables).toContain('variable "business_delivery_observed_since"');
    expect(variables).toContain(
      'Business Delivery observed-since must be empty or a valid UTC ISO-8601 timestamp ending in Z.'
    );
    expect(variables).toContain(
      'variable "business_delivery_maintenance_emails_secret_version"'
    );
    expect(variables).toContain('latest is refused');
    expect(variables).toMatch(
      /variable "business_delivery_maintenance_prerequisites_enabled" \{[\s\S]*?type\s*=\s*bool[\s\S]*?default\s*=\s*false/
    );

    expect(main).toContain('precondition {');
    expect(main).toContain(
      'Business Delivery maintenance prerequisites and report routes are restricted to the exact C1 synthetic project'
    );
    expect(main).toContain('var.project_id == "beauessence-clinic-stg-c1a01"');
    for (const name of [
      'BUSINESS_DELIVERY_ENABLED',
      'BUSINESS_DELIVERY_POLICY_VERSION',
      'BUSINESS_DELIVERY_SCOPE',
      'BUSINESS_DELIVERY_OBSERVED_SINCE'
    ]) {
      expect(main).toContain(`name  = "${name}"`);
    }
    expect(main).toContain(
      'value = var.business_delivery_enabled ? "true" : "false"'
    );
    expect(main).toContain('value = var.business_delivery_policy_version');
    expect(main).toContain('value = var.business_delivery_scope');
    expect(main).toContain('value = var.business_delivery_observed_since');
    expect(main).toContain('name = "BUSINESS_DELIVERY_MAINTENANCE_EMAILS"');
    expect(main).toContain(
      'secret  = google_secret_manager_secret.runtime["c1-business-delivery-maintenance-emails"].secret_id'
    );
    expect(main).toContain(
      'version = var.business_delivery_maintenance_emails_secret_version'
    );
    expect(main).not.toContain(
      'value = var.business_delivery_maintenance_emails'
    );
    expect(main).toContain(
      'business_delivery_maintenance_prerequisites_active = ('
    );
    expect(main).toContain(
      'local.business_delivery_maintenance_prerequisites_active ? toset(["c1-business-delivery-maintenance-emails"])'
    );
    expect(main).toContain(
      'for_each  = local.apply_enabled ? (local.business_delivery_maintenance_prerequisites_active ? toset(["enabled"])'
    );
    expect(main).toContain(
      'for_each = local.apply_enabled && local.business_delivery_maintenance_pin_numeric ? toset(["enabled"])'
    );
    expect(main).toMatch(
      /resource "google_cloud_run_v2_service" "api" \{[\s\S]*?depends_on = \[\s*google_project_service\.stage_f,\s*google_secret_manager_secret_iam_member\.api_business_delivery_maintenance\s*\]/
    );
    expect(outputs).not.toContain('business_delivery');

    expect(example).toContain('business_delivery_enabled');
    expect(example).toContain(
      'business_delivery_maintenance_emails_secret_version = "not_granted"'
    );
    expect(example).toContain(
      'business_delivery_maintenance_prerequisites_enabled = false'
    );
    const tftest = read('infra/terraform/c1-internal-test-run/noop.tftest.hcl');
    expect(tftest).toContain(
      'business_delivery_maintenance_prerequisites_without_sha_are_noop'
    );
    expect(tftest).toContain(
      'business_delivery_maintenance_prerequisites_create_container_without_mount'
    );
    expect(readme).toContain('For the first plan, keep');
    expect(readme).toContain('Do not use `-target`.');
    expect(readme).toContain('private process.');
    expect(readme).toContain('Keep those identities out of `terraform.tfvars`');
    expect(readme).toContain(
      'the API receives them through the existing secret mount.'
    );
  });

  it('keeps the maintenance-emails container once it exists: flag stays true and secrets cannot be destroyed', () => {
    const readme = read('infra/terraform/c1-internal-test-run/README.md');
    const packet = read('docs/plans/2026-10-01-c1-batch-deployment-packet.md');

    // With the flag false, returning the pin to not_granted removes the
    // container (and every secret version). The README must not tell the
    // operator to turn it off, and must agree with the deployment packet.
    expect(readme).not.toMatch(/set the prerequisites flag back to `false`/);
    expect(readme).toContain(
      'keep `business_delivery_maintenance_prerequisites_enabled = true`'
    );
    expect(packet).toMatch(
      /\| `business_delivery_maintenance_prerequisites_enabled` \| `true`[^|]*\| `true`/
    );

    const start = main.indexOf(
      'resource "google_secret_manager_secret" "runtime"'
    );
    expect(start).toBeGreaterThanOrEqual(0);
    const next = main.indexOf('\nresource "', start + 1);
    const runtimeSecret = main.slice(start, next === -1 ? undefined : next);
    expect(runtimeSecret).toMatch(
      /lifecycle \{[\s\S]*?prevent_destroy\s*=\s*true[\s\S]*?\}/
    );
  });

  it('documents Stage 1, 2a (mount the pin) and 2b (enable) because observed_since only exists after the mount', () => {
    const readme = read('infra/terraform/c1-internal-test-run/README.md');
    const packet = read('docs/plans/2026-10-01-c1-batch-deployment-packet.md');

    // The enabling precondition needs a non-empty observed_since, which is the
    // first complete classified capture and so cannot exist before the
    // allowlist is mounted: the mount and the enable are separate plans.
    expect(main).toContain('var.business_delivery_observed_since != ""');
    for (const document of [readme, packet]) {
      expect(document).toContain('Stage 2a');
      expect(document).toContain('Stage 2b');
    }
    // The owner has filled each stage's cap; the cap does not grant an exact
    // plan. Keep the approved one-apply limit and the pending plan authority.
    expect(packet).toContain('以下由 `wayde.fu` 在本次對話核准');
    for (const row of ['Stage 2a mount-pin apply', 'Stage 2b enable apply']) {
      const line = packet
        .split('\n')
        .find((candidate) => candidate.startsWith(`| C1 ${row}`));
      expect(line).toBeDefined();
      expect(line.split('|')[2].trim()).toBe('1 次');
      expect(line).toContain('plan');
      expect(line).toContain('核准');
      expect(line).toContain('`BLOCKED`');
    }
    expect(packet).toContain('上限不是 artifact、plan 或 fixture 已就緒的證明');
    expect(packet).toContain('失敗與重試計入同類上限，不自動補額');
    expect(packet).toContain('<OWNER_FILLED_MEASURED_UTC_INSTANT>');
  });

  it('blocks build submission until the approved machine and source input are verified', () => {
    const packet = read('docs/plans/2026-10-01-c1-batch-deployment-packet.md');

    expect(packet).toContain('BLOCKED_MACHINE_TYPE_UNVERIFIED');
    expect(packet).not.toContain('gcloud builds submit');
    expect(packet).toContain('git worktree add --detach');
    expect(packet).toContain(
      'test "$(git rev-parse HEAD)" = "$APPROVED_SOURCE_SHA"'
    );
    expect(packet).toContain('BUILD_SOURCE_SHA="$(git rev-parse HEAD)"');
    expect(packet).toContain('tracked-source archive');
    expect(packet).not.toContain('--expires 7d');
  });
});
