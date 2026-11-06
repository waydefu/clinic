import { describe, expect, it, vi } from 'vitest';

import {
  runCalendarPilotFullScanRound,
  type CalendarPilotFullScanPort,
  type CalendarPilotFullScanState
} from './calendar-pilot-full-scan.js';

describe('calendar pilot full scan', () => {
  it('resumes both inventories without convergence evidence until the full scan finishes', async () => {
    let duplicateExists = true;
    const tokens: (string | undefined)[] = [];
    const apply = vi.fn(() => {
      duplicateExists = false;
      return Promise.resolve('changed' as const);
    });
    const port: CalendarPilotFullScanPort = {
      calendarPage: (_limit, pageToken) => {
        tokens.push(pageToken);
        return Promise.resolve(pageToken === undefined
          ? { events: [{ id: 'original', linkId: 'link_a', recurring: false }], nextPageToken: 'page-2' }
          : { events: duplicateExists ? [{ id: 'duplicate', linkId: 'link_a', recurring: false }] : [] });
      },
      firestorePage: () => Promise.resolve({ linkIds: ['link_a'] }),
      reconcileCalendarEvent: (event) => event.id === 'duplicate' ? apply() : Promise.resolve('no-op'),
      reconcileFirestoreLink: () => Promise.resolve('no-op')
    };
    const bounds = { scope: 'synthetic-source-v1', maxItems: 1, deadline: 10, now: () => 0 };
    let state: CalendarPilotFullScanState | undefined;
    let firstConverged = false;
    for (let i = 0; i < 10; i += 1) {
      const result = await runCalendarPilotFullScanRound(port, bounds, state);
      expect(result.processed).toBeLessThanOrEqual(1);
      if (result.state.phase !== 'complete') expect(result.converged).toBe(false);
      state = result.state;
      if (state.phase === 'complete') {
        firstConverged = result.converged;
        break;
      }
    }
    expect(state?.phase).toBe('complete');
    expect(firstConverged).toBe(false);
    expect(apply).toHaveBeenCalledTimes(1);
    state = undefined;
    let secondConverged = false;
    for (let i = 0; i < 10; i += 1) {
      const result = await runCalendarPilotFullScanRound(port, bounds, state);
      state = result.state;
      if (state.phase !== 'complete') expect(result.converged).toBe(false);
      if (state.phase === 'complete') {
        secondConverged = result.converged;
        break;
      }
    }
    expect(state?.phase).toBe('complete');
    expect(secondConverged).toBe(true);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(tokens).toEqual([undefined, 'page-2', undefined, 'page-2']);
  });

  it('keeps page size fixed across continuation requests', async () => {
    const limits: number[] = [];
    const port: CalendarPilotFullScanPort = {
      calendarPage: (limit, token) => {
        limits.push(limit);
        return Promise.resolve(token === undefined
          ? { events: [{ id: 'a', recurring: false }], nextPageToken: 'next' }
          : { events: [{ id: 'b', recurring: false }] });
      },
      firestorePage: () => Promise.resolve({ linkIds: [] }),
      reconcileCalendarEvent: () => Promise.resolve('no-op'),
      reconcileFirestoreLink: () => Promise.resolve('no-op')
    };
    const options = { scope: 'synthetic', maxItems: 2, deadline: 10, now: () => 0 };
    const first = await runCalendarPilotFullScanRound(port, options);
    expect(first.converged).toBe(false);
    await runCalendarPilotFullScanRound(port, options, first.state);
    expect(limits).toEqual([2, 2]);
  });

  it('does not fetch or report convergence after the round deadline', async () => {
    const calendarPage = vi.fn<CalendarPilotFullScanPort['calendarPage']>();
    const port: CalendarPilotFullScanPort = {
      calendarPage,
      firestorePage: () => Promise.resolve({ linkIds: [] }),
      reconcileCalendarEvent: () => Promise.resolve('no-op'),
      reconcileFirestoreLink: () => Promise.resolve('no-op')
    };
    const result = await runCalendarPilotFullScanRound(port, {
      scope: 'synthetic-source-v1', maxItems: 1, deadline: 0, now: () => 0
    });
    expect(result.converged).toBe(false);
    expect(result.processed).toBe(0);
    expect(result.state.phase).toBe('calendar');
    expect(calendarPage).not.toHaveBeenCalled();
  });

  it('fails closed on repeated page tokens and scope changes', async () => {
    const port: CalendarPilotFullScanPort = {
      calendarPage: (_limit, pageToken) => Promise.resolve({ events: [], nextPageToken: pageToken ?? 'same' }),
      firestorePage: () => Promise.resolve({ linkIds: [] }),
      reconcileCalendarEvent: () => Promise.resolve('no-op'),
      reconcileFirestoreLink: () => Promise.resolve('no-op')
    };
    const bounds = { scope: 'synthetic-source-v1', maxItems: 2, deadline: 10, now: () => 0 };
    const first = await runCalendarPilotFullScanRound(port, bounds);
    expect(first.converged).toBe(false);
    await expect(runCalendarPilotFullScanRound(port, bounds, first.state)).rejects.toThrow('page token');
    await expect(runCalendarPilotFullScanRound(port, { ...bounds, scope: 'another-source' }, {
      scope: bounds.scope, pageSize: bounds.maxItems, phase: 'calendar', pageLoaded: false, pending: [], clean: true
    })).rejects.toThrow('bounds or scope');
    await expect(runCalendarPilotFullScanRound(port, { ...bounds, maxItems: 1 }, first.state))
      .rejects.toThrow('bounds or scope');
  });
});
