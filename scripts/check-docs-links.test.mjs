import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  isScannedMarkdown,
  linksIn,
  MARKDOWN_GLOBS,
  resolveLink,
  reviewDocumentation,
  sectionText,
  STALE_CLAIMS
} from './check-docs-links.mjs';

const INDEX = 'docs/README.md';

function index({ body = '', review = '', superseded = '' } = {}) {
  return [
    '# Index',
    '',
    '## 1. Start here',
    '',
    body,
    '',
    '## 7. Review record',
    '',
    review,
    '',
    '## Superseded',
    '',
    superseded,
    ''
  ].join('\n');
}

function review({ documents, fileExists = () => true, otherTexts } = {}) {
  return reviewDocumentation({
    documents: new Map(documents),
    fileExists,
    otherTexts: otherTexts === undefined ? undefined : new Map(otherTexts)
  });
}

describe('markdown link extraction', () => {
  it('keeps relative targets and drops external ones', () => {
    expect(
      linksIn(
        '[a](./a.md) [b](https://example.com) [c](mailto:x@y.z) [d](#anchor) [e](../e.md#part)'
      )
    ).toEqual(['./a.md', '../e.md']);
  });

  it('ignores an empty target rather than resolving it to the directory', () => {
    expect(linksIn('[empty]() [real](x.md)')).toEqual(['x.md']);
  });

  it('resolves a link relative to the file that contains it', () => {
    expect(resolveLink('docs/product/plan.md', '../reviews/r.md')).toBe(
      'docs/reviews/r.md'
    );
    expect(resolveLink('docs/README.md', 'product/plan.md')).toBe(
      'docs/product/plan.md'
    );
    expect(resolveLink('README.md', 'docs/x.md')).toBe('docs/x.md');
  });

  it('decodes percent-encoded paths so a spaced filename still resolves', () => {
    expect(resolveLink('docs/README.md', 'a%20b.md')).toBe('docs/a b.md');
  });
});

describe('index section extraction', () => {
  const text = index({ review: '- [r](reviews/r.md)' });

  it('returns only the requested section', () => {
    expect(sectionText(text, '7. Review record')).toContain('reviews/r.md');
    expect(sectionText(text, '1. Start here')).not.toContain('reviews/r.md');
  });

  it('returns empty for a heading that does not exist', () => {
    expect(sectionText(text, 'Nope')).toBe('');
  });
});

describe('documentation gate', () => {
  it('passes a document that is linked and indexed', () => {
    const failures = review({
      documents: [
        [INDEX, index({ body: '- [plan](product/plan.md)' })],
        ['docs/product/plan.md', '# Plan']
      ]
    });

    expect(failures).toEqual([]);
  });

  // 這是本閘門存在的第一個理由：新增文件卻沒登記索引，就等於沒有人找得到它。
  it('blocks a document that exists but is not in the index', () => {
    const failures = review({
      documents: [
        [INDEX, index()],
        ['docs/product/orphan.md', '# Orphan']
      ]
    });

    expect(failures).toContain(
      'Document is not listed in docs/README.md: docs/product/orphan.md'
    );
  });

  it('blocks a link whose target does not exist', () => {
    const failures = review({
      documents: [
        [INDEX, index({ body: '- [plan](product/plan.md)' })],
        ['docs/product/plan.md', 'see [gone](./gone.md)']
      ],
      fileExists: (path) =>
        ['docs/README.md', 'docs/product/plan.md'].includes(path)
    });

    expect(failures).toContain(
      'Broken link in docs/product/plan.md: ./gone.md'
    );
  });

  it('accepts a link to a non-markdown file that exists', () => {
    const failures = review({
      documents: [
        [INDEX, index({ body: '- [plan](product/plan.md)' })],
        ['docs/product/plan.md', 'run [the gate](../../scripts/check.mjs)']
      ],
      fileExists: (path) =>
        path === 'scripts/check.mjs' ||
        ['docs/README.md', 'docs/product/plan.md'].includes(path)
    });

    expect(failures).toEqual([]);
  });

  it('requires a dated review to sit in the Review record section', () => {
    const listedOnlyInBody = review({
      documents: [
        [INDEX, index({ body: '- [r](reviews/r.md)' })],
        ['docs/reviews/r.md', '# Review']
      ]
    });

    expect(listedOnlyInBody).toContain(
      'Dated review is not listed in the Review record section: docs/reviews/r.md'
    );

    const listedInReviewSection = review({
      documents: [
        [INDEX, index({ review: '- [r](reviews/r.md)' })],
        ['docs/reviews/r.md', '# Review']
      ]
    });

    expect(listedInReviewSection).toEqual([]);
  });

  it('exempts the live approval gate from the dated-review rule', () => {
    const failures = review({
      documents: [
        [INDEX, index({ body: '- [gate](reviews/phase-1-approval-gate.md)' })],
        ['docs/reviews/phase-1-approval-gate.md', '# Live gate']
      ]
    });

    expect(failures).toEqual([]);
  });

  it('requires an archived document to sit in the Superseded section', () => {
    const failures = review({
      documents: [
        [INDEX, index({ body: '- [old](archive/old.md)' })],
        ['docs/archive/old.md', '# Old']
      ]
    });

    expect(failures).toContain(
      'Archived document is not listed in the Superseded section: docs/archive/old.md'
    );
  });

  it('does not demand an index entry for markdown outside docs/', () => {
    const failures = review({
      documents: [
        [INDEX, index()],
        ['README.md', '# Root'],
        ['AGENTS.md', '# Agents']
      ]
    });

    expect(failures).toEqual([]);
  });

  // 規則與 skill 會連到 docs/ 與 scripts/，但它們自己不必進索引。
  it('checks links in the agent harness without demanding an index entry', () => {
    const failures = review({
      documents: [
        [INDEX, index()],
        ['.claude/rules/web-ui.md', '[rules](../../docs/design/ui-ux-rules.md)']
      ],
      fileExists: (candidate) => candidate !== 'docs/design/ui-ux-rules.md'
    });

    expect(failures).toEqual([
      'Broken link in .claude/rules/web-ui.md: ../../docs/design/ui-ux-rules.md'
    ]);
  });

  // 過時宣稱的掃描目標可能是 docs/ 以外的檔案，例如建置腳本的註解。
  it('reports a stale claim found in a non-markdown source', () => {
    const failures = reviewDocumentation({
      documents: new Map([[INDEX, index()]]),
      fileExists: () => true,
      otherTexts: new Map([['scripts/build.mjs', 'Cache-Control: no-store']]),
      staleClaims: [
        ['scripts/build.mjs', /Cache-Control:\s*no-store/, 'policy is no-cache']
      ]
    });

    expect(failures).toEqual([
      'Stale claim in scripts/build.mjs: policy is no-cache'
    ]);
  });

  it('blocks retired AGENTS boot headings and the publication slogan', () => {
    const agents = STALE_CLAIMS.filter(([file]) => file === 'AGENTS.md');
    expect(agents.map(([, pattern]) => pattern.source).sort()).toEqual(
      [
        '## Current commands',
        'Calendar test projection before D-009\\.',
        'Repository security posture — dated facts',
        'every commit is a publication',
        'unretired Rule 1'
      ].sort()
    );
  });

  it('blocks current-facing claims that the canonical repository is private', () => {
    const contributing = STALE_CLAIMS.find(
      ([file]) => file === 'CONTRIBUTING.md'
    );
    expect(
      contributing?.[1].test('waydefu/clinic 是私有且唯一的專案權威來源。')
    ).toBe(true);
    expect(
      contributing?.[1].test(
        'waydefu/clinic 是正式公開且唯一的專案權威來源（GC-001'
      )
    ).toBe(false);

    const readme = STALE_CLAIMS.find(
      ([file, pattern]) =>
        file === 'README.md' &&
        pattern.source.includes('access-restricted repository remains')
    );
    expect(
      readme?.[1].test(
        'This access-restricted repository remains the canonical project record.'
      )
    ).toBe(true);

    const execution = STALE_CLAIMS.find(
      ([file, pattern]) =>
        file === 'docs/product/current-execution-and-approval-plan.md' &&
        pattern.source.includes('維持個人私有 repository')
    );
    expect(execution?.[1].test('維持個人私有 repository，未來再重評')).toBe(
      true
    );
  });

  it('blocks current-facing health-only API wording after CAL-PILOT routed', () => {
    const apiReadme = STALE_CLAIMS.find(
      ([file]) => file === 'apps/api/README.md'
    );
    expect(
      apiReadme?.[1].test(
        'The current Stage 1 build still exposes only `GET /v1/health`; it does not'
      )
    ).toBe(true);
    expect(
      apiReadme?.[1].test(
        'Formal booking routes remain unrouted. The Stage 1 `AppModule` registers'
      )
    ).toBe(false);

    const contract = STALE_CLAIMS.find(
      ([file]) => file === 'docs/architecture/api-v1-contract.md'
    );
    expect(contract?.[1].test('and only the health endpoint is routed.')).toBe(
      true
    );
    expect(
      contract?.[1].test(
        'Formal booking endpoints are **not** routed. `AppModule` registers'
      )
    ).toBe(false);
    const scheduleClaim = STALE_CLAIMS.find(
      ([file, pattern]) =>
        file === 'docs/architecture/api-v1-contract.md' &&
        pattern.source.includes('Schedule publish')
    );
    expect(
      scheduleClaim?.[1].test(
        'Schedule publish | x | y | Unrouted Stage 0 schema'
      )
    ).toBe(true);

    const execution = STALE_CLAIMS.find(
      ([file, pattern]) =>
        file === 'docs/product/current-execution-and-approval-plan.md' &&
        pattern.source.includes('真實病患、薪資、Calendar')
    );
    expect(
      execution?.[1].test('- 真實病患、薪資、Calendar、社群訊息或 NAS 資料；')
    ).toBe(true);
    expect(
      execution?.[1].test(
        '- 真實病患、薪資、**production** Calendar、社群訊息或 NAS 資料；'
      )
    ).toBe(false);
  });

  it('blocks attributing DATA-R01/02 and ARC-R01 completion to PR #23', () => {
    const roadmap = STALE_CLAIMS.filter(([file]) => file === 'docs/roadmap.md');
    expect(roadmap.length).toBeGreaterThanOrEqual(1);
    const pattern = roadmap.find(([, claim]) =>
      claim.source.includes('DATA-R01')
    )?.[1];
    expect(pattern).toBeDefined();
    expect(
      pattern.test(
        '缺口已由 `DATA-R01/02`、`ARC-R01` 補齊，PR #23 當前同 commit'
      )
    ).toBe(true);
    expect(pattern.test('PR #23 不是這三項的完成證據')).toBe(false);
  });

  it('blocks live Canon from telling agents C2–C6 are still not_granted', () => {
    const register = STALE_CLAIMS.find(
      ([file, pattern]) =>
        file === 'docs/product/phase-1-decision-register.md' &&
        pattern.source.includes('not_granted')
    );
    expect(
      register?.[1].test('C2～C6 stay `not_granted`. Named reviewer')
    ).toBe(true);
    expect(register?.[1].test('C1～C6 `deploymentAuthorities=granted`')).toBe(
      false
    );

    const recs = STALE_CLAIMS.find(
      ([file]) => file === 'docs/architecture/c0-engineering-recommendations.md'
    );
    expect(recs?.[1].test('C2～C6 仍 `not_granted`。具名')).toBe(true);

    const roadmap = STALE_CLAIMS.find(
      ([file, pattern]) =>
        file === 'docs/roadmap.md' && pattern.source.includes('not_granted')
    );
    expect(roadmap?.[1].test('C2～C6 仍 `not_granted`。見')).toBe(true);
  });

  it('blocks current-status docs from leaving DATA-R01/02 and ARC-R01 pending', () => {
    const execution = STALE_CLAIMS.find(
      ([file]) => file === 'docs/product/current-execution-and-approval-plan.md'
    );
    expect(
      execution?.[1].test(
        '`DATA-R01`／`DATA-R02`／\n`ARC-R01`／`WEB-P0-01/02/03` 不受此影響，仍各自待處理。'
      )
    ).toBe(true);
    expect(
      execution?.[1].test('`WEB-P0-01/02/03` 不受此影響，仍各自待處理。')
    ).toBe(false);

    const firestore = STALE_CLAIMS.find(
      ([file]) => file === 'docs/architecture/firestore-local-baseline.md'
    );
    expect(firestore?.[1].test('Until `DATA-R01` and `DATA-R02` pass')).toBe(
      true
    );

    const calendar = STALE_CLAIMS.find(
      ([file]) => file === 'docs/architecture/calendar-event-id.md'
    );
    expect(calendar?.[1].test('仍有 `DATA-002` 缺口')).toBe(true);

    const worker = STALE_CLAIMS.find(
      ([file]) =>
        file ===
        'docs/architecture/worker-runtime-and-reconciliation-plan-2026-07-24.md'
    );
    expect(
      worker?.[1].test(
        '在 `ARC-R01` 完成 owner/token/generation 與 conditional settle 前不得多實例'
      )
    ).toBe(true);
  });

  it('blocks SECURITY.md from asserting a live PVR setting or a mailto contact', () => {
    const security = STALE_CLAIMS.filter(([file]) => file === 'SECURITY.md');
    expect(security.map(([, pattern]) => pattern.source).sort()).toEqual(
      ['Private Vulnerability Reporting is enabled', 'mailto:'].sort()
    );
  });

  it('accepts wording that refuses to assert the remote PVR setting', () => {
    const failures = reviewDocumentation({
      documents: new Map([
        [INDEX, index()],
        [
          'SECURITY.md',
          [
            'The intended private intake is GitHub Private Vulnerability Reporting.',
            'Whether GitHub currently offers Private Vulnerability Reporting is a remote repository setting.',
            'This file cannot treat that setting as standing fact.'
          ].join('\n')
        ]
      ]),
      fileExists: () => true
    });
    expect(failures).toEqual([]);
  });

  it('rejects a SECURITY.md that asserts PVR is enabled or publishes mailto', () => {
    const enabled = reviewDocumentation({
      documents: new Map([
        [INDEX, index()],
        ['SECURITY.md', 'Private Vulnerability Reporting is enabled here.']
      ]),
      fileExists: () => true
    });
    expect(enabled).toEqual([
      'Stale claim in SECURITY.md: do not assert the remote PVR setting from a committed file'
    ]);

    const mailto = reviewDocumentation({
      documents: new Map([
        [INDEX, index()],
        ['SECURITY.md', 'Write to mailto:security@example.invalid']
      ]),
      fileExists: () => true
    });
    expect(mailto).toEqual([
      'Stale claim in SECURITY.md: do not publish a personal security contact'
    ]);
  });

  it('stays silent when a stale-claim source is absent rather than crashing', () => {
    const failures = reviewDocumentation({
      documents: new Map([[INDEX, index()]]),
      fileExists: () => true,
      staleClaims: [['scripts/missing.mjs', /anything/, 'unreachable']]
    });

    expect(failures).toEqual([]);
  });
});

// 檔案探索決定了「這道閘門看得見什麼」。看不見的檔案永遠是綠的，
// 而那和通過長得一模一樣，所以兩個方向都要斷言。
describe('which markdown the gate discovers', () => {
  it('scans the harness explicitly, because **/*.md skips dot-directories', () => {
    expect(MARKDOWN_GLOBS).toContain('.claude/**/*.md');
    expect(MARKDOWN_GLOBS).toContain('.agents/**/*.md');
    expect(isScannedMarkdown('.claude/rules/web-ui.md')).toBe(true);
    expect(isScannedMarkdown('.claude/skills/verify-gates/SKILL.md')).toBe(
      true
    );
    expect(isScannedMarkdown('docs/README.md')).toBe(true);
  });

  it('skips another session worktree, whose docs/ copy is not this tree', () => {
    expect(isScannedMarkdown('.claude/worktrees/topic/docs/README.md')).toBe(
      false
    );
    expect(isScannedMarkdown('.claude/worktrees/topic/AGENTS.md')).toBe(false);
  });

  it('skips dependencies', () => {
    expect(isScannedMarkdown('node_modules/pkg/README.md')).toBe(false);
  });

  it('skips Terraform provider cache documentation', () => {
    expect(
      isScannedMarkdown(
        'infra/terraform/cal-pilot/.terraform/providers/example/README.md'
      )
    ).toBe(false);
  });

  it('skips generated browser reports and failure attachments', () => {
    expect(isScannedMarkdown('playwright-report/data/trace/README.md')).toBe(
      false
    );
    expect(isScannedMarkdown('test-results/spec/error-context.md')).toBe(false);
  });
});

describe('Markdown parser boundaries for links and index registration', () => {
  it('does not treat fenced, indented or inline code as links', () => {
    expect(linksIn('~~~md\n[example](./missing.md)\n~~~')).toEqual([]);
    expect(linksIn('```md\n[example](./missing.md)\n```')).toEqual([]);
    expect(linksIn('    [example](./missing.md)')).toEqual([]);
    expect(linksIn('`[example](./missing.md)`')).toEqual([]);
    expect(linksIn('``a `[example](./missing.md)` b``')).toEqual([]);
  });

  it('extracts rendered destinations with titles and balanced parentheses', () => {
    expect(
      linksIn('[a](./a.md "title") [b](<./b c.md>) [c](./d(e).md)')
    ).toEqual(['./a.md', './b c.md', './d(e).md']);
  });

  it('extracts used reference links and images, not unused definitions', () => {
    expect(
      linksIn(
        '[guide][TARGET]\n![image][]\n[shortcut]\n\n[target]: ./guide.md\n[image]: ./image.png\n[shortcut]: ./shortcut.md\n[unused]: ./missing.md'
      )
    ).toEqual(['./guide.md', './image.png', './shortcut.md']);
  });

  it('honours the first definition for duplicate reference labels', () => {
    expect(linksIn('[x][id]\n\n[id]: ./first.md\n[id]: ./second.md')).toEqual([
      './first.md'
    ]);
  });

  it('does not parse escaped examples or HTML comments as Markdown links', () => {
    expect(linksIn('\\[example](./missing.md)')).toEqual([]);
    expect(linksIn('<!-- [example](./missing.md) -->')).toEqual([]);
  });

  it('checks a broken reference destination through the gate', () => {
    const failures = review({
      documents: [
        [INDEX, index({ body: '- [guide](product/guide.md)' })],
        ['docs/product/guide.md', '[missing][target]\n\n[target]: ./missing.md']
      ],
      fileExists: (path) =>
        ['docs/README.md', 'docs/product/guide.md'].includes(path)
    });
    expect(failures).toContain(
      'Broken link in docs/product/guide.md: ./missing.md'
    );
  });

  it('does not let a code-only catalogue example register a docs page', () => {
    const failures = review({
      documents: [
        [INDEX, index({ body: '~~~md\n- [orphan](product/orphan.md)\n~~~' })],
        ['docs/product/orphan.md', '# Orphan']
      ]
    });
    expect(failures).toContain(
      'Document is not listed in docs/README.md: docs/product/orphan.md'
    );
  });

  it('ignores fenced pseudo-headings when extracting index sections', () => {
    const text = [
      '## 7. Review record',
      '~~~md',
      '## Example heading',
      '~~~',
      '- [later](reviews/later.md)',
      '## Superseded'
    ].join('\n');
    expect(sectionText(text, '7. Review record')).toContain('reviews/later.md');
  });

  it('does not accept a fenced Review heading/link as review registration', () => {
    const failures = review({
      documents: [
        [
          INDEX,
          index({
            body: '~~~md\n## 7. Review record\n- [orphan](reviews/orphan.md)\n~~~'
          })
        ],
        ['docs/reviews/orphan.md', '# Orphan']
      ]
    });
    expect(failures).toContain(
      'Document is not listed in docs/README.md: docs/reviews/orphan.md'
    );
    expect(failures).toContain(
      'Dated review is not listed in the Review record section: docs/reviews/orphan.md'
    );
  });

  it('resolves section reference links using definitions outside that section', () => {
    const failures = review({
      documents: [
        [
          INDEX,
          index({ review: '- [review][target]' }) + '\n[target]: reviews/r.md\n'
        ],
        ['docs/reviews/r.md', '# Review']
      ]
    });
    expect(failures).toEqual([]);
  });

  it('preserves real links inside historical details and escaped-pipe tables', () => {
    expect(
      linksIn(
        '<details>\n<summary>History</summary>\n\n[real](./real.md)\n\n</details>'
      )
    ).toEqual(['./real.md']);
    expect(linksIn('| value \\| [cell](./cell.md) | `a\\|b` |')).toEqual([
      './cell.md'
    ]);
  });

  it('reports a target removed from a dirty tree instead of accepting its index entry', () => {
    const failures = review({
      documents: [[INDEX, index({ body: '- [deleted](product/deleted.md)' })]],
      fileExists: (path) => path === INDEX
    });
    expect(failures).toContain(
      'Broken link in docs/README.md: product/deleted.md'
    );
  });
});

describe('documentation CLI filesystem boundary', () => {
  const roots = [];

  afterEach(() => {
    for (const root of roots.splice(0))
      rmSync(root, { recursive: true, force: true });
  });

  function temporaryRoot() {
    const root = mkdtempSync(
      join(
        process.env.TMPDIR ?? process.env.RUNNER_TEMP ?? tmpdir(),
        'docs-gate-'
      )
    );
    roots.push(root);
    return root;
  }

  function fixture() {
    const root = temporaryRoot();
    const files = new Set([
      INDEX,
      ...STALE_CLAIMS.map(([file]) => file),
      'docs/product/plan.md',
      '.claude/rules/example.md',
      '.agents/skills/example/SKILL.md',
      'target.txt'
    ]);
    for (const file of files) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), '# Synthetic fixture\n');
    }
    writeFileSync(
      join(root, INDEX),
      index({
        body: [...files]
          .filter((file) => file.startsWith('docs/') && file !== INDEX)
          .map((file) => `[fixture](${posix.relative('docs', file)})`)
          .join('\n')
      })
    );
    writeFileSync(
      join(root, 'docs/product/plan.md'),
      '[target](../../target.txt)\n'
    );
    mkdirSync(join(root, 'scripts'), { recursive: true });
    copyFileSync(
      fileURLToPath(new URL('./check-docs-links.mjs', import.meta.url)),
      join(root, 'scripts/check-docs-links.mjs')
    );
    mkdirSync(join(root, 'node_modules'), { recursive: true });
    symlinkSync(
      dirname(fileURLToPath(import.meta.resolve('prettier/package.json'))),
      join(root, 'node_modules/prettier'),
      'junction'
    );
    return root;
  }

  // Fault injection is confined to a fresh Node subprocess over synthetic files.
  // Do not depend on chmod (Windows/admin runs can still read the file).
  function faultPrelude(method, target, code) {
    const source = `
      import fs from 'node:fs/promises';
      import { syncBuiltinESMExports } from 'node:module';
      const original = fs[${JSON.stringify(method)}];
      fs[${JSON.stringify(method)}] = function (...args) {
        if (!${JSON.stringify(target)} || String(args[0]).replaceAll('\\\\', '/').endsWith(${JSON.stringify(target)})) {
          throw Object.assign(new Error('synthetic opaque error detail'), { code: ${JSON.stringify(code)} });
        }
        return original.apply(this, args);
      };
      syncBuiltinESMExports();
    `;
    return ['--import', `data:text/javascript,${encodeURIComponent(source)}`];
  }

  function run(root, { cwd = root, fault = [] } = {}) {
    const result = spawnSync(
      process.execPath,
      [...fault, join(root, 'scripts/check-docs-links.mjs')],
      { cwd, encoding: 'utf8', timeout: 15000 }
    );
    expect(result.error).toBeUndefined();
    return result;
  }

  it('passes a clean synthetic repository and an independent copied fixture', () => {
    const root = fixture();
    const copy = temporaryRoot();
    cpSync(root, copy, { recursive: true });
    for (const candidate of [root, copy]) {
      const result = run(candidate);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Documentation check passed');
      expect(result.stderr).toBe('');
    }
  });

  it('anchors discovery, reads and linked non-markdown stats to the script root', () => {
    const root = fixture();
    const result = run(root, { cwd: temporaryRoot() });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Documentation check passed');
    expect(result.stderr).toBe('');
  });

  it('does not scan a competing repository in the invocation cwd', () => {
    const root = fixture();
    const competing = fixture();
    writeFileSync(
      join(competing, 'docs/product/plan.md'),
      '[gone](missing.md)'
    );
    expect(run(root, { cwd: competing }).status).toBe(0);
    expect(run(competing).status).toBe(1);
  });

  it.each(['docs/product/plan.md', 'scripts/build-web.mjs'])(
    'fails closed for invalid UTF-8 in %s',
    (file) => {
      const root = fixture();
      writeFileSync(join(root, file), Buffer.from([0xc3, 0x28]));
      const result = run(root);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        `Scan failure reading ${file}: invalid UTF-8`
      );
      expect(result.stdout).not.toContain('Documentation check passed');
    }
  );

  it('reports a missing required index as a scan failure, not an empty pass', () => {
    const root = fixture();
    unlinkSync(join(root, INDEX));
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Scan failure reading ${INDEX}`);
  });

  it('accepts valid Unicode, a literal replacement character and an existing BOM', () => {
    const root = fixture();
    for (const file of ['docs/product/plan.md', 'scripts/build-web.mjs'])
      writeFileSync(
        join(root, file),
        Buffer.concat([
          Buffer.from([0xef, 0xbb, 0xbf]),
          Buffer.from('合成文件 \uFFFD\n', 'utf8')
        ])
      );
    const result = run(root);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
  });

  it('keeps deleted link targets as broken links', () => {
    const root = fixture();
    unlinkSync(join(root, 'target.txt'));
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Broken link in docs/product/plan.md: ../../target.txt'
    );
    expect(result.stderr).not.toContain('Scan failure');
  });

  it.each([
    [
      'readFile',
      'docs/product/plan.md',
      'EACCES',
      'reading docs/product/plan.md'
    ],
    [
      'readFile',
      'scripts/build-web.mjs',
      'EIO',
      'reading scripts/build-web.mjs'
    ],
    ['stat', 'target.txt', 'EACCES', 'stating target.txt'],
    ['glob', '', 'EIO', 'discovering markdown']
  ])(
    'classifies %s %s failure without exposing raw error details',
    (method, target, code, label) => {
      const root = fixture();
      const result = run(root, { fault: faultPrelude(method, target, code) });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(`Scan failure ${label}`);
      expect(result.stderr).toContain(code);
      expect(result.stderr).not.toContain('synthetic opaque error detail');
      expect(result.stdout).not.toContain('Documentation check passed');
    }
  );

  it.each(['.claude/rules/example.md', '.agents/skills/example/SKILL.md'])(
    'retains broken-link checks in %s',
    (file) => {
      const root = fixture();
      writeFileSync(join(root, file), '[gone](missing.md)');
      const result = run(root);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(`Broken link in ${file}: missing.md`);
    }
  );

  it('does not scan or log when imported', () => {
    const root = fixture();
    const url = pathToFileURL(join(root, 'scripts/check-docs-links.mjs')).href;
    const result = spawnSync(
      process.execPath,
      [
        ...faultPrelude('glob', '', 'EIO'),
        '--input-type=module',
        '-e',
        `await import(${JSON.stringify(url)})`
      ],
      { cwd: root, encoding: 'utf8', timeout: 15000 }
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
  });
});
