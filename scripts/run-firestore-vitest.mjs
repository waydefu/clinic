import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const workspaceRoot = fileURLToPath(new URL('../', import.meta.url));
const vitestEntryPoint = fileURLToPath(
  new URL('../node_modules/vitest/vitest.mjs', import.meta.url)
);

export function runVitest({
  spawnProcess = spawn,
  processObject = process
} = {}) {
  return new Promise((resolveCompletion) => {
    let completed = false;

    const finish = (code) => {
      if (completed) return;
      completed = true;
      processObject.exitCode = code ?? 1;
      resolveCompletion(processObject.exitCode);
    };

    const failToStart = (error) => {
      if (completed) return;
      const detail = error instanceof Error ? error.message : String(error);
      finish(1);
      console.error(`Unable to start Firestore Vitest: ${detail}`);
    };

    try {
      const child = spawnProcess(
        processObject.execPath,
        [
          vitestEntryPoint,
          'run',
          '--config',
          'vitest.rules.config.ts',
          ...processObject.argv.slice(2)
        ],
        { cwd: workspaceRoot, stdio: 'inherit' }
      );

      child.once('error', failToStart);
      child.once('close', (code) => finish(code));
    } catch (error) {
      failToStart(error);
    }
  });
}

if (
  process.argv[1] !== undefined &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
) {
  await runVitest();
}
