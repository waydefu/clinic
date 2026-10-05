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

  it('accepts a single valid return-patient session without trying other authentication', async () => {
    const readReturnSession = vi.fn(() =>
      Promise.resolve('patient_opaque_001')
    );
    const patients: Pick<PatientDirectoryPort, 'readReturnSession'> = {
      readReturnSession
    };
    const sessions = { authenticate: vi.fn() };
    const auth = { verifyIdToken: vi.fn(), getUser: vi.fn() };
    const authenticator = new InternalTestBookingAuthenticator(
      sessions as unknown as CalendarPilotSessionService,
      auth as unknown as Auth,
      patients as PatientDirectoryPort,
      () => '2026-10-05T00:00:00.000Z'
    );

    await expect(
      authenticator.authenticate(
        request({ headers: { 'x-return-session': 'return_opaque_001' } })
      )
    ).resolves.toEqual({
      actorId: 'patient_opaque_001',
      actorRole: 'patient',
      verifiedPatientId: 'patient_opaque_001'
    });
    expect(readReturnSession).toHaveBeenCalledWith(
      'return_opaque_001',
      '2026-10-05T00:00:00.000Z'
    );
    expect(sessions.authenticate).not.toHaveBeenCalled();
    expect(auth.verifyIdToken).not.toHaveBeenCalled();
  });

  it('rejects a return session mixed with the staff session cookie', async () => {
    const readReturnSession = vi.fn(() =>
      Promise.resolve('patient_opaque_001')
    );
    const patients: Pick<PatientDirectoryPort, 'readReturnSession'> = {
      readReturnSession
    };
    const sessions = { authenticate: vi.fn() };
    const authenticator = new InternalTestBookingAuthenticator(
      sessions as unknown as CalendarPilotSessionService,
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
    ).rejects.toBeInstanceOf(AuthenticationRequiredError);
    expect(readReturnSession).not.toHaveBeenCalled();
    expect(sessions.authenticate).not.toHaveBeenCalled();
  });

  it.each(['Bearer', 'bearer', 'BEARER', 'bEaReR'])(
    'rejects a return session mixed with a %s identity',
    async (scheme) => {
      const readReturnSession = vi.fn(() =>
        Promise.resolve('patient_opaque_001')
      );
      const patients: Pick<PatientDirectoryPort, 'readReturnSession'> = {
        readReturnSession
      };
      const sessions = { authenticate: vi.fn() };
      const auth = { verifyIdToken: vi.fn(), getUser: vi.fn() };
      const authenticator = new InternalTestBookingAuthenticator(
        sessions as unknown as CalendarPilotSessionService,
        auth as unknown as Auth,
        patients as PatientDirectoryPort
      );

      await expect(
        authenticator.authenticate(
          request({
            headers: {
              'x-return-session': 'return_opaque_001',
              authorization: `${scheme} patient_id_token`
            }
          })
        )
      ).rejects.toBeInstanceOf(AuthenticationRequiredError);
      expect(readReturnSession).not.toHaveBeenCalled();
      expect(auth.verifyIdToken).not.toHaveBeenCalled();
      expect(sessions.authenticate).not.toHaveBeenCalled();
    }
  );

  it.each(['Bearer', 'bearer', 'BEARER', 'bEaReR'])(
    'preserves the patient %s flow without a return session',
    async (scheme) => {
      const auth = {
        verifyIdToken: vi.fn(() =>
          Promise.resolve({ uid: 'patient_opaque_001', email_verified: true })
        ),
        getUser: vi.fn(() => Promise.resolve({ disabled: false }))
      };
      const authenticator = new InternalTestBookingAuthenticator(
        {} as CalendarPilotSessionService,
        auth as unknown as Auth
      );

      await expect(
        authenticator.authenticate(
          request({
            headers: { authorization: `${scheme}  Synthetic_ID.Token_XyZ  ` }
          })
        )
      ).resolves.toEqual({
        actorId: 'patient_opaque_001',
        actorRole: 'patient',
        verifiedPatientId: 'patient_opaque_001'
      });
      expect(auth.verifyIdToken).toHaveBeenCalledWith(
        'Synthetic_ID.Token_XyZ',
        true
      );
      expect(auth.getUser).toHaveBeenCalledWith('patient_opaque_001');
    }
  );

  it('fails closed for an invalid return session without falling back to anonymous auth', async () => {
    const readReturnSession = vi.fn(() => Promise.resolve(undefined));
    const patients: Pick<PatientDirectoryPort, 'readReturnSession'> = {
      readReturnSession
    };
    const sessions = { authenticate: vi.fn() };
    const auth = { verifyIdToken: vi.fn() };
    const authenticator = new InternalTestBookingAuthenticator(
      sessions as unknown as CalendarPilotSessionService,
      auth as unknown as Auth,
      patients as PatientDirectoryPort
    );

    await expect(
      authenticator.authenticate(
        request({ headers: { 'x-return-session': 'return_opaque_invalid' } })
      )
    ).rejects.toBeInstanceOf(AuthenticationRequiredError);
    expect(readReturnSession).toHaveBeenCalledOnce();
    expect(sessions.authenticate).not.toHaveBeenCalled();
    expect(auth.verifyIdToken).not.toHaveBeenCalled();
  });

  it('fails closed when a return session is supplied without a patient directory', async () => {
    const sessions = { authenticate: vi.fn() };
    const auth = { verifyIdToken: vi.fn() };
    const authenticator = new InternalTestBookingAuthenticator(
      sessions as unknown as CalendarPilotSessionService,
      auth as unknown as Auth
    );

    await expect(
      authenticator.authenticate(
        request({ headers: { 'x-return-session': 'return_opaque_001' } })
      )
    ).rejects.toBeInstanceOf(AuthenticationRequiredError);
    expect(sessions.authenticate).not.toHaveBeenCalled();
    expect(auth.verifyIdToken).not.toHaveBeenCalled();
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
