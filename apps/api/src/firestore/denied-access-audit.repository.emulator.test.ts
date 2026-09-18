import 'reflect-metadata';

import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication
} from '@nestjs/platform-fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  APPOINTMENT_APPLICATION,
  APPOINTMENT_AUTHENTICATOR,
  AppointmentController,
  type AppointmentAuthenticator,
  type AuthenticatableRequest
} from '../appointments/appointment.controller.js';
import {
  AUTHORIZATION_DENIAL_COLLECTION,
  FirestoreDeniedAccessAuditStore
} from './denied-access-audit.repository.js';
import {
  AuthenticationRequiredError,
  AuthorizationDeniedError
} from '../platform/errors/api-error.js';
import { ApiExceptionFilter } from '../platform/errors/api-exception.filter.js';
import { DENIED_AUTHORIZATION_AUDIT } from '../platform/authorization/denied-access-audit.port.js';
import {
  INTERNAL_TEST_BOOKING_CLOCK,
  INTERNAL_TEST_BOOKING_SETTINGS
} from '../internal-test-booking/internal-test-booking.tokens.js';
import {
  LOCAL_FIREBASE_PROJECT_ID,
  requireLocalFirestoreEmulatorTarget
} from '../../../../packages/config/src/index.js';

requireLocalFirestoreEmulatorTarget(process.env['FIRESTORE_EMULATOR_HOST']);

const projectId = LOCAL_FIREBASE_PROJECT_ID;
const APP_NAME = 'denied-access-audit-emulator';
const OPEN_INTERNAL_TEST_SETTINGS = {
  enabled: true,
  expiresAtUtc: '2099-01-01T00:00:00.000Z',
  projectId: 'beauessence-clinic-stg-c1a01',
  emulatorHost: '127.0.0.1:8080'
} as const;

type AuthenticationMode = 'allow' | 'fresh-denial' | 'reused-denial';
type ApplicationMode = 'success' | 'denial';

let authenticationMode: AuthenticationMode = 'fresh-denial';
let applicationMode: ApplicationMode = 'success';
const reusedAuthenticationError = new AuthenticationRequiredError();

function actorHeaders(): Record<string, string> {
  return {
    'x-test-actor-id': 'synthetic_actor_001',
    'x-test-role': 'manager'
  };
}

const harnessAuthenticator: AppointmentAuthenticator = {
  authenticate(request: AuthenticatableRequest) {
    if (authenticationMode === 'reused-denial') {
      return Promise.reject(reusedAuthenticationError);
    }
    if (authenticationMode === 'fresh-denial') {
      return Promise.reject(new AuthenticationRequiredError());
    }
    request.authentication = {
      actorId: 'synthetic_actor_001',
      actorRole: 'manager'
    };
    return Promise.resolve(request.authentication);
  }
};

const harnessApplication = {
  create: () => {
    if (applicationMode === 'denial') {
      return Promise.reject(new AuthorizationDeniedError());
    }
    return Promise.resolve({ appointmentId: 'synthetic_appointment_001' });
  },
  list: () => {
    if (applicationMode === 'denial') {
      return Promise.reject(new AuthorizationDeniedError());
    }
    return Promise.resolve({ appointments: [] });
  }
};

function harnessModule(store: FirestoreDeniedAccessAuditStore) {
  @Module({
    controllers: [AppointmentController],
    providers: [
      {
        provide: APP_FILTER,
        useFactory: (audit: FirestoreDeniedAccessAuditStore) =>
          new ApiExceptionFilter(audit),
        inject: [DENIED_AUTHORIZATION_AUDIT]
      },
      { provide: DENIED_AUTHORIZATION_AUDIT, useValue: store },
      { provide: APPOINTMENT_AUTHENTICATOR, useValue: harnessAuthenticator },
      {
        provide: APPOINTMENT_APPLICATION,
        useValue: harnessApplication
      },
      {
        provide: INTERNAL_TEST_BOOKING_SETTINGS,
        useValue: OPEN_INTERNAL_TEST_SETTINGS
      },
      {
        provide: INTERNAL_TEST_BOOKING_CLOCK,
        useValue: { nowUtc: () => '2029-12-15T09:00:00.000Z' }
      }
    ]
  })
  class DeniedAccessAuditHarnessModule {}

  return DeniedAccessAuditHarnessModule;
}

describe('Firestore denied-access audit over routed Nest HTTP', () => {
  let firebaseApp: App;
  let db: Firestore;
  let nestApp: NestFastifyApplication | undefined;

  beforeAll(async () => {
    firebaseApp = initializeApp({ projectId }, APP_NAME);
    db = getFirestore(firebaseApp);
    const store = new FirestoreDeniedAccessAuditStore(db);
    const instance = await NestFactory.create<NestFastifyApplication>(
      harnessModule(store),
      new FastifyAdapter({ logger: false }),
      { logger: false }
    );
    instance.setGlobalPrefix('v1');
    await instance.init();
    await instance.getHttpAdapter().getInstance().ready();
    nestApp = instance;
  });

  afterAll(async () => {
    await wipeAuditCollection();
    await nestApp?.close();
    nestApp = undefined;
    await deleteApp(firebaseApp);
  });

  beforeEach(async () => {
    authenticationMode = 'fresh-denial';
    applicationMode = 'success';
    await wipeAuditCollection();
  });

  async function wipeAuditCollection(): Promise<void> {
    if (db === undefined) return;
    const documents = await db
      .collection(AUTHORIZATION_DENIAL_COLLECTION)
      .listDocuments();
    await Promise.all(documents.map((document) => document.delete()));
  }

  function requireHarness(): NestFastifyApplication {
    if (nestApp === undefined) throw new Error('Nest harness was not started.');
    return nestApp;
  }

  async function readAuditEvents(): Promise<Record<string, unknown>[]> {
    const snapshot = await db.collection(AUTHORIZATION_DENIAL_COLLECTION).get();
    return snapshot.docs.map((document) => document.data());
  }

  it('returns 401 and reads back exactly one safe denial event', async () => {
    const response = await requireHarness().inject({
      method: 'GET',
      url: '/v1/bookings'
    });

    expect(response.statusCode).toBe(401);
    const events = await readAuditEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actorId: 'anonymous',
      actorType: 'unauthenticated',
      outcome: 'denied',
      reasonCategory: 'authentication_required',
      environment: 'internal_test'
    });
    expect(Object.keys(events[0] ?? {}).sort()).toEqual([
      'action',
      'actorId',
      'actorType',
      'correlationId',
      'environment',
      'eventId',
      'occurredAt',
      'outcome',
      'reasonCategory',
      'resourceId',
      'resourceType'
    ]);
    expect(JSON.stringify(events)).not.toMatch(
      /password|secret|cookie|token|csrf|totp|email|phone|0912/i
    );
  });

  it('returns 403 and writes exactly one event for each of two requests', async () => {
    authenticationMode = 'allow';
    applicationMode = 'denial';

    const first = await requireHarness().inject({
      method: 'GET',
      url: '/v1/bookings',
      headers: actorHeaders()
    });
    const second = await requireHarness().inject({
      method: 'GET',
      url: '/v1/bookings',
      headers: actorHeaders()
    });

    expect(first.statusCode).toBe(403);
    expect(second.statusCode).toBe(403);
    const events = await readAuditEvents();
    expect(events).toHaveLength(2);
    expect(new Set(events.map((event) => event['eventId'])).size).toBe(2);
    expect(new Set(events.map((event) => event['correlationId'])).size).toBe(2);
  });

  it('does not overwrite or append when the same error object is reused over HTTP', async () => {
    authenticationMode = 'reused-denial';

    const first = await requireHarness().inject({
      method: 'GET',
      url: '/v1/bookings'
    });
    const second = await requireHarness().inject({
      method: 'GET',
      url: '/v1/bookings'
    });

    expect(first.statusCode).toBe(401);
    expect(second.statusCode).toBe(401);
    const events = await readAuditEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.['actorId']).toBe('anonymous');
  });

  it('does not write an event for success or a non-denial failure', async () => {
    authenticationMode = 'allow';

    const success = await requireHarness().inject({
      method: 'GET',
      url: '/v1/bookings',
      headers: actorHeaders()
    });
    expect(success.statusCode).toBe(200);
    expect(await readAuditEvents()).toHaveLength(0);

    const invalid = await requireHarness().inject({
      method: 'POST',
      url: '/v1/bookings',
      headers: actorHeaders(),
      payload: {}
    });
    expect(invalid.statusCode).toBe(400);
    expect(await readAuditEvents()).toHaveLength(0);
  });
});
