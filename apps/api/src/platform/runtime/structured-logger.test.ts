import { describe, expect, it } from 'vitest';

import { StdoutStructuredLogger } from './structured-logger.js';

const BASE = {
  timestamp: '2026-09-15T00:00:00.000Z',
  environment: 'internal_test',
  service: 'api',
  correlationId: 'corr_req_0001',
  operation: 'POST_v1_bookings',
  result: 'error' as const,
  errorCode: 'INTERNAL_ERROR',
  durationMs: 11,
  retryState: 'none' as const
};

describe('StdoutStructuredLogger', () => {
  it('writes a PII-safe JSON line with correlation id and stable code', () => {
    const lines: string[] = [];
    const logger = new StdoutStructuredLogger(
      () => 1,
      (line) => lines.push(line)
    );
    logger.emit(BASE);
    expect(JSON.parse(lines[0] ?? '{}')).toMatchObject({
      correlationId: 'corr_req_0001',
      errorCode: 'INTERNAL_ERROR',
      result: 'error'
    });
    expect(lines[0]).not.toMatch(/0912/);
  });

  it('caps log volume within a minute', () => {
    const lines: string[] = [];
    const logger = new StdoutStructuredLogger(
      () => 1,
      (line) => lines.push(line)
    );
    for (let i = 0; i < 200; i += 1) logger.emit(BASE);
    expect(lines.length).toBe(120);
  });
});
