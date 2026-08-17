#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// PostToolUse: `check:docs` fails when a document under docs/ is not linked from
// docs/README.md. That failure arrives at the end of a long gate run, far from
// the context that would explain it. This says it at the moment the file is
// written, in one line, and stays silent otherwise.

export const INDEX = 'docs/README.md';

const posix = (value) => value.split(sep).join('/');

export function missingIndexEntry(relativePath, indexText) {
  if (!relativePath.startsWith('docs/')) return false;
  if (!relativePath.endsWith('.md')) return false;
  if (relativePath === INDEX) return false;
  return !indexText.includes(relativePath.slice('docs/'.length));
}

function main() {
  const payload = JSON.parse(readFileSync(0, 'utf8'));
  const filePath = payload?.tool_input?.file_path;
  if (typeof filePath !== 'string') return;

  const root = posix(payload?.cwd ?? process.cwd());
  const relative = posix(filePath).replace(`${root}/`, '').replace(/^\.\//, '');

  const indexText = readFileSync(`${root}/${INDEX}`, 'utf8');
  if (!missingIndexEntry(relative, indexText)) return;

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: `${relative} is not linked from ${INDEX}. corepack pnpm run check:docs will fail until it is. Dated review and handoff records go in the "Review record" section; retired material goes under "Superseded".`
      }
    })
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch {
    // Never let a reminder break an edit.
  }
}
