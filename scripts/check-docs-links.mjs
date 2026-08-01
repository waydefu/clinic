import { readFile, stat } from 'node:fs/promises';
import { glob } from 'node:fs/promises';
import { posix, resolve, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// This project carries more governance documentation than code, and a stale
// cross-reference is as misleading as stale code. Two rules are enforced:
//   1. every relative markdown link resolves to a file that exists;
//   2. every document under docs/ is reachable from the canonical index,
//      so a new document cannot be added without registering it.
// It also keeps dated evidence and superseded material in their explicit index
// sections, and rejects a short list of facts that are known to be obsolete.
//
// The rule evaluation below is pure and exported so it can be tested without a
// repository on disk. Only the I/O at the bottom touches the filesystem: a gate
// that cannot be exercised in isolation is a gate nobody can prove still works.

export const INDEX = 'docs/README.md';

export const LIVE_REVIEW_EXCEPTION = 'docs/reviews/phase-1-approval-gate.md';

export const STALE_CLAIMS = [
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

const linkPattern = /\[[^\]]*\]\(([^)\s]+)\)/g;

export function linksIn(text) {
  return [...text.matchAll(linkPattern)]
    .map((match) => match[1])
    .filter((target) => !/^(https?:|mailto:|#)/.test(target))
    .map((target) => target.split('#')[0])
    .filter((target) => target !== '');
}

export function sectionText(markdown, heading) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start === -1) return '';
  const next = lines.findIndex(
    (line, index) => index > start && line.startsWith('## ')
  );
  return lines.slice(start + 1, next === -1 ? undefined : next).join('\n');
}

// Resolve a link the way a reader would: relative to the file it appears in,
// then expressed back as a repository-relative path with forward slashes.
export function resolveLink(fromFile, target) {
  return posix.normalize(
    posix.join(posix.dirname(fromFile), decodeURIComponent(target))
  );
}

/**
 * @param documents Map of repository-relative markdown path to its text.
 *   Must include the index itself.
 * @param fileExists Predicate over repository-relative paths, used for link
 *   targets that are not markdown (scripts, JSON, images).
 * @param otherTexts Map of non-markdown path to text, for the stale-claim scan.
 */
export function reviewDocumentation({
  documents,
  fileExists,
  otherTexts = new Map(),
  indexPath = INDEX,
  staleClaims = STALE_CLAIMS,
  liveReviewException = LIVE_REVIEW_EXCEPTION
}) {
  const failures = [];
  const indexText = documents.get(indexPath) ?? '';

  for (const [file, text] of documents)
    for (const target of linksIn(text)) {
      const resolved = resolveLink(file, target);
      if (!fileExists(resolved))
        failures.push(`Broken link in ${file}: ${target}`);
    }

  const indexedPaths = (section) =>
    new Set(linksIn(section).map((target) => resolveLink(indexPath, target)));

  const indexed = indexedPaths(indexText);
  const indexedInReview = indexedPaths(
    sectionText(indexText, '7. Review record')
  );
  const indexedAsSuperseded = indexedPaths(
    sectionText(indexText, 'Superseded')
  );

  for (const file of documents.keys()) {
    if (!file.startsWith('docs/')) continue;
    if (file === indexPath) continue;
    if (!indexed.has(file))
      failures.push(`Document is not listed in ${indexPath}: ${file}`);

    if (
      file.startsWith('docs/reviews/') &&
      file !== liveReviewException &&
      !indexedInReview.has(file)
    )
      failures.push(
        `Dated review is not listed in the Review record section: ${file}`
      );

    if (file.startsWith('docs/archive/') && !indexedAsSuperseded.has(file))
      failures.push(
        `Archived document is not listed in the Superseded section: ${file}`
      );
  }

  for (const [file, pattern, correction] of staleClaims) {
    const text = documents.get(file) ?? otherTexts.get(file);
    if (text !== undefined && pattern.test(text))
      failures.push(`Stale claim in ${file}: ${correction}`);
  }

  return failures;
}

async function main() {
  const markdownFiles = [];
  for await (const entry of glob('**/*.md', { cwd: process.cwd() })) {
    if (entry.includes('node_modules')) continue;
    markdownFiles.push(entry.split(sep).join('/'));
  }

  const documents = new Map(
    await Promise.all(
      markdownFiles.map(async (file) => [file, await readFile(file, 'utf8')])
    )
  );

  const otherTexts = new Map(
    await Promise.all(
      staleClaimSources(documents).map(async (file) => [
        file,
        await readFile(file, 'utf8')
      ])
    )
  );

  // The link check must be able to see every file, not only markdown, because
  // documents legitimately link to scripts and configuration.
  const existence = new Map();
  const fileExists = (candidate) => {
    if (documents.has(candidate)) return true;
    return existence.get(candidate) === true;
  };
  const candidates = new Set();
  for (const [file, text] of documents)
    for (const target of linksIn(text))
      candidates.add(resolveLink(file, target));
  await Promise.all(
    [...candidates].map(async (candidate) => {
      if (documents.has(candidate)) return;
      try {
        await stat(resolve(process.cwd(), candidate));
        existence.set(candidate, true);
      } catch {
        existence.set(candidate, false);
      }
    })
  );

  const failures = reviewDocumentation({ documents, fileExists, otherTexts });

  if (failures.length > 0) {
    console.error('Documentation check failed:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
  } else {
    console.log(
      `Documentation check passed (${markdownFiles.length} files, links/index/lifecycle checks passed).`
    );
  }
}

function staleClaimSources(documents) {
  return STALE_CLAIMS.map(([file]) => file).filter(
    (file) => !documents.has(file)
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
