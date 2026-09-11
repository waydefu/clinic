import { accessSync, constants, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function hasCli(name) {
  const dirs = (process.env.PATH ?? '').split(':').filter(Boolean);
  for (const dir of dirs) {
    try {
      accessSync(join(dir, name), constants.X_OK);
      return true;
    } catch {
      /* keep scanning PATH */
    }
  }
  return false;
}

function terraformCliStatus() {
  return {
    gcloud: hasCli('gcloud'),
    terraform: hasCli('terraform'),
    firebase: hasCli('firebase')
  };
}

export const C_SLICE_TERRAFORM_MODULES = [
  {
    slice: 'C1',
    directory: 'infra/terraform/c1-foundation',
    allowedServiceSubstrings: [
      'billingbudgets.googleapis.com',
      'cloudbilling.googleapis.com',
      'cloudresourcemanager.googleapis.com',
      'iam.googleapis.com',
      'iamcredentials.googleapis.com',
      'logging.googleapis.com',
      'monitoring.googleapis.com',
      'pubsub.googleapis.com',
      'secretmanager.googleapis.com',
      'storage.googleapis.com',
      'sts.googleapis.com'
    ],
    forbiddenSubstrings: [
      'identitytoolkit.googleapis.com',
      'firestore.googleapis.com',
      'calendar-json.googleapis.com',
      'run.googleapis.com',
      'cloudscheduler.googleapis.com',
      'artifactregistry.googleapis.com',
      'google_firestore_database',
      'google_secret_manager_secret_version'
    ]
  },
  {
    slice: 'C2',
    directory: 'infra/terraform/c2-identity',
    allowedServiceSubstrings: ['identitytoolkit.googleapis.com'],
    forbiddenSubstrings: [
      'firestore.googleapis.com',
      'calendar-json.googleapis.com',
      'google_firestore_database'
    ]
  },
  {
    slice: 'C5',
    directory: 'infra/terraform/c5-firestore',
    allowedServiceSubstrings: ['firestore.googleapis.com'],
    forbiddenSubstrings: [
      'identitytoolkit.googleapis.com',
      'calendar-json.googleapis.com'
    ]
  },
  {
    slice: 'C6',
    directory: 'infra/terraform/c6-calendar',
    allowedServiceSubstrings: ['calendar-json.googleapis.com'],
    forbiddenSubstrings: [
      'identitytoolkit.googleapis.com',
      'firestore.googleapis.com',
      'google_firestore_database'
    ]
  }
];

const BLOCK_HEADER = /^(resource|data)\s+"([^"]+)"\s+"([^"]+)"\s*\{/gm;

export function findHclBlocks(source) {
  const blocks = [];
  const scanner = new RegExp(BLOCK_HEADER.source, 'gm');
  let match;
  while ((match = scanner.exec(source))) {
    const braceStart = match.index + match[0].length - 1;
    const end = findMatchingBrace(source, braceStart);
    blocks.push({
      kind: match[1],
      type: match[2],
      name: match[3],
      body: source.slice(braceStart, end)
    });
  }
  return blocks;
}

function findMatchingBrace(source, start) {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (char === '\\') {
        escape = true;
        continue;
      }
      if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return source.length;
}

export function blockIsApplyGated(block) {
  return (
    /count\s*=\s*local\.apply_enabled\s*\?\s*1\s*:\s*0/.test(block.body) ||
    /for_each\s*=\s*local\.apply_enabled\s*\?/.test(block.body)
  );
}

export function terraformValidateCommands(directory) {
  return [
    `terraform -chdir=${directory} init -backend=false -input=false`,
    `terraform -chdir=${directory} validate`,
    `terraform -chdir=${directory} plan -input=false -lock=false -refresh=false -var=exact_apply_authority_sha=not_granted`
  ];
}

export function evaluateCSliceTerraformSource(module, files) {
  const issues = [];
  const main = files.main ?? '';
  const variables = files.variables ?? '';
  if (
    !main.includes(
      'apply_enabled = var.exact_apply_authority_sha != "not_granted"'
    )
  ) {
    issues.push(`${module.slice} must SHA-gate apply_enabled.`);
  }
  if (!variables.includes('default     = "not_granted"')) {
    issues.push(
      `${module.slice} exact_apply_authority_sha must default to not_granted.`
    );
  }
  if (!variables.includes('beauessence-clinic-staging')) {
    issues.push(`${module.slice} must reject beauessence-clinic-staging.`);
  }
  for (const forbidden of module.forbiddenSubstrings) {
    if (main.includes(forbidden)) {
      issues.push(`${module.slice} source contains forbidden ${forbidden}.`);
    }
  }
  for (const allowed of module.allowedServiceSubstrings) {
    if (!main.includes(allowed)) {
      issues.push(`${module.slice} must declare ${allowed}.`);
    }
  }
  const blocks = findHclBlocks(main);
  if (blocks.length === 0) {
    issues.push(`${module.slice} main.tf has no resource or data blocks.`);
  }
  for (const block of blocks) {
    if (!blockIsApplyGated(block)) {
      issues.push(
        `${module.slice} ${block.kind} ${block.type}.${block.name} is not SHA-gated.`
      );
    }
  }
  return { ok: issues.length === 0, issues, blockCount: blocks.length };
}

export function evaluateAllCSliceTerraform(repoRoot = root) {
  const results = C_SLICE_TERRAFORM_MODULES.map((module) => {
    const directory = join(repoRoot, module.directory);
    const files = {
      main: readFileSync(join(directory, 'main.tf'), 'utf8'),
      variables: readFileSync(join(directory, 'variables.tf'), 'utf8')
    };
    const evaluation = evaluateCSliceTerraformSource(module, files);
    return {
      slice: module.slice,
      directory: module.directory,
      validateCommands: terraformValidateCommands(module.directory),
      ...evaluation
    };
  });
  const issues = results.flatMap((result) => result.issues);
  return {
    ok: issues.length === 0,
    issues,
    results,
    terraformCli: terraformCliStatus(),
    apply: 'NOT_RUN'
  };
}

function isDirectRun() {
  const invoked = process.argv[1];
  if (typeof invoked !== 'string' || invoked === '') return false;
  return import.meta.url === pathToFileURL(invoked).href;
}

if (isDirectRun()) {
  const report = evaluateAllCSliceTerraform();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(report.ok ? 0 : 1);
}
