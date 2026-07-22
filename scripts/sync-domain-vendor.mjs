import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

// packages/domain 的編譯產物直接複製給瀏覽器載入（ADR-0004）。tsc 的輸出已是
// 合格的瀏覽器 ESM：純函式、無 node: 匯入、相對匯入帶 .js 副檔名。
//
// 兩種模式：
//   （無參數）  依 dist 重建 vendor 目錄，並寫入 manifest。
//   --check     只驗證 vendor 與 dist 一致，不寫入。給 verify 用。
//
// manifest 記錄每個檔案的 sha256，讓漂移在 CI 就被擋下，而不是等正式環境。

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const distDir = join(root, 'packages', 'domain', 'dist');
const vendorDir = join(root, 'apps', 'web', 'public', 'vendor', 'domain');
const manifestPath = join(vendorDir, 'manifest.json');

const checkOnly = process.argv.includes('--check');

const sha256 = (text) => createHash('sha256').update(text).digest('hex');

async function readDist() {
  let entries;
  try {
    entries = await readdir(distDir);
  } catch {
    throw new Error(
      'packages/domain/dist is missing. Run `corepack pnpm --filter @beauessence/domain build` first.'
    );
  }
  // 只搬瀏覽器實際會載入的 JS。宣告檔（.d.ts）與 source map 對執行沒有用，
  // 留在 vendor 只會變成必須跟著檢查的死重量。
  const files = entries.filter((name) => name.endsWith('.js')).sort();
  const contents = new Map();
  for (const name of files) {
    const raw = await readFile(join(distDir, name), 'utf8');
    // 剝掉 sourceMappingURL 註解：只搬 .js、不搬 .map，若留著這行，載入器
    // （瀏覽器或 vitest）會去找不存在的 map 而報錯。
    contents.set(name, raw.replace(/\n?\/\/# sourceMappingURL=.*$/m, '\n'));
  }
  assertBrowserSafe(contents);
  return contents;
}

// packages/domain 現在同時是瀏覽器與伺服器的相依（ADR-0004）。任何 node: 內建
// 匯入或裸名的第三方相依，在 Node 端能跑，在瀏覽器端會於執行期炸掉。這裡在
// 同步時就擋下，讓錯誤停在建置階段而不是使用者的瀏覽器。
function assertBrowserSafe(contents) {
  const offenders = [];
  for (const [name, text] of contents) {
    for (const match of text.matchAll(
      /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g
    )) {
      const specifier = match[1];
      const isRelative = specifier.startsWith('.') || specifier.startsWith('/');
      if (specifier.startsWith('node:') || !isRelative) {
        offenders.push(`${name}: ${specifier}`);
      }
    }
  }
  if (offenders.length > 0) {
    throw new Error(
      'packages/domain must stay browser-loadable, but these imports are not:\n' +
        offenders.map((line) => `  - ${line}`).join('\n') +
        '\nRemove the Node-only or third-party dependency from the domain package.'
    );
  }
}

function buildManifest(contents) {
  const files = {};
  for (const [name, text] of contents) files[name] = sha256(text);
  return { files };
}

async function readVendorManifest() {
  try {
    return JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch {
    return undefined;
  }
}

const contents = await readDist();
const manifest = buildManifest(contents);

if (checkOnly) {
  const failures = [];
  const stored = await readVendorManifest();

  if (stored === undefined) {
    failures.push('apps/web/public/vendor/domain/manifest.json is missing.');
  } else {
    const expected = manifest.files;
    const actual = stored.files ?? {};
    for (const [name, hash] of Object.entries(expected)) {
      if (actual[name] !== hash) {
        failures.push(`Vendored ${name} is stale or missing.`);
      }
    }
    for (const name of Object.keys(actual)) {
      if (expected[name] === undefined) {
        failures.push(`Vendored ${name} no longer exists in dist.`);
      }
    }
    // manifest 對得上，還要確認檔案本身沒有被手動改過。
    for (const [name, hash] of Object.entries(expected)) {
      try {
        const onDisk = await readFile(join(vendorDir, name), 'utf8');
        if (sha256(onDisk) !== hash) {
          failures.push(`Vendored ${name} was edited by hand.`);
        }
      } catch {
        failures.push(`Vendored ${name} is missing on disk.`);
      }
    }
  }

  if (failures.length > 0) {
    console.error('Vendored domain is out of sync with packages/domain/dist:');
    for (const failure of failures) console.error(`- ${failure}`);
    console.error(
      'Run `corepack pnpm sync:domain` after rebuilding the domain.'
    );
    process.exitCode = 1;
  } else {
    console.log(
      `Vendored domain is in sync (${Object.keys(manifest.files).length} files).`
    );
  }
} else {
  await rm(vendorDir, { recursive: true, force: true });
  await mkdir(vendorDir, { recursive: true });
  for (const [name, text] of contents) {
    await writeFile(join(vendorDir, name), text, 'utf8');
  }
  await writeFile(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8'
  );
  console.log(
    `Synced ${Object.keys(manifest.files).length} domain files into apps/web/public/vendor/domain.`
  );
}
