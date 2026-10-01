import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { selectBrowserDomainFiles } from './sync-domain-vendor-rules.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

describe('browser domain sync boundary', () => {
  it('selects browser JavaScript and excludes server-only and declaration files', () => {
    expect(
      selectBrowserDomainFiles([
        'index.js',
        'x.node.js',
        'x.d.ts',
        'calendar-sync.js'
      ])
    ).toEqual(['calendar-sync.js', 'index.js']);
  });

  it('declares the node-only identity entry without vendoring it', async () => {
    const [packageManifest, vendorManifest] = await Promise.all([
      readFile(join(root, 'packages/domain/package.json'), 'utf8'),
      readFile(
        join(root, 'apps/web/public/vendor/domain/manifest.json'),
        'utf8'
      )
    ]);

    expect(JSON.parse(packageManifest).exports).toHaveProperty(
      './patient-lookup-identity.node'
    );
    expect(Object.keys(JSON.parse(vendorManifest).files)).not.toContain(
      'patient-lookup-identity.node.js'
    );
  });
});
