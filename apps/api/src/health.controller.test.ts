import { afterEach, describe, expect, it } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';

import { createApplication } from './main.js';

describe('GET /v1/health', () => {
  let app: NestFastifyApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('returns the versioned API health contract', async () => {
    app = await createApplication();
    await app.init();

    const response = await app.inject({ method: 'GET', url: '/v1/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ service: 'api', status: 'ok' });
  });

  it('exposes no other route; the booking write path is not routed yet', async () => {
    app = await createApplication();
    await app.init();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/bookings'
    });

    expect(response.statusCode).toBe(404);
  });
});
