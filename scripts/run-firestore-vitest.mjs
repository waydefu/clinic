import { spawn } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const workspaceRoot = fileURLToPath(new URL('../', import.meta.url));
const vitestEntryPoint = fileURLToPath(
  new URL('../node_modules/vitest/vitest.mjs', import.meta.url)
);

const child = spawn(
  process.execPath,
  [
    vitestEntryPoint,
    'run',
    '--config',
    'vitest.rules.config.ts',
    ...process.argv.slice(2)
  ],
  { cwd: workspaceRoot, stdio: 'inherit' }
);

child.once('error', (error) => {
  throw error;
});

child.once('close', (code) => {
  process.exitCode = code ?? 1;
});
