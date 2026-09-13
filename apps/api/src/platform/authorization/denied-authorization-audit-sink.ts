import type { DeniedDelegationAuditEvent } from '@beauessence/domain';

/**
 * Append-only denied-event sink. There is no delete or rewrite method: D-006
 * audit is permanent for authorization denials as well as appointment writes.
 * Retention / linkability still belong to D-002.
 */
export class InMemoryDeniedAuthorizationAuditSink {
  private readonly events: DeniedDelegationAuditEvent[] = [];

  append(event: DeniedDelegationAuditEvent): void {
    this.events.push(event);
  }

  list(): readonly DeniedDelegationAuditEvent[] {
    return this.events;
  }
}
