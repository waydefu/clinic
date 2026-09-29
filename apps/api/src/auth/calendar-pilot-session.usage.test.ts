import { describe, expect, it } from 'vitest';

import { actorRefForUid } from '../business-delivery/usage-events.js';
import { CalendarPilotSessionService } from './calendar-pilot-session.js';

const NOW = '2030-10-01T01:00:00.000Z';
const EMAIL = 'usage.pilot@example.com';
const MAINTENANCE_EMAIL = 'maintenance.pilot@example.com';
const UID = 'uid_usage_fixture_001';
const ID_TOKEN = 'id_token_usage_fixture';
const COOKIE = 'session_cookie_usage_fixture';

type Write = { readonly path: string; readonly data: Record<string, unknown> };

/** Minimal transactional fake: writes become visible only on commit. */
function fakeDb(options: { existing?: string[]; failCommit?: boolean } = {}) {
  const stored = new Map<string, Record<string, unknown>>();
  for (const path of options.existing ?? [])
    stored.set(path, { existing: true });
  const plainCreates: string[] = [];
  const db = {
    stored,
    plainCreates,
    collection(name: string) {
      return {
        doc(id: string) {
          const path = `${name}/${id}`;
          return {
            path,
            create(data: Record<string, unknown>) {
              plainCreates.push(path);
              stored.set(path, data);
              return Promise.resolve();
            }
          };
        }
      };
    },
    async runTransaction(
      body: (transaction: {
        get(ref: { path: string }): Promise<{ exists: boolean }>;
        create(ref: { path: string }, data: Record<string, unknown>): void;
      }) => Promise<void>
    ) {
      const pending: Write[] = [];
      await body({
        get: (ref) => Promise.resolve({ exists: stored.has(ref.path) }),
        create: (ref, data) => {
          pending.push({ path: ref.path, data });
        }
      });
      if (options.failCommit === true) throw new Error('commit failed');
      for (const write of pending) {
        if (stored.has(write.path)) throw new Error('already exists');
        stored.set(write.path, write.data);
      }
    }
  };
  return db;
}

function fakeAuth(email: string) {
  return {
    verifyIdToken: () =>
      Promise.resolve({
        uid: UID,
        email,
        email_verified: true,
        firebase: { sign_in_second_factor: 'totp' }
      }),
    getUser: () => Promise.resolve({ disabled: false }),
    createSessionCookie: () => Promise.resolve(COOKIE)
  };
}

const ENVIRONMENT = {
  CALENDAR_PILOT_MANAGER_EMAILS: `${EMAIL},${MAINTENANCE_EMAIL}`,
  CALENDAR_PILOT_FRONT_DESK_EMAILS: '',
  BUSINESS_DELIVERY_MAINTENANCE_EMAILS: MAINTENANCE_EMAIL
} as NodeJS.ProcessEnv;

function service(
  db: ReturnType<typeof fakeDb>,
  email = EMAIL,
  record = true
): CalendarPilotSessionService {
  return new CalendarPilotSessionService(
    fakeAuth(email) as never,
    db as never,
    ENVIRONMENT,
    undefined,
    record
  );
}

function usageEvents(db: ReturnType<typeof fakeDb>) {
  return [...db.stored.entries()].filter(([path]) =>
    path.startsWith('bd_usage_events/')
  );
}

describe('CalendarPilotSessionService usage ingress', () => {
  it('keeps the single session create when ingress is off', async () => {
    const db = fakeDb();
    await service(db, EMAIL, false).create(ID_TOKEN, NOW);
    expect(db.plainCreates).toHaveLength(1);
    expect(db.plainCreates[0]).toMatch(/^calendar_pilot_sessions\//);
    expect(usageEvents(db)).toEqual([]);
  });

  it('commits session, staff_login event and trial start together', async () => {
    const db = fakeDb();
    await service(db).create(ID_TOKEN, NOW);
    expect(db.plainCreates).toEqual([]);
    const events = usageEvents(db);
    expect(events).toHaveLength(1);
    const [, event] = events[0]!;
    expect(event).toEqual({
      schemaVersion: 1,
      eventId: expect.stringMatching(/^sl_[a-f0-9]{32}$/),
      kind: 'staff_login',
      eventClass: 'runtime',
      occurredAt: NOW,
      actorRef: actorRefForUid(UID)
    });
    expect(db.stored.get('bd_milestones/first_eligible_use')).toEqual({
      schemaVersion: 1,
      occurredAt: NOW,
      eventId: event['eventId']
    });
    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain(UID);
    expect(serialized).not.toContain(EMAIL);
  });

  it('never moves an existing trial start', async () => {
    const db = fakeDb({ existing: ['bd_milestones/first_eligible_use'] });
    await service(db).create(ID_TOKEN, NOW);
    expect(db.stored.get('bd_milestones/first_eligible_use')).toEqual({
      existing: true
    });
    expect(usageEvents(db)).toHaveLength(1);
  });

  it('classifies a maintenance account and does not let it start the trial', async () => {
    const db = fakeDb();
    await service(db, MAINTENANCE_EMAIL).create(ID_TOKEN, NOW);
    const [, event] = usageEvents(db)[0]!;
    expect(event['eventClass']).toBe('maintenance');
    expect(db.stored.has('bd_milestones/first_eligible_use')).toBe(false);
  });

  it('writes nothing when the transaction fails', async () => {
    const db = fakeDb({ failCommit: true });
    await expect(service(db).create(ID_TOKEN, NOW)).rejects.toThrow(
      'commit failed'
    );
    expect(db.stored.size).toBe(0);
  });
});
