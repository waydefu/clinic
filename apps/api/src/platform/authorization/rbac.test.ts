import { describe, expect, it } from 'vitest';

import type { AuthenticationContext } from '../../auth/authentication-context.js';
import {
  AuthenticationRequiredError,
  AuthorizationDeniedError
} from '../errors/api-error.js';
import { createRbacAppointmentPolicy } from './rbac-appointment-policy.js';
import { evaluateAccess, type AccessRequest } from './rbac.js';

function context(
  overrides: Partial<AuthenticationContext> = {}
): AuthenticationContext {
  return {
    actorId: 'actor_001',
    actorRole: 'opaque-role-token',
    ...overrides
  };
}

const CREATE_COMMAND = {
  idempotencyKey: 'create-key-000001',
  slotId: 'slot_001',
  serviceId: 'service_001',
  bookingKind: 'initial'
} as const;

describe('evaluateAccess', () => {
  it('allows a permitted staff action on a clinic-wide resource', () => {
    const request: AccessRequest = {
      role: 'front_desk',
      accountActive: true,
      permission: 'complete_visit',
      scope: { kind: 'any' }
    };
    expect(() => evaluateAccess(context(), request)).not.toThrow();
  });

  it('allows a patient to act only on their own resource', () => {
    const request: AccessRequest = {
      role: 'patient',
      accountActive: true,
      permission: 'create_appointment',
      scope: { kind: 'own_patient', ownerPatientId: 'patient_001' }
    };
    expect(() =>
      evaluateAccess(context({ verifiedPatientId: 'patient_001' }), request)
    ).not.toThrow();
    // Another patient's resource is denied — the same way regardless of whether
    // it exists, so the result is not an ownership oracle.
    expect(() =>
      evaluateAccess(context({ verifiedPatientId: 'patient_002' }), request)
    ).toThrowError(AuthorizationDeniedError);
  });

  it('denies an action the role does not carry', () => {
    expect(() =>
      evaluateAccess(context(), {
        role: 'patient',
        accountActive: true,
        permission: 'delete_appointment',
        scope: { kind: 'any' }
      })
    ).toThrowError(AuthorizationDeniedError);
  });

  it('fails a disabled account as authentication before any role check', () => {
    expect(() =>
      evaluateAccess(context(), {
        role: 'manager',
        accountActive: false,
        permission: 'delete_appointment',
        scope: { kind: 'any' }
      })
    ).toThrowError(AuthenticationRequiredError);
  });

  it('rejects a non-opaque actor id', () => {
    expect(() =>
      evaluateAccess(context({ actorId: 'actor 001!' }), {
        role: 'front_desk',
        accountActive: true,
        permission: 'complete_visit',
        scope: { kind: 'any' }
      })
    ).toThrowError(AuthenticationRequiredError);
  });

  it('scopes a case manager to assigned patients unless the role is broad', () => {
    const request: AccessRequest = {
      role: 'case_manager',
      accountActive: true,
      permission: 'assign_case_manager',
      scope: { kind: 'assigned_patient', patientId: 'patient_007' }
    };
    expect(() =>
      evaluateAccess(context(), request, {
        isAssignedManager: (id) => id === 'patient_007'
      })
    ).not.toThrow();
    expect(() =>
      evaluateAccess(context(), request, { isAssignedManager: () => false })
    ).toThrowError(AuthorizationDeniedError);
    // No predicate supplied → denied, never assumed.
    expect(() => evaluateAccess(context(), request)).toThrowError(
      AuthorizationDeniedError
    );
    // A manager has broad scope and needs no predicate.
    expect(() =>
      evaluateAccess(context(), { ...request, role: 'manager' })
    ).not.toThrow();
  });
});

describe('createRbacAppointmentPolicy', () => {
  it('permits a front-desk create', async () => {
    const policy = createRbacAppointmentPolicy(() => 'front_desk');
    await expect(
      policy.assertCanCreate(context(), CREATE_COMMAND)
    ).resolves.toBeUndefined();
  });

  it('permits a patient creating their own booking', async () => {
    const policy = createRbacAppointmentPolicy(() => 'patient');
    await expect(
      policy.assertCanCreate(
        context({ verifiedPatientId: 'patient_001' }),
        CREATE_COMMAND
      )
    ).resolves.toBeUndefined();
  });

  it('rejects a role without create permission', async () => {
    const policy = createRbacAppointmentPolicy(() => 'auditor');
    await expect(
      policy.assertCanCreate(context(), CREATE_COMMAND)
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
  });
});
