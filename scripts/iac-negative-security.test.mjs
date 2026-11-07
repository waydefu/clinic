import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * SOL-IAM B-41. Negative security assertions over every Terraform module:
 * public principals, dangerous roles and wide ingress must be absent unless
 * they are in the accepted baseline below. The baseline records TODAY's
 * source; it is not an approval of those grants. B-01 / B-09 / NEW-10 shrink
 * it later, in the same PR that changes the real grant. Adding a baseline
 * entry is a security decision and must be reviewed as one.
 */
const FORBIDDEN_ROLES = new Set([
  'roles/owner',
  'roles/editor',
  'roles/viewer',
  'roles/iam.securityAdmin',
  'roles/iam.roleAdmin',
  'roles/iam.serviceAccountKeyAdmin',
  'roles/iam.serviceAccountTokenCreator',
  'roles/resourcemanager.organizationAdmin',
  'roles/resourcemanager.folderAdmin'
]);
const PUBLIC_PRINCIPALS = new Set(['allUsers', 'allAuthenticatedUsers']);
const ADMIN_ROLE = /^roles\/[A-Za-z.]*(\.admin|Admin)$/;
const PROJECT_STORAGE_ROLE = /^roles\/storage\./;

// `<module>/<role>`
const ACCEPTED_ADMIN_ROLES = new Set([
  'c1-foundation/roles/serviceusage.serviceUsageAdmin',
  'c1-foundation/roles/iam.serviceAccountAdmin',
  'c1-foundation/roles/iam.workloadIdentityPoolAdmin',
  'c1-foundation/roles/resourcemanager.projectIamAdmin', // B-01
  'c1-foundation/roles/secretmanager.admin',
  'c1-foundation/roles/logging.admin',
  'c1-foundation/roles/monitoring.admin',
  'c1-foundation/roles/pubsub.admin',
  'c1-foundation/roles/storage.admin', // B-01 / NEW-10
  'c1-internal-test-run/roles/run.admin',
  'c1-internal-test-run/roles/artifactregistry.admin',
  'c1-internal-test-run/roles/cloudscheduler.admin',
  'cal-pilot/roles/firebaseauth.admin' // B-09
]);
// Project-wide Storage grants (admin ones are also in the set above).
const ACCEPTED_PROJECT_STORAGE = new Set([
  'c1-foundation/roles/storage.admin',
  'cal-pilot/roles/storage.objectViewer' // NEW-10
]);
// `<module>/<type>.<name>`
const ACCEPTED_PUBLIC_PRINCIPAL = new Set([
  'c1-internal-test-run/google_cloud_run_v2_service_iam_member.api_hosting_invoke'
]);
const ACCEPTED_INGRESS_ALL = new Set([
  'c1-internal-test-run/google_cloud_run_v2_service.api',
  'c1-internal-test-run/google_cloud_run_v2_service.worker',
  'c1-internal-test-run/google_cloud_run_v2_service.calendar_sync'
]);

function resourceBlocks(source) {
  const blocks = [];
  const header = /^resource\s+"([^"]+)"\s+"([^"]+)"\s*\{/gm;
  let match;
  while ((match = header.exec(source))) {
    let depth = 1;
    let i = header.lastIndex;
    for (; i < source.length && depth > 0; i += 1) {
      if (source[i] === '{') depth += 1;
      else if (source[i] === '}') depth -= 1;
    }
    blocks.push({
      type: match[1],
      name: match[2],
      body: source.slice(header.lastIndex, i)
    });
  }
  return blocks;
}

export function scanTerraformModule(module, source) {
  const violations = [];
  for (const { type, name, body } of resourceBlocks(source)) {
    const id = `${module}/${type}.${name}`;
    const roles = [...body.matchAll(/"(roles\/[A-Za-z0-9_.]+)"/g)].map(
      (m) => m[1]
    );
    for (const role of roles) {
      const key = `${module}/${role}`;
      if (FORBIDDEN_ROLES.has(role)) {
        violations.push(`${id}: forbidden role ${role}`);
      } else if (ADMIN_ROLE.test(role) && !ACCEPTED_ADMIN_ROLES.has(key)) {
        violations.push(`${id}: unaccepted admin role ${role}`);
      }
      if (
        type === 'google_project_iam_member' &&
        PROJECT_STORAGE_ROLE.test(role) &&
        !ACCEPTED_PROJECT_STORAGE.has(key)
      ) {
        violations.push(`${id}: unaccepted project-wide storage role ${role}`);
      }
    }
    const members = [...body.matchAll(/^\s*members?\s*=\s*"([^"]+)"/gm)].map(
      (m) => m[1]
    );
    if (
      members.some((m) => PUBLIC_PRINCIPALS.has(m)) &&
      !ACCEPTED_PUBLIC_PRINCIPAL.has(id)
    ) {
      violations.push(`${id}: public principal`);
    }
    if (
      /^\s*ingress\s*=\s*"INGRESS_TRAFFIC_ALL"/m.test(body) &&
      !ACCEPTED_INGRESS_ALL.has(id)
    ) {
      violations.push(`${id}: INGRESS_TRAFFIC_ALL`);
    }
  }
  return violations;
}

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const tfRoot = join(root, 'infra/terraform');

function modules() {
  return readdirSync(tfRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

describe('IaC negative security assertions (B-41)', () => {
  it('finds the Terraform modules it is meant to scan', () => {
    expect(modules()).toEqual(
      expect.arrayContaining([
        'c1-foundation',
        'c1-internal-test-run',
        'cal-pilot'
      ])
    );
  });

  it.each(modules())(
    '%s has no unaccepted public, dangerous or wide grant',
    (module) => {
      const dir = join(tfRoot, module);
      const violations = readdirSync(dir)
        .filter((file) => file.endsWith('.tf'))
        .flatMap((file) =>
          scanTerraformModule(
            module,
            readFileSync(join(dir, file), 'utf8')
          ).map((v) => `${relative(root, join(dir, file))}: ${v}`)
        );
      expect(violations).toEqual([]);
    }
  );

  it('flags a wrong fixture: public principal, dangerous role, wide ingress, new admin and project storage', () => {
    const bad = `
resource "google_cloud_run_v2_service_iam_member" "oops" {
  role   = "roles/run.invoker"
  member = "allAuthenticatedUsers"
}
resource "google_project_iam_member" "owner" {
  role   = "roles/owner"
  member = "serviceAccount:x@y.iam.gserviceaccount.com"
}
resource "google_project_iam_member" "admin" {
  for_each = toset(["roles/compute.admin", "roles/storage.objectAdmin"])
  role     = each.value
  member   = "serviceAccount:x@y.iam.gserviceaccount.com"
}
resource "google_project_iam_member" "store" {
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:x@y.iam.gserviceaccount.com"
}
resource "google_cloud_run_v2_service" "wide" {
  ingress = "INGRESS_TRAFFIC_ALL"
}
`;
    expect(scanTerraformModule('fixture', bad)).toEqual([
      'fixture/google_cloud_run_v2_service_iam_member.oops: public principal',
      'fixture/google_project_iam_member.owner: forbidden role roles/owner',
      'fixture/google_project_iam_member.admin: unaccepted admin role roles/compute.admin',
      'fixture/google_project_iam_member.admin: unaccepted admin role roles/storage.objectAdmin',
      'fixture/google_project_iam_member.admin: unaccepted project-wide storage role roles/storage.objectAdmin',
      'fixture/google_project_iam_member.store: unaccepted project-wide storage role roles/storage.objectViewer',
      'fixture/google_cloud_run_v2_service.wide: INGRESS_TRAFFIC_ALL'
    ]);
  });

  it('accepts the baseline allUsers invoker only on its exact resource', () => {
    const body = (name) => `
resource "google_cloud_run_v2_service_iam_member" "${name}" {
  role   = "roles/run.invoker"
  member = "allUsers"
}
`;
    expect(
      scanTerraformModule('c1-internal-test-run', body('api_hosting_invoke'))
    ).toEqual([]);
    expect(
      scanTerraformModule(
        'c1-internal-test-run',
        body('worker_scheduler_invoke')
      )
    ).toEqual([
      'c1-internal-test-run/google_cloud_run_v2_service_iam_member.worker_scheduler_invoke: public principal'
    ]);
  });
});
