import { describe, expect, it } from 'vitest';

import { REQUIRED_PROJECT_ID } from './calendar-pilot-fault-trials.mjs';
import { createPorts } from './calendar-pilot-live-ports.mjs';

const calendarId = 'synthetic-trials-1@group.calendar.google.com';
const appointment = {
  appointmentId: 'synthetic_a',
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
      'calendar_pilot_appointments/synthetic_a': appointment,
      'calendar_pilot_configuration/active': {
        lastSuccessfulSyncAt: '2026-11-22T10:00:00.000Z'
      }
    }),
    ...extra
  });
  return { ports, commands, urls };
};

describe('calendar pilot live ports', () => {
  it('refuses another project or a non-synthetic calendar', async () => {
    await expect(
      createPorts({ calendarId, projectId: 'beauessence-clinic-staging' })
    ).rejects.toThrow('authorised');
    await expect(
      createPorts({ calendarId: 'primary', projectId: REQUIRED_PROJECT_ID })
    ).rejects.toThrow('synthetic');
  });

  it('reads the scan marker and the expected event from Firestore', async () => {
    const { ports } = make();
    const live = await ports;
    expect(await live.readScanMarker()).toBe('2026-11-22T10:00:00.000Z');
    const expected = await live.readExpected('synthetic_a');
    expect(expected).toMatchObject({
      linkId: 'synthetic_a',
      status: 'confirmed',
      startsAt: '2026-11-23T01:00:00.000Z',
      endsAt: '2026-11-23T01:30:00.000Z'
    });
    expect(expected.id).toMatch(/^calpilot[a-f0-9]{40}$/u);
    expect(await live.readExpected('synthetic_missing')).toBeUndefined();
    await expect(live.readExpected('real_1')).rejects.toThrow();
  });

  it('lists every Calendar page with UTC times and only for the env calendar', async () => {
    const { ports, urls, commands } = make();
    const live = await ports;
    const events = await live.listEvents(calendarId, 'synthetic_a');
    expect(events).toEqual([
      {
        id: 'e1',
        linkId: 'synthetic_a',
        status: 'confirmed',
        title: 's',
        startsAt: '2026-11-23T01:00:00.000Z',
        endsAt: '2026-11-23T01:30:00.000Z'
      }
    ]);
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain('beauessenceLinkId%3Dsynthetic_a');
    expect(commands).toEqual([
      ['auth', 'application-default', 'print-access-token']
    ]);
    await expect(
      live.listEvents('other@group.calendar.google.com', 'synthetic_a')
    ).rejects.toThrow();
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
