import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  parseDecisionRegister,
  parseStageGateStatus
} from './unrouted-inventory.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

describe('2026-09-11 C0 owner-direction reconciliation', () => {
  const register = read('docs/product/phase-1-decision-register.md');
  const authority = read('docs/architecture/first-stage-c0-authority.md');
  const gateStatus = parseStageGateStatus(
    JSON.parse(read('docs/architecture/stage-2-gate-status.json'))
  );

  it('records owner direction ids without changing D-series status vocabulary', () => {
    const { decisions, issues } = parseDecisionRegister(register);
    expect(issues).toEqual([]);
    expect(register).toContain('Recorded input ID: FS-001');
    expect(register).toContain('Recorded input ID: C0-DIR-2026-09-11');
    expect(register).toContain('Recorded input ID: CAL-SYNC-DIR-2026-09-11');
    expect(register).toContain('Recorded input ID: C0-ENG-REC-2026-09-11');
    expect(register).toContain('Recorded input ID: C0-ENG-ACCEPT-2026-09-11');
    expect(decisions.get('D-006')).toBe('approved');
    expect(decisions.get('D-010')).toBe('approved');
    expect(decisions.get('D-009')).toBe('pending');
    expect(decisions.get('D-016')).toBe('pending');
    expect(decisions.get('D-011')).toBe('pending');
  });

  it('closes engineering C0 and records C1–C6 synthetic PASS', () => {
    expect(gateStatus.issues).toEqual([]);
    expect(gateStatus.stageSlices.get('C0')).toBe('completed');
    for (const id of ['C1', 'C2', 'C3', 'C4', 'C5', 'C6']) {
      expect(gateStatus.stageSlices.get(id)).toBe('completed');
      expect(gateStatus.deploymentAuthorities.get(id)).toBe('granted');
    }
  });

  it('splits owner authority from named-reviewer metadata and forbids invalid C0=approved', () => {
    expect(authority).toContain('OWNER_AUTHORITY_CONFIRMED');
    expect(authority).toContain('ENGINEERING_RECOMMENDATION_COMPLETE');
    expect(authority).toContain('NAMED_REVIEWER_METADATA_PENDING');
    expect(authority).toContain('stageSlices.C0=completed');
    expect(authority).toMatch(/50%\s*\/\s*80%\s*\/\s*100%/);
    expect(authority).toContain('DR option');
    expect(authority).toContain('MFA recovery');
    expect(authority).toContain('events.watch');
    expect(authority).toContain('UNROUTED');
    expect(authority).not.toMatch(/stageSlices\.C0=approved/);
    expect(register).toContain('did not fabricate a named technical');
  });

  it('keeps formal booking unrouted in AppModule', () => {
    const appModule = read('apps/api/src/app.module.ts');
    expect(appModule).toContain('CalendarPilotModule');
    expect(appModule).not.toMatch(
      /AppointmentController|BookPilotModule|BookPilotController|CalendarWatchController/
    );
  });

  it('indexes the 2026-09-11 C0 split in Canon maps', () => {
    const index = read('docs/INDEX.md');
    const catalogue = read('docs/README.md');
    const execution = read('docs/architecture/first-stage-c1-c6-execution.md');
    const runtime = read(
      'apps/worker/src/calendar-sync/calendar-pilot-runtime.ts'
    );
    expect(index).toContain('architecture/first-stage-c0-authority.md');
    expect(index).toContain('architecture/first-stage-c1-c6-execution.md');
    expect(catalogue).toContain('architecture/first-stage-c0-authority.md');
    expect(catalogue).toContain(
      'reviews/2026-09-11-c0-owner-direction-reconciliation.md'
    );
    expect(catalogue).toContain(
      'reviews/2026-09-11-c0-engineering-recommendations.md'
    );
    expect(catalogue).toContain(
      'reviews/2026-09-11-c0-engineering-acceptance.md'
    );
    expect(catalogue).toContain(
      'architecture/c0-engineering-recommendations.md'
    );
    expect(execution).toContain('AUTHORIZED');
    expect(execution).toContain('DEPLOYED=NO');
    expect(execution).not.toMatch(/Status \| `completed`/);
    expect(runtime).not.toMatch(/watch-channel/);
    expect(runtime).not.toMatch(/GoogleCalendarWatchClient/);
    expect(runtime).not.toMatch(/watch-channel-store/);
    expect(
      read('apps/worker/src/calendar-sync/calendar-pilot-main.ts')
    ).not.toMatch(/calendar-watch/);
  });

  it('keeps CAL-PILOT session windows aligned with C0-DIR idle/absolute targets', () => {
    const session = read('apps/api/src/auth/calendar-pilot-session.ts');
    expect(session).toContain('const ABSOLUTE_SESSION_MS = 8 * 60 * 60 * 1000');
    expect(session).toContain('const IDLE_SESSION_MS = 30 * 60 * 1000');
  });

  it('does not treat suggested hostnames as Hosting or Terraform apply targets', () => {
    const firebase = read('firebase.json');
    for (const host of [
      'book.beauessence.com.tw',
      'staff.beauessence.com.tw',
      'api.beauessence.com.tw'
    ]) {
      expect(firebase).not.toContain(host);
      expect(register).toContain(host);
    }
    expect(register).toContain('not DNS');
  });
});

describe('C0-ENG-REC-2026-09-11 engineering recommendations', () => {
  const recs = JSON.parse(
    read('docs/architecture/c0-engineering-recommendations.json')
  );
  const identityScript = read('scripts/configure-cal-pilot-identity.mjs');
  const calPilotTf = read('infra/terraform/cal-pilot/variables.tf');

  it('records owner acceptance without claiming C1 PASS or C2–C6 grants', () => {
    expect(recs.status.stageSliceC0).toBe('completed');
    expect(recs.status.c1Authority).toBe('granted');
    expect(recs.status.c2ToC6Authorities).toBe('not_granted');
    expect(recs.status.ownerAuthority).toBe('OWNER_AUTHORITY_CONFIRMED');
    expect(recs.status.humanReview).toBe('NAMED_REVIEWER_METADATA_PENDING');
    expect(recs.iam.firestoreDatabaseScope.syntheticStagingAcceptance).toBe(
      'OWNER_AUTHORITY_CONFIRMED'
    );
    expect(recs.iam.firestoreDatabaseScope.productionAcceptance).toBe(
      'not_granted'
    );
    expect(recs.iam.firestoreDatabaseScope.humanAcceptanceRequired).toBe(true);
  });

  it('selects a new isolated C1 project and keeps existing staging out of C1', () => {
    expect(recs.c1.strategy).toBe('new_isolated_project');
    expect(recs.c1.existingStaging).toBe('beauessence-clinic-staging');
    expect(calPilotTf).toContain('default     = "beauessence-clinic-staging"');
    expect(recs.c1.existingStagingDisposition).toContain('cal_pilot');
    expect(recs.c1.excludedApis).toEqual(
      expect.arrayContaining([
        'firestore.googleapis.com',
        'identitytoolkit.googleapis.com',
        'run.googleapis.com'
      ])
    );
    expect(recs.c1.apiAllowlist).not.toEqual(
      expect.arrayContaining(recs.c1.excludedApis)
    );
  });

  it('encodes budget actions, DR A+B, and MFA parameters used by domain/CAL-PILOT', () => {
    expect(recs.budget.actions['50']).toMatch(/notify/);
    expect(recs.budget.actions['80']).toMatch(/freeze/);
    expect(recs.budget.actions['100']).toMatch(/do_not_detach_billing/);
    expect(recs.dr.selected).toBe(
      'option_a_baseline_plus_option_b_secondary_project_same_region'
    );
    expect(recs.mfa.totpAdjacentIntervals).toBe(1);
    expect(identityScript).toContain('adjacentIntervals: 1');
    expect(recs.mfa.breakGlass).toBe('not_provisioned');
  });
});
