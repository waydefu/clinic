import { describe, expect, it } from 'vitest';

import {
  isWithinSelfCancelWindow,
  selfCancelCutoffAt
} from './appointment-rules.js';

describe('selfCancelCutoffAt', () => {
  it('resolves to 10:00 Asia/Taipei on the appointment day', () => {
    expect(selfCancelCutoffAt('2030-01-02T04:00:00.000Z')).toBe(
      '2030-01-02T02:00:00.000Z'
    );
  });

  it('rejects an unparseable appointment start', () => {
    expect(() => selfCancelCutoffAt('not-a-time')).toThrow(/parseable/);
  });
});

describe('isWithinSelfCancelWindow', () => {
  it('allows 09:59 and denies 10:00 on the appointment day', () => {
    const startsAt = '2030-01-02T04:00:00.000Z';
    expect(
      isWithinSelfCancelWindow(startsAt, Date.parse('2030-01-02T01:59:00.000Z'))
    ).toBe(true);
    expect(
      isWithinSelfCancelWindow(startsAt, Date.parse('2030-01-02T02:00:00.000Z'))
    ).toBe(false);
  });

  it('fails closed on non-finite now', () => {
    expect(
      isWithinSelfCancelWindow('2030-01-02T04:00:00.000Z', Number.NaN)
    ).toBe(false);
  });
});
