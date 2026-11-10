import { describe, expect, it } from 'vitest';
import {
  buildReport,
  complexity,
  duplicateLineCounts,
  lineCount,
  TARGETS
} from './maintainability-baseline.mjs';

describe('maintainability baseline', () => {
  it('counts physical lines, including a final line without a newline', () => {
    expect(lineCount('')).toBe(0);
    expect(lineCount('a\nb')).toBe(2);
    expect(lineCount('a\nb\n')).toBe(2);
  });

  it('counts matching trimmed five-line windows across and within files', () => {
    const block = 'a\nb\nc\nd\ne';
    expect(duplicateLineCounts([block, `  ${block}`])).toEqual([5, 5]);
    expect(duplicateLineCounts([`${block}\n\n${block}`])).toEqual([10]);
    const interrupted = 'a\nb\n\nd\ne';
    expect(duplicateLineCounts([interrupted, interrupted])).toEqual([0, 0]);
  });

  it('measures nested functions separately and rejects malformed code', () => {
    const source =
      'function outer(a) { if (a && a.ok) return () => a ? 1 : 0; }';
    expect(complexity(source, 'test.js')).toEqual({
      functions: 2,
      max: 3,
      mean: 2.5
    });
    expect(complexity('x {}', 'test.css')).toBeNull();
    expect(() => complexity('function broken(', 'test.js')).toThrow(
      'Cannot parse test.js'
    );
  });

  it('reports every input, includes the method, and handles empty files', () => {
    const report = buildReport([
      { path: 'sample.js', source: 'function f() {}\n' },
      { path: 'sample.css', source: '' }
    ]);
    expect(report).toContain('| sample.js | 1 | 0.0% | 1 / 1.0 / 1 |');
    expect(report).toContain('| sample.css | 0 | 0.0% | N/A (CSS) |');
    expect(report).toContain('not merge thresholds');
    expect(TARGETS).toHaveLength(6);
  });
});
