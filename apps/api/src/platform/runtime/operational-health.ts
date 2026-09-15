import {
  evaluateOperationalHealth,
  type OperationalHealthEvaluation,
  type OperationalHealthInput,
  type ProbeResult
} from '@beauessence/domain';

export const OPERATIONAL_HEALTH_PROBE = 'OperationalHealthProbe';

export interface OperationalHealthProbe {
  snapshot(): OperationalHealthInput;
}

export class ProcessOnlyOperationalHealthProbe implements OperationalHealthProbe {
  public snapshot(): OperationalHealthInput {
    return {
      processAlive: true,
      firestore: 'not_probed',
      calendarAdapter: 'not_probed',
      requiredConfigPresent: true,
      bookingGateEnabled:
        process.env['INTERNAL_TEST_BOOKING_ENABLED'] === 'true',
      outboxDeadLetterCount: 0,
      outboxOldestAgeSeconds: 0,
      candidateBacklog: 0,
      calendarSyncStale: false,
      calendarGoneRecoveryNeeded: false,
      backupFailed: false,
      iamAlertIntegrated: true,
      workerDegraded: false
    };
  }
}

export class StaticOperationalHealthProbe implements OperationalHealthProbe {
  public constructor(private readonly input: OperationalHealthInput) {}

  public snapshot(): OperationalHealthInput {
    return this.input;
  }
}

export function evaluateProbe(
  probe: OperationalHealthProbe
): OperationalHealthEvaluation {
  return evaluateOperationalHealth(probe.snapshot());
}

export function probeResultFromBoolean(available: boolean | null): ProbeResult {
  if (available === null) return 'not_probed';
  return available ? 'ok' : 'unavailable';
}
