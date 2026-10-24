import { describe, expect, it } from 'vitest';

import { assessScan, fixtureCases } from './gitleaks-fixtures.mjs';

const cases = fixtureCases();
describe('real-scanner fixture oracle', () => {
  it('covers every named value with positive, mixed and both boundary cases', () => {
    expect(new Set(cases.map(({ id }) => id)).size).toBe(cases.length);
    expect(cases).toHaveLength(42);
    for (let index = 0; index < 9; index += 1) {
      expect(
        cases.filter(({ id }) => id.startsWith(`value-${index}-`))
      ).toHaveLength(4);
    }
  });

  it('keeps the control positive even when a candidate exception is expected', () => {
    for (const fixture of cases) {
      expect(fixture.control.length).toBeGreaterThan(0);
      expect(fixture.control).toContain(
        fixture.id.startsWith('vendor-')
          ? 'fixture-vendor'
          : fixture.id === 'standalone-canary'
            ? 'fixture-canary'
            : 'fixture-value'
      );
    }
  });

  it('rejects a silent/disabled scanner that produces no finding for a denied case', () => {
    expect(() => assessScan({ status: 0 }, [], ['fixture-canary'])).toThrow();
  });

  it.each([null, 2, 7])('rejects scanner error exit %s', (status) => {
    expect(() => assessScan({ status }, [], [])).toThrow();
  });

  it('rejects unreadable reports, spawn errors and unexpected findings', () => {
    expect(() => assessScan({ status: 0 }, null, [])).toThrow();
    expect(() =>
      assessScan({ status: 0, error: new Error('synthetic') }, [], [])
    ).toThrow();
    expect(() =>
      assessScan({ status: 1 }, [{ RuleID: 'other' }], ['fixture-value'])
    ).toThrow();
  });

  it('accepts only the exact finding multiset and corresponding exit status', () => {
    expect(() => assessScan({ status: 0 }, [], [])).not.toThrow();
    expect(() =>
      assessScan(
        { status: 1 },
        [{ RuleID: 'fixture-value' }],
        ['fixture-value']
      )
    ).not.toThrow();
    expect(() =>
      assessScan(
        { status: 1 },
        [{ RuleID: 'fixture-value' }, { RuleID: 'fixture-value' }],
        ['fixture-value']
      )
    ).toThrow();
  });
});
