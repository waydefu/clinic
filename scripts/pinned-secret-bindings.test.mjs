import { describe, expect, it } from 'vitest';

import {
  assertPinnedEntryPoints,
  oracleCaseCount,
  runPinnedBindingsOracle
} from './fixtures/pinned-secret-bindings-oracle.mjs';

let cachedRows;
function results() {
  cachedRows ??= runPinnedBindingsOracle();
  return cachedRows;
}

describe('CAL-PILOT E1-06 immutable secret references', () => {
  it('uses pinned expressions in all three operational entrypoints', () => {
    expect(() => assertPinnedEntryPoints()).not.toThrow();
  });

  it('executes each actual API/worker binding expression with synthetic versions', () => {
    const rows = results().filter(({ id }) =>
      /\.ps1-(?:api|worker)$/u.test(id)
    );
    expect(rows).toHaveLength(6);
    expect(rows.every(({ passed }) => passed)).toBe(true);
  });

  it('rejects mutable, missing, malformed and mismatched references without a provider', () => {
    const rows = results().filter(
      ({ id }) => !/\.ps1-(?:api|worker)$/u.test(id)
    );
    expect(rows).toHaveLength(oracleCaseCount - 6);
    expect(rows.every(({ passed }) => passed)).toBe(true);
  });
});
