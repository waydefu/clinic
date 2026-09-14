import { describe, expect, it, vi } from 'vitest';

import {
  httpTransportError,
  isInternalTestBookingEnabled
} from '../public/modules/api-client.js';
import {
  applyDeleteContractWrite,
  applyFollowUpContractWrite,
  createInternalTestBookingTransport,
  mapInternalTestBookingRequest,
  refreshPublishedOccupancy
} from '../public/modules/internal-test-booking-transport.js';

describe('isInternalTestBookingEnabled', () => {
  it('stays off without the query and on the forbidden preview host', () => {
    expect(
      isInternalTestBookingEnabled({
        hostname: '127.0.0.1',
        search: ''
      })
    ).toBe(false);
    expect(
      isInternalTestBookingEnabled({
        hostname: 'beauessence-clinic-staging.web.app',
        search: '?internalTestBooking=1'
      })
    ).toBe(false);
  });

  it('opts in only with the explicit query on another host', () => {
    expect(
      isInternalTestBookingEnabled({
        hostname: 'beauessence-clinic-stg-c1a01.web.app',
        search: '?internalTestBooking=1'
      })
    ).toBe(true);
  });
});

describe('mapInternalTestBookingRequest', () => {
  it('maps create, cancel and reschedule and leaves lookup on the local store', () => {
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
      mapInternalTestBookingRequest('/patient/bookings/lookup', 'POST', {})
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
      slots: []
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
      slots: []
    });
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
      appointments: [{ id: 'appointment_local_001' }],
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
