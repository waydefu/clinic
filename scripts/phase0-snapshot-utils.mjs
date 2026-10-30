import { spawnSync } from 'node:child_process';

export function parseFirebaseLoginAccount(output) {
  const match = output.match(/^\s*Logged in as\s+([^\s]+@[^\s]+)\s*$/m);
  return match ? match[1] : '';
}

export function redactAccount(value) {
  const at = value.indexOf('@');
  return at === -1 ? value : `domain=${value.slice(at + 1)}`;
}

/**
 * Run an argv array without a shell and return trimmed stdout, or '' when the
 * command is missing or exits non-zero. Each element is one argument, so an
 * argument with spaces or quotes cannot change what runs (E2-07).
 */
export function runCommand(argv, { cwd, spawn = spawnSync } = {}) {
  const [exe, ...args] = argv;
  const result = spawn(exe, args, {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
    shell: false
  });
  if (result.error || result.status !== 0) return '';
  return (result.stdout ?? '').trim();
}

/** Exit status only: no output is captured, so a printed token is never held. */
export function commandSucceeds(argv, { cwd, spawn = spawnSync } = {}) {
  const [exe, ...args] = argv;
  const result = spawn(exe, args, { cwd, stdio: 'ignore', shell: false });
  return !result.error && result.status === 0;
}

export function outputLines(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}
