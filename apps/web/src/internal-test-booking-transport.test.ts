import { describe, expect, it, vi } from 'vitest';

import {
  httpTransportError,
  isInternalTestBookingEnabled
} from '../public/modules/api-client.js';
import {
  createInternalTestBookingTransport,
  mapInternalTestBookingRequest
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

    await expect(transport('/state')).resolves.toEqual({ version: 8 });
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
});
