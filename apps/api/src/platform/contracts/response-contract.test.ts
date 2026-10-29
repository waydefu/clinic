import 'reflect-metadata';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { Module } from '@nestjs/common';
import { APP_FILTER, NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication
} from '@nestjs/platform-fastify';
import { OPERATIONAL_ROLES } from '@beauessence/domain';
import { ReturnLookupController } from '../../internal-test-booking/return-lookup.controller.js';

import {
  APPOINTMENT_APPLICATION,
  APPOINTMENT_AUTHENTICATOR,
  APPOINTMENT_AUTHORIZATION,
  AppointmentController
} from '../../appointments/appointment.controller.js';
import {
  SCHEDULE_APPLICATION,
  ScheduleController
} from '../../schedule/schedule.controller.js';
import {
  INTERNAL_TEST_BOOKING_CLOCK,
  INTERNAL_TEST_BOOKING_SETTINGS
} from '../../internal-test-booking/internal-test-booking.tokens.js';
import {
  AuthenticationRequiredError,
  ConflictError,
  RateLimitedError
} from '../errors/api-error.js';
import { ApiExceptionFilter } from '../errors/api-exception.filter.js';
import { WP_B2_RATE_LIMITER } from '../runtime/wp-b2-rate-limiter.js';

const command = { idempotencyKey: 'synthetic_command_0001' };
const times = {
  startsAt: '2026-10-15T01:00:00Z',
  endsAt: '2026-10-15T01:30:00Z'
};
const confirmed = {
  appointmentId: 'synthetic_appointment',
  status: 'confirmed',
  ...times
};
const schedule = {
  timeZone: 'Asia/Taipei',
  weeklyAvailability: [],
  dateExceptions: []
};
const cases = [
  {
    name: 'lookupReturn',
    method: 'POST',
    url: '/v1/return-lookup',
    payload: { phone: '0912345678', birthDate: '--02-29' },
    valid: {
      sessionId: 'synthetic_session',
      expiresAt: '2026-10-15T01:00:00Z',
      outcome: 'schedule'
    }
  },
  {
    name: 'create',
    method: 'POST',
    url: '/v1/bookings',
    payload: {
      ...command,
      slotId: 'synthetic_slot',
      serviceId: 'synthetic_service',
      bookingKind: 'initial'
    },
    valid: confirmed
  },
  {
    name: 'list',
    method: 'GET',
    url: '/v1/bookings',
    valid: { appointments: [confirmed] }
  },
  {
    name: 'get',
    method: 'GET',
    url: '/v1/bookings/synthetic_appointment',
    valid: confirmed
  },
  {
    name: 'cancel',
    method: 'POST',
    url: '/v1/bookings/synthetic_appointment/cancel',
    payload: command,
    valid: { appointmentId: 'synthetic_appointment', status: 'cancelled' }
  },
  {
    name: 'reschedule',
    method: 'POST',
    url: '/v1/bookings/synthetic_appointment/reschedule',
    payload: { ...command, targetSlotId: 'synthetic_slot' },
    valid: confirmed
  },
  {
    name: 'arrive',
    method: 'POST',
    url: '/v1/bookings/synthetic_appointment/arrive',
    payload: command,
    valid: { appointmentId: 'synthetic_appointment', status: 'arrived' }
  },
  {
    name: 'complete',
    method: 'POST',
    url: '/v1/bookings/synthetic_appointment/complete',
    payload: command,
    valid: { appointmentId: 'synthetic_appointment', status: 'completed' }
  },
  {
    name: 'markNoShow',
    method: 'POST',
    url: '/v1/bookings/synthetic_appointment/no-show',
    payload: command,
    valid: { appointmentId: 'synthetic_appointment', status: 'no_show' }
  },
  {
    name: 'recordFollowUp',
    method: 'POST',
    url: '/v1/bookings/synthetic_appointment/follow-up',
    payload: { ...command, decision: 'not_required' },
    valid: {
      appointmentId: 'synthetic_appointment',
      decision: 'not_required',
      dueAt: null
    }
  },
  {
    name: 'delete',
    method: 'POST',
    url: '/v1/bookings/synthetic_appointment/delete',
    payload: { ...command, reasonCode: 'duplicate_record' },
    valid: {
      appointmentId: 'synthetic_appointment',
      deleted: true,
      auditEventId: 'synthetic_audit'
    }
  },
  {
    name: 'listSlots',
    method: 'GET',
    url: '/v1/slots?kind=initial',
    valid: {
      slots: [
        { slotId: 'synthetic_slot', kind: 'initial', ...times, available: true }
      ]
    }
  },
  {
    name: 'read',
    method: 'GET',
    url: '/v1/schedule',
    valid: { publishedVersion: 0, publishedAt: null, schedule: null }
  },
  {
    name: 'publish',
    method: 'POST',
    url: '/v1/schedule/publish',
    payload: { ...command, expectedVersion: 0, schedule },
    valid: {
      publishedVersion: 1,
      publishedAt: '2026-10-15T00:00:00Z',
      slotCount: 0
    }
  }
] as const;

let output: unknown;
let applicationError: Error | undefined;
let authenticationDenied = false;
let quotaDenied = false;
const settings = {
  enabled: true,
  expiresAtUtc: '2026-10-16T00:00:00Z',
  projectId: 'synthetic-project',
  emulatorHost: '127.0.0.1:8080'
};
const service = Object.fromEntries(
  cases.map(({ name }) => [
    name,
    vi.fn(() => {
      if (applicationError !== undefined)
        return Promise.reject(applicationError);
      return Promise.resolve(output);
    })
  ])
);

@Module({
  controllers: [
    AppointmentController,
    ScheduleController,
    ReturnLookupController
  ],
  providers: [
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    { provide: APPOINTMENT_APPLICATION, useValue: service },
    { provide: SCHEDULE_APPLICATION, useValue: service },
    { provide: APPOINTMENT_AUTHORIZATION, useValue: {} },
    {
      provide: APPOINTMENT_AUTHENTICATOR,
      useValue: {
        authenticate: () => {
          if (authenticationDenied)
            return Promise.reject(new AuthenticationRequiredError());
          return Promise.resolve({
            actorId: 'synthetic_actor',
            actorRole: OPERATIONAL_ROLES[0]
          });
        }
      }
    },
    { provide: INTERNAL_TEST_BOOKING_SETTINGS, useValue: settings },
    {
      provide: INTERNAL_TEST_BOOKING_CLOCK,
      useValue: { nowUtc: () => '2026-10-15T00:00:00Z' }
    },
    {
      provide: WP_B2_RATE_LIMITER,
      useValue: {
        assertRequest: vi.fn(() =>
          quotaDenied
            ? Promise.reject(new RateLimitedError(17))
            : Promise.resolve(undefined)
        )
      }
    }
  ]
})
class ResponseHarness {}

let app: NestFastifyApplication | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
  applicationError = undefined;
  authenticationDenied = false;
  quotaDenied = false;
  settings.enabled = true;
  vi.clearAllMocks();
});
async function inject(testCase: (typeof cases)[number]) {
  if (app === undefined) {
    app = await NestFactory.create<NestFastifyApplication>(
      ResponseHarness,
      new FastifyAdapter({ logger: false }),
      { logger: false }
    );
    app.setGlobalPrefix('v1');
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  }
  return app.inject({
    method: testCase.method,
    url: testCase.url,
    ...('payload' in testCase ? { payload: testCase.payload } : {})
  });
}

for (const testCase of cases) {
  describe(`declared response admission: ${testCase.name}`, () => {
    it('preserves the complete declared valid response', async () => {
      output = testCase.valid;
      const response = await inject(testCase);
      expect(response.statusCode).toBe(testCase.method === 'POST' ? 201 : 200);
      expect(response.json()).toEqual(testCase.valid);
      expect(service[testCase.name]).toHaveBeenCalledTimes(1);
    });
    it.each(['missing', 'extra'])(
      'refuses %s server output as generic 500 without payload or validation issue leakage',
      async (mutation) => {
        output =
          mutation === 'missing'
            ? {}
            : {
                ...testCase.valid,
                syntheticPrivateField: 'SYNTHETIC_PRIVATE_CANARY'
              };
        const response = await inject(testCase);
        expect(response.statusCode).toBe(500);
        expect(response.json()).toEqual({
          error: {
            code: 'INTERNAL_ERROR',
            message: '系統發生非預期錯誤，請稍後再試。',
            correlationId: expect.any(String)
          }
        });
        expect(response.payload).not.toContain('SYNTHETIC_PRIVATE_CANARY');
        expect(response.payload).not.toContain('syntheticPrivateField');
        expect(response.payload).not.toContain('issues');
        expect(service[testCase.name]).toHaveBeenCalledTimes(1);
      }
    );
    if (['create', 'list', 'get', 'reschedule'].includes(testCase.name)) {
      it.each([
        'Sep 02 2026 Z',
        '2026-02-31T00:00:00Z',
        '2026-10-15T09:00:00+08:00',
        '2026-10-15T24:00:00Z'
      ])(
        'refuses malformed UTC timestamp %s as generic 500 without timestamp leakage',
        async (timestamp) => {
          for (const field of ['startsAt', 'endsAt'] as const) {
            const malformed = { ...confirmed, [field]: timestamp };
            output =
              testCase.name === 'list'
                ? { appointments: [malformed] }
                : malformed;
            const response = await inject(testCase);
            expect(response.statusCode).toBe(500);
            expect(response.json()).toEqual({
              error: {
                code: 'INTERNAL_ERROR',
                message: '系統發生非預期錯誤，請稍後再試。',
                correlationId: expect.any(String)
              }
            });
            expect(response.payload).not.toContain(timestamp);
          }
          expect(service[testCase.name]).toHaveBeenCalledTimes(2);
        }
      );
      it('preserves UTC timestamp strings with 9 fractional digits', async () => {
        const precise = {
          ...confirmed,
          startsAt: '2026-10-15T01:00:00.123456789Z',
          endsAt: '2026-10-15T01:30:00.123456789Z'
        };
        output =
          testCase.name === 'list' ? { appointments: [precise] } : precise;
        const expected = structuredClone(output);
        const response = await inject(testCase);
        expect(response.statusCode).toBe(
          testCase.method === 'POST' ? 201 : 200
        );
        expect(response.json()).toEqual(expected);
        expect(service[testCase.name]).toHaveBeenCalledTimes(1);
      });
    }
  });
}

it('keeps malformed client input as 400 before application invocation', async () => {
  output = confirmed;
  const response = await inject({
    ...cases[1],
    payload: {}
  } as (typeof cases)[number]);
  expect(response.statusCode).toBe(400);
  expect(response.json().error.code).toBe('VALIDATION_FAILED');
  expect(service['create']).not.toHaveBeenCalled();
});
it('keeps the original application conflict, not a response-validation error', async () => {
  applicationError = new ConflictError();
  const response = await inject(cases[1]);
  expect(response.statusCode).toBe(409);
  expect(response.json().error.code).toBe('CONFLICT');
});
it.each(['auth', 'closed-gate'])(
  'retains the %s denial before any service work',
  async (mode) => {
    authenticationDenied = mode === 'auth';
    settings.enabled = mode !== 'closed-gate';
    const response = await inject(cases[1]);
    expect(response.statusCode).toBe(mode === 'auth' ? 401 : 503);
    expect(service['create']).not.toHaveBeenCalled();
  }
);

it.each([cases[0], cases[1]])(
  'keeps limiter 429 before $name service or response admission',
  async (testCase) => {
    quotaDenied = true;
    output = { syntheticPrivateField: 'SYNTHETIC_PRIVATE_CANARY' };
    const response = await inject(testCase);
    expect(response.statusCode).toBe(429);
    expect(response.headers['retry-after']).toBe('17');
    expect(response.json().error.code).toBe('RATE_LIMITED');
    expect(service[testCase.name]).not.toHaveBeenCalled();
    expect(response.payload).not.toContain('SYNTHETIC_PRIVATE_CANARY');
  }
);
