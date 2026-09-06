import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import {
  NO_STORE_CACHE_CONTROL,
  NoStoreInterceptor
} from './no-store.interceptor.js';

describe('NoStoreInterceptor', () => {
  it('marks the response private, no-store and passes the call through', () => {
    const written: Record<string, string> = {};
    const context = {
      switchToHttp: () => ({
        getResponse: () => ({
          header: (name: string, value: string): void => {
            written[name] = value;
          }
        })
      })
    } as unknown as ExecutionContext;
    const handle = vi.fn(() => 'handled');
    const next = { handle } as unknown as CallHandler;

    const output = new NoStoreInterceptor().intercept(context, next);

    expect(written['Cache-Control']).toBe('private, no-store');
    expect(written['Cache-Control']).toBe(NO_STORE_CACHE_CONTROL);
    expect(handle).toHaveBeenCalledTimes(1);
    expect(output).toBe('handled');
  });
});
