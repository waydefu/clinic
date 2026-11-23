import { describe, expect, it } from 'vitest';

import { GoogleCalendarClient } from './google-calendar.js';
import { runCalendarSmoke } from './calendar-smoke.js';

interface RecordedCall {
  readonly method: string;
  readonly url: string;
  readonly body?: string;
}

function makeSmokePort(
  responder: (
    call: RecordedCall
  ) => Promise<{ readonly status: number; readonly body?: string }>
) {
  const calls: RecordedCall[] = [];
  const port = new GoogleCalendarClient({
    calendarId: 'synthetic-smoke-calendar@group.calendar.google.com',
    getAccessToken: () => Promise.resolve('synthetic-token'),
    fetchImpl: async (url, init) => {
      const recorded: RecordedCall = {
        method: init.method,
        url,
        ...(init.body === undefined ? {} : { body: init.body })
      };
      calls.push(recorded);
      const reply = await responder(recorded);
      return {
        status: reply.status,
        text: () => Promise.resolve(reply.body ?? '{}')
      };
    }
  });
  return { port, calls };
}

describe('runCalendarSmoke', () => {
  it('runs fresh create and cleanup with unique event IDs', async () => {
    const events = new Map<string, string>();
    const logs: string[] = [];
    const { port, calls } = makeSmokePort((call) => {
      if (call.method === 'POST') {
        const body = JSON.parse(call.body ?? '{}') as Record<string, string>;
        const id = body['id'] ?? '';
        if (events.has(id)) return Promise.resolve({ status: 409 });
        events.set(id, 'confirmed');
        return Promise.resolve({
          status: 201,
          body: JSON.stringify({ id, status: 'confirmed' })
        });
      }
      if (call.method === 'DELETE') {
        const id = call.url.split('/').pop() ?? '';
        events.delete(id);
        return Promise.resolve({ status: 204 });
      }
      return Promise.resolve({ status: 500 });
    });

    const first = await runCalendarSmoke({
      port,
      now: () => Date.parse('2026-11-23T00:00:00.000Z'),
      log: (line) => logs.push(line)
    });
    const second = await runCalendarSmoke({
      port,
      now: () => Date.parse('2026-11-23T00:05:00.000Z'),
      log: (line) => logs.push(line)
    });

    expect(first.eventId).not.toBe(second.eventId);
    expect(events.size).toBe(0);
    expect(calls.map((c) => c.method)).toEqual([
      'POST',
      'DELETE',
      'POST',
      'DELETE'
    ]);
    expect(logs.join('\n')).not.toContain('命中既有事件');
  });

  it('rejects 409 collision without patching an existing event', async () => {
    const { port, calls } = makeSmokePort(() =>
      Promise.resolve({ status: 409 })
    );

    await expect(
      runCalendarSmoke({
        port,
        runId: 'fixedcollision01',
        now: () => Date.parse('2026-11-23T00:00:00.000Z'),
        log: () => undefined
      })
    ).rejects.toThrow('409');

    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('POST');
  });

  it('rejects a cancelled remnant even on 200 response', async () => {
    const { port, calls } = makeSmokePort(() =>
      Promise.resolve({
        status: 200,
        body: JSON.stringify({ id: 'smoke', status: 'cancelled' })
      })
    );

    await expect(
      runCalendarSmoke({
        port,
        runId: 'cancelledremnant01',
        now: () => Date.parse('2026-11-23T00:00:00.000Z'),
        log: () => undefined
      })
    ).rejects.toThrow('non-confirmed');

    expect(calls).toHaveLength(1);
  });

  it('fails closed when Calendar integration falls back in-memory', async () => {
    await expect(
      runCalendarSmoke({ env: {}, log: () => undefined })
    ).rejects.toThrow('回退假日曆');
  });
});
