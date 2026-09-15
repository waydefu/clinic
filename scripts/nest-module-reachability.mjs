import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { stripComments } from './architecture-rules.mjs';

const defaultRoot = dirname(dirname(fileURLToPath(import.meta.url)));

export const APP_MODULE_PATH = 'apps/api/src/app.module.ts';

/**
 * Resolve a relative TypeScript import the same way `check-architecture`
 * does: ESM specifiers end in `.js`, the source file is `.ts`.
 */
export function resolveTypescriptSpecifier(fromPath, specifier) {
  if (!specifier.startsWith('.')) return undefined;
  const base = fromPath.slice(0, fromPath.lastIndexOf('/') + 1);
  const parts = `${base}${specifier}`.split('/');
  const normalized = [];
  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') normalized.pop();
    else normalized.push(part);
  }
  let target = normalized.join('/');
  if (target.endsWith('.js')) target = `${target.slice(0, -3)}.ts`;
  return target;
}

/**
 * Value (not `import type`) named bindings → specifier. Nest `imports` and
 * `controllers` arrays name runtime classes, so type-only bindings cannot
 * mount a controller.
 */
export function namedImportBindings(source) {
  const bindings = new Map();
  const stripped = stripComments(source);
  for (const match of stripped.matchAll(
    /(?:^|[\s;{(])import\s+(?!type\s)(?:[\w*][\w\s*,]*?,\s*)?\{([^}]+)\}\s+from\s*['"]([^'"]+)['"]/gm
  )) {
    const specifier = match[2];
    for (const part of match[1].split(',')) {
      const trimmed = part.trim();
      if (trimmed === '' || trimmed.startsWith('type ')) continue;
      const aliased = trimmed.match(/^(\w+)\s+as\s+(\w+)$/);
      if (aliased) {
        bindings.set(aliased[2], specifier);
        continue;
      }
      const named = trimmed.match(/^(\w+)$/);
      if (named) bindings.set(named[1], specifier);
    }
  }
  return bindings;
}

function skipWs(source, index) {
  while (index < source.length && /\s/.test(source[index])) index += 1;
  return index;
}

function extractBalanced(source, openIndex) {
  const open = source[openIndex];
  const close = open === '{' ? '}' : open === '[' ? ']' : undefined;
  if (close === undefined) return undefined;
  let depth = 0;
  let quote;
  for (let index = openIndex; index < source.length; index += 1) {
    const character = source[index];
    if (quote !== undefined) {
      if (character === '\\') {
        index += 1;
        continue;
      }
      if (character === quote) quote = undefined;
      continue;
    }
    if (character === "'" || character === '"' || character === '`') {
      quote = character;
      continue;
    }
    if (character === open) depth += 1;
    else if (character === close) {
      depth -= 1;
      if (depth === 0) return source.slice(openIndex, index + 1);
    }
  }
  return undefined;
}

function identifiersFromListInner(inner) {
  const identifiers = [];
  for (const raw of inner.split(',')) {
    const trimmed = raw.trim();
    if (trimmed === '') continue;
    const call = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\.\s*\w+\s*\(/);
    if (call) {
      identifiers.push(call[1]);
      continue;
    }
    const ident = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)$/);
    if (ident) identifiers.push(ident[1]);
  }
  return identifiers;
}

function extractKeyedIdentifierLists(source, key) {
  const stripped = stripComments(source);
  const found = [];
  const needle = `${key}:`;
  let searchFrom = 0;
  while (searchFrom < stripped.length) {
    const keyIndex = stripped.indexOf(needle, searchFrom);
    if (keyIndex === -1) break;
    const before = keyIndex === 0 ? '' : stripped[keyIndex - 1];
    if (/\w/.test(before)) {
      searchFrom = keyIndex + needle.length;
      continue;
    }
    let index = skipWs(stripped, keyIndex + needle.length);
    if (stripped[index] !== '[') {
      searchFrom = index;
      continue;
    }
    const list = extractBalanced(stripped, index);
    if (list === undefined) break;
    found.push(identifiersFromListInner(list.slice(1, -1)));
    searchFrom = index + list.length;
  }
  return found;
}

function unique(values) {
  return [...new Set(values)];
}

/**
 * Every `controllers` / `imports` array in the file, including DynamicModule
 * `register()` return objects. That is what mounts
 * `AppointmentController` through `InternalTestBookingModule.register()`.
 */
export function nestModuleSurface(source) {
  return {
    controllers: unique(
      extractKeyedIdentifierLists(source, 'controllers').flat()
    ),
    importedModules: unique(
      extractKeyedIdentifierLists(source, 'imports').flat()
    )
  };
}

/**
 * The first `@Module({...})` decorator only. Used to prove AppModule does not
 * list a production controller directly while still allowing a composing
 * module to mount it.
 */
export function nestModuleDecoratorSurface(source) {
  const stripped = stripComments(source);
  const match = stripped.match(/@Module\s*\(\s*\{/);
  if (match === null || match.index === undefined) {
    return { controllers: [], importedModules: [] };
  }
  const openIndex = stripped.indexOf('{', match.index);
  const block = extractBalanced(stripped, openIndex);
  if (block === undefined) return { controllers: [], importedModules: [] };
  return nestModuleSurface(block);
}

/**
 * Transitive Nest module/controller reachability from a composing entry.
 * A controller is routed only when a reachable module lists it in
 * `controllers`, not merely because some file imports its symbol.
 */
export function routedNestControllers(entryPath, sources) {
  const routedControllers = new Set();
  const visitedModules = new Set();
  const queue = [entryPath];
  while (queue.length > 0) {
    const current = queue.pop();
    if (current === undefined || visitedModules.has(current)) continue;
    const source = sources.get(current);
    if (source === undefined) continue;
    visitedModules.add(current);
    const bindings = namedImportBindings(source);
    const surface = nestModuleSurface(source);
    for (const name of surface.controllers) routedControllers.add(name);
    for (const name of surface.importedModules) {
      const specifier = bindings.get(name);
      if (specifier === undefined) continue;
      const target = resolveTypescriptSpecifier(current, specifier);
      if (target !== undefined) queue.push(target);
    }
  }
  return { routedControllers, visitedModules };
}

function walkTypeScriptFiles(directory, relativePrefix, sources) {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const relative = relativePrefix
      ? `${relativePrefix}/${entry.name}`
      : entry.name;
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      walkTypeScriptFiles(full, relative, sources);
      continue;
    }
    if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts'))
      continue;
    sources.set(relative.replaceAll('\\', '/'), readFileSync(full, 'utf8'));
  }
}

export function loadApiModuleSources(repoRoot = defaultRoot) {
  const sources = new Map();
  walkTypeScriptFiles(
    join(repoRoot, 'apps', 'api', 'src'),
    'apps/api/src',
    sources
  );
  return sources;
}
