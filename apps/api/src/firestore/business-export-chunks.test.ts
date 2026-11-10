import { describe, expect, it } from 'vitest';

import {
  businessExportChunkCount,
  splitBusinessExportChunks
} from './business-export-chunks.js';

describe('business export chunks', () => {
  it.each([
    ['empty', ''],
    ['ordinary', 'ordinary synthetic CSV'],
    ['multibyte', '中'.repeat(200_001)],
    ['first boundary', `${'a'.repeat(199_999)}😀tail`],
    ['second boundary', `${'a'.repeat(399_999)}😀tail`]
  ])('preserves %s content after UTF-8 encoding', (_label, input) => {
    const chunks = splitBusinessExportChunks(input);
    const serialized = chunks.map((chunk) =>
      Buffer.from(chunk, 'utf8').toString('utf8')
    );
    expect(serialized.join('') === input).toBe(true);
    expect(chunks).toHaveLength(businessExportChunkCount(input));
    for (const chunk of chunks) {
      expect(Buffer.byteLength(chunk, 'utf8')).toBeLessThan(1_000_000);
    }
  });

  it('preserves the existing 20-chunk admission boundary', () => {
    expect(businessExportChunkCount('a'.repeat(4_000_000))).toBe(20);
    expect(businessExportChunkCount('a'.repeat(4_000_001))).toBe(21);
  });
});
