import { randomUUID } from 'node:crypto';
import {
  Catch,
  type ArgumentsHost,
  type ExceptionFilter
} from '@nestjs/common';

import { mapErrorToApiResponse } from './api-error.js';

interface HttpReply {
  header(name: string, value: string): HttpReply;
  status(code: number): HttpReply;
  send(body: unknown): void;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  public catch(error: unknown, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<HttpReply>();
    const mapped = mapErrorToApiResponse(error, randomUUID());
    for (const [name, value] of Object.entries(mapped.headers))
      reply.header(name, value);
    reply.status(mapped.status).send(mapped.body);
  }
}
