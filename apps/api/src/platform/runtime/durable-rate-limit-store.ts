import { RateLimitedError } from '../errors/api-error.js';
import type { RateLimitPolicy } from '@beauessence/domain';

export interface DurableRateLimitRecord {
  count: number;
  windowStartMs: number;
  lockedUntilMs: number | null;
}

export interface DurableRateLimitConsumeResult {
  readonly allowed: boolean;
  readonly retryAfterSeconds?: number;
}

export interface DurableRateLimitStore {
  consume(
    key: string,
    policy: RateLimitPolicy,
    nowMs: number
  ): Promise<DurableRateLimitConsumeResult>;
}

function retryAfterSeconds(
  record: DurableRateLimitRecord,
  policy: RateLimitPolicy,
  nowMs: number
): number {
  if (record.lockedUntilMs !== null && nowMs < record.lockedUntilMs) {
    return (record.lockedUntilMs - nowMs) / 1000;
  }
  return (record.windowStartMs + policy.windowMs - nowMs) / 1000;
}

export function planDurableRateLimit(
  current: DurableRateLimitRecord | undefined,
  policy: RateLimitPolicy,
  nowMs: number
): { record: DurableRateLimitRecord; result: DurableRateLimitConsumeResult } {
  if (
    current?.lockedUntilMs !== undefined &&
    current.lockedUntilMs !== null &&
    nowMs < current.lockedUntilMs
  ) {
    return {
      record: current,
      result: {
        allowed: false,
        retryAfterSeconds: retryAfterSeconds(current, policy, nowMs)
      }
    };
  }
  const expired =
    current === undefined || nowMs - current.windowStartMs >= policy.windowMs;
  const nextCount = expired ? 1 : current.count + 1;
  const windowStartMs = expired ? nowMs : current.windowStartMs;
  if (nextCount > policy.limit) {
    const lockedUntilMs =
      policy.lockMs > 0
        ? nowMs + policy.lockMs
        : windowStartMs + policy.windowMs;
    const locked = {
      count: policy.limit,
      windowStartMs,
      lockedUntilMs
    };
    return {
      record: locked,
      result: {
        allowed: false,
        retryAfterSeconds: retryAfterSeconds(locked, policy, nowMs)
      }
    };
  }
  const lockedUntilMs =
    policy.lockMs > 0 && nextCount >= policy.limit
      ? nowMs + policy.lockMs
      : null;
  return {
    record: {
      count: nextCount,
      windowStartMs,
      lockedUntilMs
    },
    result: { allowed: true }
  };
}

export class InMemoryDurableRateLimitStore implements DurableRateLimitStore {
  public constructor(
    private readonly records: Map<string, DurableRateLimitRecord> = new Map()
  ) {}

  public consume(
    key: string,
    policy: RateLimitPolicy,
    nowMs: number
  ): Promise<DurableRateLimitConsumeResult> {
    const planned = planDurableRateLimit(this.records.get(key), policy, nowMs);
    this.records.set(key, { ...planned.record });
    return Promise.resolve(planned.result);
  }
}

export async function consumeDurableRateLimit(
  store: DurableRateLimitStore,
  policy: RateLimitPolicy,
  key: string,
  nowMs: number
): Promise<void> {
  const result = await store.consume(key, policy, nowMs);
  if (!result.allowed) {
    throw new RateLimitedError(result.retryAfterSeconds);
  }
}
