import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import {
  CLINIC_FREEZE_BASELINE,
  verifyClinicFreeze
} from './check-clinic-freeze.mjs';

describe('Clinic Homepage Freeze Guard (BOOK-MVP-002)', () => {
  it('passes verification against current repository files on disk', async () => {
    const result = await verifyClinicFreeze({
      baseline: CLINIC_FREEZE_BASELINE,
      reader: (filePath) => readFile(filePath)
    });

    expect(result.violations).toEqual([]);
    expect(result.pass).toBe(true);
  });

  it('contains exactly the 30 protected clinic files in the baseline', () => {
    const keys = Object.keys(CLINIC_FREEZE_BASELINE);
    expect(keys).toHaveLength(30);

    // Verify key categories are represented
    expect(keys).toContain('apps/web/public/clinic.html');
    expect(keys).toContain('apps/web/public/clinic-site.js');
    expect(keys).toContain('apps/web/public/clinic-site.css');
    expect(keys).toContain('apps/web/public/clinic-content.js');
    expect(keys).toContain('apps/web/public/clinic-booking.css');
    expect(keys).toContain('apps/web/clinic-assets.manifest.json');

    // All hash values must be valid 64-char hex strings
    for (const [file, hash] of Object.entries(CLINIC_FREEZE_BASELINE)) {
      expect(hash, `${file} hash validity`).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it('detects and reports file content modifications as freeze violations', async () => {
    const mockBaseline = {
      'apps/web/public/clinic.html':
        CLINIC_FREEZE_BASELINE['apps/web/public/clinic.html']
    };

    const mockBuffers = {
      'apps/web/public/clinic.html': Buffer.from('<!doctype html>MODIFIED')
    };

    const result = await verifyClinicFreeze({
      baseline: mockBaseline,
      fileBuffers: mockBuffers
    });

    expect(result.pass).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toContain(
      'Clinic freeze violation in apps/web/public/clinic.html: SHA-256 hash mismatch'
    );
  });

  it('detects and reports missing/unreadable files as freeze violations', async () => {
    const mockBaseline = {
      'apps/web/public/non-existent-clinic-file.html':
        '3b5c0de6caab960f2bdbc883fcfe5a38452bf08c5572be1202fbd647274583e8'
    };

    const result = await verifyClinicFreeze({
      baseline: mockBaseline,
      reader: async () => {
        throw new Error('ENOENT: no such file or directory');
      }
    });

    expect(result.pass).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toContain('failed to read file');
  });
});
