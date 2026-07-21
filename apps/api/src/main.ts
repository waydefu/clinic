import 'reflect-metadata';

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication
} from '@nestjs/platform-fastify';

import { AppModule } from './app.module.js';

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
  const app = await createApplication();
  await app.listen({
    host: process.env['HOST'] ?? '127.0.0.1',
    port: Number(process.env['PORT'] ?? '3000')
  });
}

const isExecutedAsEntryPoint =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isExecutedAsEntryPoint) {
  void bootstrap();
}
