import 'reflect-metadata';

import { afterEach, describe, expect, it } from 'vitest';
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication
} from '@nestjs/platform-fastify';

import { planInboundNotificationWork } from '../../../worker/src/calendar-sync/watch-channel.js';
import { ApiExceptionFilter } from '../platform/errors/api-exception.filter.js';
import { createApplication } from '../main.js';
import {
  CALENDAR_WATCH_PLANNER,
  CalendarWatchController,
  type CalendarWatchPlanner
} from './calendar-watch.controller.js';

const PUSH_HEADERS = {
  'x-goog-channel-id': 'chan-1',
  'x-goog-resource-id': 'res-1',
  'x-goog-resource-state': 'exists',
  'x-goog-message-number': '7',
  'x-goog-channel-token': 'token-hash'
} as const;

const harnessPlanner: CalendarWatchPlanner = {
  plan(headers) {
    const result = planInboundNotificationWork({
      headers,
      expectedToken: 'token-hash'
    });
    if (result.action === 'reject') return { httpStatus: result.httpStatus };
    return { httpStatus: 204 };
  }
};

@Module({
  controllers: [CalendarWatchController],
  providers: [
    { provide: CALENDAR_WATCH_PLANNER, useValue: harnessPlanner },
    { provide: APP_FILTER, useClass: ApiExceptionFilter }
  ]
})
class CalendarWatchHarnessModule {}

describe('unrouted CalendarWatchController harness', () => {
  let app: NestFastifyApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  async function harness(): Promise<NestFastifyApplication> {
    app = await NestFactory.create<NestFastifyApplication>(
      CalendarWatchHarnessModule,
      new FastifyAdapter({ logger: false }),
      { logger: false }
    );
    app.setGlobalPrefix('v1');
    await app.init();
    return app;
  }

  it('acks a valid push with empty body as 204', async () => {
    const server = await harness();
    const response = await server.inject({
      method: 'POST',
      url: '/v1/calendar-watch',
      headers: PUSH_HEADERS,
      payload: ''
    });
    expect(response.statusCode).toBe(204);
  });

  it('hides token mismatch as 404', async () => {
    const server = await harness();
    const response = await server.inject({
      method: 'POST',
      url: '/v1/calendar-watch',
      headers: { ...PUSH_HEADERS, 'x-goog-channel-token': 'wrong' }
    });
    expect(response.statusCode).toBe(404);
  });

  it('rejects unrecognized headers as 400', async () => {
    const server = await harness();
    const response = await server.inject({
      method: 'POST',
      url: '/v1/calendar-watch',
      payload: { summary: 'must-not-become-a-booking' }
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('production AppModule calendar watch path', () => {
  let app: NestFastifyApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('keeps POST /v1/calendar-watch unrouted', async () => {
    app = await createApplication();
    await app.init();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/calendar-watch',
      headers: PUSH_HEADERS
    });
    expect(response.statusCode).toBe(404);
  });
});
