import { describe, expect, it } from 'vitest';

import {
  isLicenseAllowed,
  packageUrl,
  planLicenseReview,
  planSbom
  // @ts-expect-error — the SBOM script is plain ESM with no type declarations.
} from '../../../scripts/generate-sbom.mjs';

interface Component {
  type: string;
  'bom-ref': string;
  name: string;
  version: string;
  purl: string;
  scope: string;
  licenses?: { license?: { id: string }; expression?: string }[];
  properties?: { name: string; value: string }[];
}

interface SbomDocument {
  bomFormat: string;
  specVersion: string;
  serialNumber: string;
  version: number;
  metadata: { timestamp: string; component: { name: string; purl: string } };
  components: Component[];
  dependencies: { ref: string; dependsOn: string[] }[];
}

// `pnpm list --recursive --depth Infinity --json` 的縮小版：一個根專案、一個
// workspace 套件、一個 runtime 相依（含一層傳遞相依）與一個 dev 相依。
function sampleProjects() {
  return [
    {
      name: 'beauessence-appointment-platform',
      version: '0.1.0',
      path: '/repo',
      devDependencies: {
        vitest: { version: '3.2.7', path: '/repo/n/vitest' }
      }
    },
    {
      name: '@beauessence/worker',
      version: '0.1.0',
      path: '/repo/apps/worker',
      dependencies: {
        googleapis: {
          version: '164.0.0',
          path: '/repo/n/googleapis',
          dependencies: {
            'url-template': { version: '2.0.8', path: '/repo/n/url-template' }
          }
        },
        '@beauessence/domain': { version: 'link:packages/domain' }
      }
    },
    {
      name: '@beauessence/domain',
      version: '0.1.0',
      path: '/repo/packages/domain'
    }
  ];
}

const licenses = new Map([
  ['/repo/n/vitest', 'MIT'],
  ['/repo/n/googleapis', 'Apache-2.0'],
  ['/repo/n/url-template', 'BSD']
]);

function build(overrides: Partial<Record<string, unknown>> = {}): SbomDocument {
  return planSbom(sampleProjects(), {
    inspectPackage: (path: string) =>
      licenses.has(path)
        ? { license: licenses.get(path), installed: true }
        : { license: '', installed: false },
    timestamp: '2026-07-24T00:00:00.000Z',
    serialNumber: 'urn:uuid:00000000-0000-4000-a000-000000000000',
    ...overrides
  }) as SbomDocument;
}

function componentOf(document: SbomDocument, name: string): Component {
  const component = document.components.find(
    (candidate) => candidate.name === name
  );
  if (component === undefined) throw new Error(`no component for ${name}`);
  return component;
}

describe('planSbom', () => {
  it('emits a CycloneDX 1.6 document describing the workspace root', () => {
    const document = build();

    expect(document.bomFormat).toBe('CycloneDX');
    expect(document.specVersion).toBe('1.6');
    expect(document.version).toBe(1);
    expect(document.metadata.component.purl).toBe(
      'pkg:npm/beauessence-appointment-platform@0.1.0'
    );
  });

  it('gives every component a purl, with scopes percent-encoded', () => {
    expect(packageUrl('@beauessence/domain', '0.1.0')).toBe(
      'pkg:npm/%40beauessence/domain@0.1.0'
    );
    expect(packageUrl('vitest', '3.2.7')).toBe('pkg:npm/vitest@3.2.7');

    for (const component of build().components) {
      expect(component.purl).toBe(component['bom-ref']);
      expect(component.purl.startsWith('pkg:npm/')).toBe(true);
    }
  });

  it('separates runtime dependencies from development-only ones', () => {
    const document = build();

    expect(componentOf(document, 'googleapis').scope).toBe('required');
    expect(componentOf(document, 'url-template').scope).toBe('required');
    expect(componentOf(document, 'vitest').scope).toBe('optional');
  });

  it('records workspace packages as components rather than registry ones', () => {
    const domain = componentOf(build(), '@beauessence/domain');

    // `link:` 相依不是外部元件——它就是 workspace 專案本身。
    expect(domain.version).toBe('0.1.0');
    expect(domain.properties).toContainEqual({
      name: 'beauessence:origin',
      value: 'workspace'
    });
  });

  it('marks packages that are not installed on this platform', () => {
    const document = build();
    const resolutionOf = (name: string) =>
      componentOf(document, name).properties?.find(
        (property) => property.name === 'beauessence:resolution'
      )?.value;

    expect(resolutionOf('vitest')).toBe('installed');
    // sampleProjects 沒有給 @beauessence/domain 之外的未安裝套件，
    // 因此用一個查不到 manifest 的路徑代表其他平台的 optional binary。
    const platformBinary = planSbom(
      [
        {
          name: 'beauessence-appointment-platform',
          version: '0.1.0',
          path: '/repo',
          devDependencies: {
            '@esbuild/aix-ppc64': {
              version: '0.28.1',
              path: '/repo/n/aix'
            }
          }
        }
      ],
      {
        inspectPackage: () => ({ license: '', installed: false }),
        timestamp: '2026-07-24T00:00:00.000Z',
        serialNumber: 'urn:uuid:00000000-0000-4000-a000-000000000000'
      }
    ) as SbomDocument;
    expect(
      componentOf(platformBinary, '@esbuild/aix-ppc64').properties
    ).toContainEqual({
      name: 'beauessence:resolution',
      value: 'not-installed'
    });
  });

  it('records the dependency edges it can determine', () => {
    const document = build();
    const dependsOn = (ref: string) =>
      document.dependencies.find((edge) => edge.ref === ref)?.dependsOn ?? [];

    expect(dependsOn('pkg:npm/%40beauessence/worker@0.1.0')).toContain(
      'pkg:npm/googleapis@164.0.0'
    );
    expect(dependsOn('pkg:npm/googleapis@164.0.0')).toEqual([
      'pkg:npm/url-template@2.0.8'
    ]);
    // link: 相依要指向 workspace 專案自己的 purl，不是 `link:` 字面值。
    expect(dependsOn('pkg:npm/%40beauessence/worker@0.1.0')).toContain(
      'pkg:npm/%40beauessence/domain@0.1.0'
    );
  });

  it('is reproducible for the same dependency tree', () => {
    expect(JSON.stringify(build())).toBe(JSON.stringify(build()));
  });
});

describe('isLicenseAllowed', () => {
  const allowed = new Set(['MIT', 'Apache-2.0', 'CC0-1.0']);

  it('accepts a single allowed identifier', () => {
    expect(isLicenseAllowed('MIT', allowed)).toBe(true);
    expect(isLicenseAllowed('GPL-3.0-only', allowed)).toBe(false);
  });

  it('accepts an OR expression when either side is allowed', () => {
    expect(isLicenseAllowed('(MIT OR CC0-1.0)', allowed)).toBe(true);
    expect(isLicenseAllowed('(GPL-3.0-only OR MIT)', allowed)).toBe(true);
    expect(isLicenseAllowed('(GPL-3.0-only OR AGPL-3.0)', allowed)).toBe(false);
  });

  it('requires every side of an AND expression', () => {
    expect(isLicenseAllowed('MIT AND Apache-2.0', allowed)).toBe(true);
    expect(isLicenseAllowed('MIT AND GPL-3.0-only', allowed)).toBe(false);
  });

  it('judges a WITH exception by its principal license', () => {
    expect(isLicenseAllowed('Apache-2.0 WITH LLVM-exception', allowed)).toBe(
      true
    );
    expect(
      isLicenseAllowed('GPL-2.0 WITH Classpath-exception-2.0', allowed)
    ).toBe(false);
  });

  it('rejects anything it cannot fully parse', () => {
    expect(isLicenseAllowed('public domain', allowed)).toBe(false);
    expect(isLicenseAllowed('(MIT', allowed)).toBe(false);
    expect(isLicenseAllowed('', allowed)).toBe(false);
  });
});

describe('planLicenseReview', () => {
  it('passes permissive licences and flags everything else', () => {
    const { violations } = planLicenseReview(build(), {
      exceptions: new Map()
    }) as { violations: { purl: string; license: string }[] };

    // vitest（MIT）與 googleapis（Apache-2.0）通過；url-template 的 "BSD" 不是
    // 合法 SPDX 識別碼，沒有例外就必須擋下。
    expect(violations.map((violation) => violation.purl)).toEqual([
      'pkg:npm/url-template@2.0.8'
    ]);
  });

  const reviewed = (overrides: Record<string, unknown> = {}) =>
    new Map([
      [
        'pkg:npm/url-template@2.0.8',
        {
          // 這份 fixture 裡 url-template 是 googleapis 的傳遞相依，因此 scope 是
          // required。真實專案的三筆例外都是 optional（dev-only）。
          license: 'BSD',
          scope: 'required',
          note: 'manifest 只寫 BSD',
          ...overrides
        }
      ]
    ]);

  it('accepts a reviewed exception but keeps reporting it', () => {
    const { violations, accepted } = planLicenseReview(build(), {
      exceptions: reviewed()
    }) as {
      violations: unknown[];
      accepted: { purl: string; exception: string }[];
    };

    expect(violations).toEqual([]);
    expect(accepted).toEqual([
      {
        purl: 'pkg:npm/url-template@2.0.8',
        license: 'BSD',
        exception: 'manifest 只寫 BSD'
      }
    ]);
  });

  it('stops honouring an exception once the package moves to a new version', () => {
    // 例外綁的是被審視過的那一個版本。升版之後授權可能整個換掉，而稽核最需要
    // 重新看一眼的時刻，正是這個時候——不能因為套件名稱一樣就自動延續。
    const document = build();
    const component = componentOf(document, 'url-template');
    component.version = '3.0.0';
    component.purl = 'pkg:npm/url-template@3.0.0';

    const { violations, accepted } = planLicenseReview(document, {
      exceptions: reviewed()
    }) as { violations: { purl: string }[]; accepted: unknown[] };

    expect(accepted).toEqual([]);
    expect(violations.map((violation) => violation.purl)).toEqual([
      'pkg:npm/url-template@3.0.0'
    ]);
  });

  it('stops honouring an exception once the licence text or the scope drifts', () => {
    const licenceDrift = planLicenseReview(build(), {
      exceptions: reviewed({ license: 'BSD-3-Clause' })
    }) as { violations: { reason: string }[] };
    expect(licenceDrift.violations).toHaveLength(1);
    expect(licenceDrift.violations[0]?.reason).toMatch(/授權由/);

    // 任何 scope 變動都讓當初的審視失效。實務上最要緊的方向是 dev → runtime：
    // 「反正只是開發相依、不會出貨」這個免責理由會在那一刻消失，而套件名稱完全
    // 沒變，只查名稱的例外會一路放行到出貨。
    const scopeDrift = planLicenseReview(build(), {
      exceptions: reviewed({ scope: 'optional' })
    }) as { violations: { reason: string }[] };
    expect(scopeDrift.violations).toHaveLength(1);
    expect(scopeDrift.violations[0]?.reason).toMatch(/scope 由/);
  });

  it('does not judge packages that are not installed on this platform', () => {
    const document = build();
    // url-template 的 "BSD" 在上一個測試裡是違規；把它標成本平台未安裝之後，
    // 就不該再被評判。
    componentOf(document, 'url-template').properties = [
      { name: 'beauessence:origin', value: 'registry' },
      { name: 'beauessence:resolution', value: 'not-installed' }
    ];

    const { violations } = planLicenseReview(document, {
      exceptions: new Map()
    }) as { violations: unknown[] };

    expect(violations).toEqual([]);
  });

  it('never judges the workspace packages themselves', () => {
    const { violations } = planLicenseReview(build(), {
      exceptions: new Map()
    }) as { violations: { purl: string }[] };

    expect(
      violations.some((violation) => violation.purl.includes('%40beauessence'))
    ).toBe(false);
  });
});
