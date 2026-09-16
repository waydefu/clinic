import type { DeniedAccessAuditEvent } from '@beauessence/domain';

export const DENIED_AUTHORIZATION_AUDIT = 'DeniedAuthorizationAuditPort';

/**
 * Append-only denial store. `record` never updates or deletes. Replaying the
 * same server event id is a no-op so the filter can await persistence without
 * creating a second copy. Callers supply server-generated event ids only.
 */
export interface DeniedAuthorizationAuditPort {
  record(event: DeniedAccessAuditEvent): Promise<void>;
}

export class InMemoryDeniedAccessAuditSink implements DeniedAuthorizationAuditPort {
  private readonly events: DeniedAccessAuditEvent[] = [];
  private readonly seen = new Set<string>();

  public record(event: DeniedAccessAuditEvent): Promise<void> {
    const requestKey = `${event.correlationId}:${event.reasonCategory}:${event.action}`;
    if (this.seen.has(event.eventId) || this.seen.has(requestKey)) {
      return Promise.resolve();
    }
    this.seen.add(event.eventId);
    this.seen.add(requestKey);
    this.events.push(event);
    return Promise.resolve();
  }

  public list(): readonly DeniedAccessAuditEvent[] {
    return this.events;
  }
}
