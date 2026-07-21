import 'reflect-metadata';

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication
} from '@nestjs/platform-fastify';

import { AppModule } from './app.module.js';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

/**
 * The test-only booking routes carry no authentication or authorization. They
 * may therefore only ever be reachable from the machine running them. The web
 * harness hard-codes its loopback bind; this keeps the API side symmetrical so
 * a stray HOST value cannot publish those write endpoints to a network.
 */
export function resolveListenHost(
  environment: NodeJS.ProcessEnv = process.env
): string {
  const host = environment['HOST'] ?? '127.0.0.1';
  if (
    environment['ENABLE_TEST_ONLY_BOOKING'] === 'true' &&
    !LOOPBACK_HOSTS.has(host)
  ) {
    throw new Error(
      `Refusing to bind the test-only API to non-loopback host "${host}". ` +
        'Unset HOST or unset ENABLE_TEST_ONLY_BOOKING.'
    );
  }
  return host;
}

export async function createApplication(): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }),
    { logger: false }
  );

  app.setGlobalPrefix('v1');
  if (process.env['ENABLE_TEST_ONLY_BOOKING'] === 'true') {
    app.enableCors({
      origin: 'http://127.0.0.1:3100',
      methods: ['GET', 'POST'],
      allowedHeaders: ['Content-Type']
    });
  }
  return app;
}

async function bootstrap(): Promise<void> {
  const host = resolveListenHost();
  const app = await createApplication();
  await app.listen({
    host,
    port: Number(process.env['PORT'] ?? '3000')
  });
}

const isExecutedAsEntryPoint =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isExecutedAsEntryPoint) {
  void bootstrap();
}
