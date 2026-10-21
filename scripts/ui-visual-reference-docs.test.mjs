import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const structure = source('scripts/check-structure.mjs');
const capture = source('tests/ui-screenshots/current-ui.spec.ts');
const directory = structure.match(
  /const visualBaselineDirectory =\s*'([^']+)';/
)?.[1];
const evidenceId = directory?.split('/').at(-1);
const documents = [
  'docs/design/ui-ux-rules.md',
  'docs/design/test-only-operations-ui.md',
  'docs/README.md'
];

describe('current visual reference documentation (E3-14)', () => {
  it('uses the same evidence id in structure paths and the capture fixture', () => {
    const date = capture.match(/const CAPTURE_DATE = '([^']+)';/)?.[1];
    const prefix = capture.match(
      /const EVIDENCE_ID = `(ui-visual-[a-z0-9]+-)\$\{CAPTURE_DATE\}`;/
    )?.[1];

    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(prefix).toBeDefined();
    expect(evidenceId).toBe(`${prefix}${date}`);
    expect(structure).toContain(`'docs/reviews/${evidenceId}.md'`);
    expect(structure).toContain(`'${directory}/manifest.json'`);
  });

  it.each(documents)(
    '%s names the guarded reference without promoting it to approval',
    (path) => {
      const text = source(path);

      expect(evidenceId).toBeDefined();
      expect(text).toContain(`reviews/${evidenceId}.md`);
      expect(text).toContain(`reviews/assets/${evidenceId}/manifest.json`);
      expect(text).toContain('reference-only');
      expect(text).toMatch(/不構成新的業主核准|not new owner approval/);
    }
  );

  it('keeps both C4 and C3 evidence linked as history in the design guides', () => {
    for (const path of documents.slice(0, 2)) {
      const text = source(path);

      expect(text).toContain('reviews/ui-visual-c4-2026-08-22.md');
      expect(text).toContain('reviews/ui-visual-baseline-2026-08-22.md');
      expect(text).toContain('歷史');
      expect(text).not.toMatch(/現行基線(?:是|已記錄於)\s*\n\[/);
    }
  });
});
