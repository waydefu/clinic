import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BOOKING_PATH,
  CLINIC_ROUTES,
  DOCTORS,
  NASAL_SERVICES,
  NAVIGATION
} from '../public/clinic-content.js';

const repoFile = (relativePath: string) =>
  readFileSync(
    fileURLToPath(new URL(`../../../${relativePath}`, import.meta.url)),
    'utf8'
  );

describe('clinic website scope', () => {
  it('publishes only the requested clinic, doctor and nasal-function routes', () => {
    expect(CLINIC_ROUTES).toEqual([
      '/clinic',
      '/clinic/doctors',
      '/clinic/doctors/yan-cheng-an',
      '/clinic/doctors/yang-sheng-feng',
      '/clinic/nasal/snoring-five-in-one',
      '/clinic/nasal/inferior-turbinate-surgery',
      '/clinic/nasal/septoplasty',
      '/clinic/nasal/snore-relief-mouthguard'
    ]);

    expect(CLINIC_ROUTES.join(' ')).not.toMatch(
      /surgery\/|injectable|aesthetic|微整形|整形手術/i
    );
  });

  it('keeps the doctor and nasal-service catalogue complete', () => {
    expect(DOCTORS).toHaveLength(2);
    expect(NASAL_SERVICES).toHaveLength(4);
    for (const service of NASAL_SERVICES) {
      expect(service.title).toBeTruthy();
      expect(service.intro.length).toBeGreaterThan(30);
      expect(service.sections.length).toBeGreaterThanOrEqual(3);
      expect(service.image).toMatch(/^\/clinic-assets\//);
    }
  });

  it('routes every conversion point to the existing synthetic booking flow', () => {
    expect(BOOKING_PATH).toBe('/booking');
    expect(NAVIGATION.some((item) => item.href === '/clinic')).toBe(true);

    const shell = repoFile('apps/web/public/clinic.html');
    const renderer = repoFile('apps/web/public/clinic-site.js');
    expect(shell).toContain('href="/booking"');
    expect(renderer).toContain('BOOKING_PATH');
    expect(renderer).not.toMatch(/<form|innerHTML/);
  });
});

describe('clinic route integration', () => {
  it('keeps Firebase Hosting and the local server aligned', () => {
    const firebase = JSON.parse(repoFile('firebase.json'));
    const rewrites = firebase.hosting.rewrites;
    expect(rewrites).toContainEqual({
      source: '/clinic',
      destination: '/clinic.html'
    });
    expect(rewrites).toContainEqual({
      source: '/clinic/**',
      destination: '/clinic.html'
    });

    const server = repoFile('apps/web/server.mjs');
    for (const route of CLINIC_ROUTES) {
      expect(server).toContain(`['${route}', 'clinic.html']`);
    }
  });

  it('links the booking page back into the clinic website and visual layer', () => {
    const patient = repoFile('apps/web/public/patient.html');
    expect(patient).toContain('href="/clinic"');
    expect(patient).toContain('href="/clinic/doctors"');
    expect(patient).toContain('href="/clinic-booking.css"');
    expect(patient).toContain('aria-current="page"');
  });
});
