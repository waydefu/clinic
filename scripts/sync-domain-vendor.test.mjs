import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

describe('browser domain sync boundary', () => {
  it('keeps the Node-only lookup identity entry point out of browser output', async () => {
    const [
      syncScript,
      architectureScript,
      domainIndex,
      packageManifest,
      serverEntry,
      vendorManifest
    ] = await Promise.all([
      readFile(join(root, 'scripts/sync-domain-vendor.mjs'), 'utf8'),
      readFile(join(root, 'scripts/check-architecture.mjs'), 'utf8'),
      readFile(join(root, 'packages/domain/src/index.ts'), 'utf8'),
      readFile(join(root, 'packages/domain/package.json'), 'utf8'),
      readFile(
        join(root, 'packages/domain/src/patient-lookup-identity.node.ts'),
        'utf8'
      ),
      readFile(
        join(root, 'apps/web/public/vendor/domain/manifest.json'),
        'utf8'
      )
    ]);

    expect(syncScript).toContain("!name.endsWith('.node.js')");
    expect(architectureScript).toContain(
      "file.endsWith('.ts') && !file.endsWith('.node.ts')"
    );
    expect(architectureScript).toContain("allowedBare: ['node:crypto']");
    expect(domainIndex).not.toContain('patient-lookup-identity.node');
    expect(JSON.parse(packageManifest).exports).toHaveProperty(
      './patient-lookup-identity.node'
    );
    expect(serverEntry).toContain("from 'node:crypto'");
    expect(vendorManifest).not.toContain('patient-lookup-identity.node');
  });
});
