import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  directAttributeExpressions,
  findHclBlocks
} from './terraform-sha-gate.mjs';

const directory = new URL('../infra/terraform/cal-pilot/', import.meta.url);
const sourceFiles = readdirSync(directory);
const source = sourceFiles
  .filter((name) => name.endsWith('.tf'))
  .sort()
  .map((name) => readFileSync(new URL(name, directory), 'utf8'))
  .join('\n');

// B-41 pins the current source, not approval or necessity of its broad grants.
const resources = [
  'data.google_project.pilot',
  'google_project_service.required',
  'google_service_account.api',
  'google_service_account.worker',
  'google_service_account.scheduler',
  'google_service_account.builder',
  'google_artifact_registry_repository.images',
  'google_project_iam_member.builder_logging',
  'google_project_iam_member.builder_source',
  'google_artifact_registry_repository_iam_member.builder_images',
  'google_project_iam_member.api_firestore',
  'google_project_iam_member.api_identity',
  'google_project_iam_member.worker_firestore',
  'google_secret_manager_secret.pilot',
  'google_secret_manager_secret_iam_member.api',
  'google_secret_manager_secret_iam_member.worker',
  'google_firestore_database.pilot',
  'google_cloud_scheduler_job.sync',
  'google_billing_budget.pilot'
];
const grants = [
  [
    'google_project_iam_member.builder_logging',
    'roles/logging.logWriter',
    'builder'
  ],
  [
    'google_project_iam_member.builder_source',
    'roles/storage.objectViewer',
    'builder'
  ],
  [
    'google_artifact_registry_repository_iam_member.builder_images',
    'roles/artifactregistry.writer',
    'builder'
  ],
  ['google_project_iam_member.api_firestore', 'roles/datastore.user', 'api'],
  [
    'google_project_iam_member.api_identity',
    'roles/firebaseauth.admin',
    'api'
  ],
  [
    'google_project_iam_member.worker_firestore',
    'roles/datastore.user',
    'worker'
  ],
  [
    'google_secret_manager_secret_iam_member.api',
    'roles/secretmanager.secretAccessor',
    'api'
  ],
  [
    'google_secret_manager_secret_iam_member.worker',
    'roles/secretmanager.secretAccessor',
    'worker'
  ]
];

function expectCalPilotBoundary(candidate, files = sourceFiles) {
  // Fail closed instead of silently ignoring Terraform JSON configurations.
  expect(files.filter((name) => name.endsWith('.tf.json'))).toEqual([]);
  const blocks = findHclBlocks(candidate);
  const id = ({ kind, type, name }) =>
    `${kind === 'data' ? 'data.' : ''}${type}.${name}`;
  expect(blocks.map(id).sort()).toEqual([...resources].sort());
  const iam = blocks.filter(({ type }) =>
    /_iam_(member|binding|policy)$/.test(type)
  );
  expect(iam.map(id).sort()).toEqual(grants.map(([name]) => name).sort());

  function attribute(block, name) {
    const expressions = directAttributeExpressions(block.bodyTokens, name);
    expect(expressions).toHaveLength(1);
    const expression = expressions[0];
    return candidate.slice(expression[0].start, expression.at(-1).end).trim();
  }
  for (const [name, role, identity] of grants) {
    const block = iam.find((entry) => id(entry) === name);
    expect(attribute(block, 'project')).toBe('var.project_id');
    expect(attribute(block, 'role')).toBe(JSON.stringify(role));
    expect(attribute(block, 'member')).toBe(
      '"serviceAccount:${google_service_account.' + identity + '.email}"'
    );
    if (block.type === 'google_secret_manager_secret_iam_member') {
      expect(attribute(block, 'for_each')).toBe(
        `local.secret_access.${identity}`
      );
      expect(attribute(block, 'secret_id')).toBe(
        'google_secret_manager_secret.pilot[each.value].secret_id'
      );
    }
    if (block.type === 'google_artifact_registry_repository_iam_member') {
      expect(attribute(block, 'repository')).toBe(
        'google_artifact_registry_repository.images.name'
      );
      expect(attribute(block, 'location')).toBe(
        'google_artifact_registry_repository.images.location'
      );
    }
  }

  for (const identity of ['api', 'worker', 'scheduler', 'builder']) {
    const block = blocks.find(
      (entry) => id(entry) === `google_service_account.${identity}`
    );
    expect(attribute(block, 'project')).toBe('var.project_id');
    expect(attribute(block, 'account_id')).toBe(`"cal-pilot-${identity}"`);
  }
  const repository = blocks.find(
    (entry) => id(entry) === 'google_artifact_registry_repository.images'
  );
  expect(attribute(repository, 'repository_id')).toBe('"cal-pilot"');
  expect(attribute(repository, 'project')).toBe('var.project_id');
  expect(attribute(repository, 'location')).toBe('var.region');
  const secrets = blocks.find(
    (entry) => id(entry) === 'google_secret_manager_secret.pilot'
  );
  expect(attribute(secrets, 'for_each')).toBe(
    'setunion(local.secret_access.api, local.secret_access.worker)'
  );
  expect(attribute(secrets, 'project')).toBe('var.project_id');
  expect(attribute(secrets, 'secret_id')).toBe('each.value');
}

describe('CAL-PILOT exact IAM source boundary (B-41)', () => {
  it('binds every current grant to its project, role, identity and resource', () => {
    expectCalPilotBoundary(source);
  });

  it('rejects Terraform JSON instead of silently dropping it from the inventory', () => {
    expect(() =>
      expectCalPilotBoundary(source, [...sourceFiles, 'unexpected.tf.json'])
    ).toThrow();
  });

  it.each([
    [
      'another allowed role on the wrong grant',
      source.replace('roles/logging.logWriter', 'roles/storage.objectViewer')
    ],
    [
      'a forbidden role',
      source.replace('roles/firebaseauth.admin', 'roles/owner')
    ],
    [
      'a different identity',
      source.replace(
        '"serviceAccount:${google_service_account.builder.email}"',
        '"serviceAccount:${google_service_account.api.email}"'
      )
    ],
    [
      'a public principal',
      source.replace(
        '"serviceAccount:${google_service_account.builder.email}"',
        '"allUsers"'
      )
    ],
    [
      'another project',
      source.replace(
        /(resource "google_project_iam_member" "builder_logging" \{[\s\S]*?project\s*=\s*)var\.project_id/,
        '$1"synthetic-other-project"'
      )
    ],
    [
      'a different secret set',
      source.replace(
        'for_each  = local.secret_access.api',
        'for_each  = local.secret_access.worker'
      )
    ],
    [
      'another repository',
      source.replace(
        'repository = google_artifact_registry_repository.images.name',
        'repository = "synthetic-other-repository"'
      )
    ],
    [
      'a changed underlying repository',
      source.replace(
        'repository_id = "cal-pilot"',
        'repository_id = "synthetic-other-repository"'
      )
    ],
    [
      'a changed underlying secret',
      source.replace('secret_id = each.value', 'secret_id = "synthetic-secret"')
    ],
    [
      'a changed underlying identity project',
      source.replace(
        /(resource "google_service_account" "api" \{[\s\S]*?project\s*=\s*)var\.project_id/,
        '$1"synthetic-other-project"'
      )
    ],
    [
      'an added public service',
      `${source}\nresource "google_cloud_run_v2_service" "unexpected" { ingress = "INGRESS_TRAFFIC_ALL" }\n`
    ],
    [
      'a renamed grant',
      source.replace(
        '"google_project_iam_member" "builder_source"',
        '"google_project_iam_member" "unexpected"'
      )
    ]
  ])('rejects %s without changing real IAM', (_label, candidate) => {
    expect(candidate).not.toBe(source);
    expect(() => expectCalPilotBoundary(candidate)).toThrow();
  });

  it.each(
    Object.entries({
      'google_service_account.api': ['project', 'account_id'],
      'google_service_account.worker': ['project', 'account_id'],
      'google_service_account.scheduler': ['project', 'account_id'],
      'google_service_account.builder': ['project', 'account_id'],
      'google_artifact_registry_repository.images': [
        'project',
        'location',
        'repository_id'
      ],
      'google_secret_manager_secret.pilot': ['project', 'for_each', 'secret_id']
    }).flatMap(([resource, fields]) => fields.map((field) => [resource, field]))
  )('rejects underlying scope drift: %s.%s', (resource, field) => {
    const block = findHclBlocks(source).find(
      ({ type, name }) => `${type}.${name}` === resource
    );
    const [expression] = directAttributeExpressions(block.bodyTokens, field);
    expect(expression.length).toBeGreaterThan(0);
    const value =
      field === 'for_each' ? 'local.secret_access.api' : '"synthetic-other"';
    const candidate =
      source.slice(0, expression[0].start) +
      value +
      source.slice(expression.at(-1).end);
    expect(candidate).not.toBe(source);
    expect(() => expectCalPilotBoundary(candidate)).toThrow();
  });
});
