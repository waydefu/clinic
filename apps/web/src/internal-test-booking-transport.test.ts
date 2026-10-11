import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  httpTransportError,
  isInternalTestBookingEnabled
} from '../public/modules/api-client.js';
import { renderAppointments } from '../public/modules/admin-view.js';
import { DEFAULT_BLOCKED_TIMES } from '../public/modules/constants.js';
import { initialState } from '../public/modules/state-schema.js';
import { CALENDAR_PILOT_SCHEDULE } from '../public/vendor/domain/calendar-sync.js';
import {
  applyDeleteContractWrite,
  applyFollowUpContractWrite,
  clearInternalTestReturnSession,
  createInternalTestBookingTransport,
  isStageFM11Enabled,
  mapInternalTestBookingRequest,
  refreshPublishedOccupancy
} from '../public/modules/internal-test-booking-transport.js';

describe('return-patient context isolation', () => {
  afterEach(() => vi.unstubAllGlobals());

  function setup(pathname = '/booking') {
    const memory = new Map<string, string>();
    vi.stubGlobal('location', { pathname });
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => memory.set(key, value),
      removeItem: (key: string) => memory.delete(key)
    });
    const fetchImpl = vi.fn(
      (_url: string, _options: { headers: Record<string, string> }) =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ sessionId: 'synthetic_return_001' })
        })
    );
    const transport = createInternalTestBookingTransport({
      local: vi.fn(() => Promise.resolve({})),
      toError: httpTransportError,
      fetchImpl
    });
    return { memory, fetchImpl, transport };
  }

  const lookup = {
    method: 'POST',
    body: JSON.stringify({ phone: 'synthetic_phone', birthDate: '--01-01' })
  };

  it('keeps a verified session for legitimate return booking and self-service', async () => {
    const { transport, fetchImpl } = setup();
    await transport('/patient/bookings/lookup', lookup);
    await transport('/bookings', {
      method: 'POST',
      body: JSON.stringify({ bookingKind: 'follow_up' })
    });
    await transport('/bookings/synthetic_booking_001');
    await transport('/patient/bookings/synthetic_booking_001/self-cancel', {
      method: 'POST'
    });
    await transport('/patient/bookings/synthetic_booking_001/self-reschedule', {
      method: 'POST',
      body: JSON.stringify({ targetSlotId: 'synthetic_slot_002' })
    });
    expect(fetchImpl.mock.calls[0]?.[1]?.headers).not.toHaveProperty(
      'x-return-session'
    );
    for (const [, options] of fetchImpl.mock.calls.slice(1)) {
      expect(options?.headers).toHaveProperty(
        'x-return-session',
        'synthetic_return_001'
      );
    }
  });

  it('clears a previous return session before a new initial intake', async () => {
    const { transport, fetchImpl, memory } = setup();
    await transport('/patient/bookings/lookup', lookup);
    await transport('/bookings', {
      method: 'POST',
      body: JSON.stringify({
        bookingKind: 'initial',
        intake: { name: 'synthetic_person_002' }
      })
    });
    expect(fetchImpl.mock.calls[1]?.[1]?.headers).not.toHaveProperty(
      'x-return-session'
    );
    expect(memory.has('itrs')).toBe(false);
  });

  it('does not attach a return session to public or staff-only operations', async () => {
    const { transport, fetchImpl, memory } = setup();
    memory.set('itrs', 'synthetic_return_001');
    await transport('/slots');
    await transport('/schedule');
    await transport('/bookings/synthetic_booking_001/complete', {
      method: 'POST'
    });
    for (const [, options] of fetchImpl.mock.calls) {
      expect(options?.headers).not.toHaveProperty('x-return-session');
    }
    expect(memory.get('itrs')).toBe('synthetic_return_001');
  });

  it('clears return context when a staff transport is created', async () => {
    const { memory } = setup('/staff');
    memory.set('itrs', 'synthetic_return_001');
    const fetchImpl = vi.fn(
      (_url: string, _options: { headers: Record<string, string> }) =>
        Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    );
    const transport = createInternalTestBookingTransport({
      local: vi.fn(() => Promise.resolve({})),
      toError: httpTransportError,
      fetchImpl
    });
    await transport('/bookings/synthetic_booking_001');
    expect(memory.has('itrs')).toBe(false);
    expect(fetchImpl.mock.calls[0]?.[1]?.headers).not.toHaveProperty(
      'x-return-session'
    );
  });

  it('does not use patient credentials after the current page switches to staff', async () => {
    const { transport, fetchImpl, memory } = setup();
    memory.set('itrs', 'synthetic_return_001');
    vi.stubGlobal('location', { pathname: '/staff' });
    await transport('/bookings/synthetic_booking_001');
    expect(fetchImpl.mock.calls[0]?.[1]?.headers).not.toHaveProperty(
      'x-return-session'
    );
  });

  it('does not retain a previous identity when the next lookup fails', async () => {
    const { transport, fetchImpl, memory } = setup();
    memory.set('itrs', 'synthetic_return_001');
    fetchImpl.mockRejectedValueOnce(new Error('Synthetic lookup failure'));
    await expect(transport('/patient/bookings/lookup', lookup)).rejects.toThrow(
      'Synthetic lookup failure'
    );
    expect(memory.has('itrs')).toBe(false);
  });

  it('does not reinstate an in-flight lookup after the flow is reset', async () => {
    const { transport, fetchImpl, memory } = setup();
    let finish!: (response: {
      ok: boolean;
      json: () => Promise<{ sessionId: string }>;
    }) => void;
    fetchImpl.mockImplementationOnce(
      () => new Promise((resolve) => (finish = resolve))
    );
    const pending = transport('/patient/bookings/lookup', lookup);
    const rejected = expect(pending).rejects.toMatchObject({
      name: 'AbortError'
    });
    clearInternalTestReturnSession();
    finish({
      ok: true,
      json: () => Promise.resolve({ sessionId: 'synthetic_return_001' })
    });
    await rejected;
    expect(memory.has('itrs')).toBe(false);
  });
});

const M11_LOCATION = {
  protocol: 'https:',
  hostname:
    'beauessence-clinic-stg-c1a01--internal-preproduction-3u85hkcz.web.app',
  pathname: '/staff',
  search: '?internalTestBooking=1&stageFM11=1'
};

const EXPECTED_M11_SCHEDULE = {
  ...CALENDAR_PILOT_SCHEDULE,
  blockedTimes: {
    initial: [...DEFAULT_BLOCKED_TIMES.initial],
    follow_up: [...DEFAULT_BLOCKED_TIMES.follow_up]
  }
};

describe('isInternalTestBookingEnabled', () => {
  it('stays off without the query and on the forbidden preview host', () => {
    expect(
      isInternalTestBookingEnabled({
        protocol: 'https:',
        pathname: '/staff',
        port: '',
        hostname: '127.0.0.1',
        search: ''
      })
    ).toBe(false);
    expect(
      isInternalTestBookingEnabled({
        protocol: 'https:',
        pathname: '/staff',
        port: '',
        hostname: 'beauessence-clinic-staging.web.app',
        search: '?internalTestBooking=1'
      })
    ).toBe(false);
  });

  it('opts in with the explicit query, or automatically on isolated C1 preview', () => {
    expect(
      isInternalTestBookingEnabled({
        protocol: 'https:',
        pathname: '/staff',
        port: '',
        hostname: 'beauessence-clinic-stg-c1a01.web.app',
        search: '?internalTestBooking=1'
      })
    ).toBe(true);
    expect(
      isInternalTestBookingEnabled({
        protocol: 'https:',
        pathname: '/staff',
        port: '',
        hostname:
          'beauessence-clinic-stg-c1a01--internal-preproduction-3u85hkcz.web.app',
        search: ''
      })
    ).toBe(true);
  });
});

describe('isStageFM11Enabled', () => {
  it('requires the exact HTTPS staff host, path, and both flags', () => {
    expect(isStageFM11Enabled(M11_LOCATION)).toBe(true);
    for (const location of [
      { ...M11_LOCATION, protocol: 'http:' },
      { ...M11_LOCATION, pathname: '/booking' },
      { ...M11_LOCATION, hostname: 'localhost' },
      {
        ...M11_LOCATION,
        hostname: 'beauessence-clinic-stg-c1a01.web.app'
      },
      {
        ...M11_LOCATION,
        hostname:
          'beauessence-clinic-stg-c1a01--internal-preproduction-3u85hkcz.example.com'
      },
      { ...M11_LOCATION, search: '?internalTestBooking=1' },
      { ...M11_LOCATION, search: '?stageFM11=1' },
      { ...M11_LOCATION, search: '' }
    ]) {
      expect(isStageFM11Enabled(location)).toBe(false);
    }
  });
});

describe('mapInternalTestBookingRequest', () => {
  it('maps create, cancel, reschedule and return lookup', () => {
    const create = mapInternalTestBookingRequest('/bookings', 'POST', {
      slotId: 'slot_001',
      itemIds: ['service_consult'],
      bookingKind: 'initial',
      patient: { fullName: 'must-not-leave-the-browser' }
    });
    expect(create).toMatchObject({
      url: '/v1/bookings',
      method: 'POST',
      body: {
        slotId: 'slot_001',
        serviceId: 'service_consult',
        bookingKind: 'initial'
      }
    });
    expect(create?.body).not.toHaveProperty('patient');
    expect(String(create?.body.idempotencyKey).length).toBeGreaterThanOrEqual(
      16
    );

    const accountless = mapInternalTestBookingRequest('/bookings', 'POST', {
      slotId: 'slot_001',
      itemIds: ['service_consult'],
      bookingKind: 'initial',
      intake: {
        name: '合成患者甲',
        phone: '0912000001',
        birthDate: '--01-15',
        nationality: 'domestic',
        privacyConsent: true
      }
    });
    expect(accountless?.body).toMatchObject({
      intake: {
        name: '合成患者甲',
        phone: '0912000001',
        birthDate: '--01-15',
        nationality: 'domestic',
        privacyConsent: true
      }
    });
    expect(accountless?.body).not.toHaveProperty('patient');
    expect(accountless?.body).not.toHaveProperty('onBehalfPatientId');
    expect(accountless?.body).not.toHaveProperty('patientNote');

    const withNote = mapInternalTestBookingRequest('/bookings', 'POST', {
      slotId: 'slot_001',
      itemIds: ['service_consult'],
      bookingKind: 'initial',
      patientNote: '  合成備註  '
    });
    expect(withNote?.body).toMatchObject({ patientNote: '合成備註' });
    expect(
      mapInternalTestBookingRequest('/bookings', 'POST', {
        slotId: 'slot_001',
        itemIds: ['service_consult'],
        bookingKind: 'initial',
        patientNote: '   '
      })?.body
    ).not.toHaveProperty('patientNote');

    expect(
      mapInternalTestBookingRequest(
        '/patient/bookings/appointment_001/self-cancel',
        'POST',
        {}
      )?.url
    ).toBe('/v1/bookings/appointment_001/cancel');
    expect(
      mapInternalTestBookingRequest(
        '/patient/bookings/appointment_001/self-reschedule',
        'POST',
        { targetSlotId: 'slot_002' }
      )
    ).toMatchObject({
      url: '/v1/bookings/appointment_001/reschedule',
      body: { targetSlotId: 'slot_002' }
    });
    expect(
      mapInternalTestBookingRequest(
        '/bookings/appointment_001/reschedule',
        'POST',
        { slotId: 'slot_staff_002' }
      )
    ).toMatchObject({
      url: '/v1/bookings/appointment_001/reschedule',
      body: { targetSlotId: 'slot_staff_002' }
    });
    expect(
      mapInternalTestBookingRequest('/patient/bookings/lookup', 'POST', {
        phone: '0912000001',
        birthDate: '--01-15'
      })
    ).toMatchObject({
      url: '/v1/return-lookup',
      method: 'POST',
      body: { phone: '0912000001', birthDate: '--01-15' }
    });
    expect(
      mapInternalTestBookingRequest('/patient/bookings/lookup', 'POST', {
        documentNumber: 'A123456789',
        birthDate: '--01-15'
      })
    ).toBeUndefined();
    expect(mapInternalTestBookingRequest('/state', 'GET', {})).toBeUndefined();
    expect(
      mapInternalTestBookingRequest('/bookings/appointment_001', 'GET')
    ).toEqual({
      url: '/v1/bookings/appointment_001',
      method: 'GET'
    });
    expect(
      mapInternalTestBookingRequest(
        '/bookings/appointment_001/arrive',
        'POST',
        {}
      )?.url
    ).toBe('/v1/bookings/appointment_001/arrive');
    expect(
      mapInternalTestBookingRequest(
        '/bookings/appointment_001/complete',
        'POST',
        {}
      )?.url
    ).toBe('/v1/bookings/appointment_001/complete');
    expect(
      mapInternalTestBookingRequest(
        '/bookings/appointment_001/no-show',
        'POST',
        {}
      )?.url
    ).toBe('/v1/bookings/appointment_001/no-show');
    expect(
      mapInternalTestBookingRequest(
        '/bookings/appointment_001/delete',
        'POST',
        {
          reasonCode: 'created_in_error',
          authorizationSecret: 'must-not-leave-the-browser'
        }
      )
    ).toMatchObject({
      url: '/v1/bookings/appointment_001/delete',
      method: 'POST',
      body: { reasonCode: 'created_in_error' }
    });
    expect(
      mapInternalTestBookingRequest(
        '/bookings/appointment_001/delete',
        'POST',
        {
          reasonCode: 'created_in_error',
          authorizationSecret: 'must-not-leave-the-browser'
        }
      )?.body
    ).not.toHaveProperty('authorizationSecret');
    expect(
      mapInternalTestBookingRequest(
        '/bookings/appointment_001/complete-without-card',
        'POST',
        {}
      )
    ).toBeUndefined();
    expect(mapInternalTestBookingRequest('/slots', 'GET')).toEqual({
      url: '/v1/slots',
      method: 'GET'
    });
    expect(
      mapInternalTestBookingRequest('/schedule/publish', 'POST', {
        expectedVersion: 2,
        schedule: { timeZone: 'Asia/Taipei' }
      })
    ).toMatchObject({
      url: '/v1/schedule/publish',
      method: 'POST',
      body: {
        expectedVersion: 2,
        schedule: { timeZone: 'Asia/Taipei' }
      }
    });

    const firstM11Request = mapInternalTestBookingRequest(
      '/schedule/publish',
      'POST',
      {
        idempotencyKey: 'caller-controlled-key-must-be-ignored',
        expectedVersion: 0,
        publishedVersion: 99,
        schedule: { timeZone: 'caller-controlled-schedule-must-be-ignored' }
      },
      M11_LOCATION
    );
    const secondM11Request = mapInternalTestBookingRequest(
      '/schedule/publish',
      'POST',
      {
        idempotencyKey: 'a-different-caller-key',
        expectedVersion: 1,
        publishedVersion: 100,
        schedule: { timeZone: 'another-caller-schedule' }
      },
      M11_LOCATION
    );
    expect(firstM11Request).toEqual({
      url: '/v1/schedule/publish',
      method: 'POST',
      body: {
        idempotencyKey: 'stagef_c1_schedule_publish_v0',
        expectedVersion: 0,
        schedule: EXPECTED_M11_SCHEDULE
      }
    });
    expect(secondM11Request).toEqual(firstM11Request);

    const normalRequest = mapInternalTestBookingRequest(
      '/schedule/publish',
      'POST',
      { expectedVersion: 1, schedule: EXPECTED_M11_SCHEDULE },
      { ...M11_LOCATION, search: '?internalTestBooking=1' }
    );
    expect(normalRequest?.body.expectedVersion).toBe(1);
    expect(normalRequest?.body.idempotencyKey).not.toBe(
      'stagef_c1_schedule_publish_v0'
    );

    const followUp = mapInternalTestBookingRequest(
      '/follow-ups/appointment_001',
      'POST',
      {
        status: 'required',
        dueDate: '2030-01-02',
        dueTime: '12:15',
        tags: ['reminder'],
        noteText: 'must-not-leave-the-browser',
        certificateCopies: 2,
        medicalRecordNumber: 'chart-only-local',
        managerId: 'manager_001'
      }
    );
    expect(followUp).toMatchObject({
      url: '/v1/bookings/appointment_001/follow-up',
      method: 'POST',
      body: {
        decision: 'required',
        dueDate: '2030-01-02',
        dueTime: '12:15'
      }
    });
    expect(followUp?.body).not.toHaveProperty('tags');
    expect(followUp?.body).not.toHaveProperty('noteText');
    expect(followUp?.body).not.toHaveProperty('certificateCopies');
    expect(followUp?.body).not.toHaveProperty('medicalRecordNumber');
    expect(followUp?.body).not.toHaveProperty('managerId');
    expect(followUp?.body).not.toHaveProperty('status');
    expect(
      mapInternalTestBookingRequest('/follow-ups/appointment_001', 'POST', {
        status: 'not_required'
      })
    ).toMatchObject({
      url: '/v1/bookings/appointment_001/follow-up',
      body: { decision: 'not_required' }
    });
    expect(
      mapInternalTestBookingRequest('/follow-ups/appointment_001', 'POST', {
        status: 'not_required'
      })?.body
    ).not.toHaveProperty('dueDate');
    expect(
      mapInternalTestBookingRequest('/follow-ups/appointment_001', 'POST', {
        status: 'required'
      })?.body
    ).toEqual(
      expect.objectContaining({
        decision: 'required'
      })
    );
    expect(
      mapInternalTestBookingRequest('/follow-ups/appointment_001', 'POST', {
        status: 'required'
      })?.body
    ).not.toHaveProperty('dueDate');
  });
});

describe('createInternalTestBookingTransport', () => {
  it('posts only the contract fields and returns the v1 body', async () => {
    const local = vi.fn();
    const fetchImpl = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            appointmentId: 'appointment_api_001',
            status: 'confirmed',
            startsAt: '2030-01-02T04:00:00.000Z',
            endsAt: '2030-01-02T04:30:00.000Z'
          })
      })
    );
    const transport = createInternalTestBookingTransport({
      local,
      toError: httpTransportError,
      fetchImpl,
      csrfToken: () => 'csrf_test_token',
      accessToken: () => 'id_token_test'
    });

    await expect(
      transport('/bookings', {
        method: 'POST',
        body: JSON.stringify({
          slotId: 'slot_001',
          itemIds: ['service_consult'],
          bookingKind: 'initial',
          patient: { fullName: 'must-not-leave-the-browser' }
        })
      })
    ).resolves.toEqual({
      appointmentId: 'appointment_api_001',
      status: 'confirmed',
      startsAt: '2030-01-02T04:00:00.000Z',
      endsAt: '2030-01-02T04:30:00.000Z'
    });
    expect(local).not.toHaveBeenCalled();
    const [, init] = fetchImpl.mock.calls[0] ?? [];
    const sent = JSON.parse(String(init?.body));
    expect(sent).toMatchObject({
      slotId: 'slot_001',
      serviceId: 'service_consult',
      bookingKind: 'initial'
    });
    expect(sent).not.toHaveProperty('patient');
    expect(init?.headers).toMatchObject({
      'X-CSRF-Token': 'csrf_test_token',
      Authorization: 'Bearer id_token_test'
    });
  });

  it('queries by appointment id without a body', async () => {
    const local = vi.fn();
    const fetchImpl = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            appointmentId: 'appointment_api_001',
            status: 'confirmed',
            startsAt: '2030-01-02T04:00:00.000Z',
            endsAt: '2030-01-02T04:30:00.000Z'
          })
      })
    );
    const transport = createInternalTestBookingTransport({
      local,
      toError: httpTransportError,
      fetchImpl
    });

    await expect(transport('/bookings/appointment_api_001')).resolves.toEqual({
      appointmentId: 'appointment_api_001',
      status: 'confirmed',
      startsAt: '2030-01-02T04:00:00.000Z',
      endsAt: '2030-01-02T04:30:00.000Z'
    });
    expect(local).not.toHaveBeenCalled();
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe('/v1/bookings/appointment_api_001');
    expect(init?.method).toBe('GET');
    expect(init?.body).toBeUndefined();
  });

  it('fail-closes complete-without-card instead of completing on the local store', async () => {
    const local = vi.fn();
    const fetchImpl = vi.fn();
    const transport = createInternalTestBookingTransport({
      local,
      toError: httpTransportError,
      fetchImpl
    });

    await expect(
      transport('/bookings/appointment_001/complete-without-card', {
        method: 'POST',
        body: '{}'
      })
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(local).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fail-closes notes, case assignment and local outbox demo writes', async () => {
    const local = vi.fn();
    const fetchImpl = vi.fn();
    const transport = createInternalTestBookingTransport({
      local,
      toError: httpTransportError,
      fetchImpl
    });

    await expect(
      transport('/bookings/appointment_001/notes', {
        method: 'POST',
        body: JSON.stringify({ noteText: 'must-not-persist-locally' })
      })
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    await expect(
      transport('/case-assignments', {
        method: 'POST',
        body: JSON.stringify({
          appointmentId: 'appointment_001',
          managerId: 'manager_001'
        })
      })
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    await expect(
      transport('/outbox/simulate', {
        method: 'POST',
        body: JSON.stringify({ fail: false })
      })
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    await expect(
      transport('/outbox/requeue', {
        method: 'POST',
        body: JSON.stringify({ jobId: 'outbox_001' })
      })
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(local).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('keeps /state on the local store and maps a 503 through the v1 envelope', async () => {
    const local = vi.fn(() => Promise.resolve({ version: 8 }));
    const fetchImpl = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 503,
        json: () =>
          Promise.resolve({
            error: {
              code: 'SERVICE_UNAVAILABLE',
              message: '服務暫時無法使用，請稍後再試。',
              correlationId: 'corr_gate'
            }
          })
      })
    );
    const transport = createInternalTestBookingTransport({
      local,
      toError: httpTransportError,
      fetchImpl
    });

    await expect(transport('/state')).resolves.toEqual({
      version: 8,
      slots: [],
      appointments: []
    });
    expect(fetchImpl).toHaveBeenCalled();
    await expect(
      transport('/bookings', {
        method: 'POST',
        body: JSON.stringify({
          slotId: 'slot_001',
          itemIds: ['service_consult'],
          bookingKind: 'initial'
        })
      })
    ).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      retryable: true,
      correlationId: 'corr_gate'
    });
  });

  it('does not keep local slots when the published grid cannot be loaded', async () => {
    const local = vi.fn(() =>
      Promise.resolve({ version: 8, slots: [{ id: 'local_slot' }] })
    );
    const fetchImpl = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 401,
        json: () =>
          Promise.resolve({
            error: { code: 'UNAUTHENTICATED' }
          })
      })
    );
    const transport = createInternalTestBookingTransport({
      local,
      toError: httpTransportError,
      fetchImpl
    });
    await expect(transport('/state')).resolves.toEqual({
      version: 8,
      slots: [],
      appointments: []
    });
  });

  it('omits cookies on the public booking path so staff sessions stay separated', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ slots: [] })
      })
    );
    const transport = createInternalTestBookingTransport({
      local: () => Promise.resolve({}),
      toError: httpTransportError,
      fetchImpl,
      credentials: 'omit',
      csrfToken: () => undefined,
      accessToken: () => undefined
    });
    await transport('/slots');
    expect(fetchImpl).toHaveBeenCalledWith(
      '/v1/slots',
      expect.objectContaining({
        method: 'GET',
        credentials: 'omit'
      })
    );
    const headers = fetchImpl.mock.calls[0]?.[1]?.headers ?? {};
    expect(headers['X-CSRF-Token']).toBeUndefined();
    expect(headers.Authorization).toBeUndefined();
  });

  it('does not restore synthetic slots after a local workspace snapshot', async () => {
    const local = vi.fn(() =>
      Promise.resolve({
        version: 8,
        appointments: [{ id: 'appointment_local_001' }],
        slots: [{ id: 'local_slot' }]
      })
    );
    const fetchImpl = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 401,
        json: () =>
          Promise.resolve({
            error: { code: 'UNAUTHENTICATED' }
          })
      })
    );
    const transport = createInternalTestBookingTransport({
      local,
      toError: httpTransportError,
      fetchImpl
    });
    await expect(
      transport('/workspace/login', {
        method: 'POST',
        body: JSON.stringify({ username: 'admin', password: 'secret' })
      })
    ).resolves.toEqual({
      version: 8,
      appointments: [],
      slots: []
    });
  });

  it('overlays listed slots onto local /state when the gate answers', async () => {
    const local = vi.fn(() =>
      Promise.resolve({ version: 8, slots: [{ id: 'local_slot' }] })
    );
    const fetchImpl = vi.fn((url) => {
      if (url === '/v1/slots') {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              slots: [
                {
                  slotId: 'slot_20300102_1200',
                  kind: 'initial',
                  startsAt: '2030-01-02T04:00:00.000Z',
                  endsAt: '2030-01-02T04:30:00.000Z',
                  available: true
                }
              ]
            })
        });
      }
      if (String(url).startsWith('/v1/bookings')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              appointments: [
                {
                  appointmentId: 'appointment_api_001',
                  status: 'confirmed',
                  startsAt: '2030-01-02T04:00:00.000Z',
                  endsAt: '2030-01-02T04:30:00.000Z',
                  bookingKind: 'initial',
                  slotId: 'slot_20300102_1200',
                  patientId: 'patient_opaque_001',
                  intakeNationality: 'foreign'
                }
              ]
            })
        });
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            publishedVersion: 1,
            publishedAt: '2029-12-15T09:00:00.000Z',
            schedule: { timeZone: 'Asia/Taipei' }
          })
      });
    });
    const transport = createInternalTestBookingTransport({
      local,
      toError: httpTransportError,
      fetchImpl
    });
    await expect(transport('/state')).resolves.toMatchObject({
      version: 8,
      slots: [
        {
          id: 'slot_20300102_1200',
          kind: 'initial',
          startsAt: '2030-01-02T04:00:00.000Z'
        }
      ],
      appointments: [
        {
          id: 'appointment_api_001',
          status: 'confirmed',
          slotId: 'slot_20300102_1200',
          patientId: 'patient_opaque_001',
          intakeNationality: 'foreign'
        }
      ],
      schedule: { timeZone: 'Asia/Taipei' },
      scheduleMeta: { publishedVersion: 1 }
    });
  });

  it('does not leave publish without an occupancy list when the grid cannot be loaded', async () => {
    const local = vi.fn();
    const fetchImpl = vi.fn((url) => {
      if (url === '/v1/schedule/publish') {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              publishedVersion: 1,
              publishedAt: '2029-12-15T09:00:00.000Z',
              schedule: { timeZone: 'Asia/Taipei' }
            })
        });
      }
      return Promise.resolve({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: { code: 'UNAUTHENTICATED' } })
      });
    });
    const transport = createInternalTestBookingTransport({
      local,
      toError: httpTransportError,
      fetchImpl
    });
    await expect(
      transport('/schedule/publish', {
        method: 'POST',
        body: JSON.stringify({
          expectedVersion: 0,
          schedule: { timeZone: 'Asia/Taipei' }
        })
      })
    ).resolves.toMatchObject({
      publishedVersion: 1,
      slots: []
    });
    expect(local).not.toHaveBeenCalled();
  });

  // AUD-13：伺服器依 BOOKING-NOTE-STORAGE-2026-09-29 只在櫃台清單回傳患者備註；
  // 工作臺 transport 把清單列映射成本機形狀時沒帶這一欄，備註在這裡被丟掉，
  // 工作臺的渲染器（早已會顯示 appointment.patientNote）永遠看不到它。
  describe('staff clinic list (AUD-13)', () => {
    const SYNTHETIC_NOTE = '合成備註：想問術後照護';
    const HOSTILE_NOTE = '<img src=x onerror=alert(1)>合成備註';

    function stateWithListedNotes(notes: Array<string | undefined>) {
      const local = vi.fn(() => Promise.resolve({ version: 8, slots: [] }));
      const fetchImpl = vi.fn((url) => {
        if (url === '/v1/slots') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ slots: [] })
          });
        }
        if (url === '/v1/bookings') {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                appointments: notes.map((patientNote, index) => ({
                  appointmentId: `appointment_api_00${index + 1}`,
                  status: 'confirmed',
                  startsAt: '2030-01-02T04:00:00.000Z',
                  endsAt: '2030-01-02T04:30:00.000Z',
                  bookingKind: 'initial',
                  slotId: `slot_20300102_120${index}`,
                  patientId: `patient_opaque_00${index + 1}`,
                  ...(patientNote === undefined ? {} : { patientNote })
                }))
              })
          });
        }
        return Promise.resolve({
          ok: false,
          status: 404,
          json: () => Promise.resolve({ error: { code: 'NOT_FOUND' } })
        });
      });
      return createInternalTestBookingTransport({
        local,
        toError: httpTransportError,
        fetchImpl
      })('/state');
    }

    it('keeps the patient note on the mapped appointment and omits it when absent', async () => {
      const state: any = await stateWithListedNotes([
        SYNTHETIC_NOTE,
        undefined,
        ''
      ]);
      expect(state.appointments[0].patientNote).toBe(SYNTHETIC_NOTE);
      expect(state.appointments[1]).not.toHaveProperty('patientNote');
      expect(state.appointments[2]).not.toHaveProperty('patientNote');
    });

    it('renders the listed note as inert text in the staff list', async () => {
      const state: any = await stateWithListedNotes([HOSTILE_NOTE]);
      const render: any = initialState();
      render.appointments = state.appointments;
      const html = renderAppointments(render, {
        status: 'all',
        kind: 'all',
        query: ''
      });
      expect(html).toContain('note-chip');
      expect(html).toContain(
        '患者：&lt;img src=x onerror=alert(1)&gt;合成備註'
      );
      expect(html).not.toContain('<img');
    });
  });
});

describe('refreshPublishedOccupancy', () => {
  const currentState = {
    version: 8,
    appointments: [{ id: 'appointment_local_001' }],
    slots: [
      {
        id: 'slot_stale_open',
        kind: 'initial',
        startsAt: '2030-01-02T04:00:00.000Z'
      }
    ]
  };

  it('overlays the published grid onto the current snapshot after a write', async () => {
    const request = vi.fn(() =>
      Promise.resolve({
        slots: [
          {
            slotId: 'slot_20300102_1200',
            kind: 'initial',
            startsAt: '2030-01-02T04:00:00.000Z',
            available: false
          },
          {
            slotId: 'slot_20300102_1230',
            kind: 'initial',
            startsAt: '2030-01-02T04:30:00.000Z',
            available: true
          }
        ]
      })
    );

    await expect(
      refreshPublishedOccupancy(request, currentState)
    ).resolves.toEqual({
      version: 8,
      appointments: [{ id: 'appointment_local_001' }],
      slots: [
        {
          id: 'slot_20300102_1200',
          kind: 'initial',
          startsAt: '2030-01-02T04:00:00.000Z',
          reservationId: 'reserved'
        },
        {
          id: 'slot_20300102_1230',
          kind: 'initial',
          startsAt: '2030-01-02T04:30:00.000Z'
        }
      ]
    });
    expect(request).toHaveBeenCalledWith('/slots');
  });

  it('does not keep the pre-write grid when occupancy cannot be loaded', async () => {
    const request = vi.fn(() => Promise.reject(new Error('gate closed')));
    await expect(
      refreshPublishedOccupancy(request, currentState)
    ).resolves.toEqual({
      version: 8,
      appointments: [{ id: 'appointment_local_001' }],
      slots: []
    });
  });
});

describe('applyFollowUpContractWrite', () => {
  it('records a required decision onto the local follow-up list', () => {
    const state = {
      appointments: [{ id: 'appointment_001', patientId: 'patient_001' }],
      followUps: [] as Array<Record<string, unknown>>
    };

    const next = applyFollowUpContractWrite(
      state,
      '/follow-ups/appointment_001',
      { dueDate: '2030-01-02', dueTime: '12:15' },
      { appointmentId: 'appointment_001', decision: 'required' }
    );

    expect(next.followUps).toEqual([
      expect.objectContaining({
        appointmentId: 'appointment_001',
        patientId: 'patient_001',
        status: 'required',
        followUpDecisionBy: 'doctor_instruction',
        dueDate: '2030-01-02',
        dueTime: '12:15'
      })
    ]);
  });

  it('clears due fields when a later decision is not_required', () => {
    const state = {
      appointments: [{ id: 'appointment_001', patientId: 'patient_001' }],
      followUps: [
        {
          appointmentId: 'appointment_001',
          patientId: 'patient_001',
          status: 'required',
          dueDate: '2030-01-02',
          dueTime: '12:15'
        }
      ]
    };

    applyFollowUpContractWrite(
      state,
      '/follow-ups/appointment_001',
      { dueDate: '2030-01-09', dueTime: '12:15' },
      { appointmentId: 'appointment_001', decision: 'not_required' }
    );

    expect(state.followUps).toEqual([
      expect.objectContaining({
        appointmentId: 'appointment_001',
        status: 'not_required'
      })
    ]);
    expect(state.followUps[0]).not.toHaveProperty('dueDate');
    expect(state.followUps[0]).not.toHaveProperty('dueTime');
  });

  it('records required without a target as unscheduled entitlement', () => {
    const state = {
      appointments: [{ id: 'appointment_001', patientId: 'patient_001' }],
      followUps: [] as Array<Record<string, unknown>>
    };

    applyFollowUpContractWrite(
      state,
      '/follow-ups/appointment_001',
      {},
      { appointmentId: 'appointment_001', decision: 'required' }
    );

    expect(state.followUps[0]).toMatchObject({
      appointmentId: 'appointment_001',
      status: 'required'
    });
    expect(state.followUps[0]).not.toHaveProperty('dueDate');
    expect(state.followUps[0]).not.toHaveProperty('dueTime');
  });

  it('leaves the snapshot unchanged for other writes', () => {
    const state = { followUps: [] };
    expect(
      applyFollowUpContractWrite(state, '/bookings', {}, { appointmentId: 'x' })
    ).toBe(state);
    expect(state.followUps).toEqual([]);
  });
});

describe('applyDeleteContractWrite', () => {
  it('removes the deleted appointment from the local list', () => {
    const state = {
      appointments: [{ id: 'appointment_001' }, { id: 'appointment_002' }]
    };

    applyDeleteContractWrite(state, '/bookings/appointment_001/delete', {
      appointmentId: 'appointment_001',
      deleted: true,
      auditEventId: 'audit_appointment_001_deleted_key'
    });

    expect(state.appointments).toEqual([{ id: 'appointment_002' }]);
  });

  it('leaves the snapshot unchanged when the write is not a deletion', () => {
    const state = { appointments: [{ id: 'appointment_001' }] };
    expect(
      applyDeleteContractWrite(state, '/bookings', {
        appointmentId: 'appointment_001'
      })
    ).toBe(state);
    expect(state.appointments).toEqual([{ id: 'appointment_001' }]);
  });
});
