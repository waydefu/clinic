import { describe, expect, it, vi } from 'vitest';
import type { Auth } from 'firebase-admin/auth';

import { InternalTestBookingAuthenticator } from './internal-test-booking.authenticator.js';
import type { CalendarPilotSessionService } from '../auth/calendar-pilot-session.js';
import type { AuthenticatableRequest } from '../appointments/appointment.controller.js';
import type { PatientDirectoryPort } from '../patients/patient-directory.js';
import {
  AuthenticationRequiredError,
  DisabledAccountError
} from '../platform/errors/api-error.js';

function request(
  overrides: Partial<AuthenticatableRequest> = {}
): AuthenticatableRequest {
  return {
    method: 'POST',
    headers: {},
    ...overrides
  };
}

describe('InternalTestBookingAuthenticator', () => {
  it('lets accountless public booking through as an anonymous patient', async () => {
    const authenticator = new InternalTestBookingAuthenticator(
      {} as CalendarPilotSessionService,
      {} as Auth
    );
    await expect(authenticator.authenticate(request())).resolves.toEqual({
      actorId: 'anonymous',
      actorRole: 'patient'
    });
  });

  it('requires CSRF on staff writes and not on staff GETs', async () => {
    const sessions = {
      authenticate: vi.fn(() =>
        Promise.resolve({
          actorId: 'staff_001',
          actorRole: 'front_desk' as const,
          sessionId: 'session_001'
        })
      ),
      assertCsrf: vi.fn(() => Promise.resolve())
    };
    const authenticator = new InternalTestBookingAuthenticator(
      sessions as unknown as CalendarPilotSessionService,
      {} as Auth
    );
    const cookie = { cookie: '__session=staff_cookie' };

    await expect(
      authenticator.authenticate(request({ method: 'GET', headers: cookie }))
    ).resolves.toEqual({
      actorId: 'staff_001',
      actorRole: 'front_desk'
    });
    expect(sessions.assertCsrf).not.toHaveBeenCalled();

    await expect(
      authenticator.authenticate(request({ headers: cookie }))
    ).rejects.toBeInstanceOf(AuthenticationRequiredError);

    await expect(
      authenticator.authenticate(
        request({
          headers: { ...cookie, 'x-csrf-token': 'csrf_test' }
        })
      )
    ).resolves.toEqual({
      actorId: 'staff_001',
      actorRole: 'front_desk'
    });
    expect(sessions.assertCsrf).toHaveBeenCalledWith(
      'session_001',
      'csrf_test'
    );
  });

  it('does not treat a return-patient session as staff authentication', async () => {
    const patients: Pick<PatientDirectoryPort, 'readReturnSession'> = {
      readReturnSession: () => Promise.resolve('patient_opaque_001')
    };
    const authenticator = new InternalTestBookingAuthenticator(
      {
        authenticate: vi.fn(() =>
          Promise.reject(
            new Error('staff session must not run for return lookup')
          )
        )
      } as unknown as CalendarPilotSessionService,
      {} as Auth,
      patients as PatientDirectoryPort
    );
    await expect(
      authenticator.authenticate(
        request({
          headers: {
            'x-return-session': 'return_opaque_001',
            cookie: '__session=staff_cookie'
          }
        })
      )
    ).resolves.toEqual({
      actorId: 'patient_opaque_001',
      actorRole: 'patient',
      verifiedPatientId: 'patient_opaque_001'
    });
  });

  it('propagates disabled-account enforcement from the staff session', async () => {
    const authenticator = new InternalTestBookingAuthenticator(
      {
        authenticate: vi.fn(() => Promise.reject(new DisabledAccountError()))
      } as unknown as CalendarPilotSessionService,
      {} as Auth
    );
    await expect(
      authenticator.authenticate(
        request({ headers: { cookie: '__session=staff_cookie' } })
      )
    ).rejects.toBeInstanceOf(DisabledAccountError);
  });
});
