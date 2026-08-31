/**
 * Trusted Types：把「記得要逸出」從紀律變成瀏覽器強制的機制。
 *
 * 要解決的不是「現在有 XSS」——2026-07-26 的稽核逐一確認過，29 處 `innerHTML`
 * 的每一個插值都經過 `escapeHtml`。問題是**那份安全性目前只靠紀律**：今天沒事，
 * 是因為每個寫過這些 render 函式的人都記得呼叫它。哪天有人新增一個忘了，沒有
 * 任何東西會擋，而漏掉的那一次剛好是患者姓名或備註欄。
 *
 * CSP 開啟 `require-trusted-types-for 'script'` 之後，寫進 `innerHTML` 的字串一律
 * 要先經過 policy。這裡註冊的是 **default policy**，所以既有的 29 處指派不必改寫
 * 就會全部流經下面的檢查。
 *
 * **為什麼是 default 而不是具名 policy＋逐點改寫**：具名 policy 會強迫每個
 * sink 顯式呼叫，稽核面更清楚——但那是 29 個橫跨多行的呼叫點，機械改寫會弄壞
 * 語句邊界（實際嘗試過），手工改寫則是一次跟本次目的無關的大 diff。default
 * policy 現在就能讓每一個字串都被檢查，風險低得多。把 sink 改成顯式呼叫是獨立
 * 的後續工作，不是這張卡的前提。
 *
 * **這個 policy 做什麼、不做什麼**：它不是消毒器。專案的 CSP 禁止外部資源，
 * 引入 DOMPurify 之類的相依是另一個決定。`createHTML` 做的是**結構檢查**：確認
 * 要寫進 DOM 的字串沒有可執行的標記。正常運作時永遠不會觸發，因為模板都是程式
 * 自己組的、插值都逸出過；一旦有人漏了逸出而值裡帶著 `<script>`，它會在寫進 DOM
 * **之前**丟錯，而不是靜默把它渲染出來。
 */

/**
 * 三種樣式都要求 `<` 在前，因為逸出過的文字不可能產生它——命中就代表真的有標記
 * 混進來，不是某段文字剛好長得像。
 *
 * 這一點很重要：如果只找 `onclick=` 這種字樣，一段寫著「sign on = yes」的備註
 * 就會被擋下來。那種假警報會讓人乾脆把檢查關掉，於是保護歸零。
 */
const EXECUTABLE_MARKUP = [
  // 直接的執行面。
  /<\s*(?:script|iframe|object|embed)\b/i,
  // 標籤內的行內事件處理器（onclick、onerror…）。CSP 本來就會擋下它們執行，
  // 但它們出現在這裡就代表逸出漏了，應該更早失敗。
  /<[^>]+\son\w+\s*=/i,
  // href/src 裡的 javascript: URL。
  /<[^>]+(?:href|src|xlink:href)\s*=\s*["']?\s*javascript:/i
];

export function assertRenderable(html) {
  const text = String(html);
  for (const pattern of EXECUTABLE_MARKUP) {
    if (pattern.test(text)) {
      throw new TypeError(
        'Refusing to render markup containing executable content. ' +
          'A value was very likely interpolated without escapeHtml().'
      );
    }
  }
  return text;
}

/**
 * Firebase Auth 的 redirect resolver 會動態載入 Google API iframe loader。
 * `require-trusted-types-for 'script'` 同時保護 script.src，因此 default policy
 * 必須處理這個唯一獲准的外部 ScriptURL。只接受 SDK 實際產生的固定路徑與隨機
 * callback 形狀；其他來源、路徑、query 或 fragment 一律拒絕。
 */
export function assertFirebaseAuthScriptUrl(value) {
  const text = String(value);
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new TypeError('Refusing an invalid external script URL.');
  }
  const parameters = [...url.searchParams.entries()];
  const allowed =
    url.origin === 'https://apis.google.com' &&
    url.pathname === '/js/api.js' &&
    url.hash === '' &&
    parameters.length === 1 &&
    parameters[0][0] === 'onload' &&
    /^__iframefcb\d{1,6}$/.test(parameters[0][1]);
  if (!allowed) {
    throw new TypeError('Refusing an unaudited external script URL.');
  }
  return text;
}

/**
 * 註冊 default policy。
 *
 * Trusted Types 在測試環境（Node／vitest）與尚未支援的瀏覽器裡不存在，此時
 * 靜默略過：少的是瀏覽器的強制力，`assertRenderable` 本身仍可被直接測試。
 *
 * 重複註冊同名 policy 會丟錯，所以只在模組載入時做一次；模組本身是單例。
 */
export function installTrustedHtmlPolicy() {
  const trustedTypes = globalThis.trustedTypes;
  if (trustedTypes === undefined) return false;
  try {
    trustedTypes.createPolicy('default', {
      createHTML: assertRenderable,
      createScriptURL: assertFirebaseAuthScriptUrl
    });
    return true;
  } catch {
    // 已經註冊過（例如同一頁載入兩個進入點）就不是錯誤，維持既有的那一份。
    return false;
  }
}

installTrustedHtmlPolicy();
