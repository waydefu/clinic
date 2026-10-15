import 'reflect-metadata';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';
import { afterEach, describe, expect, it } from 'vitest';
import {
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  Patch,
  Post,
  UseGuards,
  type CanActivate,
  type ExecutionContext
} from '@nestjs/common';
import { APP_FILTER, APP_GUARD, NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication
} from '@nestjs/platform-fastify';
import { CreateAppointmentRequestSchema } from '@beauessence/contracts';

import { HealthController } from '../../health.controller.js';
import {
  AuthenticationRequiredError,
  AuthorizationDeniedError,
  ServiceUnavailableError
} from '../errors/api-error.js';
import { ApiExceptionFilter } from '../errors/api-exception.filter.js';
import {
  MAINTENANCE_GATE,
  StaticMaintenanceGate,
  type MaintenanceGate
} from './maintenance-gate.js';
import { MaintenanceGuard } from './maintenance.guard.js';
import {
  OPERATIONAL_HEALTH_PROBE,
  StaticOperationalHealthProbe
} from './operational-health.js';

const repo = fileURLToPath(new URL('../../../../../', import.meta.url));
const BODY = {
  idempotencyKey: 'maintenance_probe_key_001',
  slotId: 'slot_fixture',
  serviceId: 'service_fixture',
  bookingKind: 'initial',
  onBehalfPatientId: 'patient_fixture'
};

function productionProviders(): readonly ts.Expression[] {
  const file = join(repo, 'apps/api/src/app.module.ts');
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true
  );
  const app = source.statements.find(
    (node): node is ts.ClassDeclaration =>
      ts.isClassDeclaration(node) && node.name?.text === 'AppModule'
  );
  if (app === undefined) throw new Error('AppModule is missing.');
  const decorator = ts
    .getDecorators(app)
    ?.find(
      (node) =>
        ts.isCallExpression(node.expression) &&
        node.expression.expression.getText(source) === 'Module'
    );
  if (decorator === undefined || !ts.isCallExpression(decorator.expression))
    throw new Error('Module decorator is missing.');
  const metadata = decorator.expression.arguments[0];
  if (metadata === undefined || !ts.isObjectLiteralExpression(metadata))
    throw new Error('Module metadata is missing.');
  const providers = metadata.properties.find(
    (node): node is ts.PropertyAssignment =>
      ts.isPropertyAssignment(node) && node.name.getText(source) === 'providers'
  )?.initializer;
  if (providers === undefined || !ts.isArrayLiteralExpression(providers))
    throw new Error('Provider list is missing.');
  return providers.elements;
}
function field(node: ts.Expression, name: string): string | undefined {
  if (!ts.isObjectLiteralExpression(node)) return undefined;
  const value = node.properties.find(
    (entry): entry is ts.PropertyAssignment =>
      ts.isPropertyAssignment(entry) && entry.name.getText() === name
  )?.initializer;
  return value?.getText();
}

describe('maintenance source composition, not live control proof', () => {
  it('registers the real HTTP guard and keeps the default explicitly inactive', () => {
    const providers = productionProviders();
    expect(
      providers.some(
        (node) =>
          field(node, 'provide') === 'APP_GUARD' &&
          field(node, 'useClass') === 'MaintenanceGuard'
      )
    ).toBe(true);
    expect(
      providers.some(
        (node) =>
          field(node, 'provide') === 'MAINTENANCE_GATE' &&
          field(node, 'useValue') === 'new StaticMaintenanceGate(false)'
      )
    ).toBe(true);
  });
  it.each([
    'backup-and-restore.md',
    'incident-response.md',
    'stage-e-operational.md'
  ])('keeps the write-quiescence evidence prerequisite in %s', (name) => {
    const text = readFileSync(join(repo, 'docs/runbooks', name), 'utf8');
    expect(text).toContain(
      'MAINTENANCE_WRITE_QUIESCENCE = RUNTIME_PROOF_REQUIRED'
    );
    expect(text).toContain('StaticMaintenanceGate');
    expect(text).toContain('BLOCKED');
    expect(text).toContain('worker');
  });
});

describe('synthetic Nest/Fastify maintenance admission', () => {
  let app: NestFastifyApplication | undefined;
  const calls = { gate: 0, handler: 0 };
  afterEach(async () => {
    await app?.close();
    app = undefined;
    calls.gate = 0;
    calls.handler = 0;
  });

  async function boot(
    closed: boolean,
    override?: MaintenanceGate
  ): Promise<NestFastifyApplication> {
    const gate = override ?? new StaticMaintenanceGate(closed);
    @Injectable()
    class FixtureAuthentication implements CanActivate {
      public canActivate(context: ExecutionContext): boolean {
        const request = context
          .switchToHttp()
          .getRequest<{ headers: Record<string, unknown> }>();
        const role = request.headers['x-fixture-role'];
        if (role === undefined) throw new AuthenticationRequiredError();
        if (role !== 'front_desk') throw new AuthorizationDeniedError();
        return true;
      }
    }
    @Controller('fixture')
    @UseGuards(FixtureAuthentication)
    class FixtureController {
      @Get('read') public read() {
        calls.handler += 1;
        return { ok: true };
      }
      @Get('health') public healthSpelling() {
        calls.handler += 1;
        return { ok: true };
      }
      @Post('write') public create(@Body() body: unknown) {
        CreateAppointmentRequestSchema.parse(body);
        calls.handler += 1;
        return { ok: true };
      }
      @Patch('write') public patch(@Body() body: unknown) {
        CreateAppointmentRequestSchema.parse(body);
        calls.handler += 1;
        return { ok: true };
      }
      @Delete('write') public remove() {
        calls.handler += 1;
        return { ok: true };
      }
    }
    @Module({
      controllers: [FixtureController, HealthController],
      providers: [
        FixtureAuthentication,
        {
          provide: MAINTENANCE_GATE,
          useValue: {
            assertAvailable: () => {
              calls.gate += 1;
              return gate.assertAvailable();
            }
          }
        },
        { provide: APP_GUARD, useClass: MaintenanceGuard },
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
        {
          provide: OPERATIONAL_HEALTH_PROBE,
          useValue: new StaticOperationalHealthProbe({
            processAlive: true,
            firestore: 'ok',
            calendarAdapter: 'ok',
            requiredConfigPresent: true,
            bookingGateEnabled: false,
            outboxDeadLetterCount: 0,
            outboxOldestAgeSeconds: 0,
            candidateBacklog: 0,
            calendarSyncStale: false,
            calendarGoneRecoveryNeeded: false,
            backupFailed: false,
            iamAlertIntegrated: true,
            workerDegraded: false
          })
        }
      ]
    })
    class Harness {}
    const instance = await NestFactory.create<NestFastifyApplication>(
      Harness,
      new FastifyAdapter({ logger: false }),
      { logger: false }
    );
    app = instance;
    instance.setGlobalPrefix('v1');
    await instance.init();
    await instance.getHttpAdapter().getInstance().ready();
    return instance;
  }

  it.each([false, true])(
    'checks real business HTTP dispatch with gate closed=%s',
    async (closed) => {
      const instance = await boot(closed);
      for (const method of ['POST', 'PATCH', 'DELETE', 'GET'] as const) {
        const response = await instance.inject({
          method,
          url: method === 'GET' ? '/v1/fixture/read' : '/v1/fixture/write',
          headers: { 'x-fixture-role': 'front_desk' },
          ...(method === 'POST' || method === 'PATCH' ? { payload: BODY } : {})
        });
        expect(response.statusCode).toBe(
          closed ? 503 : method === 'POST' ? 201 : 200
        );
        expect(response.headers['cache-control']).toBe('private, no-store');
        if (closed) expect(response.body).toContain('SERVICE_UNAVAILABLE');
      }
      expect(calls.gate).toBe(4);
      expect(calls.handler).toBe(closed ? 0 : 4);
    }
  );
  it.each([false, true])(
    'keeps actual health GET/HEAD probes available, closed=%s',
    async (closed) => {
      const instance = await boot(closed);
      for (const url of [
        '/v1/health',
        '/v1/health/live',
        '/v1/health/ready',
        '/v1/health/operational'
      ])
        for (const method of ['GET', 'HEAD'] as const)
          expect((await instance.inject({ method, url })).statusCode).toBe(200);
      expect(calls.gate).toBe(0);
      expect(calls.handler).toBe(0);
    }
  );
  it('awaits an injected asynchronous refusal before a handler can write', async () => {
    let refuse!: (error: Error) => void;
    let entered!: () => void;
    const seen = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const pending = new Promise<void>((_resolve, reject) => {
      refuse = reject;
    });
    // A diagnostic failure on the old guard must not become an unhandled rejection.
    void pending.catch(() => undefined);
    const instance = await boot(false, {
      assertAvailable: () => {
        entered();
        return pending;
      }
    });
    const response = instance.inject({
      method: 'POST',
      url: '/v1/fixture/write',
      headers: { 'x-fixture-role': 'front_desk' },
      payload: BODY
    });
    await seen;
    refuse(new ServiceUnavailableError());
    const result = await response;
    expect(result.statusCode).toBe(503);
    expect(result.headers['cache-control']).toBe('private, no-store');
    expect(calls.gate).toBe(1);
    expect(calls.handler).toBe(0);
  });

  it('does not execute a handler while asynchronous admission is unresolved', async () => {
    let allow!: () => void;
    let entered!: () => void;
    const seen = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const pending = new Promise<void>((resolve) => {
      allow = resolve;
    });
    const instance = await boot(false, {
      assertAvailable: () => {
        entered();
        return pending;
      }
    });
    const response = instance.inject({
      method: 'POST',
      url: '/v1/fixture/write',
      headers: { 'x-fixture-role': 'front_desk' },
      payload: BODY
    });
    try {
      await seen;
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(calls.handler).toBe(0);
    } finally {
      allow();
    }
    expect((await response).statusCode).toBe(201);
    expect(calls.gate).toBe(1);
    expect(calls.handler).toBe(1);
  });

  it('does not infer a health bypass from a route spelling', async () => {
    const instance = await boot(true);
    const response = await instance.inject({
      method: 'GET',
      url: '/v1/fixture/health',
      headers: { 'x-fixture-role': 'front_desk' }
    });
    expect(response.statusCode).toBe(503);
    expect(calls.gate).toBe(1);
    expect(calls.handler).toBe(0);
  });
  it('does not bypass fixture authentication or authorization with the gate open', async () => {
    const instance = await boot(false);
    for (const [headers, status] of [
      [{}, 401],
      [{ 'x-fixture-role': 'unknown' }, 403]
    ] as const) {
      const response = await instance.inject({
        method: 'POST',
        url: '/v1/fixture/write',
        headers,
        payload: BODY
      });
      expect(response.statusCode).toBe(status);
    }
    expect(calls.gate).toBe(2);
    expect(calls.handler).toBe(0);
  });
  it('does not admit invalid input with the gate open', async () => {
    const instance = await boot(false);
    const response = await instance.inject({
      method: 'POST',
      url: '/v1/fixture/write',
      headers: { 'x-fixture-role': 'front_desk' },
      payload: {}
    });
    expect(response.statusCode).toBe(400);
    expect(calls.gate).toBe(1);
    expect(calls.handler).toBe(0);
  });
});
