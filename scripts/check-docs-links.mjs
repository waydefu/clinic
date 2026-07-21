import { readFile, stat } from 'node:fs/promises';
import { glob } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import process from 'node:process';

// This project carries more governance documentation than code, and a stale
// cross-reference is as misleading as stale code. Two rules are enforced:
//   1. every relative markdown link resolves to a file that exists;
//   2. every document under docs/ is reachable from the canonical index,
//      so a new document cannot be added without registering it.

const INDEX = 'docs/README.md';
const failures = [];

const markdownFiles = [];
for await (const entry of glob('**/*.md', { cwd: process.cwd() })) {
  if (entry.includes('node_modules')) continue;
  markdownFiles.push(entry);
}

const linkPattern = /\[[^\]]*\]\(([^)\s]+)\)/g;

function linksIn(text) {
  return [...text.matchAll(linkPattern)]
    .map((match) => match[1])
    .filter((target) => !/^(https?:|mailto:|#)/.test(target))
    .map((target) => target.split('#')[0])
    .filter((target) => target !== '');
}

for (const file of markdownFiles) {
  const text = await readFile(file, 'utf8');
  for (const target of linksIn(text)) {
    const absolute = resolve(
      dirname(resolve(file)),
      decodeURIComponent(target)
    );
    try {
      await stat(absolute);
    } catch {
      failures.push(`Broken link in ${file}: ${target}`);
    }
  }
}

const indexText = await readFile(INDEX, 'utf8');
const indexed = new Set(
  linksIn(indexText).map((target) =>
    relative(process.cwd(), resolve(dirname(resolve(INDEX)), target))
      .split(sep)
      .join('/')
  )
);

for (const file of markdownFiles) {
  const normalised = file.split(sep).join('/');
  if (!normalised.startsWith('docs/')) continue;
  if (normalised === INDEX) continue;
  if (!indexed.has(normalised)) {
    failures.push(`Document is not listed in ${INDEX}: ${normalised}`);
  }
}

if (failures.length > 0) {
  console.error('Documentation check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `Documentation check passed (${markdownFiles.length} files, all links resolve, all docs indexed).`
  );
}
