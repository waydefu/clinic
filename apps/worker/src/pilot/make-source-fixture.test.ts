import { describe, expect, it } from 'vitest';

import {
  buildSourceFixtureEvents,
  parseSourceFixtureCliArgs,
  renderSourceFixtureIcs
} from './make-source-fixture.js';

describe('CAL-PILOT configurable source fixture (D-32)', () => {
  it('reproduces identical ICS for fixed anchor and timestamp', () => {
    const config = {
      anchorDate: '2030-01-02',
      generatedAt: '2030-01-01T00:00:00Z'
    };
    const first = renderSourceFixtureIcs(config);
    const second = renderSourceFixtureIcs(config);
    expect(first).toBe(second);
    expect(first).toContain('DTSTAMP:20300101T000000Z');
    expect(first).toContain('DTSTART:20300102T040000Z');
    expect(first).toContain('DTEND:20300102T043000Z');
  });

  it('configures duration, daily counts, labels and edge cases', () => {
    const config = {
      anchorDate: '2030-01-02',
      defaultDurationMinutes: 45,
      weekdayCounts: [1, 1, 0] as const,
      saturdayCount: 1,
      syntheticNames: ['合成甲'],
      syntheticItems: ['評估'],
      includeEdgeCases: false
    };
    const events = buildSourceFixtureEvents(config);
    expect(events).toHaveLength(3);
    expect(events.map((event) => event.summary)).toEqual([
      '合成甲 評估',
      '合成甲 評估',
      '合成甲 評估'
    ]);
    for (const event of events) {
      expect(event.end).toBeDefined();
      const minutes =
        ((event.end?.getTime() ?? 0) - event.start.getTime()) / 60_000;
      expect(minutes).toBe(45);
    }
  });

  it('includes intentional edge cases by default', () => {
    const events = buildSourceFixtureEvents({
      anchorDate: '2030-01-02',
      weekdayCounts: [0, 0, 0],
      saturdayCount: 0
    });
    expect(events).toHaveLength(5);
    expect(events.some((event) => event.allDayStart !== undefined)).toBe(true);
  });

  it('fails closed on invalid dates, bounds and PII-like labels', () => {
    for (const badConfig of [
      { anchorDate: '2030-02-30' },
      { anchorDate: 'not-a-date' },
      { generatedAt: '2030-01-02T12:00:00+08:00' },
      { defaultDurationMinutes: 10 },
      { defaultDurationMinutes: 241 },
      { defaultDurationMinutes: 30.5 },
      { weekdayCounts: [-1, 0, 0] as const },
      { saturdayCount: 33 },
      { syntheticNames: [] },
      { syntheticNames: ['   '] },
      { syntheticItems: [] },
      { syntheticNames: ['0912345678'] },
      { syntheticNames: ['user@example.com'] },
      { syntheticNames: ['A123456789'] }
    ]) {
      expect(() => buildSourceFixtureEvents(badConfig)).toThrow();
    }
  });

  it('parses valid CLI args and rejects unknown or incomplete flags', () => {
    expect(
      parseSourceFixtureCliArgs([
        '--anchor-date',
        '2030-01-02',
        '--duration-minutes',
        '60',
        '--saturday-count',
        '2',
        '--generated-at',
        '2030-01-01T00:00:00Z',
        '--no-edge-cases'
      ])
    ).toEqual({
      anchorDate: '2030-01-02',
      defaultDurationMinutes: 60,
      saturdayCount: 2,
      generatedAt: '2030-01-01T00:00:00Z',
      includeEdgeCases: false
    });
    for (const badArgs of [
      ['--unknown'],
      ['--anchor-date'],
      ['--duration-minutes', 'abc']
    ]) {
      expect(() => parseSourceFixtureCliArgs(badArgs)).toThrow();
    }
  });
});
