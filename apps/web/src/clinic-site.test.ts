import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BOOKING_PATH,
  CLINIC,
  CLINIC_ROUTES,
  DOCTORS,
  HOME_DOCTOR_PROFILES,
  HOME_FAQS,
  HOME_PAGE,
  HOME_PROCESS_ITEMS,
  HOME_SYMPTOMS,
  NASAL_SERVICES,
  NAVIGATION,
  SNORING_SELF_TRACKING
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
      const source = new URL(service.sourceUrl);
      expect(source.protocol).toBe('https:');
      expect(source.host).toBe('beauessence.com.tw');
    }
  });

  it('keeps homepage copy data-driven and limited to nasal and sleep care', () => {
    const serviceSlugs = new Set(NASAL_SERVICES.map((service) => service.slug));
    const doctorSlugs = new Set(DOCTORS.map((doctor) => doctor.slug));

    expect(HOME_SYMPTOMS).toHaveLength(5);
    expect(HOME_PROCESS_ITEMS).toHaveLength(4);
    expect(HOME_FAQS).toHaveLength(4);
    for (const symptom of HOME_SYMPTOMS) {
      expect(serviceSlugs.has(symptom.slug)).toBe(true);
    }
    for (const profile of HOME_DOCTOR_PROFILES) {
      expect(doctorSlugs.has(profile.slug)).toBe(true);
    }

    const homepageCopy = JSON.stringify({
      HOME_PAGE,
      HOME_SYMPTOMS,
      HOME_PROCESS_ITEMS,
      HOME_DOCTOR_PROFILES,
      HOME_FAQS,
      SNORING_SELF_TRACKING
    });
    expect(homepageCopy).not.toMatch(
      /醫美|微整|整形美容|隆鼻|抽脂|玻尿酸|肉毒|雷射/u
    );
  });

  // C3（業主 2026-07-27）：首頁與止鼾頁放 SnoreLab 的官方入口。
  //
  // 這三個網址是當天從 snorelab.com 首頁的下載按鈕讀出來的實際 href，不是依商店
  // 網址格式拼湊的，並於 2026-08-10 加入首頁時重新開啟三頁確認。拼錯一個字母不會
  // 有任何錯誤訊息——只會把患者送到別人的 App，所以主機名單寫死在測試裡，改網址
  // 就必須同時改這裡並重新確認一次來源。
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
    expect(resources).toBe(SNORING_SELF_TRACKING);
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

  it('keeps SEO metadata route-specific without enabling preview indexing', () => {
    const shell = repoFile('apps/web/public/clinic.html');
    const renderer = repoFile('apps/web/public/clinic-site.js');

    expect(shell).toContain('name="robots" content="noindex, nofollow"');
    expect(renderer).toContain("'og:title'");
    expect(renderer).toContain("'twitter:card'");
    expect(shell).toContain('"@type": "MedicalClinic"');
    expect(shell).toContain('"@type": "OpeningHoursSpecification"');
    expect(renderer).toContain('link[rel="canonical"]');
  });

  it('keeps static structured clinic data aligned with the content model', () => {
    const shell = repoFile('apps/web/public/clinic.html');
    const match = shell.match(
      /<script id="clinic-structured-data" type="application\/ld\+json">([\s\S]*?)<\/script>/u
    );
    expect(match).not.toBeNull();

    const structured = JSON.parse(match?.[1] ?? '{}');
    expect(structured).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'MedicalClinic',
      name: CLINIC.name,
      alternateName: CLINIC.englishName,
      telephone: CLINIC.phoneHref.replace('tel:', ''),
      address: {
        '@type': 'PostalAddress',
        ...CLINIC.addressStructured
      },
      sameAs: CLINIC.socialLinks.map((item) => item.href)
    });
    expect(structured.openingHoursSpecification).toHaveLength(2);
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
