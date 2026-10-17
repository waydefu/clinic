import { readFileSync } from 'node:fs';
import { parsers } from 'prettier/plugins/markdown';
import { describe, expect, it } from 'vitest';

// Parse with the project's existing pinned Markdown parser, never format prose.
const parse = (text) => parsers.markdown.parse(text);
const source = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const textOf = (node) =>
  node.value ?? node.children?.map(textOf).join('') ?? '';
const tableNamed = (text, heading) =>
  parse(text).children.find(
    (node) =>
      node.type === 'table' && textOf(node.children[0]).startsWith(heading)
  );

const packetPath = 'docs/plans/2026-10-01-c1-batch-deployment-packet.md';
const manualPath = 'docs/runbooks/manager-operations-manual.md';
const planPath = 'docs/product/luna-local-project-completion-master-plan.md';

describe('bounded Markdown hygiene regressions', () => {
  it('distinguishes legal missing data cells from an invalid delimiter width', () => {
    const legal = parse('| A | B | C |\n| --- | --- | --- |\n| x | y |');
    expect(legal.children[0].type).toBe('table');
    expect(legal.children[0].children[1].children).toHaveLength(2);
    const invalid = parse('| A | B | C |\n| --- | --- |\n| x | y | z |');
    expect(invalid.children[0].type).toBe('paragraph');
  });

  it('renders the deployment checkpoint header and every row as five columns', () => {
    const table = tableNamed(source(packetPath), 'Checkpoint');
    expect(table).toBeDefined();
    expect(table.align).toHaveLength(5);
    expect(table.children.length).toBeGreaterThan(1);
    for (const row of table.children) expect(row.children).toHaveLength(5);
  });

  it('keeps the complete termination constraints in the third table cell', () => {
    const table = tableNamed(source(manualPath), '功能');
    expect(table).toBeDefined();
    const row = table.children.find((item) =>
      textOf(item).startsWith('CP-07 termination')
    );
    expect(row).toBeDefined();
    expect(row.children).toHaveLength(3);
    const constraints = textOf(row.children[2]);
    expect(constraints).toContain(
      '"backup_disposition" | "audit_disposition" | "access_revocation"'
    );
    expect(constraints).toContain('manual_close_review');
  });

  it('demonstrates why inline-code pipes still need escaping in GFM tables', () => {
    const unescaped = parse('| A | B |\n| --- | --- |\n| x | `a | b` |');
    expect(unescaped.children[0].children[1].children).toHaveLength(3);
    const escaped = parse('| A | B |\n| --- | --- |\n| x | `a\\|b` |');
    const row = escaped.children[0].children[1];
    expect(row.children).toHaveLength(2);
    expect(textOf(row.children[1])).toBe('a|b');
  });

  it('routes both Session start links to the existing re-audit heading', () => {
    const text = source(planPath);
    expect(text).toContain(
      '## 1. Session start (do not re-audit the whole project)'
    );
    expect(
      text.match(/\]\(#1-session-start-do-not-re-audit-the-whole-project\)/g)
    ).toHaveLength(2);
    expect(text).not.toContain(
      '](#1-session-start-do-not-reaudit-the-whole-project)'
    );
  });

  it('labels README checkpoints as historical and routes to current authority', () => {
    const text = source('README.md');
    expect(text).toContain('## Status and authority routing');
    expect(text).toContain('## Historical status snapshot: Phase 1 Stage 1');
    expect(text).not.toContain('## Current status: Phase 1 Stage 1');
    expect(text).toContain('[task retrieval map](docs/INDEX.md)');
    expect(text).toContain(
      '[Phase 1 execution plan](docs/phase-1-execution-plan.md)'
    );
    expect(text).toContain('UNVERIFIED');
    // The old evidence is retained, not revised to look like a new live result.
    expect(text).toContain(
      '**Booking MVP final UI checkpoint (2026-08-22, PR #23):**'
    );
    expect(text).toContain('2026-08-29 13:08 Asia/Taipei');
  });
});
