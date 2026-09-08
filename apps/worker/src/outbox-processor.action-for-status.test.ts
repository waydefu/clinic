import { DomainError } from '@beauessence/domain';
import { describe, expect, it } from 'vitest';

import { actionForStatus } from './outbox-processor.js';

describe('actionForStatus', () => {
  it('upserts the live projection statuses', () => {
    expect(actionForStatus('confirmed')).toBe('upsert');
    expect(actionForStatus('cancellation_requested')).toBe('upsert');
    expect(actionForStatus('follow_up_required')).toBe('upsert');
  });

  it('cancels only known terminal or deleted projection statuses', () => {
    expect(actionForStatus('cancelled')).toBe('cancel');
    expect(actionForStatus('completed')).toBe('cancel');
    expect(actionForStatus('no_show')).toBe('cancel');
    expect(actionForStatus('deleted')).toBe('cancel');
    expect(actionForStatus('follow_up_not_required')).toBe('cancel');
  });

  it('refuses unknown status instead of cancelling the calendar event', () => {
    expect(() => actionForStatus('unknown')).toThrow(DomainError);
    expect(() => actionForStatus('not_a_status')).toThrow(
      /unknown appointment status/
    );
  });
});
