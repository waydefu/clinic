// 可複選標籤的共用標記。
//
// 工作臺與患者頁各有自己的標籤清單（櫃台的營運註記 vs 患者的自述與來源），但
// **長相與無障礙結構必須是同一份**：每個選項是一個包住 checkbox 的 <label>，
// 沒有 id，勾選狀態由呼叫端的陣列決定。
//
// 先前這段只存在於 admin-view.js，而且把 BOOKING_NOTE_TAGS 寫死在裡面。患者頁
// 不能匯入 admin-view（那是 54 KB 的工作臺程式，會整包進患者頁的傳遞閉包），
// 所以抽成這個只依賴 ui-format 的小模組。
//
// 選項刻意**不給 id**：id 全域唯一，一頁上兩組標籤就會撞；而且兩份客戶端都用
// `Object.fromEntries(querySelectorAll('[id]'))` 建 elements 表，撞到會靜默覆蓋。
// 讀取一律靠 `data-*` 或 `name` 屬性。

import { escapeHtml } from './ui-format.js';

/**
 * @param tags 標籤清單（`{ id, label }`）
 * @param selected 已勾選的 id 陣列
 * @param binding 送出方式：`{ name }` 走原生 FormData，`{ data }` 由呼叫端自行讀取
 */
export function renderTagOptions(tags, selected = [], binding = {}) {
  const attributeFor = (id) =>
    binding.name === undefined
      ? `${binding.data}="${escapeHtml(id)}"`
      : `name="${escapeHtml(binding.name)}" value="${escapeHtml(id)}"`;
  return tags
    .map(
      (tag) =>
        `<label class="tag-option"><input type="checkbox" ${attributeFor(tag.id)} ${selected.includes(tag.id) ? 'checked' : ''} />${escapeHtml(tag.label)}</label>`
    )
    .join('');
}
