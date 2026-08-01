// 工作臺 UI 守衛的純判斷邏輯。
//
// `check-web-ui.mjs` 有 1000 行以上，而且從第一行就開始讀檔、把結果推進一個
// 模組層級的 `failures` 陣列——被 import 就會整個跑起來，沒辦法測。這裡抽出的是
// 那道 gate 真正在判斷的東西：文字比對怎麼正規化、注入的 input 要滿足什麼、
// id 有沒有重複。判斷邏輯出錯時 gate 不會噴錯，只會安靜地不再擋任何事。

/**
 * 比對前先移除所有空白。
 *
 * 這些斷言描述的是「必須存在哪一種寫法」，不是「必須排成哪一種版面」。比對原始
 * 文字會把原始碼釘死在某一種格式上，之後連跑一次 formatter 都會讓 gate 變紅。
 */
export function normalizeWhitespace(value) {
  return String(value).replace(/\s+/gu, '');
}

export function containsNormalized(source, text) {
  return normalizeWhitespace(source).includes(normalizeWhitespace(text));
}

/**
 * 依一組要求檢查來源，回傳所有未滿足的描述。
 *
 * `mode` 只有兩種：`require` 是「這個寫法必須在場」，`refuse` 是「這個寫法一旦
 * 回來就是退步」。反向守衛不可省略——光要求正確寫法在場，擋不住有人在旁邊又加
 * 一份錯的。
 */
export function reviewTextRequirements(source, requirements) {
  const failures = [];
  for (const { text, description, mode = 'require' } of requirements) {
    const present = containsNormalized(source, text);
    if (mode === 'require' && !present) failures.push(description);
    if (mode === 'refuse' && present) failures.push(description);
  }
  return failures;
}

/**
 * 由 JS 注入的 `<input>` 必須遵守兩條規則。
 *
 * 兩份客戶端都用 `Object.fromEntries(querySelectorAll('[id]'))` 建 elements 表，
 * 所以注入的 input 帶 id 會靜默覆蓋掉同名控制項（2026-07-25 實際發生過）。而沒有
 * `name` 或 `data-*` 繫結的 input，值沒有任何辦法被讀出來——一個看得到卻收不到的
 * 欄位。呼叫端插入的繫結（`${...}`）不在判斷範圍內，因為那時繫結還沒成形。
 */
export function reviewInjectedInputs(name, source) {
  const failures = [];
  for (const match of String(source).matchAll(/<input\b[^>]*>/giu)) {
    const tag = match[0];
    if (/\bid=/u.test(tag)) {
      failures.push(
        `${name} injects an <input> carrying an id. Ids are global, and both clients build their element map from every [id] — a collision silently replaces a control.`
      );
    }
    if (!tag.includes('${') && !/\b(?:name|data-[a-z-]+)=/u.test(tag)) {
      failures.push(
        `${name} injects an <input> with no name or data-* binding, so nothing can read its value: ${tag.slice(0, 60)}…`
      );
    }
  }
  return failures;
}

/**
 * 同一份 HTML 裡重複的 id。
 *
 * 在這個專案不是小瑕疵：後出現的那個會直接蓋掉前一個，於是某個控制項被悄悄換成
 * 另一個元素，沒有錯誤訊息，只有讀到 undefined 或寫錯地方。
 */
export function duplicateIds(html) {
  const seen = new Set();
  const duplicates = new Set();
  for (const match of String(html).matchAll(/\sid="([^"]+)"/gu)) {
    const id = match[1];
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  return [...duplicates];
}
