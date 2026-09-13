import { DomainError } from '@beauessence/domain';
import type { DelegationVerificationState } from '@beauessence/domain';

/**
 * In-process atomic attempt store. Firestore / Secret Manager wiring waits
 * for a routed write path; this adapter proves that two overlapping failures
 * cannot lose the lock by read-modify-write races.
 */
export function delegatedAttemptKey(
  actorId: string,
  permission: string
): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(actorId)) {
    throw new DomainError(
      'INVALID_VALUE',
      'delegation attempt actorId must be an opaque identifier'
    );
  }
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(permission)) {
    throw new DomainError(
      'INVALID_VALUE',
      'delegation attempt permission must be an opaque identifier'
    );
  }
  return `${actorId}:${permission}`;
}

const EMPTY_STATE: DelegationVerificationState = {
  failedAttempts: 0,
  locked: false
};

export class InMemoryDelegatedAuthorizationAttemptStore {
  private readonly states = new Map<string, DelegationVerificationState>();
  private readonly chains = new Map<string, Promise<unknown>>();

  snapshot(key: string): DelegationVerificationState {
    return this.states.get(key) ?? EMPTY_STATE;
  }

  replace(key: string, next: DelegationVerificationState): void {
    this.states.set(key, next);
  }

  async runExclusive<T>(
    key: string,
    fn: (state: DelegationVerificationState) => T | Promise<T>
  ): Promise<T> {
    const previous = this.chains.get(key) ?? Promise.resolve();
    let release!: (value: unknown) => void;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    this.chains.set(
      key,
      previous.then(
        () => gate,
        () => gate
      )
    );
    await previous.then(
      () => undefined,
      () => undefined
    );
    try {
      return await fn(this.snapshot(key));
    } finally {
      release(undefined);
    }
  }
}
