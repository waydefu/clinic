import { describe, expect, it } from 'vitest';

import { REQUIRED_PROJECT_ID } from './calendar-pilot-fault-trials.mjs';
import { createPorts } from './calendar-pilot-live-ports.mjs';

const calendarId =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef@group.calendar.google.com';
const appointment = {
  appointmentId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  status: 'confirmed',
  patientCode: 'A01',
  bookingKind: 'initial',
  serviceId: 'service_snoring',
  startsAt: '2026-11-23T01:00:00.000Z',
  endsAt: '2026-11-23T01:30:00.000Z'
};
const fakeFirestore = (docs) => ({
  collection: (name) => ({
    doc: (id) => ({
      get: () => {
        const data = docs[`${name}/${id}`];
        return Promise.resolve({
          exists: data !== undefined,
          data: () => data
        });
      }
    })
  })
});
let calendarSummary = 'CAL-PILOT synthetic';
const make = (extra = {}) => {
  const commands = [];
  const urls = [];
  const ports = createPorts({
    calendarId,
    projectId: REQUIRED_PROJECT_ID,
    wait: () => Promise.resolve(),
    run: (argv) => {
      commands.push(argv);
      return Promise.resolve('tok');
    },
    fetchImpl: (url) => {
      if (!url.includes('/events'))
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ summary: calendarSummary })
        });
      urls.push(url);
      const first = !url.includes('pageToken');
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve(
            first
              ? {
                  items: [
                    {
                      id: 'e1',
                      status: 'confirmed',
                      summary: 's',
                      start: { dateTime: '2026-11-23T09:00:00+08:00' },
                      end: { dateTime: '2026-11-23T09:30:00+08:00' }
                    }
                  ],
                  nextPageToken: 'p2'
                }
              : { items: [] }
          )
      });
    },
    firestore: fakeFirestore({
      'calendar_pilot_appointments/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa':
        appointment,
      'calendar_pilot_configuration/active': {
        lastSuccessfulSyncAt: '2026-11-22T10:00:00.000Z'
      }
    }),
    ...extra
  });
  return { ports, commands, urls };
};

describe('calendar pilot live ports', () => {
  it('refuses another project or a malformed calendar id', async () => {
    await expect(
      createPorts({ calendarId, projectId: 'beauessence-clinic-staging' })
    ).rejects.toThrow('authorised');
    await expect(
      createPorts({ calendarId: 'primary', projectId: REQUIRED_PROJECT_ID })
    ).rejects.toThrow('group calendar');
  });

  it('reads the scan marker and the expected event from Firestore', async () => {
    const { ports } = make();
    const live = await ports;
    expect(await live.readScanMarker()).toBe('2026-11-22T10:00:00.000Z');
    const expected = await live.readExpected(
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    );
    expect(expected).toMatchObject({
      linkId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      status: 'confirmed',
      startsAt: '2026-11-23T01:00:00.000Z',
      endsAt: '2026-11-23T01:30:00.000Z'
    });
    expect(expected.id).toMatch(/^calpilot[a-f0-9]{40}$/u);
    expect(
      await live.readExpected('dddddddddddddddddddddddddddddddd')
    ).toBeUndefined();
    await expect(live.readExpected('real_1')).rejects.toThrow();
  });

  it('lists every Calendar page with UTC times and only for the env calendar', async () => {
    const { ports, urls, commands } = make();
    const live = await ports;
    const events = await live.listEvents(
      calendarId,
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    );
    expect(events).toEqual([
      {
        id: 'e1',
        linkId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        status: 'confirmed',
        title: 's',
        startsAt: '2026-11-23T01:00:00.000Z',
        endsAt: '2026-11-23T01:30:00.000Z'
      }
    ]);
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain(
      'beauessenceLinkId%3Daaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    );
    expect(commands).toEqual([
      ['auth', 'application-default', 'print-access-token']
    ]);
    await expect(
      live.listEvents(
        'other@group.calendar.google.com',
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      )
    ).rejects.toThrow();
  });

  it('refuses a calendar whose name is not CAL-PILOT, accepts one that is', async () => {
    calendarSummary = 'Clinic main';
    try {
      const live = await make().ports;
      await expect(live.assertAuthorisedCalendar()).rejects.toThrow(
        'CAL-PILOT'
      );
      await expect(
        live.listEvents(calendarId, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
      ).rejects.toThrow('CAL-PILOT');
    } finally {
      calendarSummary = 'CAL-PILOT synthetic';
    }
    const ok = await make().ports;
    await expect(ok.assertAuthorisedCalendar()).resolves.toBeUndefined();
  });

  it('refuses an appointment without a synthetic patient code', async () => {
    const id = 'f'.repeat(32);
    const live = await make({
      firestore: fakeFirestore({
        [`calendar_pilot_appointments/${id}`]: {
          ...appointment,
          appointmentId: id,
          patientCode: 'REAL-001'
        }
      })
    }).ports;
    await expect(live.readExpected(id)).rejects.toThrow('synthetic');
  });

  it('triggers one scan as resume, run, pause and always pauses again', async () => {
    const ok = make();
    await (await ok.ports).triggerScan();
    expect(ok.commands.map((argv) => argv[2])).toEqual([
      'resume',
      'run',
      'pause'
    ]);
    for (const argv of ok.commands)
      expect(argv).toEqual(
        expect.arrayContaining([
          'internal-test-calendar-sync',
          '--project',
          REQUIRED_PROJECT_ID,
          '--location',
          'asia-east1'
        ])
      );
    const verbs = [];
    const failing = make({
      run: (argv) => {
        verbs.push(argv[2]);
        return argv[2] === 'run'
          ? Promise.reject(new Error('x'))
          : Promise.resolve('');
      }
    });
    await expect((await failing.ports).triggerScan()).rejects.toThrow();
    expect(verbs).toEqual(['resume', 'run', 'pause']);
  });
});
