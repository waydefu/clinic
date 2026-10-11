import { afterEach, describe, expect, it, vi } from 'vitest';
import { OPERATIONAL_ROLES } from '@beauessence/domain';
import { hydrateStaff } from '../public/modules/hydrate-staff.js';
import {
  isInternalTestBookingEnabled,
  httpTransportError
} from '../public/modules/api-client.js';
import { createInternalTestBookingTransport } from '../public/modules/internal-test-booking-transport.js';
import { initialState } from '../public/store.js';
import {
  createAppointmentCancel,
  createBookingHandoff,
  createCandidateReview
} from './calendar-pilot-actions.js';

const [manager, frontDesk] = OPERATIONAL_ROLES;
export function memoryStorage(values: Record<string, string> = {}) {
  return {
    getItem: (key: string) => values[key] ?? null,
    setItem: (key: string, value: string) => {
      values[key] = value;
    },
    removeItem: (key: string) => {
      delete values[key];
    }
  };
}
afterEach(() => vi.unstubAllGlobals());

describe('frontend trust boundary regressions', () => {
  it.each([manager, frontDesk])(
    'a stored %s role cannot establish a verified actor',
    (role) => {
      const state = {
        ...initialState(),
        session: { authenticated: false, account: null }
      };
      state.workspace.authenticated = false;
      const result = hydrateStaff(
        state,
        memoryStorage({ calPilotCsrf: 'synthetic_csrf', calPilotRole: role })
      );
      expect(result.session.authenticated).toBe(false);
      expect(result.session.account).toBeNull();
    }
  );

  it.each([
    'unapproved.web.app',
    'unapproved.example',
    'beauessence-clinic-staging.firebaseapp.com',
    'beauessence-clinic-stg-other--copied.web.app'
  ])('a copied opt-in cannot enable %s', (hostname) => {
    expect(
      isInternalTestBookingEnabled({
        protocol: 'https:',
        hostname,
        port: '',
        pathname: '/staff',
        search: '?internalTestBooking=1'
      })
    ).toBe(false);
  });

  it('does not recycle a persisted or Calendar reauth bearer into booking requests', async () => {
    vi.stubGlobal('location', { pathname: '/staff' });
    vi.stubGlobal(
      'sessionStorage',
      memoryStorage({
        internalTestIdToken: 'synthetic_persisted_bearer',
        calPilotCsrf: 'synthetic_csrf'
      })
    );
    const fetchImpl = vi.fn(async (_url: string, _options: RequestInit) =>
      Promise.resolve({
        ok: true,
        json: async () => Promise.resolve({})
      })
    );
    const transport = createInternalTestBookingTransport({
      local: async () => Promise.resolve({}),
      toError: httpTransportError,
      fetchImpl
    });
    await transport('/bookings/synthetic_booking_001');
    expect(fetchImpl.mock.calls[0]?.[1]?.headers).not.toHaveProperty(
      'Authorization'
    );
    expect(sessionStorage.getItem('internalTestIdToken')).toBeNull();
  });

  it('preserves explicitly injected request-memory staff credentials', async () => {
    vi.stubGlobal('location', { pathname: '/staff' });
    vi.stubGlobal('sessionStorage', memoryStorage());
    const fetchImpl = vi.fn(async (_url: string, _options: RequestInit) =>
      Promise.resolve({
        ok: true,
        json: async () => Promise.resolve({})
      })
    );
    const transport = createInternalTestBookingTransport({
      local: async () => Promise.resolve({}),
      toError: httpTransportError,
      fetchImpl,
      accessToken: () => 'synthetic_request_memory_token'
    });
    await transport('/bookings/synthetic_booking_001');
    expect(fetchImpl.mock.calls[0]?.[1]?.headers).toHaveProperty(
      'Authorization',
      'Bearer synthetic_request_memory_token'
    );
    expect(sessionStorage.getItem('internalTestIdToken')).toBeNull();
  });

  it('does not attach staff credentials after a staff page changes to public booking', async () => {
    vi.stubGlobal('location', { pathname: '/staff' });
    vi.stubGlobal(
      'sessionStorage',
      memoryStorage({ calPilotCsrf: 'synthetic_staff_csrf' })
    );
    const fetchImpl = vi.fn(async (_url: string, _options: RequestInit) =>
      Promise.resolve({
        ok: true,
        json: async () => Promise.resolve({})
      })
    );
    const transport = createInternalTestBookingTransport({
      local: async () => Promise.resolve({}),
      toError: httpTransportError,
      fetchImpl,
      accessToken: () => 'synthetic_request_memory_token'
    });
    vi.stubGlobal('location', { pathname: '/booking' });
    await transport('/bookings', {
      method: 'POST',
      body: JSON.stringify({ bookingKind: 'initial' })
    });
    expect(fetchImpl.mock.calls[0]?.[1]?.headers).not.toHaveProperty(
      'Authorization'
    );
    expect(fetchImpl.mock.calls[0]?.[1]?.headers).not.toHaveProperty(
      'X-CSRF-Token'
    );
  });

  it('a staff authorization denial clears client authentication hints', async () => {
    vi.stubGlobal('location', { pathname: '/staff' });
    vi.stubGlobal(
      'sessionStorage',
      memoryStorage({
        calPilotCsrf: 'synthetic_csrf',
        calPilotRole: manager,
        internalTestIdToken: 'synthetic_legacy_token'
      })
    );
    const fetchImpl = vi.fn(async () =>
      Promise.resolve({
        ok: false,
        status: 401,
        json: async () =>
          Promise.resolve({ error: { code: 'AUTHENTICATION_REQUIRED' } })
      })
    );
    const transport = createInternalTestBookingTransport({
      local: async () => Promise.resolve({}),
      toError: httpTransportError,
      fetchImpl
    });
    await expect(
      transport('/bookings/synthetic_booking_001')
    ).rejects.toMatchObject({ code: 'AUTHENTICATION_REQUIRED' });
    for (const key of ['calPilotCsrf', 'calPilotRole', 'internalTestIdToken'])
      expect(sessionStorage.getItem(key)).toBeNull();
  });

  it.each([
    {
      protocol: 'https:',
      hostname: 'beauessence-clinic-stg-c1a01.web.app',
      port: '444',
      pathname: '/staff'
    },
    {
      protocol: 'https:',
      hostname: 'beauessence-clinic-stg-c1a01.web.app',
      port: '',
      pathname: '/unapproved'
    },
    {
      protocol: 'http:',
      hostname: 'beauessence-clinic-stg-c1a01.web.app',
      port: '',
      pathname: '/staff'
    },
    {
      protocol: 'http:',
      hostname: '127.0.0.1.unapproved.example',
      port: '3100',
      pathname: '/staff'
    }
  ])('rejects an out-of-scope protocol/port/path: %o', (location) => {
    expect(
      isInternalTestBookingEnabled({
        ...location,
        search: '?internalTestBooking=1'
      })
    ).toBe(false);
  });

  it('keeps approved C1 runtime paths and explicit loopback opt-in available', () => {
    expect(
      isInternalTestBookingEnabled({
        protocol: 'https:',
        hostname: 'beauessence-clinic-stg-c1a01.web.app',
        port: '',
        pathname: '/booking',
        search: '?internalTestBooking=1'
      })
    ).toBe(true);
    expect(
      isInternalTestBookingEnabled({
        protocol: 'http:',
        hostname: '127.0.0.1',
        port: '3100',
        pathname: '/staff',
        search: '?internalTestBooking=1'
      })
    ).toBe(true);
    expect(
      isInternalTestBookingEnabled({
        protocol: 'http:',
        hostname: '127.0.0.1',
        port: '3100',
        pathname: '/staff',
        search: ''
      })
    ).toBe(false);
  });

  it('candidate review failure restores the same control and remains single-flight', async () => {
    let reject!: (error: Error) => void;
    const request = vi.fn(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        })
    );
    const announce = vi.fn();
    const renderApplication = vi.fn();
    const review = createCandidateReview({
      request,
      announce,
      renderApplication,
      idempotency: () => 'synthetic_key'
    });
    const button = { disabled: false };
    const candidate = {
      candidateId: 'synthetic_candidate',
      expectedVersion: 3
    };
    const pending = review(candidate, 'resolve', {}, button);
    expect(button.disabled).toBe(true);
    const repeated = review(candidate, 'resolve', {}, button);
    expect(request).toHaveBeenCalledTimes(1);
    reject(new Error('Synthetic request failure'));
    await Promise.all([pending, repeated]);
    expect(button.disabled).toBe(false);
    expect(announce).toHaveBeenCalledWith('Synthetic request failure', 'error');
    expect(renderApplication).not.toHaveBeenCalled();
  });

  it('successful candidate review keeps the expected version and refreshes the view', async () => {
    const request = vi.fn(async (_path: string, _options: { body: string }) =>
      Promise.resolve({})
    );
    const announce = vi.fn();
    const renderApplication = vi.fn(async () => {});
    const review = createCandidateReview({
      request,
      announce,
      renderApplication,
      idempotency: () => 'synthetic_key'
    });
    await review(
      { candidateId: 'synthetic_candidate', expectedVersion: 3 },
      'resolve',
      { resolution: 'synthetic_resolution' },
      { disabled: false }
    );
    expect(JSON.parse(request.mock.calls[0]?.[1]?.body)).toEqual({
      idempotencyKey: 'synthetic_key',
      expectedVersion: 3,
      resolution: 'synthetic_resolution'
    });
    expect(renderApplication).toHaveBeenCalledOnce();
  });

  it('appointment cancel failure restores the same control and remains single-flight', async () => {
    let reject!: (error: Error) => void;
    const request = vi.fn(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        })
    );
    const announce = vi.fn();
    const renderApplication = vi.fn();
    const cancel = createAppointmentCancel({
      request,
      announce,
      renderApplication,
      idempotency: () => 'synthetic_key'
    });
    const button = { disabled: false };
    const appointment = { appointmentId: 'synthetic_appointment', version: 4 };
    const pending = cancel(appointment, button);
    expect(button.disabled).toBe(true);
    const repeated = cancel(appointment, button);
    expect(request).toHaveBeenCalledTimes(1);
    reject(new Error('Synthetic cancel failure'));
    await Promise.all([pending, repeated]);
    expect(button.disabled).toBe(false);
    expect(announce).toHaveBeenCalledWith('Synthetic cancel failure', 'error');
    expect(renderApplication).not.toHaveBeenCalled();
  });

  it('successful appointment cancel keeps the expected version and refreshes the view', async () => {
    const request = vi.fn(async (_path: string, _options: { body: string }) =>
      Promise.resolve({})
    );
    const renderApplication = vi.fn(async () => {});
    const button = { disabled: false };
    await createAppointmentCancel({
      request,
      announce: vi.fn(),
      renderApplication,
      idempotency: () => 'synthetic_key'
    })({ appointmentId: 'synthetic_appointment', version: 4 }, button);
    expect(request.mock.calls[0]?.[0]).toBe(
      '/calendar/synthetic-appointments/synthetic_appointment/cancel'
    );
    expect(JSON.parse(request.mock.calls[0]?.[1]?.body ?? '{}')).toEqual({
      idempotencyKey: 'synthetic_key',
      expectedVersion: 4
    });
    expect(renderApplication).toHaveBeenCalledOnce();
    expect(button.disabled).toBe(false);
  });

  it('a failed workbench handoff restores the booking control and sends no suggestion', async () => {
    const target = new EventTarget();
    const suggestions: Event[] = [];
    target.addEventListener(
      'beauessence:calendar-booking-suggestion',
      (event) => suggestions.push(event)
    );
    const awaiting: (string | undefined)[] = [];
    const announce = vi.fn();
    const handOff = createBookingHandoff({
      handoffToStaffWorkbench: () =>
        Promise.reject(new Error('Synthetic session needs verification')),
      announce,
      setAwaitingCandidate: (candidateId: string | undefined) =>
        awaiting.push(candidateId),
      target
    });
    const button = { disabled: false };
    await handOff({ candidateId: 'synthetic_candidate' }, button);
    expect(button.disabled).toBe(false);
    expect(awaiting).toEqual(['synthetic_candidate', undefined]);
    expect(announce).toHaveBeenCalledWith(
      'Synthetic session needs verification',
      'error'
    );
    expect(suggestions).toHaveLength(0);
  });

  it('a successful workbench handoff sends one suggestion and keeps the control busy', async () => {
    const target = new EventTarget();
    const suggestions: CustomEvent[] = [];
    target.addEventListener(
      'beauessence:calendar-booking-suggestion',
      (event) => suggestions.push(event as CustomEvent)
    );
    const awaiting: (string | undefined)[] = [];
    const handoff = vi.fn(() => Promise.resolve());
    const handOff = createBookingHandoff({
      handoffToStaffWorkbench: handoff,
      announce: vi.fn(),
      setAwaitingCandidate: (candidateId: string | undefined) =>
        awaiting.push(candidateId),
      target
    });
    const button = { disabled: false };
    const candidate = {
      candidateId: 'synthetic_candidate',
      suggestedPatientId: 'synthetic_patient',
      suggestedPatientName: 'Synthetic Patient',
      startsAt: '2030-01-07T04:00:00.000Z'
    };
    await handOff(candidate, button);
    await handOff(candidate, button);
    expect(handoff).toHaveBeenCalledOnce();
    expect(awaiting).toEqual(['synthetic_candidate']);
    expect(button.disabled).toBe(true);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.detail).toEqual({
      candidateId: 'synthetic_candidate',
      patientId: 'synthetic_patient',
      patientName: 'Synthetic Patient',
      startsAt: '2030-01-07T04:00:00.000Z'
    });
  });
});
