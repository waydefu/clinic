import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

const sourceOverride = vi.hoisted(() => ({
  text: undefined,
  missing: false,
  unreadable: false
}));
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    readFileSync(path, ...options) {
      if (
        String(path)
          .replaceAll('\\', '/')
          .endsWith('/apps/api/src/platform/runtime/c1-firebase-auth-domain.ts')
      ) {
        if (sourceOverride.missing) {
          throw Object.assign(
            new Error('Synthetic missing comparator source'),
            {
              code: 'ENOENT'
            }
          );
        }
        if (sourceOverride.unreadable) {
          throw Object.assign(
            new Error('Synthetic unreadable comparator source'),
            {
              code: 'EACCES'
            }
          );
        }
        if (sourceOverride.text !== undefined) return sourceOverride.text;
      }
      return actual.readFileSync(path, ...options);
    }
  };
});

import { inspectC1FirebaseAuthDomainSource } from './c1-firebase-auth-domain.mjs';
import { inspectStageFSourceGaps } from './stage-f-deployment-graph.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const original = readFileSync(
  join(root, 'apps/api/src/platform/runtime/c1-firebase-auth-domain.ts'),
  'utf8'
);
const normalizer = "  const host = (value ?? '').trim();";
const approved =
  'beauessence-clinic-stg-c1a01--internal-preproduction-3u85hkcz.web.app';
if (!original.includes(normalizer))
  throw new Error('Owning fixture shape changed');

afterEach(() => {
  sourceOverride.text = undefined;
  sourceOverride.missing = false;
  sourceOverride.unreadable = false;
});

const mutations = [
  [
    'mutable deny markers escape through a new export',
    (text) =>
      text.replace(
        'const FORBIDDEN_AUTH_DOMAIN_MARKERS =',
        'export const FORBIDDEN_AUTH_DOMAIN_MARKERS ='
      )
  ],
  [
    'local normalization declares an unsupported export modifier',
    (text) =>
      text.replace(normalizer, "  export const host = (value ?? '').trim();")
  ],
  [
    'project helper loses its public export',
    (text) =>
      text.replace(
        'export function isIsolatedC1ProjectId(',
        'function isIsolatedC1ProjectId('
      )
  ],
  [
    'comparator has no body statements to prove',
    (text) =>
      text.replace(
        /(export function isAuthorizedC1FirebaseAuthDomain\([\s\S]*?\): boolean) \{[\s\S]*?\n\}/,
        '$1 {}'
      )
  ],
  [
    'project helper has a bare return rather than a pure comparison',
    (text) =>
      text.replace(
        "  return (projectId ?? '').trim() === ISOLATED_C1_PROJECT_ID;",
        '  return;'
      )
  ],
  [
    'comparator loses its public export',
    (text) =>
      text.replace(
        'export function isAuthorizedC1FirebaseAuthDomain(',
        'function isAuthorizedC1FirebaseAuthDomain('
      )
  ],
  [
    'module includes an awaited disposable declaration',
    (text) => `${text}\nawait using opaqueDisposable = ['literal'];\n`
  ],
  [
    'normalized local uses an awaited disposable declaration',
    (text) =>
      text.replace(normalizer, "  await using host = (value ?? '').trim();")
  ],
  [
    'exported allowlist uses an awaited disposable declaration',
    (text) =>
      text.replace(
        'export const C1_AUTHORIZED_FIREBASE_AUTH_DOMAINS',
        'export await using C1_AUTHORIZED_FIREBASE_AUTH_DOMAINS'
      )
  ],
  [
    'caller input replaced by an approved constant',
    (text) =>
      text.replace(
        normalizer,
        '  const host = C1_AUTHORIZED_FIREBASE_AUTH_DOMAINS[0];'
      )
  ],
  [
    'local allowlist shadows the approved export',
    (text) =>
      text.replace(
        normalizer,
        `${normalizer}\n  const C1_AUTHORIZED_FIREBASE_AUTH_DOMAINS = [host];`
      )
  ],
  [
    'membership checks another approved constant identifier',
    (text) =>
      text
        .replace('    host\n  );', '    ISOLATED_C1_PROJECT_ID\n  );')
        .replace(
          "const ISOLATED_C1_PROJECT_ID = 'beauessence-clinic-stg-c1a01';",
          `const ISOLATED_C1_PROJECT_ID = '${approved}';`
        )
  ],
  [
    'unconditional denial makes membership unreachable',
    (text) => text.replace(normalizer, `${normalizer}\n  return false;`)
  ],
  [
    'parameter default silently authorizes missing input',
    (text) =>
      text.replace(
        'value: string | undefined',
        'value: string | undefined = C1_AUTHORIZED_FIREBASE_AUTH_DOMAINS[0]'
      )
  ],
  [
    'a deny guard blocks the approved host',
    (text) =>
      text.replace(
        normalizer,
        `${normalizer}\n  if (host.includes('web.app')) return false;`
      )
  ],
  [
    'guard expression mutates the allowlist',
    (text) =>
      text.replace(
        normalizer,
        `${normalizer}\n  if (C1_AUTHORIZED_FIREBASE_AUTH_DOMAINS.push(host) === 0) return false;`
      )
  ],
  [
    'asynchronous comparator has the same body but a different return contract',
    (text) =>
      text.replace(
        'export function isAuthorizedC1FirebaseAuthDomain(',
        'export async function isAuthorizedC1FirebaseAuthDomain('
      )
  ],
  [
    'generator comparator has the same body but a different return contract',
    (text) =>
      text.replace(
        'export function isAuthorizedC1FirebaseAuthDomain(',
        'export function* isAuthorizedC1FirebaseAuthDomain('
      )
  ],
  [
    'duplicate comparator implementation makes the proof ambiguous',
    (text) =>
      `${text}\nexport function isAuthorizedC1FirebaseAuthDomain(value: string | undefined): boolean {\n  return false;\n}\n`
  ],
  [
    'opaque top-level call is not part of the admitted module form',
    (text) => `${text}\nunknownModuleEffect();\n`
  ],
  [
    'top-level allowlist mutation invalidates immutable provenance',
    (text) =>
      `${text}\nC1_AUTHORIZED_FIREBASE_AUTH_DOMAINS.push('other.web.app');\n`
  ],
  [
    'unknown conditional guard is not admitted as pure',
    (text) =>
      text.replace(
        normalizer,
        `${normalizer}\n  if (unknownPredicate(host)) return false;`
      )
  ],
  [
    'duplicate top-level allowlist declaration is ambiguous',
    (text) =>
      `${text}\nconst C1_AUTHORIZED_FIREBASE_AUTH_DOMAINS = ['other.web.app'];\n`
  ]
];

describe('C1 comparator non-executing semantic proof', () => {
  it('rejects a mutable exported array even when typed as const', () => {
    sourceOverride.text = original.replace(
      /(export const C1_AUTHORIZED_FIREBASE_AUTH_DOMAINS = )[\s\S]*?;/,
      `$1[\n  '${approved}'\n] as const;`
    );
    expect(inspectC1FirebaseAuthDomainSource(root).ok).toBe(false);
    expect(inspectStageFSourceGaps(root).e2).toBe('PARTIAL');
  });

  it('rejects a module binding that shadows the Object.freeze intrinsic', () => {
    sourceOverride.text = `${original}\nconst Object = 'not the intrinsic';\n`;
    expect(inspectC1FirebaseAuthDomainSource(root).ok).toBe(false);
    expect(inspectStageFSourceGaps(root).e2).toBe('PARTIAL');
  });

  it.each(mutations)(
    'rejects %s without closing Stage-F e2',
    (_name, change) => {
      sourceOverride.text = change(original);
      expect(sourceOverride.text).not.toBe(original);
      const result = inspectC1FirebaseAuthDomainSource(root);
      expect(result.ok).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(inspectStageFSourceGaps(root).e2).toBe('PARTIAL');
    }
  );

  it('accepts the real source and keeps Stage-F e2 closed', () => {
    expect(inspectC1FirebaseAuthDomainSource(root).issues).toEqual([]);
    expect(inspectStageFSourceGaps(root).e2).toBe('CLOSED');
  });

  it('accepts consistent parameter/local renames and equivalent type casts', () => {
    sourceOverride.text = original
      .replace(/\bvalue\b/g, 'input')
      .replace(/\bhost\b/g, 'candidate')
      .replace(
        '(C1_AUTHORIZED_FIREBASE_AUTH_DOMAINS as readonly string[])',
        '((C1_AUTHORIZED_FIREBASE_AUTH_DOMAINS) as readonly string[])'
      );
    expect(inspectC1FirebaseAuthDomainSource(root).issues).toEqual([]);
  });

  it('never executes comparator text carrying top-level side effects', () => {
    const sentinel = '__E1_14_SYNTHETIC_EXECUTION_SENTINEL__';
    expect(globalThis[sentinel]).toBeUndefined();
    sourceOverride.text = `${original}\nglobalThis.${sentinel} = true;\n`;
    const result = inspectC1FirebaseAuthDomainSource(root);
    expect(globalThis[sentinel]).toBeUndefined();
    expect(result.ok).toBe(false);
  });

  it('reports unprovable source when the comparator file is deleted', () => {
    sourceOverride.missing = true;
    expect(() => inspectC1FirebaseAuthDomainSource(root)).not.toThrow();
    expect(inspectC1FirebaseAuthDomainSource(root).ok).toBe(false);
  });

  it('reports unprovable source when the comparator file is unreadable', () => {
    sourceOverride.unreadable = true;
    expect(() => inspectC1FirebaseAuthDomainSource(root)).not.toThrow();
    expect(inspectC1FirebaseAuthDomainSource(root).ok).toBe(false);
  });

  it('rejects parse errors instead of treating a recovered AST as proof', () => {
    sourceOverride.text = `${original}\nconst broken = ;\n`;
    expect(inspectC1FirebaseAuthDomainSource(root).ok).toBe(false);
  });
});
