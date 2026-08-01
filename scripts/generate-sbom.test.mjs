import { describe, expect, it } from 'vitest';
import {
  isLicenseAllowed,
  packageUrl,
  planLicenseReview
} from './generate-sbom.mjs';

const allowed = new Set(['MIT', 'Apache-2.0', 'ISC', 'BSD-3-Clause']);

function component({
  name = 'left-pad',
  version = '1.0.0',
  licenses,
  scope = 'required',
  properties = []
} = {}) {
  return {
    name,
    version,
    purl: packageUrl(name, version),
    'bom-ref': packageUrl(name, version),
    scope,
    licenses,
    properties
  };
}

const noExceptions = new Map();

function property(name, value) {
  return { name, value };
}

describe('SPDX expression evaluation', () => {
  it.each(['MIT', 'Apache-2.0', 'ISC'])('accepts the bare licence %s', (id) => {
    expect(isLicenseAllowed(id, allowed)).toBe(true);
  });

  it('rejects a licence outside the allowlist', () => {
    expect(isLicenseAllowed('GPL-3.0-only', allowed)).toBe(false);
  });

  it('accepts an OR expression when either side is allowed', () => {
    expect(isLicenseAllowed('MIT OR GPL-3.0-only', allowed)).toBe(true);
    expect(isLicenseAllowed('GPL-3.0-only OR MIT', allowed)).toBe(true);
  });

  // AND 代表兩份授權都要遵守，因此有一邊不允許就整條不允許。
  it('rejects an AND expression when either side is disallowed', () => {
    expect(isLicenseAllowed('MIT AND GPL-3.0-only', allowed)).toBe(false);
    expect(isLicenseAllowed('MIT AND ISC', allowed)).toBe(true);
  });

  it('honours parentheses rather than flattening the expression', () => {
    expect(isLicenseAllowed('(MIT OR GPL-3.0-only) AND ISC', allowed)).toBe(
      true
    );
    expect(
      isLicenseAllowed('(GPL-3.0-only OR AGPL-3.0) AND MIT', allowed)
    ).toBe(false);
  });

  it('treats a WITH exception as the base licence', () => {
    expect(isLicenseAllowed('Apache-2.0 WITH LLVM-exception', allowed)).toBe(
      true
    );
  });

  it('rejects an empty or malformed expression instead of passing it', () => {
    expect(isLicenseAllowed('', allowed)).toBe(false);
    expect(isLicenseAllowed('(MIT', allowed)).toBe(false);
  });
});

describe('package URL', () => {
  it('builds a purl for a plain package', () => {
    expect(packageUrl('left-pad', '1.0.0')).toBe('pkg:npm/left-pad@1.0.0');
  });

  it('encodes a scoped package so the slash is not read as a path', () => {
    expect(packageUrl('@scope/pkg', '2.0.0')).toContain('2.0.0');
    expect(packageUrl('@scope/pkg', '2.0.0')).toMatch(/^pkg:npm\//u);
  });
});

describe('licence policy review', () => {
  it('accepts a component with an allowed licence', () => {
    const review = planLicenseReview(
      { components: [component({ licenses: [{ license: { id: 'MIT' } }] })] },
      { allowed, exceptions: noExceptions }
    );

    expect(review.violations).toEqual([]);
  });

  it('reports a component with a disallowed licence', () => {
    const review = planLicenseReview(
      {
        components: [
          component({
            name: 'copyleft-lib',
            licenses: [{ license: { id: 'GPL-3.0-only' } }]
          })
        ]
      },
      { allowed, exceptions: noExceptions }
    );

    expect(review.violations).toHaveLength(1);
    expect(review.violations[0].purl).toContain('copyleft-lib');
    expect(review.violations[0].reason).toContain('不在允許清單');
  });

  // 沒有 license 欄位比錯的授權更危險：它會被誤讀成「沒有限制」。
  it('reports a component that declares no licence at all', () => {
    const review = planLicenseReview(
      { components: [component({ name: 'silent-lib', licenses: [] })] },
      { allowed, exceptions: noExceptions }
    );

    expect(review.violations).toHaveLength(1);
    expect(review.violations[0].purl).toContain('silent-lib');
    expect(review.violations[0].license).toBe('(未標示)');
  });

  it('skips workspace packages, which carry the project licence', () => {
    const review = planLicenseReview(
      {
        components: [
          component({
            name: '@beauessence/domain',
            licenses: [],
            properties: [property('beauessence:origin', 'workspace')]
          })
        ]
      },
      { allowed, exceptions: noExceptions }
    );

    expect(review.violations).toEqual([]);
  });

  it('skips optional binaries that were never installed on this platform', () => {
    const review = planLicenseReview(
      {
        components: [
          component({
            name: 'platform-binary',
            licenses: [],
            properties: [property('beauessence:resolution', 'not-installed')]
          })
        ]
      },
      { allowed, exceptions: noExceptions }
    );

    expect(review.violations).toEqual([]);
  });
});

describe('reviewed licence exceptions', () => {
  const reviewed = (overrides = {}) =>
    new Map([
      [
        'pkg:npm/odd-lib@1.0.0',
        {
          license: 'BSD',
          scope: 'optional',
          note: 'manifest 未指明第幾條款；dev-only',
          ...overrides
        }
      ]
    ]);

  const oddLib = (overrides = {}) =>
    component({
      name: 'odd-lib',
      licenses: [{ license: { id: 'BSD' } }],
      scope: 'optional',
      ...overrides
    });

  it('accepts the exact component that was reviewed', () => {
    const review = planLicenseReview(
      { components: [oddLib()] },
      { allowed, exceptions: reviewed() }
    );

    expect(review.violations).toEqual([]);
    expect(review.accepted).toHaveLength(1);
    expect(review.accepted[0].exception).toContain('dev-only');
  });

  // 例外綁定的是「當初審視的那個授權字串」。授權換了還沿用舊例外，等於沒有審。
  it('reports drift when the licence string changed since the review', () => {
    const review = planLicenseReview(
      { components: [oddLib({ licenses: [{ license: { id: 'AGPL-3.0' } }] })] },
      { allowed, exceptions: reviewed() }
    );

    expect(review.violations).toHaveLength(1);
    expect(JSON.stringify(review.violations)).toContain('AGPL-3.0');
  });

  // scope 也綁定：optional 的開發工具變成 required 的出貨相依是完全不同的風險。
  it('reports drift when the dependency scope changed since the review', () => {
    const review = planLicenseReview(
      { components: [oddLib({ scope: 'required' })] },
      { allowed, exceptions: reviewed() }
    );

    expect(review.violations).toHaveLength(1);
    expect(JSON.stringify(review.violations)).toContain('scope');
  });
});
