import { readFile, stat } from 'node:fs/promises';
import { glob } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import process from 'node:process';

// This project carries more governance documentation than code, and a stale
// cross-reference is as misleading as stale code. Two rules are enforced:
//   1. every relative markdown link resolves to a file that exists;
//   2. every document under docs/ is reachable from the canonical index,
//      so a new document cannot be added without registering it.
// It also keeps dated evidence and superseded material in their explicit index
// sections, and rejects a short list of facts that are known to be obsolete.

const INDEX = 'docs/README.md';
const failures = [];

const markdownFiles = [];
for await (const entry of glob('**/*.md', { cwd: process.cwd() })) {
  if (entry.includes('node_modules')) continue;
  markdownFiles.push(entry);
}

const linkPattern = /\[[^\]]*\]\(([^)\s]+)\)/g;

function linksIn(text) {
  return [...text.matchAll(linkPattern)]
    .map((match) => match[1])
    .filter((target) => !/^(https?:|mailto:|#)/.test(target))
    .map((target) => target.split('#')[0])
    .filter((target) => target !== '');
}

for (const file of markdownFiles) {
  const text = await readFile(file, 'utf8');
  for (const target of linksIn(text)) {
    const absolute = resolve(
      dirname(resolve(file)),
      decodeURIComponent(target)
    );
    try {
      await stat(absolute);
    } catch {
      failures.push(`Broken link in ${file}: ${target}`);
    }
  }
}

const indexText = await readFile(INDEX, 'utf8');
const indexed = new Set(
  linksIn(indexText).map((target) =>
    relative(process.cwd(), resolve(dirname(resolve(INDEX)), target))
      .split(sep)
      .join('/')
  )
);

for (const file of markdownFiles) {
  const normalised = file.split(sep).join('/');
  if (!normalised.startsWith('docs/')) continue;
  if (normalised === INDEX) continue;
  if (!indexed.has(normalised)) {
    failures.push(`Document is not listed in ${INDEX}: ${normalised}`);
  }
}

function sectionText(markdown, heading) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start === -1) return '';
  const next = lines.findIndex(
    (line, index) => index > start && line.startsWith('## ')
  );
  return lines.slice(start + 1, next === -1 ? undefined : next).join('\n');
}

const reviewSection = sectionText(indexText, '7. Review record');
const supersededSection = sectionText(indexText, 'Superseded');
const pathsInSection = (section) =>
  new Set(
    linksIn(section).map((target) =>
      relative(process.cwd(), resolve(dirname(resolve(INDEX)), target))
        .split(sep)
        .join('/')
    )
  );
const indexedInReview = pathsInSection(reviewSection);
const indexedAsSuperseded = pathsInSection(supersededSection);

const liveReviewException = 'docs/reviews/phase-1-approval-gate.md';
for (const file of markdownFiles) {
  const normalised = file.split(sep).join('/');
  if (
    normalised.startsWith('docs/reviews/') &&
    normalised !== liveReviewException &&
    !indexedInReview.has(normalised)
  ) {
    failures.push(
      `Dated review is not listed in the Review record section: ${normalised}`
    );
  }
  if (
    normalised.startsWith('docs/archive/') &&
    !indexedAsSuperseded.has(normalised)
  ) {
    failures.push(
      `Archived document is not listed in the Superseded section: ${normalised}`
    );
  }
}

const staleClaims = [
  [
    'docs/architecture/web-quality-gates-2026-07-24.md',
    /目前沒有 git\s+remote/,
    'the repository now has a Git remote'
  ],
  [
    'docs/runbooks/synthetic-online-preview.md',
    /check-test-only-ui-v2\.mjs/,
    'the active UI guard is scripts/check-web-ui.mjs'
  ],
  [
    'docs/runbooks/synthetic-online-preview.md',
    /Cache-Control:\s*no-store/,
    'Firebase Hosting currently serves stable HTML with no-cache'
  ],
  [
    'scripts/build-web.mjs',
    /Cache-Control:\s*no-store/,
    'build comments must match the no-cache Hosting policy'
  ],
  [
    'docs/architecture/web-quality-gates-2026-07-24.md',
    /CSP 是 `script-src 'self'`，產物必須維持/,
    'CSP does not require a multi-file unbundled module graph'
  ]
];

for (const [file, pattern, correction] of staleClaims) {
  const text = await readFile(file, 'utf8');
  if (pattern.test(text)) {
    failures.push(`Stale claim in ${file}: ${correction}`);
  }
}

if (failures.length > 0) {
  console.error('Documentation check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `Documentation check passed (${markdownFiles.length} files, links/index/lifecycle checks passed).`
  );
}
