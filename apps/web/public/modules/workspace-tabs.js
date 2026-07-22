// 工作臺的分頁切換。
//
// 為什麼是 hash 路由而不是 tabs widget：這七個區塊是**各自獨立的工作區**
// （預約、排班、個管、帳號…），不是同一份資料的替代視圖，因此語意上是導覽
// 而非 tablist。保留 <a href="#id"> 的好處很實際：
//   - 深連結：把「#case-section」貼給同事，開起來就在那一頁
//   - 上一頁／下一頁與重新整理都維持在同一區
//   - 沒有 JS 也還是可用的錨點連結（只是不會隱藏其他區）
// 因此這裡只做「一次只顯示一個區塊」，不攔截點擊、不自己管理歷史。
//
// 與權限的關係：管理者專屬區塊由 admin-bootstrap 標上 data-restricted，
// 本模組把「可見 = 是目前分頁 且 未被權限擋下」集中在一處判斷，避免兩套
// 邏輯搶同一個 hidden 屬性（櫃台帳號切過去會被導回營運首頁）。

const DEFAULT_PANEL = 'overview';

const panels = () => [...document.querySelectorAll('[data-workspace-panel]')];
const isRestricted = (panel) => panel.dataset.restricted === 'true';

function panelIdFromHash() {
  const id = window.location.hash.replace('#', '');
  return panels().some((panel) => panel.id === id) ? id : DEFAULT_PANEL;
}

/** 目前應顯示的分頁；被權限擋下時退回營運首頁。 */
function resolvePanelId() {
  const requested = panelIdFromHash();
  const panel = document.getElementById(requested);
  return panel !== null && isRestricted(panel) ? DEFAULT_PANEL : requested;
}

export function applyWorkspacePanel({ scroll = false } = {}) {
  const activeId = resolvePanelId();
  for (const panel of panels())
    panel.hidden = panel.id !== activeId || isRestricted(panel);
  for (const link of document.querySelectorAll('[data-workspace-nav]')) {
    const selected = link.getAttribute('href') === `#${activeId}`;
    link.classList.toggle('is-active', selected);
    // 導覽列的「目前位置」用 aria-current，不能只靠顏色。
    if (selected) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  // 換頁後把焦點帶到該區標題，鍵盤與報讀使用者才不會停在導覽列上。
  const heading = document.getElementById(
    document.getElementById(activeId)?.getAttribute('aria-labelledby') ?? ''
  );
  if (scroll && heading !== null) {
    heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
    heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  return activeId;
}

export function initWorkspaceTabs() {
  window.addEventListener('hashchange', () =>
    applyWorkspacePanel({ scroll: true })
  );
  applyWorkspacePanel();
}
