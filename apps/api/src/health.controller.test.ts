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

  it('does not load test-only booking routes without the explicit flag', async () => {
    app = await createApplication();
    await app.init();

    const response = await app.inject({
      method: 'GET',
      url: '/v1/test-only/state'
    });

    expect(response.statusCode).toBe(404);
  });
});
