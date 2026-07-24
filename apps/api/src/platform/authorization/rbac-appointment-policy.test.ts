import { describe, expect, it, vi } from 'vitest';

import type { AuthenticationContext } from '../../auth/authentication-context.js';
import { createRbacAppointmentPolicy } from './rbac-appointment-policy.js';
import {
  AuthorizationDeniedError,
  mapErrorToApiResponse
} from '../errors/api-error.js';
import type { CandidateRole } from './rbac.js';

const COMMAND = {} as never;

function policyFor(role: CandidateRole) {
  return createRbacAppointmentPolicy(() => role);
}

function context(
  overrides: Partial<AuthenticationContext> = {}
): AuthenticationContext {
  return {
    actorId: 'actor_001',
    actorRole: 'opaque_role_from_idp',
    ...overrides
  };
}

describe('createRbacAppointmentPolicy', () => {
  it('scopes a verified patient to their own bookings', async () => {
    await expect(
      policyFor('patient').assertCanCreate(
        context({ verifiedPatientId: 'patient_001' }),
        COMMAND
      )
    ).resolves.toBeUndefined();
  });

  it('denies a patient with no verified identity instead of widening the scope', async () => {
    // 這是 fail-open 的回歸測試。先前缺少 verifiedPatientId 時會落到
    // `{ kind: 'any' }`——而 patient 本來就持有 create_appointment，於是「無法證明
    // 自己是誰」反而變成「可以替任何人預約」。授權策略必須自己站得住，不能倚賴
    // 上游的 application service 剛好先擋掉。
    await expect(
      policyFor('patient').assertCanCreate(context(), COMMAND)
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
  });

  it('maps that denial to 403, never to a 500', async () => {
    const error = await policyFor('patient')
      .assertCanCreate(context(), COMMAND)
      .catch((reason: unknown) => reason);

    expect(mapErrorToApiResponse(error, 'corr_001').status).toBe(403);
  });

  it('lets staff create against the clinic-wide scope', async () => {
    await expect(
      policyFor('front_desk').assertCanCreate(context(), COMMAND)
    ).resolves.toBeUndefined();
  });

  it('denies a role that holds no create permission', async () => {
    await expect(
      policyFor('auditor').assertCanCreate(context(), COMMAND)
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
  });

  it('resolves the opaque role through the injected resolver rather than guessing', async () => {
    const resolveRole = vi.fn<
      (context: AuthenticationContext) => CandidateRole
    >(() => 'front_desk');
    const authentication = context();

    await createRbacAppointmentPolicy(resolveRole).assertCanCreate(
      authentication,
      COMMAND
    );

    expect(resolveRole).toHaveBeenCalledWith(authentication);
  });
});
