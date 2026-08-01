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
    /(?:^|[\s;{(])(?:import|export)\s[^'"()]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s*['"]([^'"]+)['"]/gm
  )) {
    found.push(match[1] ?? match[2] ?? match[3]);
  }
  return found.filter((value) => value !== undefined);
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
