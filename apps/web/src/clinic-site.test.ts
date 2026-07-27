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

  // C3（業主 2026-07-27）：止鼾頁放 SnoreLab 的官方入口。
  //
  // 這三個網址是當天從 snorelab.com 首頁的下載按鈕讀出來的實際 href，不是依商店
  // 網址格式拼湊的。拼錯一個字母不會有任何錯誤訊息——只會把患者送到別人的 App，
  // 所以主機名單寫死在測試裡，改網址就必須同時改這裡並重新確認一次來源。
  type ServiceResources = {
    links?: { label: string; href: string }[];
    paragraphs?: string[];
  };
  const resourcesOf = (service: unknown): ServiceResources | undefined =>
    (service as { resources?: ServiceResources }).resources;

  it('only sends snoring visitors to SnoreLab’s own official entry points', () => {
    const snoring = NASAL_SERVICES.find(
      (service) => service.slug === 'snoring-five-in-one'
    );
    const resources = resourcesOf(snoring);
    expect(resources?.links).toHaveLength(3);

    const officialHosts = [
      'www.snorelab.com',
      'apps.apple.com',
      'play.google.com'
    ];
    for (const item of resources?.links ?? []) {
      const url = new URL(item.href);
      expect(url.protocol).toBe('https:');
      expect(officialHosts).toContain(url.host);
    }

    // 第三方工具不得被寫成診所的服務或診斷依據。少了這兩句，一個自我記錄的
    // App 會被讀成診所推薦的醫療器材。
    const prose = (resources?.paragraphs ?? []).join('');
    expect(prose).toContain('並非本診所');
    expect(prose).toContain('不是診斷工具');
  });

  it('opens outbound links without leaking the referrer or the opener', () => {
    const renderer = repoFile('apps/web/public/clinic-site.js');
    expect(renderer).toContain("target: '_blank'");
    expect(renderer).toContain("rel: 'noopener noreferrer'");
  });

  it('keeps every other clinic page free of outbound links', () => {
    const outbound = NASAL_SERVICES.filter(
      (service) => resourcesOf(service) !== undefined
    ).map((service) => service.slug);
    expect(outbound).toEqual(['snoring-five-in-one']);
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
