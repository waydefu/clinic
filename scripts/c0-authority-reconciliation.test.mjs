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
    expect(decisions.get('D-006')).toBe('approved');
    expect(decisions.get('D-010')).toBe('approved');
    expect(decisions.get('D-009')).toBe('pending');
    expect(decisions.get('D-016')).toBe('pending');
    expect(decisions.get('D-011')).toBe('pending');
  });

  it('keeps engineering C0 revise and every C1–C6 authority not_granted', () => {
    expect(gateStatus.issues).toEqual([]);
    expect(gateStatus.stageSlices.get('C0')).toBe('revise');
    for (const id of ['C1', 'C2', 'C3', 'C4', 'C5', 'C6']) {
      expect(gateStatus.stageSlices.get(id)).toBe('pending');
      expect(gateStatus.deploymentAuthorities.get(id)).toBe('not_granted');
    }
  });

  it('does not let owner direction be read as engineering closure or cloud grant', () => {
    expect(authority).toContain('OWNER_DIRECTION_APPROVED');
    expect(authority).toContain('ENGINEERING_CLOSURE_PENDING');
    expect(authority).toMatch(/50%\s*\/\s*80%\s*\/\s*100%/);
    expect(authority).toContain('DR option');
    expect(authority).toContain('MFA recovery');
    expect(authority).toContain('events.watch');
    expect(authority).toContain('UNROUTED');
    expect(authority).not.toMatch(/stageSlices\.C0=approved/);
  });

  it('keeps formal booking unrouted in AppModule', () => {
    const appModule = read('apps/api/src/app.module.ts');
    expect(appModule).toContain('CalendarPilotModule');
    expect(appModule).not.toMatch(
      /AppointmentController|BookPilotModule|CalendarWatchController/
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
    expect(execution).toContain('READY_FOR_EXPLICIT_AUTHORITY');
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
});
