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

// `**/*.md` does not match a dot-directory, so the agent harness under
// `.claude/` needs its own pass. Its rules and skills link into `docs/` and
// `scripts/`; without this the harness is the one place in the repository where
// renaming a document breaks a reference and no gate notices.
export const MARKDOWN_GLOBS = ['**/*.md', '.claude/**/*.md', '.agents/**/*.md'];

// `.claude/worktrees/<name>/` is another session's checkout of this same
// repository, carrying a full second copy of `docs/`. Scanning it would report
// another agent's tree as findings against this one — the same false red that
// `.prettierignore` records for 2026-08-02, where all 16 violations came from a
// parallel checkout.
export function isScannedMarkdown(file) {
  if (file.includes('node_modules')) return false;
  if (file.startsWith('playwright-report/')) return false;
  if (file.startsWith('test-results/')) return false;
  if (file.includes('/.terraform/') || file.startsWith('.terraform/'))
    return false;
  if (file.startsWith('.claude/worktrees/')) return false;
  return true;
}

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
  ],
  [
    'AGENTS.md',
    /Repository security posture — dated facts/,
    'dated security posture was relocated out of the boot kernel'
  ],
  [
    'AGENTS.md',
    /## Current commands/,
    'command cookbook belongs in README.md, not AGENTS.md'
  ],
  [
    'AGENTS.md',
    /every commit is a publication/,
    'publication safety is visibility-independent; see docs/state/conflicts.md'
  ],
  [
    'SECURITY.md',
    /Private Vulnerability Reporting is enabled/,
    'do not assert the remote PVR setting from a committed file'
  ],
  ['SECURITY.md', /mailto:/i, 'do not publish a personal security contact'],
  [
    'docs/roadmap.md',
    /已由 `DATA-R01\/02`、`ARC-R01` 補齊，PR #23/,
    'PR #23 did not close DATA-R01/02 or ARC-R01; those landed as T1-DATA-01 (#59), T1-DATA-02 (#60), T1-ARC-01 (#67)'
  ],
  [
    'docs/product/current-execution-and-approval-plan.md',
    /`DATA-R01`／`DATA-R02`／\s*`ARC-R01`／`WEB-P0-01\/02\/03` 不受此影響，仍各自待處理/,
    'DATA-R01/02 and ARC-R01 closed 2026-09-06 as T1-DATA-01 (#59), T1-DATA-02 (#60), T1-ARC-01 (#67); only WEB-P0 remains pending in that list'
  ],
  [
    'docs/architecture/firestore-local-baseline.md',
    /Until `DATA-R01` and `DATA-R02` pass/,
    'DATA-R01/02 closed 2026-09-06; keep the adapter unrouted, do not reopen the finding as current'
  ],
  [
    'docs/architecture/calendar-event-id.md',
    /仍有 `DATA-002` 缺口/,
    'DATA-R02 / T1-DATA-02 (#60) closed occurrence identity on 2026-09-06'
  ],
  [
    'docs/architecture/worker-runtime-and-reconciliation-plan-2026-07-24.md',
    /在 `ARC-R01` 完成[^。]*前不得多實例/,
    'ARC-R01 / T1-ARC-01 (#67) closed lease fencing on 2026-09-06; multi-instance cloud runners remain unauthorised'
  ],
  [
    'docs/product/phase-1-decision-register.md',
    /C2～C6 stay `not_granted`/,
    'PR #112 merged C1–C6 granted/completed on the isolated synthetic project; live machine status is stage-2-gate-status.json'
  ],
  [
    'docs/architecture/c0-engineering-recommendations.md',
    /C2～C6 仍 `not_granted`/,
    'PR #112 merged C1–C6 granted/completed; do not instruct agents to treat C2–C6 as not_granted'
  ],
  [
    'docs/roadmap.md',
    /C2～C6 仍 `not_granted`/,
    'PR #112 completed C1–C6 on isolated synthetic staging; live status is stage-2-gate-status.json'
  ],
  [
    'apps/api/README.md',
    /exposes only `GET \/v1\/health`|registers only the health controller/,
    'formal booking is unrouted; CAL-PILOT is a routed synthetic-only exception'
  ],
  [
    'apps/web/README.md',
    /目前只提供\s*`\/v1\/health`/,
    'do not describe the API as health-only; distinguish unrouted booking from CAL-PILOT'
  ],
  [
    'apps/api/unrouted-inventory.json',
    /只掛 \/v1\/health/,
    'unrouted inventory must not claim the API mounts only health'
  ],
  [
    '.cursor/environment.json',
    /Exposes only \/v1\/health/,
    'local API description must distinguish unrouted booking from CAL-PILOT'
  ],
  [
    'scripts/check-architecture.mjs',
    /只掛 \/v1\/health/,
    'architecture-gate comments must not claim the API mounts only health'
  ],
  [
    'docs/architecture/api-v1-contract.md',
    /only the health endpoint is routed|Only health is routed|\/v1\/health` remains the only route/,
    'contract nav must list health plus the CAL-PILOT exception; formal booking stays unrouted'
  ],
  [
    'docs/architecture/test-strategy.md',
    /只掛 `\/v1\/health`/,
    'no Cloud Functions is true; health-only API surface is not'
  ],
  [
    'docs/phase-0-local-development.md',
    /API skeleton with `GET \/v1\/health` only/,
    'Phase 0 history must not be restated as the current Stage 1 API surface'
  ],
  [
    'README.md',
    /still exposes only\s*`\/v1\/health`|The sole cloud exception is the recorded expiring static Hosting/,
    'README must distinguish unrouted booking, Hosting preview, and CAL-PILOT'
  ],
  [
    'AGENTS.md',
    /Calendar test projection before D-009\./,
    'Remain disabled must name production D-009/D-016 and the register CAL-PILOT exception'
  ],
  [
    'docs/phase-1-execution-plan.md',
    /The static Hosting preview is the sole recorded exception|no\s+Calendar connection exists/,
    'execution Canon must restate the register CAL-PILOT exception without expanding it'
  ],
  [
    'docs/product/current-execution-and-approval-plan.md',
    /真實病患、薪資、Calendar、社群訊息/,
    'current execution plan must not use an unqualified Calendar prohibition'
  ],
  [
    'docs/roadmap.md',
    /尚無 source-routed cloud backend、Authentication、\s*日曆連線/,
    'roadmap must not deny all Calendar connectivity; CAL-PILOT is a register exception'
  ],
  [
    'CONTRIBUTING.md',
    /是私有且唯一的專案權威來源/,
    'GC-001 retired Rule 1; waydefu/clinic is the public canonical record'
  ],
  [
    'AGENTS.md',
    /unretired Rule 1/,
    'GC-001 retired Rule 1; do not restate it as current'
  ],
  [
    'README.md',
    /This access-restricted repository remains/,
    'GC-001: the canonical repository remains public; do not describe it as access-restricted'
  ],
  [
    'docs/product/current-execution-and-approval-plan.md',
    /維持個人私有 repository/,
    'GC-001: canonical repo stays public on the personal account; org-transfer remains deferred'
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
  const discovered = new Set();
  for (const pattern of MARKDOWN_GLOBS)
    for await (const entry of glob(pattern, { cwd: process.cwd() }))
      discovered.add(entry.split(sep).join('/'));
  const markdownFiles = [...discovered].filter(isScannedMarkdown);

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
