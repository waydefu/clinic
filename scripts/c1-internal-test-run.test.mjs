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
    expect(main).toContain('check "secret_pins_required_on_apply"');
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
});
