import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

import {
  forbiddenBrowserPatterns,
  importSpecifiers,
  layerViolations
} from './architecture-rules.mjs';
import {
  validateRbacPermissionCoverage,
  validateReachableCapabilityBlockers,
  validateUnroutedInventory
} from './unrouted-inventory.mjs';

// 架構守衛：把「哪一層可以依賴哪一層」「哪些程式刻意還沒接線」「哪些規則只能
// 有一份」從口頭約定變成 CI 會擋的條件。
//
// 這支腳本補的是既有把關**測不到**的那一塊：
//   - `check:sync` 只保證 vendored domain 副本與 dist 位元一致，不保證瀏覽器
//     沒有另外自己寫一份同樣的規則；
//   - 型別檢查擋得住錯誤的匯入型別，擋不住「方向對反」的依賴；
//   - 單元測試會通過，即使一個檔案從來沒有被任何路由載入過。
//
// 三條規則各自對應一個真實發生過的問題，違反時的訊息都要說清楚該怎麼修。

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const failures = [];
const fail = (rule, detail) => failures.push({ rule, detail });

const toPosix = (value) => value.split('\\').join('/');
const repoPath = (absolute) => toPosix(relative(root, absolute));

async function walk(directory, predicate) {
  const found = [];
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...(await walk(full, predicate)));
    else if (predicate(full)) found.push(full);
  }
  return found;
}

/**
 * 去掉註解，保留字串內容。
 *
 * 規則 3 是對原始碼做字面比對，而註解裡本來就會**引用**被禁止的寫法來說明為什麼
 * 禁止它——taipei-time.js 的檔頭正是這樣，第一版守衛因此對唯一合規的檔案報錯。
 * 一支會誤報的守衛最後一定會被關掉，所以這裡要準確。
 *
 * 掃描時要認得字串邊界，否則 `'https://…'` 會被當成行註解的開頭而把後半截吃掉。
 */
// --- 規則 1：依賴方向 ----------------------------------------------------
//
// domain 是最內層，不可以認識任何外層；contracts 只依賴 zod；瀏覽器沒有打包器
// 解析裸名，所有匯入都必須是相對路徑。方向一旦寫反，型別檢查照樣會過。
const LAYERS = [
  {
    label: 'packages/domain',
    directory: join(root, 'packages', 'domain', 'src'),
    match: (file) => file.endsWith('.ts'),
    allowedBare: ['vitest'],
    why: 'domain 必須同時能在 Node 與瀏覽器載入，且不得認識任何外層。'
  },
  {
    label: 'packages/contracts',
    directory: join(root, 'packages', 'contracts', 'src'),
    match: (file) => file.endsWith('.ts'),
    allowedBare: ['zod', 'vitest'],
    why: 'contracts 是線路格式，只依賴 zod；它不得反過來依賴 domain 或 apps。'
  },
  {
    label: 'apps/web/public',
    directory: join(root, 'apps', 'web', 'public'),
    match: (file) => file.endsWith('.js'),
    allowedBare: [],
    why: '瀏覽器是原生 ESM，沒有解析裸名的打包器——裸名匯入會在使用者端 404。'
  }
];

for (const layer of LAYERS) {
  const files = await Promise.all(
    (await walk(layer.directory, layer.match)).map(async (file) => ({
      path: repoPath(file),
      source: await readFile(file, 'utf8')
    }))
  );
  for (const violation of layerViolations(layer, files)) {
    fail('layering', violation.detail);
  }
}

// --- 規則 2：未接線的 API 程式必須是「宣告過的」 -------------------------
//
// Phase 1 的閘門讓 apps/api 只掛 /v1/health，其餘寫入路徑刻意不接。問題不是它們
// 存在，而是「存在但沒有人記得為什麼」——那正是死程式的定義。這條規則要求每個
// 從 main.ts 走不到的檔案都必須列在 inventory，並把「已核准的政策依據」和「尚未
// 完成的切片／部署授權／待決決策」分開；RBAC action 另有不隨檔案可達性消失的
// capability gate。反過來，一旦某個檔案真的接上路由，它就必須從 unrouted 清單
// 移除，但 action-level gate 仍保留到對應決策與 Stage 真正完成。
const apiSource = join(root, 'apps', 'api', 'src');
const inventoryPath = join(root, 'apps', 'api', 'unrouted-inventory.json');
const decisionRegisterPath = join(
  root,
  'docs',
  'product',
  'phase-1-decision-register.md'
);
const stageGateStatusPath = join(
  root,
  'docs',
  'architecture',
  'stage-2-gate-status.json'
);
let inventory;
try {
  inventory = JSON.parse(await readFile(inventoryPath, 'utf8'));
} catch (error) {
  fail(
    'unrouted-inventory',
    `apps/api/unrouted-inventory.json 不是有效 JSON：${error instanceof Error ? error.message : String(error)}`
  );
  inventory = {};
}
let stageGateStatus;
try {
  stageGateStatus = JSON.parse(await readFile(stageGateStatusPath, 'utf8'));
} catch (error) {
  fail(
    'unrouted-inventory',
    `docs/architecture/stage-2-gate-status.json 不是有效 JSON：${error instanceof Error ? error.message : String(error)}`
  );
  stageGateStatus = {};
}
const decisionRegisterSource = await readFile(decisionRegisterPath, 'utf8');
for (const detail of validateUnroutedInventory(
  inventory,
  decisionRegisterSource,
  stageGateStatus
)) {
  fail('unrouted-inventory', detail);
}
const rbacSource = await readFile(
  join(apiSource, 'platform', 'authorization', 'rbac.ts'),
  'utf8'
);
for (const detail of validateRbacPermissionCoverage(inventory, rbacSource)) {
  fail('unrouted-inventory', detail);
}
const declaredEntries =
  typeof inventory.unrouted === 'object' &&
  inventory.unrouted !== null &&
  !Array.isArray(inventory.unrouted)
    ? inventory.unrouted
    : {};
const declared = new Set(Object.keys(declaredEntries));

async function reachableFrom(entry) {
  const seen = new Set();
  const queue = [entry];
  while (queue.length > 0) {
    const current = queue.pop();
    if (current === undefined || seen.has(current)) continue;
    seen.add(current);
    let source;
    try {
      source = await readFile(current, 'utf8');
    } catch {
      continue;
    }
    for (const specifier of importSpecifiers(source)) {
      if (!specifier.startsWith('.')) continue;
      // tsc 的 ESM 輸出匯入 './x.js'，磁碟上是 './x.ts'。
      const resolved = resolve(dirname(current), specifier).replace(
        /\.js$/,
        '.ts'
      );
      queue.push(resolved);
    }
  }
  return seen;
}

const reachable = await reachableFrom(join(apiSource, 'main.ts'));
const apiFiles = await walk(
  apiSource,
  (file) => file.endsWith('.ts') && !file.endsWith('.test.ts')
);
const reachableApiSources = new Map();
for (const file of apiFiles) {
  if (!reachable.has(file)) continue;
  reachableApiSources.set(
    toPosix(relative(join(root, 'apps', 'api'), file)),
    await readFile(file, 'utf8')
  );
}
for (const detail of validateReachableCapabilityBlockers(
  inventory,
  reachableApiSources
)) {
  fail('capability-reachability', detail);
}

for (const file of apiFiles) {
  const key = toPosix(relative(join(root, 'apps', 'api'), file));
  const isReachable = reachable.has(file);
  if (!isReachable && !declared.has(key)) {
    fail(
      'unrouted-inventory',
      `${repoPath(file)} 從 main.ts 走不到，也沒有列在 apps/api/unrouted-inventory.json。` +
        ' 若是刻意不接線，請列入清單並分開記錄已核准政策與實際剩餘阻擋；否則就是沒有人會執行到的死程式。'
    );
  }
  if (isReachable && declared.has(key)) {
    fail(
      'unrouted-inventory',
      `${repoPath(file)} 已經接上路由，但仍列在 unrouted-inventory.json 裡。請把它移除，` +
        ' 否則清單會宣稱一件不再為真的事。'
    );
  }
}

for (const key of declared) {
  const exists = apiFiles.some(
    (file) => toPosix(relative(join(root, 'apps', 'api'), file)) === key
  );
  if (!exists)
    fail(
      'unrouted-inventory',
      `unrouted-inventory.json 列了 ${key}，但這個檔案不存在。`
    );
}

// --- 規則 3：domain 擁有的規則不得在瀏覽器再寫一份 -----------------------
//
// 這是「患者身分模型只存在於瀏覽器」那個缺陷的守衛。vendored 副本是唯一允許
// 出現這些規則的地方；其他檔案只能匯入。
const webPublic = join(root, 'apps', 'web', 'public');
const browserFiles = (
  await walk(webPublic, (file) => file.endsWith('.js'))
).filter((file) => !toPosix(file).includes('/vendor/'));

const FORBIDDEN_IN_BROWSER = [
  {
    pattern: /timeZone:\s*['"]Asia\/Taipei['"]/,
    detail:
      "寫死 timeZone: 'Asia/Taipei'。時區常數屬於 domain（TAIPEI_TIME_ZONE），" +
      '格式化一律走 modules/taipei-time.js，否則同一個時間會在不同畫面長得不一樣。'
  },
  {
    // 2026-07-27：身分證的第二碼由 `[12]` 擴為 `[1289]`（新式居留證），
    // 並新增護照格式。守衛的字面比對要跟著改，否則它會安靜地不再守住任何東西。
    pattern: /\[1289\]\[0-9\]\{8\}|\[A-Za-z\]\[1289\]|\[A-Za-z0-9\]\{6,12\}/,
    detail:
      '重寫了身分證字號或護照的格式規則。那些規則在 packages/domain 的 ' +
      'patient-identity，瀏覽器只能從 vendor/domain 匯入——否則 API 上線時會有' +
      '兩份互相漂移的定義。'
  }
];

for (const file of browserFiles) {
  const source = await readFile(file, 'utf8');
  for (const detail of forbiddenBrowserPatterns(source, FORBIDDEN_IN_BROWSER)) {
    fail('duplicated-rule', `${repoPath(file)}：${detail}`);
  }
}

// domain 每新增一個原因代碼，介面就必須補一句話。少了翻譯不會壞掉——它會安靜地
// 顯示一句通用訊息，而那正是最難發現的一種退步。
const identitySource = await readFile(
  join(root, 'packages', 'domain', 'src', 'patient-identity.ts'),
  'utf8'
);
const registrySource = await readFile(
  join(webPublic, 'modules', 'patient-registry.js'),
  'utf8'
);
const codeBlock = identitySource.match(
  /export type PatientIdentityIssueCode =([\s\S]*?);/
);
if (codeBlock === null) {
  fail(
    'duplicated-rule',
    '在 patient-identity.ts 找不到 PatientIdentityIssueCode，這條守衛已經失效。'
  );
} else {
  for (const match of codeBlock[1].matchAll(/'([a-z_]+)'/g)) {
    const code = match[1];
    if (!registrySource.includes(`.${code}'`))
      fail(
        'duplicated-rule',
        `domain 的原因代碼 '${code}' 在 patient-registry.js 的 MESSAGES 裡沒有對應的中文訊息。`
      );
  }
}

// 2026-07-27（自動檢查缺口 F-6）：**欄位**也要有翻譯，不只是原因代碼。
//
// 上面那一段只比對代碼。2026-07-27 新增 `passportNumber` 與 `identityDocument`
// 兩個欄位時，它們用的都是既有的代碼（`format`／`required`），所以那條守衛一聲
// 都沒吭——而少了 `identityDocument.required` 這一句，外籍患者會看到一句通用的
// 「這個欄位的格式不正確」，完全不知道自己該填護照。
const fieldBlock = identitySource.match(
  /export type PatientIdentityField =([\s\S]*?);/
);
if (fieldBlock === null) {
  fail(
    'duplicated-rule',
    '在 patient-identity.ts 找不到 PatientIdentityField，這條守衛已經失效。'
  );
} else {
  for (const match of fieldBlock[1].matchAll(/'([A-Za-z]+)'/g)) {
    const field = match[1];
    if (!new RegExp(`'${field}\\.[a-z_]+':`).test(registrySource))
      fail(
        'duplicated-rule',
        `domain 的欄位 '${field}' 在 patient-registry.js 的 MESSAGES 裡沒有任何一句中文訊息，它的錯誤會退回一句通用的「格式不正確」。`
      );
  }
}

// --- 回報 ---------------------------------------------------------------
if (failures.length > 0) {
  console.error('Architecture check failed:');
  for (const { rule, detail } of failures)
    console.error(`- [${rule}] ${detail}`);
  process.exitCode = 1;
} else {
  console.log(
    `Architecture check passed (依賴方向 ${LAYERS.length} 層、未接線清單 ${declared.size} 筆、domain 規則單一來源).`
  );
}

export { importSpecifiers, posix };
