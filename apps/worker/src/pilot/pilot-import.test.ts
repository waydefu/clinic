import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('node:fs', () => ({ readFileSync: vi.fn() }));
const originalExitCode = process.exitCode;
afterEach(() => {
  process.exitCode = originalExitCode;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('rejects the retired import before reading credentials or calling a provider', async () => {
  vi.stubEnv('CAL_PILOT_SOURCE_CALENDAR_ID', 'synthetic-source');
  vi.stubEnv('CAL_PILOT_TEST_CALENDAR_ID', 'synthetic-target');
  vi.stubEnv('CAL_PILOT_PSEUDONYM_KEY', 'synthetic-not-a-credential');
  vi.stubEnv('CAL_PILOT_SOURCE_KEY_FILE', 'synthetic-source-not-a-key.json');
  vi.stubEnv('CAL_PILOT_WRITER_KEY_FILE', 'synthetic-writer-not-a-key.json');
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  await import('./pilot-import.js');
  await Promise.resolve();
  expect(error).toHaveBeenCalledWith(
    '失敗：',
    'LEGACY_CALENDAR_IMPORT_DISABLED: use synthetic-only tests; no credential or source reads are authorized.'
  );
  expect(readFileSync).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  expect(process.exitCode).toBe(1);
});
