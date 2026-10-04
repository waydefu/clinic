import { DomainError } from '@beauessence/domain';
import { describe, expect, it } from 'vitest';

import {
  actionForStatus,
  resolveFollowUpReminderProjection,
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

describe('resolveFollowUpReminderProjection', () => {
  const DUE = '2030-03-05T06:45:00.000Z';

  it('cancels when the decision document no longer exists', () => {
    const resolved = resolveFollowUpReminderProjection(undefined);
    expect(resolved).toEqual({
      projectionStatus: 'follow_up_not_required',
      startsAt: ''
    });
    expect(actionForStatus(resolved.projectionStatus)).toBe('cancel');
  });

  it('cancels a not_required decision whatever due date it still carries', () => {
    const resolved = resolveFollowUpReminderProjection({
      decision: 'not_required',
      dueAt: DUE
    });
    expect(resolved).toEqual({
      projectionStatus: 'follow_up_not_required',
      startsAt: ''
    });
  });

  it('upserts a required decision at the stored due date', () => {
    const resolved = resolveFollowUpReminderProjection({
      decision: 'required',
      dueAt: DUE
    });
    expect(resolved).toEqual({
      projectionStatus: 'follow_up_required',
      startsAt: DUE
    });
    expect(actionForStatus(resolved.projectionStatus)).toBe('upsert');
  });

  it('projects nothing dated for a required decision without a due date', () => {
    for (const dueAt of [null, undefined]) {
      const resolved = resolveFollowUpReminderProjection({
        decision: 'required',
        dueAt
      });
      expect(resolved).toEqual({
        projectionStatus: 'follow_up_required',
        startsAt: ''
      });
      expect(
        shouldProjectFollowUpReminder({
          isFollowUpProjection: true,
          action: actionForStatus(resolved.projectionStatus),
          startsAt: resolved.startsAt
        })
      ).toBe(false);
    }
  });

  it('refuses an unreadable decision or due date instead of guessing', () => {
    expect(() => resolveFollowUpReminderProjection({})).toThrow(DomainError);
    expect(() =>
      resolveFollowUpReminderProjection({ decision: 'maybe', dueAt: DUE })
    ).toThrow(/decision is unreadable/);
    expect(() =>
      resolveFollowUpReminderProjection({ decision: 'required', dueAt: 12345 })
    ).toThrow(/due date is unreadable/);
    expect(() =>
      resolveFollowUpReminderProjection({
        decision: 'required',
        dueAt: '2030-02-31T00:00:00.000Z'
      })
    ).toThrow(DomainError);
  });
});
