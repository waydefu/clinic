#!/usr/bin/env node
/**
 * 網站稽核：抓「不跑 JS 的原始 HTML」與回應標頭（研究工具，不是 gate）。
 *
 *   node scripts/site-audit/page-snapshot.mjs <url>... [--out FILE]
 *
 * 搜尋引擎與社群分享預覽多半不執行 JS，所以 SEO 只看原始 HTML：標題、描述、
 * canonical、og、結構化資料、h1 與 <main> 裡有沒有正文。同時記下轉址與安全標頭。
 * 評分方式見 docs/design/site-audit-rubric.md 的 A 與 G。
 */
import { writeFileSync } from 'node:fs';
import process from 'node:process';

export const SECURITY_HEADERS = [
  'content-security-policy',
  'strict-transport-security',
  'x-frame-options',
  'x-content-type-options',
  'referrer-policy',
  'permissions-policy',
  'cross-origin-opener-policy',
  'x-robots-tag'
];

const ENTITIES = {
  amp: '&',
  quot: '"',
  apos: "'",
  lt: '<',
  gt: '>',
  nbsp: ' '
};

function decode(text) {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, code) => {
    if (code[0] !== '#') return ENTITIES[code.toLowerCase()] ?? whole;
    return String.fromCodePoint(
      code[1].toLowerCase() === 'x'
        ? parseInt(code.slice(2), 16)
        : parseInt(code.slice(1), 10)
    );
  });
}

function textOf(html) {
  return decode(
    html
      .replace(/<(script|style|template)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function attrs(tag) {
  const result = {};
  for (const m of tag.matchAll(
    /\s([a-z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi
  )) {
    result[m[1].toLowerCase()] = decode(m[2] ?? m[3]);
  }
  return result;
}

function jsonLdTypes(html) {
  const types = [];
  for (const m of html.matchAll(
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  )) {
    let data;
    try {
      data = JSON.parse(m[1]);
    } catch {
      types.push('INVALID_JSON');
      continue;
    }
    const nodes = [data, ...(data['@graph'] ?? [])].flat();
    for (const node of nodes) {
      if (node?.['@type']) types.push(...[node['@type']].flat());
    }
  }
  return types;
}

/** 從原始 HTML 抽出搜尋引擎與分享預覽看得到的欄位。 */
export function snapshotHtml(html) {
  const meta = {};
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrs(tag);
    const key = a.name ?? a.property;
    if (key && a.content !== undefined) meta[key.toLowerCase()] ??= a.content;
  }
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map(([tag]) =>
    attrs(tag)
  );
  const main = /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(html);
  const h1 = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) =>
    textOf(m[1])
  );
  const images = [...html.matchAll(/<img\b[^>]*>/gi)].map(([tag]) =>
    attrs(tag)
  );
  const ogImage = meta['og:image'] ?? null;
  return {
    lang: attrs(/<html\b[^>]*>/i.exec(html)?.[0] ?? '').lang ?? null,
    title:
      textOf(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '') ||
      null,
    description: meta.description ?? null,
    robots: meta.robots ?? null,
    canonical: links.find((l) => l.rel === 'canonical')?.href ?? null,
    ogTitle: meta['og:title'] ?? null,
    ogDescription: meta['og:description'] ?? null,
    ogImage,
    ogImageAbsolute: ogImage === null ? null : /^https?:\/\//i.test(ogImage),
    twitterCard: meta['twitter:card'] ?? null,
    jsonLdTypes: jsonLdTypes(html),
    h1,
    mainTextLength: main ? textOf(main[1]).length : 0,
    imagesWithoutAlt: images.filter((a) => a.alt === undefined).length,
    imagePreloads: links.filter((l) => l.rel === 'preload' && l.as === 'image')
      .length
  };
}

/** 安全標頭與 CSP 裡出現的外部來源（評 G 項「CSP 是否最小化」用）。 */
export function headerSnapshot(headers) {
  const present = Object.fromEntries(
    SECURITY_HEADERS.map((name) => [name, headers.get(name)])
  );
  const csp = present['content-security-policy'] ?? '';
  const cspSources = [
    ...new Set(
      csp
        .split(/[\s;]+/)
        .filter((token) =>
          /^(https?:|wss?:)?\/\/|^[\w*-]+(\.[\w-]+)+/.test(token)
        )
    )
  ].sort();
  return { headers: present, cspSources };
}

async function snapshotUrl(url) {
  const response = await fetch(url, { redirect: 'manual' });
  const html = response.status < 300 ? await response.text() : '';
  return {
    url,
    status: response.status,
    location: response.headers.get('location'),
    ...headerSnapshot(response.headers),
    html: snapshotHtml(html)
  };
}

async function main() {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf('--out');
  const out = outIndex === -1 ? null : args.splice(outIndex, 2)[1];
  if (args.length === 0) {
    console.error('用法：page-snapshot.mjs <url>... [--out FILE]');
    process.exitCode = 2;
    return;
  }
  const results = [];
  for (const url of args) results.push(await snapshotUrl(url));
  const json = `${JSON.stringify(results, null, 2)}\n`;
  if (out) writeFileSync(out, json);
  console.log(
    [
      '| 網址 | 狀態 | 標題 | 描述 | canonical | og 圖絕對網址 | JSON-LD | h1 數 | 正文字數 |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
      ...results.map(({ url, status, html: h }) =>
        [
          url,
          status,
          h.title ?? '—',
          h.description ? '有' : '—',
          h.canonical ? '有' : '—',
          h.ogImageAbsolute === null ? '—' : h.ogImageAbsolute ? '是' : '否',
          h.jsonLdTypes.join('、') || '—',
          h.h1.length,
          h.mainTextLength
        ].join(' | ')
      )
    ]
      .map((row) => (row.startsWith('|') ? row : `| ${row} |`))
      .join('\n')
  );
}

if (process.argv[1] && process.argv[1].endsWith('page-snapshot.mjs')) {
  await main();
}
