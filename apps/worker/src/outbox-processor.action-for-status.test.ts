import { DomainError } from '@beauessence/domain';
import { describe, expect, it } from 'vitest';

import {
  actionForStatus,
  shouldProjectFollowUpReminder
} from './outbox-processor.js';

describe('actionForStatus', () => {
  it('upserts the live projection statuses', () => {
    expect(actionForStatus('confirmed')).toBe('upsert');
    expect(actionForStatus('arrived')).toBe('upsert');
    expect(actionForStatus('completed')).toBe('upsert');
    expect(actionForStatus('cancellation_requested')).toBe('upsert');
    expect(actionForStatus('follow_up_required')).toBe('upsert');
  });

  it('cancels only known terminal or deleted projection statuses', () => {
    expect(actionForStatus('cancelled')).toBe('cancel');
    expect(actionForStatus('no_show')).toBe('cancel');
    expect(actionForStatus('deleted')).toBe('cancel');
    expect(actionForStatus('follow_up_not_required')).toBe('cancel');
    expect(actionForStatus('follow_up_scheduled')).toBe('cancel');
  });

  it('does not project an unscheduled follow-up entitlement as a Calendar appointment', () => {
    expect(
      shouldProjectFollowUpReminder({
        isFollowUpProjection: true,
        action: 'upsert',
        startsAt: ''
      })
    ).toBe(false);
    expect(
      shouldProjectFollowUpReminder({
        isFollowUpProjection: true,
        action: 'upsert',
        startsAt: '2030-01-02T04:15:00.000Z'
      })
    ).toBe(true);
    expect(
      shouldProjectFollowUpReminder({
        isFollowUpProjection: true,
        action: 'cancel',
        startsAt: ''
      })
    ).toBe(true);
    expect(
      shouldProjectFollowUpReminder({
        isFollowUpProjection: false,
        action: 'upsert',
        startsAt: ''
      })
    ).toBe(true);
  });

  it('refuses unknown status instead of cancelling the calendar event', () => {
    expect(() => actionForStatus('unknown')).toThrow(DomainError);
    expect(() => actionForStatus('not_a_status')).toThrow(
      /unknown appointment status/
    );
  });
});
