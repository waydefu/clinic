import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runVitest } from './run-firestore-vitest.mjs';

const workspaceRoot = fileURLToPath(new URL('../', import.meta.url));
const vitestEntryPoint = fileURLToPath(
  new URL('../node_modules/vitest/vitest.mjs', import.meta.url)
);
const forwardedArgs = ['--reporter=dot', '--testNamePattern', 'synthetic'];

function createHarness() {
  const child = new EventEmitter();
  const processObject = {
    execPath: '/synthetic/node',
    argv: [
      '/synthetic/node',
      'scripts/run-firestore-vitest.mjs',
      ...forwardedArgs
    ],
    exitCode: undefined
  };
  const spawnProcess = vi.fn(() => child);

  return { child, processObject, spawnProcess };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('runVitest', () => {
  it('preserves the Vitest invocation and successful exit code', async () => {
    const { child, processObject, spawnProcess } = createHarness();
    const completion = runVitest({ spawnProcess, processObject });

    child.emit('close', 0, null);

    await expect(completion).resolves.toBe(0);
    expect(processObject.exitCode).toBe(0);
    expect(spawnProcess).toHaveBeenCalledOnce();
    expect(spawnProcess).toHaveBeenCalledWith(
      '/synthetic/node',
      [
        vitestEntryPoint,
        'run',
        '--config',
        'vitest.rules.config.ts',
        ...forwardedArgs
      ],
      { cwd: workspaceRoot, stdio: 'inherit' }
    );
  });

  it('preserves a nonzero Vitest exit code', async () => {
    const { child, processObject, spawnProcess } = createHarness();
    const completion = runVitest({ spawnProcess, processObject });

    child.emit('close', 23, null);

    await expect(completion).resolves.toBe(23);
    expect(processObject.exitCode).toBe(23);
  });

  it('uses a nonzero exit code when the child closes without a code', async () => {
    const { child, processObject, spawnProcess } = createHarness();
    const completion = runVitest({ spawnProcess, processObject });

    child.emit('close', null, 'SIGTERM');

    await expect(completion).resolves.toBe(1);
    expect(processObject.exitCode).toBe(1);
  });

  it('handles async spawn error before a later close(0)', async () => {
    const { child, processObject, spawnProcess } = createHarness();
    const reportError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const completion = runVitest({ spawnProcess, processObject });

    child.emit('error', new Error('synthetic spawn failure'));
    child.emit('close', 0, null);

    await expect(completion).resolves.toBe(1);
    expect(processObject.exitCode).toBe(1);
    expect(reportError).toHaveBeenCalledWith(
      'Unable to start Firestore Vitest: synthetic spawn failure'
    );
  });

  it('reports a sync spawn throw through the same failure path', async () => {
    const processObject = {
      execPath: '/synthetic/node',
      argv: [
        '/synthetic/node',
        'scripts/run-firestore-vitest.mjs',
        ...forwardedArgs
      ],
      exitCode: undefined
    };
    const spawnProcess = vi.fn(() => {
      throw new Error('synthetic synchronous failure');
    });
    const reportError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const completion = runVitest({ spawnProcess, processObject });

    await expect(completion).resolves.toBe(1);
    expect(processObject.exitCode).toBe(1);
    expect(reportError).toHaveBeenCalledWith(
      'Unable to start Firestore Vitest: synthetic synchronous failure'
    );
  });
});
