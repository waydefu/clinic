import { NotFoundException } from '@nestjs/common';
import {
  ROLES,
  resolveApprovedBusinessDeliveryPolicy
} from '@beauessence/domain';
import type {
  PatientArchivedResponse,
  PatientLegalHoldResponse,
  PatientPermanentlyDeletedResponse,
  PatientRestoredResponse,
  PendingPatientDeletionResponse
} from '@beauessence/contracts';
import { ZodError } from 'zod';
import { describe, expect, it, vi } from 'vitest';

import type { AuthenticationContext } from '../auth/authentication-context.js';
import type {
  ArchivePatientCommand,
  PermanentlyDeletePatientCommand,
  RestorePatientCommand,
  SetPatientLegalHoldCommand
} from '../firestore/business-delivery-retention.repository.js';
import { CANDIDATE_ROLE_PERMISSIONS } from '../platform/authorization/rbac.js';
import {
  AuthenticationRequiredError,
  AuthorizationDeniedError
} from '../platform/errors/api-error.js';
import type { BusinessDeliveryConfig } from './business-delivery.config.js';
import { BusinessRetentionApplicationService } from './business-retention.application-service.js';
import type { BusinessRetentionRepositoryPort } from './business-retention.application-service.js';

const POLICY = resolveApprovedBusinessDeliveryPolicy(
  'BD-POLICY-2026-09-29',
  'internal_synthetic'
);
const NOW = '2030-10-20T00:00:00.000Z';
const ENABLED: BusinessDeliveryConfig = {
  enabled: true,
  policy: POLICY,
  scope: 'internal_synthetic',
  observedSince: '2030-09-01T00:00:00.000Z'
};
const PATIENT_ID = 'patient_ret_1';
const ARCHIVED: PatientArchivedResponse = {
  patientId: PATIENT_ID,
  state: 'archived',
  restorableUntil: '2030-11-19T00:00:00.000Z'
};
const RESTORED: PatientRestoredResponse = {
  patientId: PATIENT_ID,
  state: 'active'
};
const DELETED: PatientPermanentlyDeletedResponse = {
  patientId: PATIENT_ID,
  state: 'deleted',
  layers: {
    patients: 1,
    appointments: 0,
    patient_booking_guards: 0,
    patient_follow_up_states: 0,
    return_sessions: 0,
    follow_ups: 0,
    patient_lookup_index_v2: 0
  }
};
const HELD: PatientLegalHoldResponse = {
  patientId: PATIENT_ID,
  legalHold: true
};
const PENDING: PendingPatientDeletionResponse = {
  patients: [
    {
      patientId: PATIENT_ID,
      archivedAt: '2030-10-01T00:00:00.000Z',
      restorableUntil: '2030-10-31T00:00:00.000Z',
      legalHold: false
    }
  ]
};

const managers = ROLES.filter((role) =>
  CANDIDATE_ROLE_PERMISSIONS[role].includes('manage_business_retention')
);
const MANAGER = managers[0]!;

function staff(actorRole: string): AuthenticationContext {
  return { actorId: 'staff_uid_ret_1', actorRole };
}

function setup(
  config: BusinessDeliveryConfig = ENABLED,
  reauthenticate: () => Promise<void> = () => Promise.resolve()
) {
  const calls: {
    archive: ArchivePatientCommand[];
    restore: RestorePatientCommand[];
    permanentlyDelete: PermanentlyDeletePatientCommand[];
    setLegalHold: SetPatientLegalHoldCommand[];
    pendingDeletion: string[];
  } = {
    archive: [],
    restore: [],
    permanentlyDelete: [],
    setLegalHold: [],
    pendingDeletion: []
  };
  const repository: BusinessRetentionRepositoryPort = {
    archive: vi.fn((command) => {
      calls.archive.push(command);
      return Promise.resolve(ARCHIVED);
    }),
    restore: vi.fn((command) => {
      calls.restore.push(command);
      return Promise.resolve(RESTORED);
    }),
    permanentlyDelete: vi.fn((command) => {
      calls.permanentlyDelete.push(command);
      return Promise.resolve(DELETED);
    }),
    setLegalHold: vi.fn((command) => {
      calls.setLegalHold.push(command);
      return Promise.resolve(HELD);
    }),
    pendingDeletion: vi.fn((now) => {
      calls.pendingDeletion.push(now);
      return Promise.resolve(PENDING);
    })
  };
  const assertFresh = vi.fn(reauthenticate);
  const service = new BusinessRetentionApplicationService(
    config,
    repository,
    { assertFresh },
    () => NOW
  );
  return { service, repository, calls, assertFresh };
}

const patientRequest = {
  idempotencyKey: 'retention-key-000001',
  patientId: PATIENT_ID
};

describe('BusinessRetentionApplicationService authorization', () => {
  it('grants retention operations to exactly one role', () => {
    expect(managers).toEqual(['manager']);
    expect(POLICY.retention).toEqual({ recoverableDays: 30 });
  });

  it.each(ROLES.filter((role) => !managers.includes(role)))(
    'denies the %s role before storage access',
    async (role) => {
      const { service, repository } = setup();
      await expect(
        service.archive(patientRequest, 'fresh', staff(role))
      ).rejects.toBeInstanceOf(AuthorizationDeniedError);
      await expect(
        service.restore(patientRequest, staff(role))
      ).rejects.toBeInstanceOf(AuthorizationDeniedError);
      await expect(
        service.permanentlyDelete(
          { ...patientRequest, reasonCode: 'patient_request' },
          'fresh',
          staff(role)
        )
      ).rejects.toBeInstanceOf(AuthorizationDeniedError);
      await expect(
        service.setLegalHold(
          { ...patientRequest, hold: true, reasonCode: 'other' },
          staff(role)
        )
      ).rejects.toBeInstanceOf(AuthorizationDeniedError);
      await expect(service.pendingDeletion(staff(role))).rejects.toBeInstanceOf(
        AuthorizationDeniedError
      );
      expect(repository.archive).not.toHaveBeenCalled();
      expect(repository.restore).not.toHaveBeenCalled();
      expect(repository.permanentlyDelete).not.toHaveBeenCalled();
      expect(repository.setLegalHold).not.toHaveBeenCalled();
      expect(repository.pendingDeletion).not.toHaveBeenCalled();
    }
  );

  it('answers 404 before other work when the feature is disabled', async () => {
    const { service, repository, assertFresh } = setup({ enabled: false });
    await expect(
      service.archive(patientRequest, 'fresh', staff(MANAGER))
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.pendingDeletion(staff(MANAGER))
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(assertFresh).not.toHaveBeenCalled();
    expect(repository.archive).not.toHaveBeenCalled();
    expect(repository.pendingDeletion).not.toHaveBeenCalled();
  });
});

describe('BusinessRetentionApplicationService operations', () => {
  it('requires re-authentication before archiving and passes only server actor data', async () => {
    const denied = setup(ENABLED, () =>
      Promise.reject(new AuthenticationRequiredError())
    );
    await expect(
      denied.service.archive(patientRequest, undefined, staff(MANAGER))
    ).rejects.toBeInstanceOf(AuthenticationRequiredError);
    expect(denied.repository.archive).not.toHaveBeenCalled();

    const { service, calls, assertFresh } = setup();
    await expect(
      service.archive(patientRequest, 'fresh-token', staff(MANAGER))
    ).resolves.toEqual(ARCHIVED);
    expect(assertFresh).toHaveBeenCalledWith({
      idToken: 'fresh-token',
      actorId: 'staff_uid_ret_1',
      now: NOW,
      maxAgeSeconds: 600
    });
    expect(calls.archive[0]).toMatchObject({
      ...patientRequest,
      actorRef: expect.stringMatching(/^[a-f0-9]{64}$/),
      now: NOW,
      scope: 'internal_synthetic',
      policy: POLICY
    });
  });

  it('does not require re-authentication to restore or manage legal hold', async () => {
    const { service, calls, assertFresh } = setup();
    await expect(
      service.restore(patientRequest, staff(MANAGER))
    ).resolves.toEqual(RESTORED);
    await expect(
      service.setLegalHold(
        { ...patientRequest, hold: true, reasonCode: 'other' },
        staff(MANAGER)
      )
    ).resolves.toEqual(HELD);
    expect(assertFresh).not.toHaveBeenCalled();
    expect(calls.restore[0]).toMatchObject({
      ...patientRequest,
      scope: 'internal_synthetic',
      policy: POLICY
    });
    expect(calls.setLegalHold[0]).toMatchObject({
      ...patientRequest,
      hold: true,
      reasonCode: 'other'
    });
  });

  it('reauthenticates and validates the reason before permanent deletion', async () => {
    const { service, calls, assertFresh } = setup();
    await expect(
      service.permanentlyDelete(
        { ...patientRequest, reasonCode: 'patient_request' },
        'fresh-token',
        staff(MANAGER)
      )
    ).resolves.toEqual(DELETED);
    expect(assertFresh).toHaveBeenCalledOnce();
    expect(calls.permanentlyDelete[0]).toMatchObject({
      ...patientRequest,
      reasonCode: 'patient_request',
      scope: 'internal_synthetic'
    });
    await expect(
      service.permanentlyDelete(
        { ...patientRequest, reasonCode: 'arbitrary' },
        'fresh-token',
        staff(MANAGER)
      )
    ).rejects.toBeInstanceOf(ZodError);
  });

  it('returns pending deletion records without patient names', async () => {
    const { service, calls } = setup();
    await expect(service.pendingDeletion(staff(MANAGER))).resolves.toEqual(
      PENDING
    );
    expect(calls.pendingDeletion).toEqual([NOW]);
    expect(JSON.stringify(PENDING)).not.toContain('name');
  });
});
