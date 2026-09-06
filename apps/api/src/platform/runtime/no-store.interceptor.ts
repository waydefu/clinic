import { Injectable } from '@nestjs/common';
import type {
  CallHandler,
  ExecutionContext,
  NestInterceptor
} from '@nestjs/common';

interface HeaderWriter {
  header(name: string, value: string): unknown;
}

export const NO_STORE_CACHE_CONTROL = 'private, no-store';

/**
 * Authenticated and other dynamic API responses must never sit in a shared
 * cache. Registered globally (APP_INTERCEPTOR): the API serves no cacheable
 * public asset, so scoping per-controller would only let a future route
 * silently miss the header. Header write targets the Fastify reply API;
 * the application boots on Fastify (see main.ts).
 */
@Injectable()
export class NoStoreInterceptor implements NestInterceptor {
  public intercept(
    context: ExecutionContext,
    next: CallHandler
  ): ReturnType<CallHandler['handle']> {
    context
      .switchToHttp()
      .getResponse<HeaderWriter>()
      .header('Cache-Control', NO_STORE_CACHE_CONTROL);
    return next.handle();
  }
}
