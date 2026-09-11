import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { parseStageGateStatus } from './unrouted-inventory.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

describe('C2–C6 source invariants before prior-gate PASS', () => {
  const gateStatus = parseStageGateStatus(
    JSON.parse(read('docs/architecture/stage-2-gate-status.json'))
  );
  const c1 = read('infra/terraform/c1-foundation/main.tf');
  const c2 = read('infra/terraform/c2-identity/main.tf');
  const c5 = read('infra/terraform/c5-firestore/main.tf');
  const c6 = read('infra/terraform/c6-calendar/main.tf');
  const watch = read('apps/worker/src/calendar-sync/watch-channel.ts');
  const session = read('apps/api/src/auth/calendar-pilot-session.ts');
  const appModule = read('apps/api/src/app.module.ts');
  const roles = read('packages/domain/src/roles.ts');

  it('does not grant or complete C2–C6 before C1 PASS', () => {
    expect(gateStatus.issues).toEqual([]);
    expect(gateStatus.stageSlices.get('C0')).toBe('completed');
    expect(gateStatus.deploymentAuthorities.get('C1')).toBe('granted');
    for (const id of ['C2', 'C3', 'C4', 'C5', 'C6']) {
      expect(gateStatus.stageSlices.get(id)).toBe('pending');
      expect(gateStatus.deploymentAuthorities.get(id)).toBe('not_granted');
    }
  });

  it('keeps Identity, Firestore and Calendar API out of C1 and SHA-gates later slices', () => {
    expect(c1).not.toContain('identitytoolkit.googleapis.com');
    expect(c1).not.toContain('firestore.googleapis.com');
    expect(c1).not.toContain('calendar-json.googleapis.com');
    expect(c2).toContain('identitytoolkit.googleapis.com');
    expect(c2).not.toContain('firestore.googleapis.com');
    expect(c2).toContain(
      'apply_enabled = var.exact_apply_authority_sha != "not_granted"'
    );
    expect(c5).toContain('firestore.googleapis.com');
    expect(c5).toContain('POINT_IN_TIME_RECOVERY_ENABLED');
    expect(c5).toContain('location_id                       = var.region');
    expect(read('infra/terraform/c5-firestore/variables.tf')).toContain(
      'asia-east1'
    );
    expect(c5).not.toContain('identitytoolkit.googleapis.com');
    expect(c6).toContain('calendar-json.googleapis.com');
    expect(c6).toContain(
      'apply_enabled = var.exact_apply_authority_sha != "not_granted"'
    );
    expect(c6).not.toContain('identitytoolkit.googleapis.com');
    expect(read('infra/terraform/c5-firestore/noop.tftest.hcl')).toContain(
      'FIRESTORE_NATIVE'
    );
    expect(read('infra/terraform/c5-firestore/noop.tftest.hcl')).toContain(
      'POINT_IN_TIME_RECOVERY_ENABLED'
    );
    expect(read('infra/terraform/c6-calendar/noop.tftest.hcl')).toContain(
      'calendar-json.googleapis.com'
    );
    expect(read('infra/terraform/c2-identity/variables.tf')).toContain(
      'beauessence-clinic-staging'
    );
    expect(read('infra/terraform/c5-firestore/variables.tf')).toContain(
      'beauessence-clinic-staging'
    );
    expect(read('infra/terraform/c6-calendar/variables.tf')).toContain(
      'beauessence-clinic-staging'
    );
    for (const readme of [
      'infra/terraform/c2-identity/README.md',
      'infra/terraform/c5-firestore/README.md',
      'infra/terraform/c6-calendar/README.md'
    ]) {
      expect(read(readme)).toContain(
        'docs/runbooks/c2-c6-local-execution-packet.md'
      );
      expect(read(readme)).not.toContain('docs/reviews/');
    }
    for (const example of [
      'infra/terraform/c2-identity/terraform.tfvars.example',
      'infra/terraform/c5-firestore/terraform.tfvars.example',
      'infra/terraform/c6-calendar/terraform.tfvars.example'
    ]) {
      expect(read(example)).toContain(
        'exact_apply_authority_sha = "not_granted"'
      );
      expect(read(example)).toContain('beauessence-clinic-stg-c1tmp');
      expect(read(example)).not.toContain('replace-me');
      expect(read(example)).not.toContain('beauessence-clinic-staging');
    }
  });

  it('keeps staff session, roles, and unrouted booking/watch boundaries', () => {
    expect(session).toContain(
      "export const CALENDAR_PILOT_COOKIE = '__session'"
    );
    expect(session).toContain(
      "const SESSION_COOKIE_SCOPE = 'Path=/; HttpOnly; Secure; SameSite=Strict'"
    );
    expect(session).toContain('const ABSOLUTE_SESSION_MS = 8 * 60 * 60 * 1000');
    expect(session).toContain('const IDLE_SESSION_MS = 30 * 60 * 1000');
    expect(session).toContain(
      'if (user.disabled) throw new AuthenticationRequiredError()'
    );
    expect(roles).toContain("'manager'");
    expect(roles).toContain("'front_desk'");
    expect(appModule).toContain('CalendarPilotModule');
    expect(appModule).not.toMatch(
      /AppointmentController|BookPilotModule|CalendarWatchController/
    );
    expect(watch).toContain('COMPENSATION_SYNC_MIN_MS = 60_000');
    expect(watch).toContain('COMPENSATION_SYNC_MAX_MS = 5 * 60_000');
    expect(watch).toContain('Unwired by policy');
    expect(read('scripts/c2-c6-smoke-evidence.mjs')).toContain(
      'assembleC2SmokeEvidence'
    );
    expect(read('scripts/configure-c2-identity.mjs')).toContain(
      'execute: false'
    );
    expect(read('scripts/configure-c2-identity.mjs')).toContain(
      'identityPlatform:initializeAuth'
    );
  });
});
