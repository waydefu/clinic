import { describe, expect, it } from 'vitest';
import {
  isScannedMarkdown,
  linksIn,
  MARKDOWN_GLOBS,
  resolveLink,
  reviewDocumentation,
  sectionText
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
