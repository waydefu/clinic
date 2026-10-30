import { accessSync, constants } from 'node:fs';
import { join } from 'node:path';

const DEFAULT_PATHEXT = '.COM;.EXE;.BAT;.CMD';

/**
 * Is `name` an executable on PATH?
 *
 * PATH is split with the delimiter of the platform being asked about (`;` on
 * win32, `:` elsewhere), and on win32 a command only counts when a PATHEXT
 * extension is appended, as the shell would resolve it (E2-04). `env`,
 * `platform` and `access` are parameters so a test can use a fake PATH and a fake
 * file system; `access` throws when the file is not executable.
 */
export function hasCli(
  name,
  {
    env = process.env,
    platform = process.platform,
    access = (path) => accessSync(path, constants.X_OK)
  } = {}
) {
  const win32 = platform === 'win32';
  const rawPath = (win32 ? (env.PATH ?? env.Path) : env.PATH) ?? '';
  const dirs = rawPath.split(win32 ? ';' : ':').filter(Boolean);
  const extensions = win32
    ? (env.PATHEXT ?? DEFAULT_PATHEXT)
        .split(';')
        .filter(Boolean)
        .flatMap((ext) => [ext, ext.toLowerCase()])
    : [''];
  for (const dir of dirs) {
    for (const ext of extensions) {
      try {
        access(join(dir, `${name}${ext}`));
        return true;
      } catch {
        /* keep scanning PATH */
      }
    }
  }
  return false;
}

export function terraformCliStatus(options) {
  return {
    gcloud: hasCli('gcloud', options),
    terraform: hasCli('terraform', options),
    firebase: hasCli('firebase', options)
  };
}
