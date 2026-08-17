#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// SessionStart: state the working-tree facts once, so a session does not spend
// its first three tool calls rediscovering them and does not start editing on
// top of somebody else's uncommitted work.
//
// Kept to a handful of lines on purpose. This text is prepended to every
// session, so anything that is merely interesting costs tokens forever.

const posix = (value) => value.split(sep).join('/');

const git = (args, cwd) =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore']
  }).trim();

export function describeWorktree({
  root,
  branch,
  status,
  worktrees,
  hasModules,
  cwd
}) {
  const lines = [`Repository: ${root} (branch ${branch || 'DETACHED'})`];

  const changed = status.split('\n').filter(Boolean);
  if (changed.length === 0) lines.push('Working tree: clean.');
  else {
    const shown = changed.slice(0, 5).map((entry) => entry.trim());
    lines.push(
      `Working tree: ${changed.length} uncommitted change(s) present at session start: ${shown.join(', ')}${changed.length > 5 ? ', ...' : ''}`,
      'Treat these as the user or another agent working. Report them before you edit, and never reset, clean or stash them.'
    );
  }

  const others = worktrees.filter((path) => path !== root);
  if (others.length > 0)
    lines.push(
      `Other checkouts of this repository are live: ${others.join(', ')}. Another agent may be changing the same files.`
    );

  if (!hasModules)
    lines.push(
      'node_modules/ is absent, so no gate can run. Report the environment prerequisite instead of triggering an implicit install.'
    );

  if (cwd !== root)
    lines.push(
      `Current directory is ${cwd}, not the repository root. Gate scripts resolve paths against the working directory; run them from the root.`
    );

  return lines.join('\n');
}

function main() {
  const cwd = posix(process.cwd());
  const root = posix(git(['rev-parse', '--show-toplevel'], process.cwd()));
  const worktrees = git(['worktree', 'list', '--porcelain'], root)
    .split('\n')
    .filter((line) => line.startsWith('worktree '))
    .map((line) => posix(line.slice('worktree '.length)));

  process.stdout.write(
    describeWorktree({
      root,
      branch: git(['branch', '--show-current'], root),
      status: git(['status', '--porcelain'], root),
      worktrees,
      hasModules: existsSync(`${root}/node_modules`),
      cwd
    })
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch {
    // Outside a repository, or Git unavailable. Say nothing rather than fail.
  }
}
