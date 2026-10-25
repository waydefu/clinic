import { describe, expect, it } from 'vitest';

import { median, rate } from './lab-vitals.mjs';
import { headerSnapshot, snapshotHtml } from './page-snapshot.mjs';

describe('snapshotHtml', () => {
  const html = `<!doctype html><html lang="zh-Hant"><head>
    <title>醫師團隊｜測試診所</title>
    <meta content="介紹 &amp; 門診" name="description">
    <meta property="og:title" content="醫師團隊">
    <meta property="og:image" content="/og.jpg">
    <link rel="canonical" href="https://example.test/clinic/doctors">
    <link rel="preload" as="image" href="/hero.webp">
    <script type="application/ld+json">{"@graph":[{"@type":"MedicalClinic"},{"@type":["Physician","Person"]}]}</script>
    <script type="application/ld+json">{broken</script>
  </head><body><main><h1>醫師<br>團隊</h1><p>內容</p><script>ignored()</script>
    <img src="a.webp" alt=""><img src="b.webp"></main></body></html>`;
  const s = snapshotHtml(html);

  it('reads head fields regardless of attribute order and decodes entities', () => {
    expect(s).toMatchObject({
      lang: 'zh-Hant',
      title: '醫師團隊｜測試診所',
      description: '介紹 & 門診',
      canonical: 'https://example.test/clinic/doctors',
      ogTitle: '醫師團隊',
      ogImage: '/og.jpg',
      ogImageAbsolute: false,
      robots: null,
      imagePreloads: 1
    });
  });

  it('collects JSON-LD types from @graph and flags invalid blocks', () => {
    expect(s.jsonLdTypes).toEqual([
      'MedicalClinic',
      'Physician',
      'Person',
      'INVALID_JSON'
    ]);
  });

  it('counts visible main text and images without alt, ignoring scripts', () => {
    expect(s.h1).toEqual(['醫師 團隊']);
    expect(s.mainTextLength).toBe('醫師 團隊 內容'.length);
    expect(s.imagesWithoutAlt).toBe(1);
  });

  it('treats an empty shell as having no main text', () => {
    expect(snapshotHtml('<main id="app"></main>')).toMatchObject({
      title: null,
      mainTextLength: 0,
      h1: []
    });
  });
});

describe('headerSnapshot', () => {
  it('lists security headers and external CSP sources', () => {
    const headers = new Headers({
      'content-security-policy':
        "default-src 'self'; img-src 'self' data: https://tile.example.org; frame-src https://www.google.com",
      'x-frame-options': 'DENY'
    });
    const snap = headerSnapshot(headers);
    expect(snap.headers['x-frame-options']).toBe('DENY');
    expect(snap.headers['strict-transport-security']).toBeNull();
    expect(snap.cspSources).toEqual([
      'https://tile.example.org',
      'https://www.google.com'
    ]);
  });
});

describe('lab vitals helpers', () => {
  it('takes the median of finite samples only', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, null, 2, 3])).toBe(2.5);
    expect(median([null, undefined])).toBeNull();
  });

  it('rates against the web.dev boundaries', () => {
    expect(rate('lcp', 2500)).toBe('good');
    expect(rate('lcp', 2501)).toBe('needs-improvement');
    expect(rate('lcp', 4001)).toBe('poor');
    expect(rate('cls', 0.3)).toBe('poor');
    expect(rate('tbt', null)).toBe('unavailable');
  });
});
