// 架構守衛的純判斷邏輯。
//
// `check-architecture.mjs` 的流程全部在 top-level 執行（讀檔、走目錄、寫
// process.exitCode），所以它一旦被 import 就會整個跑起來，沒辦法測。判斷邏輯
// 抽到這裡之後，測試 import 的是規則本身而不是那道 gate——這與
// `unrouted-inventory.mjs` 早先的拆法一致。
//
// 這裡的每一個函式都不碰檔案系統，輸入是字串或已讀好的檔案清單。

/**
 * 移除註解，但**保留字串內容**。
 *
 * 「這個檔案有沒有自己重寫一份 domain 規則」的守衛是靠字面比對；如果連字串
 * 一起剝掉，守衛會漏掉真正寫在字串裡的規則，而如果不剝註解，一段解釋規則的
 * 中文註解會被誤判成違規。兩者都會讓守衛失去意義，方向相反而已。
 */
export function stripComments(source) {
  let output = '';
  let index = 0;
  let quote;
  while (index < source.length) {
    const character = source[index];
    const next = source[index + 1];
    if (quote !== undefined) {
      output += character;
      if (character === '\\') {
        output += next ?? '';
        index += 2;
        continue;
      }
      if (character === quote) quote = undefined;
      index += 1;
      continue;
    }
    if (character === "'" || character === '"' || character === '`') {
      quote = character;
      output += character;
      index += 1;
      continue;
    }
    if (character === '/' && next === '/') {
      while (index < source.length && source[index] !== '\n') index += 1;
      continue;
    }
    if (character === '/' && next === '*') {
      index += 2;
      while (
        index < source.length &&
        !(source[index] === '*' && source[index + 1] === '/')
      )
        index += 1;
      index += 2;
      continue;
    }
    output += character;
    index += 1;
  }
  return output;
}

/**
 * 靜態與動態匯入的模組指定字串。
 *
 * **先剝註解再比對。** 樣式只要求 `import`／`export` 前面是空白或分隔符，而
 * `// import x from 'y';` 的 `//` 後面正是空白——沿用原始碼直接比對的話，一行
 * 被註解掉的 import 會被算成真的依賴，在層級守衛上變成一筆改不掉的假違規。
 * 這是 2026-08-01 補測試時發現的：原本的註解宣稱「註解裡的字串不會匹配」，
 * 但那句話講的是任意字串，不是被註解掉的 import 敘述。
 */
export function importSpecifiers(source) {
  const found = [];
  for (const match of stripComments(source).matchAll(
    /(?:^|[\s;{(])(?:import|export)\s[^'"()]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s*\(\s*`([^`$]+)`\s*\)|^\s*import\s*['"]([^'"]+)['"]/gm
  )) {
    found.push(match[1] ?? match[2] ?? match[3] ?? match[4]);
  }
  return found.filter((value) => value !== undefined);
}

/**
 * 走訪**看不透**的模組載入。
 *
 * `importSpecifiers` 是靜態比對，只認得字面值。這在 2026-08-06 的對抗測試裡被
 * 證實可繞過：在 `main.ts` 加一行
 *
 *     const target = './appointments/appointment.application-service.js';
 *     await import(target);
 *
 * 之後 `check:architecture` 依然全綠，而該檔案仍列在 `unrouted-inventory.json`
 * 裡宣稱「未接線」——實測 `probe()` 確實把它載進來並取得三個匯出。整個專案
 * 「被決策擋住的能力到不了」的論述就靠這道走訪，所以這是可達性分析的地基問題，
 * 不是風格問題。
 *
 * 六個確認可繞過的向量：計算後的指定字串、帶插值的樣板字串、字串相接、
 * `createRequire`、把 `import` 包成別名函式，以及無插值樣板字串（後者現在已由
 * `importSpecifiers` 正常解析）。
 *
 * 修法不是去求值任意運算式——那等於實作一個直譯器，而且永遠追不完。改成**遇到
 * 看不透的載入就失敗**：可達性分析不可靠的當下就停下來，由作者改成字面值。
 * 這是 fail-closed，不是 best-effort。
 */
export function opaqueDynamicImports(source) {
  const stripped = stripComments(source);
  const found = [];
  // `import.meta` 不會命中：那是 `import` 後面接 `.` 而不是 `(`。
  for (const match of stripped.matchAll(/(?:^|[^\w.$])import\s*\(/g)) {
    const rest = stripped.slice(match.index + match[0].length);
    // 可靜態解析的兩種寫法：引號字面值，或無插值的樣板字串。
    if (/^\s*(['"])[^'"]*\1\s*\)/.test(rest)) continue;
    if (/^\s*`[^`$]*`\s*\)/.test(rest)) continue;
    found.push(`import(${rest.split('\n')[0].slice(0, 48).trim()}`);
  }
  // `createRequire` 讓 CJS 解析繞過整個 ESM 圖，走訪完全看不到。
  const createRequireCount = [...stripped.matchAll(/\bcreateRequire\s*\(/g)]
    .length;
  for (let index = 0; index < createRequireCount; index += 1) {
    found.push('createRequire(...)');
  }
  return found;
}

/** 相對路徑（`.` 或 `/` 開頭）以外的都是裸名。 */
export function isBareSpecifier(specifier) {
  return !(specifier.startsWith('.') || specifier.startsWith('/'));
}

/**
 * 找出某一層裡不被允許的裸名匯入。
 *
 * `files` 是 `{ path, source }` 陣列，由呼叫端負責讀檔。回傳的每一筆都帶著
 * 該層的 `why`，因為守衛擋下來的當下，人最需要知道的是「為什麼這一層不能這樣
 * 匯入」而不是「哪一行違規」。
 */
export function layerViolations(layer, files) {
  const allowed = new Set(layer.allowedBare ?? []);
  const violations = [];
  for (const { path, source } of files) {
    for (const specifier of importSpecifiers(source)) {
      if (!isBareSpecifier(specifier)) continue;
      if (allowed.has(specifier)) continue;
      violations.push({
        path,
        specifier,
        detail: `${path} 匯入了 '${specifier}'。${layer.why}`
      });
    }
  }
  return violations;
}

/**
 * 找出瀏覽器端自己重寫 domain 規則的痕跡。
 *
 * 比對前先剝註解：一段引用規則來解釋「為什麼要走 domain」的註解，不應該被判成
 * 違規；而真正寫在程式碼字串裡的規則必須被抓到。
 */
export function forbiddenBrowserPatterns(source, rules) {
  const stripped = stripComments(source);
  return rules
    .filter(({ pattern }) => pattern.test(stripped))
    .map(({ detail }) => detail);
}

/**
 * 判斷瀏覽器檔案是否對凍結能力提供 **fail-closed** 守衛。
 *
 * BOOK-MVP-003-B 檢討後的規則：光是「同一份檔案裡出現旗標名稱」不能證明有守衛
 * ——註解提一句、字串裡拼一次都算「出現」。fail-closed 的意思是旗標為 false 時
 * 行為被擋住，所以守衛必須是**否定形式**的執行期判斷：
 *
 * - `!FLAG`：旗標關閉時進入阻擋分支（store.js 的 mutation guard、admin-view.js
 *   的「凍結時不渲染」return ''）；
 * - `FLAG ?`：三元判斷，旗標關閉時走「不啟用」分支（workspace-tabs.js 的
 *   `FROZEN_PANEL_IDS`）。
 *
 * 比對前先剝註解，註解裡的旗標名稱不算守衛。`flags` 是同一個路由共用的旗標清單；
 * 只要其中一個旗標有 fail-closed 判斷即視為合格，與 check-architecture 的
 * 「多個能力共用同一工作區」判定一致。
 */
export function hasFailClosedCapabilityGuard(source, flags) {
  const stripped = stripComments(source);
  return flags.some((flag) => {
    const negated = new RegExp(`!\\s*${flag}\\b`);
    // `??`（nullish coalescing）不是分支判斷，用負向 lookahead 排除。
    const ternary = new RegExp(`\\b${flag}\\s*\\?(?!\\?)`);
    return negated.test(stripped) || ternary.test(stripped);
  });
}
