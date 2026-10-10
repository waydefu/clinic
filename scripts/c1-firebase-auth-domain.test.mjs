import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  C1_AUTHORIZED_FIREBASE_AUTH_DOMAINS,
  evaluateC1FirebaseAuthDomain,
  inspectC1FirebaseAuthDomainSource,
  isAuthorizedC1FirebaseAuthDomain,
  ISOLATED_C1_FIREBASE_AUTH_DOMAIN,
  ISOLATED_C1_FIREBASE_AUTH_HANDLER
} from './c1-firebase-auth-domain.mjs';

describe('C1 firebase authDomain policy', () => {
  it('accepts only the authorized isolated preview host', () => {
    expect(C1_AUTHORIZED_FIREBASE_AUTH_DOMAINS).toEqual([
      ISOLATED_C1_FIREBASE_AUTH_DOMAIN
    ]);
    expect(ISOLATED_C1_FIREBASE_AUTH_DOMAIN).toBe(
      'beauessence-clinic-stg-c1a01--internal-preproduction-3u85hkcz.web.app'
    );
    expect(
      isAuthorizedC1FirebaseAuthDomain(ISOLATED_C1_FIREBASE_AUTH_DOMAIN)
    ).toBe(true);
    expect(
      evaluateC1FirebaseAuthDomain(ISOLATED_C1_FIREBASE_AUTH_DOMAIN)
    ).toEqual({ ok: true, issues: [] });
    expect(ISOLATED_C1_FIREBASE_AUTH_HANDLER).toBe(
      `https://${ISOLATED_C1_FIREBASE_AUTH_DOMAIN}/__/auth/handler`
    );
  });

  it('fails closed for missing, firebaseapp.com, staging, production, and arbitrary hosts', () => {
    expect(evaluateC1FirebaseAuthDomain('').ok).toBe(false);
    expect(evaluateC1FirebaseAuthDomain(undefined).ok).toBe(false);
    expect(
      isAuthorizedC1FirebaseAuthDomain(
        'beauessence-clinic-stg-c1a01.firebaseapp.com'
      )
    ).toBe(false);
    expect(
      isAuthorizedC1FirebaseAuthDomain(
        'beauessence-clinic-staging.firebaseapp.com'
      )
    ).toBe(false);
    expect(isAuthorizedC1FirebaseAuthDomain('beauessence.com.tw')).toBe(false);
    expect(isAuthorizedC1FirebaseAuthDomain('staff.beauessence.com.tw')).toBe(
      false
    );
    expect(isAuthorizedC1FirebaseAuthDomain('example.com')).toBe(false);
    expect(
      isAuthorizedC1FirebaseAuthDomain(
        `https://${ISOLATED_C1_FIREBASE_AUTH_DOMAIN}`
      )
    ).toBe(false);
    expect(isAuthorizedC1FirebaseAuthDomain('*.web.app')).toBe(false);
    expect(inspectC1FirebaseAuthDomainSource().issues).toEqual([]);
    expect(inspectC1FirebaseAuthDomainSource().ok).toBe(true);
  });
});

describe('C1 firebase authDomain apply requirement', () => {
  const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const files = [
    'infra/terraform/c1-internal-test-run/main.tf',
    'infra/terraform/c1-internal-test-run/variables.tf',
    'infra/terraform/c1-internal-test-run/terraform.tfvars.example',
    'infra/terraform/c1-internal-test-run/noop.tftest.hcl',
    'apps/api/src/platform/runtime/c1-firebase-auth-domain.ts',
    'infra/config/c1-internal-test-config-contract.json'
  ];

  function inspectMutatedCopy(mutate) {
    const dir = mkdtempSync(join(tmpdir(), 'c1-authdomain-'));
    try {
      for (const file of files) {
        mkdirSync(dirname(join(dir, file)), { recursive: true });
        cpSync(join(repoRoot, file), join(dir, file));
      }
      mutate((file, change) => {
        const target = join(dir, file);
        writeFileSync(target, change(readFileSync(target, 'utf8')));
      });
      return inspectC1FirebaseAuthDomainSource(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  const blockingIssue =
    'C1 Terraform must block apply (variable validation, not a warning-only check block) when firebase_auth_domain is missing.';

  it('accepts an unmodified copy of the source', () => {
    expect(inspectMutatedCopy(() => {})).toEqual({ ok: true, issues: [] });
  });

  it('reports a warning-only check block as not blocking apply', () => {
    const result = inspectMutatedCopy((edit) => {
      edit(
        'infra/terraform/c1-internal-test-run/main.tf',
        (source) =>
          `${source}
check "auth_domain_required_on_apply" {
  assert {
    condition     = true
    error_message = "warn only"
  }
}
`
      );
    });
    expect(result.ok).toBe(false);
    expect(result.issues).toContain(blockingIssue);
  });

  it('reports a missing authDomain apply validation', () => {
    const result = inspectMutatedCopy((edit) => {
      edit('infra/terraform/c1-internal-test-run/variables.tf', (source) =>
        source.replace(
          'requires firebase_auth_domain set to an authorized isolated Hosting host.',
          'requires nothing.'
        )
      );
    });
    expect(result.ok).toBe(false);
    expect(result.issues).toContain(blockingIssue);
  });
});

describe('C1 firebase authDomain API comparator syntax', () => {
  const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const apiFile = 'apps/api/src/platform/runtime/c1-firebase-auth-domain.ts';
  const comparatorIssue =
    'API runtime authDomain comparator must be an exported function that denies by default and allows only hosts in the exported allowlist.';
  const allowlistIssue =
    'API runtime allowlist must be an exported array literal of exactly the authorized isolated preview hosts.';

  function inspectWithApiSource(change) {
    const dir = mkdtempSync(join(tmpdir(), 'c1-authdomain-syntax-'));
    try {
      for (const file of [
        'infra/terraform/c1-internal-test-run/main.tf',
        'infra/terraform/c1-internal-test-run/variables.tf',
        'infra/terraform/c1-internal-test-run/terraform.tfvars.example',
        'infra/terraform/c1-internal-test-run/noop.tftest.hcl',
        apiFile,
        'infra/config/c1-internal-test-config-contract.json'
      ]) {
        mkdirSync(dirname(join(dir, file)), { recursive: true });
        cpSync(join(repoRoot, file), join(dir, file));
      }
      const target = join(dir, apiFile);
      writeFileSync(target, change(readFileSync(target, 'utf8')));
      return inspectC1FirebaseAuthDomainSource(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it('accepts the owning comparator and allowlist as written', () => {
    expect(inspectWithApiSource((source) => source).issues).toEqual([]);
  });

  it('rejects a comparator that allows every host', () => {
    const result = inspectWithApiSource((source) =>
      source.replace(
        /export function isAuthorizedC1FirebaseAuthDomain\([\s\S]*?\n\}\n/u,
        'export function isAuthorizedC1FirebaseAuthDomain(value: string | undefined): boolean {\n  return true;\n}\n'
      )
    );
    expect(result.ok).toBe(false);
    expect(result.issues).toContain(comparatorIssue);
  });

  it('rejects an allow shortcut hidden inside an otherwise intact comparator', () => {
    const result = inspectWithApiSource((source) =>
      source.replace(
        "  if (host === '') return false;\n",
        "  if (host === '') return false;\n  if (host.endsWith('.web.app')) return true;\n"
      )
    );
    expect(result.ok).toBe(false);
    expect(result.issues).toContain(comparatorIssue);
  });

  it('rejects policy that exists only in comments', () => {
    const result = inspectWithApiSource(
      (source) =>
        `${source
          .split('\n')
          .map((line) => `// ${line}`)
          .join(
            '\n'
          )}\nexport const isAuthorizedC1FirebaseAuthDomain = () => true;\n`
    );
    expect(result.ok).toBe(false);
    expect(result.issues).toContain(comparatorIssue);
    expect(result.issues).toContain(allowlistIssue);
  });

  it('rejects an allowlist that adds an unapproved host', () => {
    const result = inspectWithApiSource((source) =>
      source.replace(
        "'beauessence-clinic-stg-c1a01--internal-preproduction-3u85hkcz.web.app'",
        "'beauessence-clinic-stg-c1a01--internal-preproduction-3u85hkcz.web.app',\n  'unapproved.web.app'"
      )
    );
    expect(result.ok).toBe(false);
    expect(result.issues).toContain(allowlistIssue);
  });
});
