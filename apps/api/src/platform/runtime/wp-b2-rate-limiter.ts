import {
  RATE_LIMIT_POLICIES,
  type RateLimitPolicyName
} from '@beauessence/domain';

import {
  RateLimitedError,
  ServiceUnavailableError
} from '../errors/api-error.js';
import { FixedWindowRateLimiter, type Clock } from './rate-limiter.js';
import {
  consumeDurableRateLimit,
  type DurableRateLimitStore
} from './durable-rate-limit-store.js';

const ANONYMOUS_ACTORS = new Set(['anonymous', 'unauthenticated']);

export const RATE_LIMIT_STORE = 'DurableRateLimitStore';
export const WP_B2_RATE_LIMITER = 'WpB2RateLimiter';

export class WpB2RateLimiter {
  private readonly burst = new Map<
    RateLimitPolicyName,
    FixedWindowRateLimiter
  >();

  public constructor(
    private readonly store: DurableRateLimitStore,
    private readonly clock: Clock = { now: () => Date.now() }
  ) {}

  private burstLimiter(name: RateLimitPolicyName): FixedWindowRateLimiter {
    const existing = this.burst.get(name);
    if (existing !== undefined) return existing;
    const policy = RATE_LIMIT_POLICIES[name];
    const limiter = new FixedWindowRateLimiter(
      policy.limit,
      policy.windowMs,
      this.clock
    );
    this.burst.set(name, limiter);
    return limiter;
  }

  public async assertPolicy(
    name: RateLimitPolicyName,
    key: string
  ): Promise<void> {
    const policy = RATE_LIMIT_POLICIES[name];
    this.burstLimiter(name).assertWithinLimit(key);
    try {
      await consumeDurableRateLimit(
        this.store,
        policy,
        `${name}:${key}`,
        this.clock.now()
      );
    } catch (error) {
      if (error instanceof RateLimitedError) throw error;
      throw new ServiceUnavailableError();
    }
  }

  public async assertUnauthenticatedIp(ip: string): Promise<void> {
    await this.assertPolicy('unauthenticated_general', `ip:${ip}`);
  }

  public async assertIdentifiedWrite(actorId: string): Promise<void> {
    await this.assertPolicy('identified_write', `actor:${actorId}`);
  }

  public async assertLookupFailure(
    lookupIdentity: string,
    ip: string
  ): Promise<void> {
    await this.assertPolicy(
      'lookup_or_auth_failure',
      `lookup:${lookupIdentity}:${ip}`
    );
    await this.assertPolicy(
      'lookup_identity_failure',
      `lookup:${lookupIdentity}`
    );
  }

  public async assertRequest(input: {
    readonly ip: string;
    readonly actorId?: string;
    readonly write: boolean;
  }): Promise<void> {
    const actorId = input.actorId;
    const identified =
      actorId !== undefined && actorId !== '' && !ANONYMOUS_ACTORS.has(actorId);
    if (identified && input.write) {
      await this.assertIdentifiedWrite(actorId);
      return;
    }
    await this.assertUnauthenticatedIp(input.ip);
  }
}

export function retryAfterFrom(error: unknown): number | undefined {
  return error instanceof RateLimitedError
    ? error.retryAfterSeconds
    : undefined;
}
