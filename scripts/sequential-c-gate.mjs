import { execFileSync } from 'node:child_process';
import { accessSync, constants, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  evaluateC1Smoke,
  loadC0EngineeringRecs
} from './c1-smoke-evidence.mjs';
import {
  bookingAndWatchRemainUnrouted,
  evaluateC2Smoke,
  evaluateC5Smoke,
  evaluateC6Smoke
} from './c2-c6-smoke-evidence.mjs';
import { parseStageGateStatus } from './unrouted-inventory.mjs';

export { bookingAndWatchRemainUnrouted };

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const LIVE_GATE_STATUS = join(
  root,
  'docs/architecture/stage-2-gate-status.json'
);

export const CLOUD_SLICES = ['C1', 'C2', 'C5', 'C6'];
export const SOURCE_SLICES = ['C3', 'C4'];
export const SLICE_ORDER = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'];

const SLICE_PACKETS = {
  C1: {
    directory: 'infra/terraform/c1-foundation',
    packet: 'docs/runbooks/c1-local-execution-packet.md'
  },
  C2: {
    directory: 'infra/terraform/c2-identity',
    packet: 'docs/runbooks/c2-c6-local-execution-packet.md'
  },
  C5: {
    directory: 'infra/terraform/c5-firestore',
    packet: 'docs/runbooks/c2-c6-local-execution-packet.md'
  },
  C6: {
    directory: 'infra/terraform/c6-calendar',
    packet: 'docs/runbooks/c2-c6-local-execution-packet.md'
  }
};

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

export function terraformCliStatus() {
  return {
    gcloud: hasCli('gcloud'),
    terraform: hasCli('terraform'),
    firebase: hasCli('firebase')
  };
}

export function evaluateC3Source(sessionSource) {
  const issues = [];
  if (
    !sessionSource.includes("export const CALENDAR_PILOT_COOKIE = '__session'")
  ) {
    issues.push('C3 session cookie must be __session.');
  }
  if (
    !sessionSource.includes(
      "const SESSION_COOKIE_SCOPE = 'Path=/; HttpOnly; Secure; SameSite=Strict'"
    )
  ) {
    issues.push('C3 cookie must be HttpOnly; Secure; SameSite=Strict.');
  }
  if (
    !sessionSource.includes('const ABSOLUTE_SESSION_MS = 8 * 60 * 60 * 1000')
  ) {
    issues.push('C3 absolute session must be 8h.');
  }
  if (!sessionSource.includes('const IDLE_SESSION_MS = 30 * 60 * 1000')) {
    issues.push('C3 idle session must be 30m.');
  }
  if (
    !sessionSource.includes(
      'if (user.disabled) throw new AuthenticationRequiredError()'
    )
  ) {
    issues.push('C3 must reject disabled users.');
  }
  if (!sessionSource.includes('public async assertCsrf')) {
    issues.push('C3 must bind CSRF to the server-side session.');
  }
  return { ok: issues.length === 0, issues };
}

export function evaluateC4Source(rolesSource, authParametersSource, recs) {
  const issues = [];
  if (!rolesSource.includes("'manager'")) {
    issues.push('C4 roles must include manager.');
  }
  if (!rolesSource.includes("'front_desk'")) {
    issues.push('C4 roles must include front_desk.');
  }
  if (
    !authParametersSource.includes(
      `export const TOTP_ADJACENT_INTERVALS = ${recs.mfa.totpAdjacentIntervals}`
    )
  ) {
    issues.push('C4 TOTP adjacentIntervals must match C0-ENG-REC.');
  }
  if (
    !authParametersSource.includes(
      `export const AUTHORIZATION_LOCK_FAILURE_THRESHOLD = ${recs.mfa.authorizationLockFailureThreshold}`
    )
  ) {
    issues.push('C4 lockout threshold must match C0-ENG-REC.');
  }
  if (!authParametersSource.includes("BREAK_GLASS = 'not_provisioned'")) {
    issues.push('C4 must keep break-glass unprovisioned.');
  }
  return { ok: issues.length === 0, issues };
}

export function currentHeadSha(repoRoot = root) {
  return execFileSync('git', ['-C', repoRoot, 'rev-parse', 'HEAD'], {
    encoding: 'utf8'
  }).trim();
}

export function emitExactAuthorityRequest(slice, extras = {}) {
  const packet = SLICE_PACKETS[slice];
  return {
    kind: 'EXACT_SHA_CLOUD_MUTATION',
    slice,
    directory: packet?.directory ?? null,
    packet: packet?.packet ?? null,
    sha: currentHeadSha(),
    shaLookup: 'git rev-parse HEAD',
    forbidden: [
      'beauessence-clinic-staging',
      'book.beauessence.com.tw',
      'staff.beauessence.com.tw',
      'api.beauessence.com.tw',
      'terraform apply from this agent sandbox',
      'live Hosting channel',
      'production Calendar',
      'real patient data',
      'routing AppointmentController'
    ],
    applyPolicy:
      'never from sequential-c-gate; local packet only after exact SHA',
    cli: terraformCliStatus(),
    afterEvidence:
      slice === 'C1'
        ? 'node scripts/sequential-c-gate.mjs --c1-smoke /tmp/c1-smoke.json'
        : `node scripts/sequential-c-gate.mjs --${slice.toLowerCase()}-smoke /tmp/${slice.toLowerCase()}-smoke.json`,
    ...extras
  };
}

function cloneGate(value) {
  return JSON.parse(JSON.stringify(value));
}

function previousSlice(slice) {
  if (slice === 'C1') return 'C0';
  const index = SLICE_ORDER.indexOf(slice);
  return index > 0 ? SLICE_ORDER[index - 1] : null;
}

function nextSlice(slice) {
  const index = SLICE_ORDER.indexOf(slice);
  return index >= 0 && index < SLICE_ORDER.length - 1
    ? SLICE_ORDER[index + 1]
    : null;
}

function evaluateSliceEvidence(slice, inputs) {
  if (slice === 'C1') {
    return inputs.c1Smoke
      ? evaluateC1Smoke(inputs.c1Smoke, inputs.recs)
      : { ok: false, issues: ['C1 smoke evidence is missing.'] };
  }
  if (slice === 'C2') {
    return inputs.c2Smoke
      ? evaluateC2Smoke(inputs.c2Smoke)
      : { ok: false, issues: ['C2 smoke evidence is missing.'] };
  }
  if (slice === 'C3') {
    return evaluateC3Source(inputs.sessionSource);
  }
  if (slice === 'C4') {
    return evaluateC4Source(
      inputs.rolesSource,
      inputs.authParametersSource,
      inputs.recs
    );
  }
  if (slice === 'C5') {
    return inputs.c5Smoke
      ? evaluateC5Smoke(inputs.c5Smoke)
      : { ok: false, issues: ['C5 smoke evidence is missing.'] };
  }
  if (slice === 'C6') {
    const smoke = inputs.c6Smoke
      ? evaluateC6Smoke(inputs.c6Smoke)
      : { ok: false, issues: ['C6 smoke evidence is missing.'] };
    if (!bookingAndWatchRemainUnrouted(inputs.appModuleSource)) {
      return {
        ok: false,
        issues: [
          ...smoke.issues,
          'Formal booking or CalendarWatchController is routed.'
        ]
      };
    }
    return smoke;
  }
  return { ok: false, issues: [`Unknown slice ${slice}.`] };
}

export function nextSequentialAction(gateValue, inputs = {}) {
  const recs = inputs.recs ?? loadC0EngineeringRecs();
  const parsed = parseStageGateStatus(gateValue);
  const blockers = [...parsed.issues];
  const appModuleSource = inputs.appModuleSource ?? '';

  if (!bookingAndWatchRemainUnrouted(appModuleSource)) {
    blockers.push(
      'Formal booking and CalendarWatchController must stay UNROUTED.'
    );
  }
  if (parsed.stageSlices.get('C0') !== 'completed') {
    blockers.push('C0 must be completed before C1–C6 progression.');
  }

  if (blockers.length > 0) {
    return {
      kind: 'HARD_BLOCKER',
      slice: null,
      blockers,
      proposedPatch: null,
      exactAuthorityRequest: null
    };
  }

  const resolvedInputs = { ...inputs, recs, appModuleSource };

  for (const slice of SLICE_ORDER) {
    const sliceStatus = parsed.stageSlices.get(slice);
    const authority = parsed.deploymentAuthorities.get(slice);
    if (sliceStatus === 'completed') continue;

    if (authority !== 'granted') {
      const previous = previousSlice(slice);
      const previousCompleted =
        previous === 'C0'
          ? parsed.stageSlices.get('C0') === 'completed'
          : parsed.stageSlices.get(previous) === 'completed';
      if (!previousCompleted) {
        return {
          kind: 'HARD_BLOCKER',
          slice,
          blockers: [`Cannot grant ${slice} before ${previous} is completed.`],
          proposedPatch: null,
          exactAuthorityRequest: null
        };
      }
      const proposedPatch = cloneGate(gateValue);
      proposedPatch.deploymentAuthorities[slice] = 'granted';
      return {
        kind: 'PROPOSE_GRANT',
        slice,
        blockers: [],
        proposedPatch,
        exactAuthorityRequest: null
      };
    }

    const evidence = evaluateSliceEvidence(slice, resolvedInputs);
    if (!evidence.ok) {
      const request = CLOUD_SLICES.includes(slice)
        ? emitExactAuthorityRequest(slice, { issues: evidence.issues })
        : null;
      return {
        kind: 'HARD_BLOCKER',
        slice,
        blockers: evidence.issues,
        proposedPatch: null,
        exactAuthorityRequest: request
      };
    }

    const proposedPatch = cloneGate(gateValue);
    proposedPatch.stageSlices[slice] = 'completed';
    const following = nextSlice(slice);
    if (following) {
      proposedPatch.deploymentAuthorities[following] = 'granted';
    }
    const parsedPatch = parseStageGateStatus(proposedPatch);
    if (parsedPatch.issues.length > 0) {
      return {
        kind: 'HARD_BLOCKER',
        slice,
        blockers: parsedPatch.issues,
        proposedPatch: null,
        exactAuthorityRequest: null
      };
    }
    return {
      kind: 'PROPOSE_COMPLETE_AND_GRANT_NEXT',
      slice,
      blockers: [],
      proposedPatch,
      exactAuthorityRequest: null
    };
  }

  return {
    kind: 'DONE',
    slice: 'C6',
    blockers: [],
    proposedPatch: null,
    exactAuthorityRequest: null
  };
}

export function loadLiveSources(repoRoot = root) {
  return {
    recs: loadC0EngineeringRecs(),
    appModuleSource: readFileSync(
      join(repoRoot, 'apps/api/src/app.module.ts'),
      'utf8'
    ),
    sessionSource: readFileSync(
      join(repoRoot, 'apps/api/src/auth/calendar-pilot-session.ts'),
      'utf8'
    ),
    rolesSource: readFileSync(
      join(repoRoot, 'packages/domain/src/roles.ts'),
      'utf8'
    ),
    authParametersSource: readFileSync(
      join(repoRoot, 'packages/domain/src/staff-auth-parameters.ts'),
      'utf8'
    )
  };
}

function parseArgs(argv) {
  const args = { write: false, gateStatusPath: LIVE_GATE_STATUS, smokes: {} };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--write') {
      args.write = true;
      continue;
    }
    if (token === '--gate-status') {
      args.gateStatusPath = argv[index + 1];
      index += 1;
      continue;
    }
    const smoke = token.match(/^--(c[1256])-smoke$/);
    if (smoke) {
      args.smokes[smoke[1].toUpperCase()] = argv[index + 1];
      index += 1;
    }
  }
  return args;
}

function readJsonIfPresent(path) {
  if (!path) return undefined;
  return JSON.parse(readFileSync(path, 'utf8'));
}

function isDirectRun() {
  const invoked = process.argv[1];
  if (typeof invoked !== 'string' || invoked === '') return false;
  return import.meta.url === pathToFileURL(invoked).href;
}

if (isDirectRun()) {
  const args = parseArgs(process.argv.slice(2));
  const gateValue = JSON.parse(readFileSync(args.gateStatusPath, 'utf8'));
  const sources = loadLiveSources();
  const action = nextSequentialAction(gateValue, {
    ...sources,
    c1Smoke: readJsonIfPresent(args.smokes.C1),
    c2Smoke: readJsonIfPresent(args.smokes.C2),
    c5Smoke: readJsonIfPresent(args.smokes.C5),
    c6Smoke: readJsonIfPresent(args.smokes.C6)
  });
  const report = {
    kind: action.kind,
    slice: action.slice,
    blockers: action.blockers,
    exactAuthorityRequest: action.exactAuthorityRequest,
    terraformCli: terraformCliStatus(),
    wrote: false
  };
  if (args.write) {
    if (
      action.kind !== 'PROPOSE_COMPLETE_AND_GRANT_NEXT' &&
      action.kind !== 'PROPOSE_GRANT'
    ) {
      process.stderr.write(
        'sequential-c-gate --write refuses to mutate Canon without a legal next patch.\n'
      );
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      process.exit(1);
    }
    writeFileSync(
      args.gateStatusPath,
      `${JSON.stringify(action.proposedPatch, null, 2)}\n`
    );
    report.wrote = true;
    report.proposedPatch = action.proposedPatch;
  } else if (action.proposedPatch) {
    report.proposedPatch = action.proposedPatch;
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(action.kind === 'HARD_BLOCKER' ? 1 : 0);
}
