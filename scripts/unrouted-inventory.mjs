import ts from 'typescript';

const DECISION_ID = /^D-\d{3}$/;
const DECISION_STATUSES = new Set(['approved', 'deferred', 'pending']);
const TOP_LEVEL_FIELDS = new Set(['$comment', 'capabilityGates', 'unrouted']);
const FILE_ENTRY_FIELDS = new Set([
  'approvedPolicyDependencies',
  'remainingBlockers',
  'note'
]);
const CAPABILITY_ENTRY_FIELDS = new Set([
  'permissions',
  'approvedPolicyDependencies',
  'remainingBlockers',
  'note'
]);
const BLOCKER_FIELDS = new Set(['kind', 'id', 'description']);
const BLOCKER_KINDS = new Set([
  'decision',
  'stage_slice',
  'deployment_authority'
]);
const STAGE_GATE_FIELDS = new Set([
  '$comment',
  'stageSlices',
  'deploymentAuthorities'
]);
const STAGE_SLICE_IDS = ['C0', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6'];
const STAGE_SLICE_STATUSES = new Set(['pending', 'revise', 'completed']);
const DEPLOYMENT_AUTHORITY_IDS = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'];
const DEPLOYMENT_AUTHORITY_STATUSES = new Set(['not_granted', 'granted']);

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function unknownFields(value, allowed) {
  return Object.keys(value).filter((field) => !allowed.has(field));
}

function validateComment(value, label, issues) {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((line) => !isNonEmptyString(line))
  ) {
    issues.push(`${label} must be a non-empty array of non-empty strings.`);
  }
}

/**
 * Reads the decision id and status from the register's canonical Markdown
 * table. Keeping this parser narrow is deliberate: if the table shape or
 * status vocabulary changes, the architecture check must fail instead of
 * silently treating every decision as unresolved.
 */
export function parseDecisionRegister(source) {
  const decisions = new Map();
  const issues = [];

  for (const line of String(source).split(/\r?\n/)) {
    if (!/^\|\s*D-\d{3}\s*\|/.test(line)) continue;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    const id = cells[0];
    const status = cells[3]?.match(/^([a-z]+)/)?.[1];

    if (!DECISION_ID.test(id)) {
      issues.push(`Decision register contains an invalid decision id: ${id}.`);
      continue;
    }
    if (status === undefined || !DECISION_STATUSES.has(status)) {
      issues.push(
        `Decision register row ${id} has an unsupported status: ${JSON.stringify(cells[3])}.`
      );
      continue;
    }
    if (decisions.has(id)) {
      issues.push(`Decision register contains duplicate row ${id}.`);
      continue;
    }
    decisions.set(id, status);
  }

  if (decisions.size === 0) {
    issues.push('Decision register contains no readable decision rows.');
  }

  return { decisions, issues };
}

/**
 * Validates and reads the one machine-readable source of current Stage 2 gate
 * status. The exact-key checks are intentional: adding or renaming a slice
 * must update this guard instead of leaving blockers attached to an unknown
 * status.
 */
export function parseStageGateStatus(value) {
  const stageSlices = new Map();
  const deploymentAuthorities = new Map();
  const issues = [];

  if (!isRecord(value)) {
    issues.push('Stage gate status must contain a JSON object.');
    return { stageSlices, deploymentAuthorities, issues };
  }

  for (const field of unknownFields(value, STAGE_GATE_FIELDS)) {
    issues.push(`Stage gate status has unknown top-level field ${field}.`);
  }
  validateComment(value.$comment, 'Stage gate status $comment', issues);

  if (!isRecord(value.stageSlices)) {
    issues.push('Stage gate status stageSlices must be a JSON object.');
  } else {
    for (const id of Object.keys(value.stageSlices)) {
      if (!STAGE_SLICE_IDS.includes(id)) {
        issues.push(`Stage gate status has unknown stage slice ${id}.`);
      }
    }
    for (const id of STAGE_SLICE_IDS) {
      const status = value.stageSlices[id];
      if (!STAGE_SLICE_STATUSES.has(status)) {
        issues.push(
          `Stage gate status stageSlices.${id} must be pending, revise or completed; received ${JSON.stringify(status)}.`
        );
        continue;
      }
      stageSlices.set(id, status);
    }
  }

  if (!isRecord(value.deploymentAuthorities)) {
    issues.push(
      'Stage gate status deploymentAuthorities must be a JSON object.'
    );
  } else {
    for (const id of Object.keys(value.deploymentAuthorities)) {
      if (!DEPLOYMENT_AUTHORITY_IDS.includes(id)) {
        issues.push(
          `Stage gate status has unknown deployment authority ${id}.`
        );
      }
    }
    for (const id of DEPLOYMENT_AUTHORITY_IDS) {
      const status = value.deploymentAuthorities[id];
      if (!DEPLOYMENT_AUTHORITY_STATUSES.has(status)) {
        issues.push(
          `Stage gate status deploymentAuthorities.${id} must be not_granted or granted; received ${JSON.stringify(status)}.`
        );
        continue;
      }
      deploymentAuthorities.set(id, status);
    }
  }

  for (const id of DEPLOYMENT_AUTHORITY_IDS) {
    if (
      stageSlices.get(id) === 'completed' &&
      deploymentAuthorities.get(id) !== 'granted'
    ) {
      issues.push(
        `Stage gate status cannot mark stageSlices.${id} completed before deploymentAuthorities.${id} is granted.`
      );
    }
  }

  return { stageSlices, deploymentAuthorities, issues };
}

function validateApprovedPolicyDependencies(label, value, decisions, issues) {
  if (!Array.isArray(value)) {
    issues.push(`${label} approvedPolicyDependencies must be an array.`);
    return;
  }

  const seenDecisions = new Set();
  for (const decision of value) {
    if (typeof decision !== 'string' || !DECISION_ID.test(decision)) {
      issues.push(
        `${label} has invalid approved policy decision ${JSON.stringify(decision)}.`
      );
      continue;
    }
    if (seenDecisions.has(decision)) {
      issues.push(`${label} repeats approved policy dependency ${decision}.`);
      continue;
    }
    seenDecisions.add(decision);

    const status = decisions.get(decision);
    if (status === undefined) {
      issues.push(
        `${label} references ${decision}, which is absent from the decision register.`
      );
    } else if (status !== 'approved') {
      issues.push(
        `${label} lists ${decision} as approved policy, but the register status is ${status}.`
      );
    }
  }
}

function validateRemainingBlockers(
  label,
  value,
  decisions,
  stageGateStatus,
  issues,
  allowEmpty
) {
  if (!Array.isArray(value)) {
    issues.push(`${label} remainingBlockers must be an array.`);
    return;
  }
  if (value.length === 0 && !allowEmpty) {
    issues.push(`${label} remainingBlockers must be a non-empty array.`);
    return;
  }

  const seenBlockers = new Set();
  for (const [index, blocker] of value.entries()) {
    const blockerLabel = `${label} remainingBlockers[${index}]`;
    if (!isRecord(blocker)) {
      issues.push(`${blockerLabel} must be a JSON object.`);
      continue;
    }
    for (const field of unknownFields(blocker, BLOCKER_FIELDS)) {
      issues.push(`${blockerLabel} has unknown field ${field}.`);
    }
    if (!isNonEmptyString(blocker.description)) {
      issues.push(`${blockerLabel} description must be a non-empty string.`);
    }
    if (!BLOCKER_KINDS.has(blocker.kind)) {
      issues.push(
        `${blockerLabel} kind must be decision, stage_slice or deployment_authority.`
      );
      continue;
    }
    if (!isNonEmptyString(blocker.id)) {
      issues.push(`${blockerLabel} id must be a non-empty string.`);
      continue;
    }

    const blockerKey = `${blocker.kind}:${blocker.id}`;
    if (seenBlockers.has(blockerKey)) {
      issues.push(`${label} repeats remaining blocker ${blockerKey}.`);
    }
    seenBlockers.add(blockerKey);

    if (blocker.kind === 'decision') {
      if (!DECISION_ID.test(blocker.id)) {
        issues.push(`${blockerLabel} has invalid decision id ${blocker.id}.`);
        continue;
      }
      const status = decisions.get(blocker.id);
      if (status === undefined) {
        issues.push(
          `${blockerLabel} references ${blocker.id}, which is absent from the decision register.`
        );
      } else if (status === 'approved') {
        issues.push(
          `${blockerLabel} uses approved decision ${blocker.id} as a remaining blocker; name the unfinished Stage 2 work or deployment authority instead.`
        );
      }
      continue;
    }

    if (blocker.kind === 'stage_slice') {
      if (!STAGE_SLICE_IDS.includes(blocker.id)) {
        issues.push(`${blockerLabel} stage_slice id must be C0 through C6.`);
        continue;
      }
      const status = stageGateStatus.stageSlices.get(blocker.id);
      if (status === 'completed') {
        issues.push(
          `${blockerLabel} uses completed stage slice ${blocker.id} as a remaining blocker.`
        );
      }
      continue;
    }

    if (!DEPLOYMENT_AUTHORITY_IDS.includes(blocker.id)) {
      issues.push(
        `${blockerLabel} deployment_authority id must be C1 through C6.`
      );
      continue;
    }
    const status = stageGateStatus.deploymentAuthorities.get(blocker.id);
    if (status === 'granted') {
      issues.push(
        `${blockerLabel} uses granted deployment authority ${blocker.id} as a remaining blocker.`
      );
    }
  }

  const hasC1Authority = seenBlockers.has('deployment_authority:C1');
  const hasC1Execution = seenBlockers.has('stage_slice:C1');
  if (
    stageGateStatus.deploymentAuthorities.get('C1') === 'not_granted' &&
    hasC1Authority !== hasC1Execution
  ) {
    issues.push(
      `${label} must track both deployment_authority:C1 and stage_slice:C1 while C1 authority is not granted; authority and post-authority execution/evidence are separate gates.`
    );
  }
}

function validateGateEntry(
  label,
  entry,
  allowedFields,
  decisions,
  stageGateStatus,
  issues,
  fieldKind,
  allowEmptyBlockers
) {
  if (!isRecord(entry)) {
    issues.push(`${label} must be a JSON object.`);
    return;
  }

  for (const field of unknownFields(entry, allowedFields)) {
    issues.push(`${label} has unknown ${fieldKind} field ${field}.`);
  }
  if (!isNonEmptyString(entry.note)) {
    issues.push(`${label} note must be a non-empty string.`);
  }
  validateApprovedPolicyDependencies(
    label,
    entry.approvedPolicyDependencies,
    decisions,
    issues
  );
  validateRemainingBlockers(
    label,
    entry.remainingBlockers,
    decisions,
    stageGateStatus,
    issues,
    allowEmptyBlockers
  );
}

/**
 * Pure validation core for apps/api/unrouted-inventory.json.
 *
 * File entries explain why a module is currently unreachable. Capability
 * entries are deliberately independent from reachability: when an approved
 * route eventually imports the RBAC evaluator, pending scheduling,
 * cancellation, case, clinical or payroll capabilities must retain their own
 * decision and Stage blockers.
 */
export function validateUnroutedInventory(
  inventory,
  decisionRegisterSource,
  stageGateStatusValue
) {
  const parsedDecisions = parseDecisionRegister(decisionRegisterSource);
  const parsedStages = parseStageGateStatus(stageGateStatusValue);
  const issues = [...parsedDecisions.issues, ...parsedStages.issues];

  if (!isRecord(inventory)) {
    issues.push('unrouted-inventory.json must contain a JSON object.');
    return issues;
  }

  for (const field of unknownFields(inventory, TOP_LEVEL_FIELDS)) {
    issues.push(
      `unrouted-inventory.json has unknown top-level field ${field}.`
    );
  }
  validateComment(
    inventory.$comment,
    'unrouted-inventory.json $comment',
    issues
  );

  if (!isRecord(inventory.capabilityGates)) {
    issues.push(
      'unrouted-inventory.json capabilityGates must be a JSON object.'
    );
  } else if (Object.keys(inventory.capabilityGates).length === 0) {
    issues.push(
      'unrouted-inventory.json capabilityGates must contain at least one capability.'
    );
  } else {
    const permissionOwners = new Map();
    for (const [capability, entry] of Object.entries(
      inventory.capabilityGates
    )) {
      const label = `capability ${capability}`;
      if (!/^[a-z][a-z0-9_]*$/.test(capability)) {
        issues.push(`${label} does not have a valid capability id.`);
      }
      validateGateEntry(
        label,
        entry,
        CAPABILITY_ENTRY_FIELDS,
        parsedDecisions.decisions,
        parsedStages,
        issues,
        'capability',
        true
      );
      if (!isRecord(entry)) continue;
      if (!Array.isArray(entry.permissions) || entry.permissions.length === 0) {
        issues.push(`${label} permissions must be a non-empty array.`);
        continue;
      }
      const seenPermissions = new Set();
      for (const permission of entry.permissions) {
        if (
          typeof permission !== 'string' ||
          !/^[a-z][a-z0-9_]*$/.test(permission)
        ) {
          issues.push(
            `${label} has invalid RBAC permission ${JSON.stringify(permission)}.`
          );
          continue;
        }
        if (seenPermissions.has(permission)) {
          issues.push(`${label} repeats RBAC permission ${permission}.`);
          continue;
        }
        seenPermissions.add(permission);
        const owner = permissionOwners.get(permission);
        if (owner !== undefined) {
          issues.push(
            `RBAC permission ${permission} is gated by both ${owner} and ${capability}.`
          );
        } else {
          permissionOwners.set(permission, capability);
        }
      }
    }
  }

  if (!isRecord(inventory.unrouted)) {
    issues.push('unrouted-inventory.json unrouted must be a JSON object.');
    return issues;
  }

  for (const [file, entry] of Object.entries(inventory.unrouted)) {
    if (!/^src\/.+\.ts$/.test(file)) {
      issues.push(`${file} is not a valid apps/api TypeScript source path.`);
    }
    validateGateEntry(
      file,
      entry,
      FILE_ENTRY_FIELDS,
      parsedDecisions.decisions,
      parsedStages,
      issues,
      'inventory',
      false
    );
  }

  return issues;
}

/**
 * Extracts the candidate RBAC permission union. This is intentionally narrow:
 * if the declaration is renamed or restructured, the architecture gate fails
 * and must be updated alongside that deliberate code change.
 */
export function parseRbacPermissions(source) {
  const issues = [];
  const permissions = [];
  const block = String(source).match(
    /export type Permission\s*=\s*([\s\S]*?);/
  );
  if (block === null) {
    issues.push('Could not find the exported RBAC Permission union.');
    return { permissions, issues };
  }

  const seen = new Set();
  for (const match of block[1].matchAll(/'([a-z][a-z0-9_]*)'/g)) {
    const permission = match[1];
    if (seen.has(permission)) {
      issues.push(`RBAC Permission union repeats ${permission}.`);
      continue;
    }
    seen.add(permission);
    permissions.push(permission);
  }
  if (permissions.length === 0) {
    issues.push('The exported RBAC Permission union contains no permissions.');
  }
  return { permissions, issues };
}

/**
 * Proves bidirectional coverage between the executable Permission union and
 * capability-level gates. File reachability is irrelevant here: every
 * permission must remain attached to exactly one gate after its module is
 * imported by a route, and stale inventory permissions are rejected.
 */
export function validateRbacPermissionCoverage(inventory, rbacSource) {
  const parsed = parseRbacPermissions(rbacSource);
  const issues = [...parsed.issues];
  if (!isRecord(inventory) || !isRecord(inventory.capabilityGates)) {
    issues.push(
      'Cannot validate RBAC permission coverage without capabilityGates.'
    );
    return issues;
  }

  const owners = new Map();
  for (const [capability, entry] of Object.entries(inventory.capabilityGates)) {
    if (!isRecord(entry) || !Array.isArray(entry.permissions)) continue;
    for (const permission of entry.permissions) {
      if (typeof permission !== 'string') continue;
      const existing = owners.get(permission) ?? [];
      existing.push(capability);
      owners.set(permission, existing);
    }
  }

  const sourcePermissions = new Set(parsed.permissions);
  for (const permission of parsed.permissions) {
    const capabilityOwners = owners.get(permission) ?? [];
    if (capabilityOwners.length === 0) {
      issues.push(
        `RBAC permission ${permission} has no capability-level gate.`
      );
    } else if (capabilityOwners.length > 1) {
      issues.push(
        `RBAC permission ${permission} has multiple capability-level gates: ${capabilityOwners.join(', ')}.`
      );
    }
  }
  for (const [permission, capabilityOwners] of owners) {
    if (!sourcePermissions.has(permission)) {
      issues.push(
        `Capability-level gate ${capabilityOwners.join(', ')} references unknown RBAC permission ${permission}.`
      );
    }
  }

  return issues;
}

/**
 * Reads executable RBAC action markers from one reachable TypeScript module.
 *
 * A route or action exercises a permission through an object property such as
 * `permission: 'create_appointment'`. TypeScript AST parsing prevents comments,
 * prose strings and type declarations from spoofing reachability. Keeping the
 * permission literal is intentional: a dynamically assembled permission would
 * make the route-to-capability gate impossible to review and therefore fails
 * closed.
 */
export function parsePermissionActionReferences(source) {
  const permissions = [];
  const issues = [];
  const sourceFile = ts.createSourceFile(
    'reachable-api-action.ts',
    String(source),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );

  function visit(node) {
    if (
      ts.isShorthandPropertyAssignment(node) &&
      node.name.text === 'permission'
    ) {
      issues.push(
        'Reachable API action has a shorthand permission property; use one reviewed RBAC Permission literal.'
      );
    } else if (ts.isPropertyAssignment(node)) {
      const name =
        ts.isIdentifier(node.name) || ts.isStringLiteralLike(node.name)
          ? node.name.text
          : undefined;
      if (name === 'permission') {
        if (!ts.isStringLiteralLike(node.initializer)) {
          issues.push(
            'Reachable API action has a non-literal permission property; use one reviewed RBAC Permission literal.'
          );
        } else if (!/^[a-z][a-z0-9_]*$/.test(node.initializer.text)) {
          issues.push(
            `Reachable API action has invalid permission ${JSON.stringify(node.initializer.text)}.`
          );
        } else {
          permissions.push(node.initializer.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  return { permissions, issues };
}

/**
 * Fails when an executable permission marker becomes reachable from API
 * `main.ts` while its machine-mapped capability still has blockers.
 *
 * `capabilityGates[*].permissions` is the permission-to-capability mapping;
 * `reachableSources` supplies the route/action side of the mapping after the
 * architecture checker walks imports from `main.ts`.
 */
export function validateReachableCapabilityBlockers(
  inventory,
  reachableSources
) {
  const issues = [];
  if (!isRecord(inventory) || !isRecord(inventory.capabilityGates)) {
    issues.push(
      'Cannot validate reachable API actions without capabilityGates.'
    );
    return issues;
  }
  if (!(reachableSources instanceof Map)) {
    issues.push('Reachable API action sources must be supplied as a Map.');
    return issues;
  }

  const permissionOwners = new Map();
  for (const [capability, entry] of Object.entries(inventory.capabilityGates)) {
    if (!isRecord(entry) || !Array.isArray(entry.permissions)) continue;
    for (const permission of entry.permissions) {
      if (typeof permission !== 'string') continue;
      const owners = permissionOwners.get(permission) ?? [];
      owners.push(capability);
      permissionOwners.set(permission, owners);
    }
  }

  for (const [file, source] of reachableSources) {
    const parsed = parsePermissionActionReferences(source);
    for (const detail of parsed.issues) issues.push(`${file}: ${detail}`);

    const seenPermissions = new Set();
    for (const permission of parsed.permissions) {
      if (seenPermissions.has(permission)) continue;
      seenPermissions.add(permission);

      const owners = permissionOwners.get(permission) ?? [];
      if (owners.length === 0) {
        issues.push(
          `${file} makes RBAC permission ${permission} reachable, but it has no capability-level gate.`
        );
        continue;
      }
      if (owners.length > 1) {
        issues.push(
          `${file} makes RBAC permission ${permission} reachable, but it maps to multiple capabilities: ${owners.join(', ')}.`
        );
        continue;
      }

      const capability = owners[0];
      const entry = inventory.capabilityGates[capability];
      const blockers = isRecord(entry) ? entry.remainingBlockers : undefined;
      if (!Array.isArray(blockers)) {
        issues.push(
          `${file} makes ${permission} reachable, but capability ${capability} has no valid remainingBlockers array.`
        );
      } else if (blockers.length > 0) {
        issues.push(
          `${file} makes RBAC permission ${permission} reachable, but capability ${capability} still has ${blockers.length} remaining blocker(s).`
        );
      }
    }
  }

  return issues;
}
