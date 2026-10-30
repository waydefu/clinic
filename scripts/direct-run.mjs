import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * True when `moduleUrl` (pass `import.meta.url`) is the script Node was started
 * with. Comparing against `file://${argv[1]}` fails for every Windows path
 * (backslashes, drive letter) and for any path that needs URL escaping, so the
 * script's main block never ran there (E2-05).
 */
export function isDirectRun(moduleUrl, argv1 = process.argv[1]) {
  return (
    typeof argv1 === 'string' &&
    argv1 !== '' &&
    moduleUrl === pathToFileURL(resolve(argv1)).href
  );
}
