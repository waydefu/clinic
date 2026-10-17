import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const scanFault = vi.hoisted(() => ({ mode: undefined, hits: 0 }));
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    async readFile(path, ...options) {
      const normalized = String(path).replaceAll('\\', '/');
      if (
        scanFault.mode === 'READ_EIO' &&
        scanFault.hits === 0 &&
        normalized.endsWith('/apps/api/src/main.ts')
      ) {
        scanFault.hits += 1;
        throw Object.assign(
          new Error('Synthetic reachable-source read failure'),
          { code: 'EIO' }
        );
      }
      return actual.readFile(path, ...options);
    },
    async readdir(path, options) {
      const normalized = String(path).replaceAll('\\', '/');
      if (
        scanFault.mode &&
        normalized.endsWith('/__synthetic_unreadable_arch__')
      ) {
        scanFault.hits += 1;
        throw Object.assign(new Error('Synthetic scan failure'), {
          code: scanFault.mode
        });
      }
      if (
        scanFault.mode === 'ENOENT' &&
        normalized.endsWith('/packages/contracts/src')
      ) {
        scanFault.hits += 1;
        throw Object.assign(new Error('Synthetic missing required directory'), {
          code: 'ENOENT'
        });
      }
      const entries = await actual.readdir(path, options);
      if (
        ['EACCES', 'EIO'].includes(scanFault.mode) &&
        normalized.endsWith('/packages/domain/src')
      ) {
        return [
          ...entries,
          { name: '__synthetic_unreadable_arch__', isDirectory: () => true }
        ];
      }
      return entries;
    }
  };
});

let originalExitCode;
beforeEach(() => {
  originalExitCode = process.exitCode;
  process.exitCode = undefined;
  scanFault.mode = undefined;
  scanFault.hits = 0;
  vi.resetModules();
});
afterEach(() => {
  process.exitCode = originalExitCode;
  scanFault.mode = undefined;
  vi.restoreAllMocks();
});

describe('architecture CLI required-source scan failures', () => {
  it.each(['ENOENT', 'EACCES', 'EIO'])(
    'does not declare PASS after a synthetic %s scan failure',
    async (code) => {
      scanFault.mode = code;
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
      const output = vi.spyOn(console, 'log').mockImplementation(() => {});
      // Import only the trusted repository gate. The fake directory
      // entries are in-memory fs metadata, never source to be executed.
      await import('./check-architecture.mjs');
      expect(scanFault.hits).toBeGreaterThan(0);
      expect(process.exitCode).toBe(1);
      expect(errors.mock.calls.flat().join('\n')).toMatch(/scan-failure/i);
      expect(output.mock.calls.flat().join('\n')).not.toMatch(
        /Architecture check passed/
      );
    }
  );

  it('reports a reachable-module read error as a scan failure, not evidence of missing routes', async () => {
    scanFault.mode = 'READ_EIO';
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await import('./check-architecture.mjs');
    expect(scanFault.hits).toBe(1);
    expect(process.exitCode).toBe(1);
    expect(errors.mock.calls.flat().join('\n')).toMatch(/scan-failure/i);
  });

  it('keeps the normal trusted source tree passing', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const output = vi.spyOn(console, 'log').mockImplementation(() => {});
    await import('./check-architecture.mjs');
    expect(scanFault.hits).toBe(0);
    expect(process.exitCode).not.toBe(1);
    expect(errors).not.toHaveBeenCalled();
    expect(output.mock.calls.flat().join('\n')).toMatch(
      /Architecture check passed/
    );
  });
});
