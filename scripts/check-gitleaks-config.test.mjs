import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const config = await readFile(new URL('../gitleaks.toml', import.meta.url), {
  encoding: 'utf8'
});

describe('gitleaks allowlist', () => {
  it('does not path-allowlist whole files', () => {
    expect(config).not.toMatch(/paths\s*=/);
  });

  it('allowlists only documented synthetic and vendor-sha256 shapes', () => {
    expect(config).toContain("'''payroll-close-key-\\d{4}'''");
    expect(config).toContain("'''schedule_publish_\\d{4}'''");
    expect(config).toContain("'''schedule-publish-key-\\d{4}'''");
    expect(config).toContain("'''booking-idempotency-\\d{4}'''");
    expect(config).toContain(
      '\'\'\'"[A-Za-z0-9.-]+\\.js": "[a-f0-9]{64}"\'\'\''
    );
    expect(config).toContain('regexTarget = "line"');
  });

  it('does not allowlist AWS or GitHub token shapes', () => {
    expect(config).not.toMatch(/AKIA[0-9A-Z]{16}/);
    expect(config).not.toMatch(/ghp_[A-Za-z0-9]/);
  });
});
