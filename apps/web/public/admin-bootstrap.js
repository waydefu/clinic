// Trusted Types 的 default policy。必須第一個匯入：它要在任何模組
// 有機會寫 innerHTML 之前就註冊好。
import './modules/trusted-html.js';
import {
  appointmentPage,
  DEFAULT_APPOINTMENT_PAGE_SIZE,
  DEFAULT_APPOINTMENT_SORT,
  renderAccounts,
  renderAppointments,
  renderAudit,
  renderDelegations,
  renderFollowUps,
  renderIntakeSheet,
  renderNextUp,
  renderOutbox,
  renderReleases,
  renderSchedule,
  renderSlots,
  renderTagPicker,
  renderTasks
} from './modules/admin-view.js';
import { apiClient } from './modules/api-client.js';
import { runPendingAction } from './modules/async-action.js';
import { confirmDialog, confirmWithReason } from './modules/confirm-dialog.js';
import {
  DELETE_APPOINTMENT_REASONS,
  PERMISSIONS,
  WORKBENCH_PROCEDURES
} from './modules/constants.js';
import { overdueAppointments } from './modules/case-management.js';
import { renderTagOptions } from './modules/tag-picker.js';
import { followUpDueTimes } from './modules/schedule-engine.js';
import { taipeiDate, taipeiTodayDate } from './modules/taipei-time.js';
import {
  hydrateWeekView,
  renderAgendaView,
  renderWeekView,
  weekStartOf
} from './modules/week-view.js';
import {
  applyWorkspacePanel,
  initWorkspaceTabs
} from './modules/workspace-tabs.js';
import {
  escapeHtml,
  formatFullDate,
  formatTime,
  roleLabel
} from './modules/ui-format.js';

// 工作臺的標記與樣式直接寫在 index.html 裡，不再於執行期 fetch 一份 shell
// 再抽換 document.body。那個做法多一次往返、會讓畫面從假骨架跳成真介面，
// 而且是先前 CSP 事故的成因（connect-src 少了 'self' 就整頁掛掉）。
const elements = Object.fromEntries(
  [...document.querySelectorAll('[id]')].map((element) => [element.id, element])
);
const isOnline = !['127.0.0.1', 'localhost'].includes(window.location.hostname);
const mobileViewport = window.matchMedia('(max-width: 48rem)');
const appShell = document.querySelector('.app-shell');
const restrictedDom = [
  ...document.querySelectorAll('[data-admin-nav], [data-admin-only]')
];

function isAdminSession() {
  return (
    state?.session?.authenticated === true &&
    state.session.account?.role === 'admin'
  );
}

// 櫃台登入時直接把主管導覽與工作區移出 document，而不是只套 hidden。節點的
// event listener 會隨頁面 reload 重建；角色切換與登出都採 reload，避免前一個
// session 的治理表單、篩選或通知殘留在下一個 session。
function enforceRoleDomBoundary() {
  if (!state.session.authenticated || isAdminSession()) return;
  for (const element of restrictedDom) element.remove();
}

// 合成登入閘門：未登入時只顯示登入頁，登入後才顯示工作臺。這是 UX 原型、
// 不是安全邊界——權限仍由帳號角色決定，`state` 也已在瀏覽器內，登出不等於
// 伺服器端撤銷（AUTH-001／D-006）。
function renderGate() {
  const authenticated = state.session.authenticated === true;
  elements['login-view'].hidden = authenticated;
  appShell.hidden = !authenticated;
}

function syncResponsiveDisclosures() {
  const topbarTools = document.querySelector('.topbar-tools');
  if (topbarTools !== null) topbarTools.open = !mobileViewport.matches;
  if (elements['week-calendar-disclosure'] !== undefined)
    elements['week-calendar-disclosure'].open = !mobileViewport.matches;
}

syncResponsiveDisclosures();
mobileViewport.addEventListener('change', syncResponsiveDisclosures);

// 預約工作區依現場頻率排列：先看週排程，再處理預約與回診；建立新預約收進
// 漸進揭露區塊。保留既有節點與事件綁定，只調整 DOM 順序。
const appointmentsHeading = document.querySelector(
  '#appointments-section > .section-heading'
);
const calendarDisclosure = elements['week-calendar-disclosure'];
const weekLegend = document.querySelector('.week-view-legend');
const appointmentListHeading = elements['appointment-list-heading'];
const appointmentFilters = elements['appointment-filters'];
const appointmentBatchBar = elements['appointment-batch-bar'];
const appointmentPagination = elements['appointment-pagination'];
const followUpWorkflow = elements['follow-up-workflow'];
if (
  appointmentsHeading !== null &&
  calendarDisclosure !== undefined &&
  appointmentListHeading !== undefined &&
  appointmentFilters !== undefined &&
  appointmentBatchBar !== undefined &&
  appointmentPagination !== undefined &&
  followUpWorkflow !== undefined
) {
  appointmentsHeading.after(
    calendarDisclosure,
    appointmentListHeading,
    appointmentFilters,
    appointmentBatchBar,
    elements.appointments,
    appointmentPagination,
    followUpWorkflow
  );
  const collisionHelp = weekLegend?.lastElementChild;
  if (collisionHelp !== null && collisionHelp !== undefined)
    collisionHelp.textContent =
      '沒有時間衝突時顯示整格；重疊時才並排。點事件查看完整預約。';
}

let state;
let filters = { status: 'today', kind: 'all', query: '' };
// 櫃台清單目前的排序。預設「時間遞增」＝原本寫死的行為。
let appointmentSort = { ...DEFAULT_APPOINTMENT_SORT };
// 目前頁碼與固定頁面大小只影響呈現，不進 state、不落地。
let appointmentPageNumber = 1;
// 批次操作勾選中的預約 id。只存在於目前顯示頁；換頁、篩選或排序後會清掉
// 不在新頁上的 id，避免畫面上五筆卻誤處理前一頁的預約。
const selectedAppointments = new Set();
// 每個批次處置允許的來源狀態，與 domain 的 planTransition 一致。批次不放寬
// 任何規則——它只是把同一個處置連續套用在多筆上。
const BATCH_ELIGIBLE_STATUS = {
  cancel: ['confirmed', 'cancellation_requested'],
  no_show: ['confirmed', 'cancellation_requested']
};
let slotKind = 'initial';
let selectedSlotId;
// 已決定回診但被「調整回診」重新開啟編輯的預約 id；讓它暫時回到逐筆回診確認。
const editingFollowUps = new Set();
// 週檢視目前顯示的週一（YYYY-MM-DD）。undefined 時於首次 render 對齊到
// 最早一筆預約／時段所在的週，讓合成資料一進來就有內容可看。
let weekStart;

// 手機用行程表、桌機用時間網格。48rem 與 workbench.css 的斷點是同一個數字，
// 改其中一個就要改另一個——CSS 自訂屬性不能用在 media query 條件裡，所以這份
// 對應只能靠註解維持。
const compactCalendar = window.matchMedia('(max-width: 48rem)');

function renderWeek() {
  if (weekStart === undefined) {
    const earliest =
      [...state.appointments, ...state.slots].sort((a, b) =>
        (a.startsAt ?? '').localeCompare(b.startsAt ?? '')
      )[0]?.startsAt ?? new Date().toISOString();
    weekStart = weekStartOf(taipeiDate(earliest));
  }
  // 依寬度擇一渲染，**不是**兩份都畫再用 CSS 藏一份。兩份都在 DOM 裡的話，
  // 同一筆預約會有兩個 data-week-event 按鈕：下方的點擊處理器會抓到兩個，
  // 讀螢幕也會唸到兩個同名按鈕。斷點與 workbench.css 的 48rem 一致。
  elements['week-view'].innerHTML = (
    compactCalendar.matches ? renderAgendaView : renderWeekView
  )(state, weekStart, taipeiTodayDate());
  hydrateWeekView(elements['week-view']);
  scrollWeekViewToNow();
  const end = new Date(`${weekStart}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 6);
  elements['week-range'].textContent =
    `${weekStart} – ${end.toISOString().slice(0, 10)}`;
}

/**
 * 桌機的時間網格在容器內部捲動（workbench.css 的 R-20 區塊），所以要把「現在」
 * 帶進視野——否則第一眼看到的是範圍最上緣，而平日 12:00 才開診，最上面那兩小時
 * 只有週六用得到。
 *
 * **只在容器仍停在頂端時才捲**：使用者自己捲過之後，每次 state 變動（新增預約、
 * 改狀態）都會重畫，這時把捲動位置搶回去等於把人踢回原點。
 */
function scrollWeekViewToNow() {
  const view = elements['week-view'];
  if (compactCalendar.matches || view.scrollTop !== 0) return;
  const now = view.querySelector('.wv-now');
  if (now === null) return;
  // 放在約三分之一處而不是正中央：往下看「接下來還有誰」比往上回顧更常用。
  const target = now.offsetTop - view.clientHeight / 3;
  view.scrollTop = Math.max(0, target);
}

// 轉向或拉動視窗會跨過斷點，此時要換成另一種檢視。只在 weekStart 已決定
// （日曆已渲染過）時才重畫，避免在初始化之前搶跑。
compactCalendar.addEventListener('change', () => {
  if (weekStart !== undefined) renderWeek();
});

// 頂端 #status 是唯一的 aria-live 播報點；anchorId 則把同一句話放到剛按下的
// 按鈕旁邊。長頁面上只寫頂端等於沒有回饋——操作者看不到成功或失敗的原因。
let inlineStatus;
function message(text, tone = 'info', anchorId, retry) {
  elements.status.textContent = text;
  elements.status.dataset.state = tone;
  const target = anchorId === undefined ? undefined : elements[anchorId];
  if (inlineStatus !== undefined && inlineStatus !== target) {
    inlineStatus.hidden = true;
    inlineStatus.textContent = '';
  }
  inlineStatus = target;
  if (target !== undefined) {
    target.textContent = text;
    target.dataset.state = tone;
    target.hidden = false;
  }
  const retryTarget = target ?? elements.status;
  if (retry !== undefined) {
    const retryButton = document.createElement('button');
    retryButton.className = 'button button-tertiary inline-retry';
    retryButton.type = 'button';
    retryButton.textContent = '重試';
    retryButton.addEventListener('click', async () => {
      await retry();
    });
    retryTarget.append(' ', retryButton);
  }
}

async function runUiAction({
  control,
  pendingLabel,
  pendingMessage,
  anchorId,
  action,
  onSuccess,
  failureMessage = (error) => error.message
}) {
  if (pendingMessage !== undefined) message(pendingMessage, 'info', anchorId);
  const outcome = await runPendingAction({ control, pendingLabel, action });
  if (outcome.ok) {
    await onSuccess(outcome.value);
    return true;
  }
  const retry =
    outcome.retry === undefined
      ? undefined
      : () =>
          runUiAction({
            control,
            pendingLabel,
            pendingMessage,
            anchorId,
            action,
            onSuccess,
            failureMessage
          });
  message(failureMessage(outcome.error), 'error', anchorId, retry);
  return false;
}

async function post(path, body = {}) {
  const requiredPermission = (() => {
    if (path === '/reset') return PERMISSIONS.MANAGE_SYSTEM;
    if (path.startsWith('/schedule/')) return PERMISSIONS.MANAGE_SCHEDULE;
    if (
      path === '/workspace/accounts' ||
      /\/workspace\/accounts\/.+\/toggle$/.test(path)
    )
      return PERMISSIONS.MANAGE_ACCOUNTS;
    if (
      [
        '/workspace/announcement',
        '/workspace/maintenance',
        '/workspace/releases',
        '/outbox/simulate',
        '/outbox/requeue'
      ].includes(path)
    )
      return PERMISSIONS.MANAGE_COMMUNICATIONS;
    if (path.startsWith('/follow-ups/')) return PERMISSIONS.MANAGE_FOLLOW_UP;
    if (path === '/case-assignments') {
      const assigned = state.caseAssignments.some(
        (item) =>
          item.appointmentId === body.appointmentId && item.status === 'active'
      );
      return assigned ? PERMISSIONS.REASSIGN_CASE : PERMISSIONS.ASSIGN_CASE;
    }
    if (path === '/bookings') return PERMISSIONS.CREATE_BOOKING;
    if (/\/bookings\/.+\/(reschedule|notes)$/.test(path))
      return PERMISSIONS.CREATE_BOOKING;
    if (/\/bookings\/.+\/delete$/.test(path))
      return PERMISSIONS.DELETE_APPOINTMENT;
    if (
      /\/bookings\/.+\/(cancel|no-show|complete|complete-without-card)$/.test(
        path
      )
    )
      return path.endsWith('/cancel')
        ? PERMISSIONS.CANCEL_BOOKING
        : PERMISSIONS.COMPLETE_VISIT;
    return undefined;
  })();
  // 送出前的自我檢查（省一次註定失敗的往返）。**被委派的權限也算數**——否則
  // 這一層會在請求還沒離開畫面前就擋掉櫃台的刪除，授權碼永遠沒有機會被驗證。
  // 這裡放行不等於授權：store 仍會逐條 requirePermissionOrDelegation。
  if (
    requiredPermission !== undefined &&
    !state.session.permissions.includes(requiredPermission) &&
    !(state.session.delegatable ?? []).includes(requiredPermission)
  )
    throw new Error('目前合成帳號沒有執行此動作的權限。');

  state = await apiClient.request(path, {
    method: 'POST',
    body: JSON.stringify(body)
  });
  if (!['/workspace/logout', '/reset'].includes(path)) {
    enforceRoleDomBoundary();
    render();
  }
  return state;
}

function renderSession() {
  elements['current-account-label'].textContent =
    `${state.session.account.label} · ${roleLabel(state.session.account.role)}`;
  elements['current-account-boundary'].textContent =
    state.session.account.role === 'admin'
      ? '可設定營業時間、帳號與系統治理。'
      : '可處理預約、到診與登錄回診指示。';
  applyWorkspacePanel();
}

function renderFilters() {
  elements['appointment-status-filter'].value = filters.status;
  elements['appointment-kind-filter'].value = filters.kind;
  elements['appointment-search'].value = filters.query;
  elements['slot-kind-filter'].value = slotKind;
}

function renderAppointmentList() {
  const page = appointmentPage(state, filters, appointmentSort, {
    page: appointmentPageNumber,
    pageSize: DEFAULT_APPOINTMENT_PAGE_SIZE
  });
  // 最後一頁因資料異動而消失時，純分頁模型會把頁碼夾回仍存在的最後一頁。
  appointmentPageNumber = page.page;

  // 只留下本頁畫得出來的選取：換頁、篩選、排序或處理完成後，殘留的 id 會讓
  // 「本頁已選 3 筆」與畫面上看得到的東西對不起來，也可能誤批次處理前一頁。
  const visible = new Set(page.ids);
  for (const id of [...selectedAppointments])
    if (!visible.has(id)) selectedAppointments.delete(id);

  elements.appointments.innerHTML = renderAppointments(
    state,
    filters,
    appointmentSort,
    selectedAppointments,
    {
      page: page.page,
      pageSize: page.pageSize
    }
  );
  elements['appointment-result-summary'].textContent =
    `共 ${page.totalCount} 筆結果，本頁顯示 ${page.ids.length} 筆` +
    `（第 ${page.page} 頁，共 ${page.totalPages} 頁）`;
  elements['appointment-pagination'].hidden = page.totalCount === 0;
  elements['appointment-page-status'].textContent =
    `第 ${page.page} 頁，共 ${page.totalPages} 頁`;
  elements['appointment-page-prev'].disabled = page.page <= 1;
  elements['appointment-page-next'].disabled = page.page >= page.totalPages;
  renderBatchBar();
}

function resetAppointmentPage() {
  appointmentPageNumber = 1;
}

/**
 * 把清單切到某筆預約所在頁並回傳它的列。
 *
 * 週檢視事件可能被目前的狀態／掛號別／搜尋條件濾掉；與原行為一致，這時先回到
 * 「全部」再找。差別是現在也會算出目標頁，不會只在第一頁找不到就放棄。
 */
function revealAppointmentCard(id, { resetFiltersIfMissing = false } = {}) {
  let page = appointmentPage(state, filters, appointmentSort, {
    page: appointmentPageNumber,
    pageSize: DEFAULT_APPOINTMENT_PAGE_SIZE
  });
  let index = page.allIds.indexOf(id);
  if (index === -1 && resetFiltersIfMissing) {
    filters = { status: 'all', kind: 'all', query: '' };
    renderFilters();
    page = appointmentPage(state, filters, appointmentSort, {
      page: 1,
      pageSize: DEFAULT_APPOINTMENT_PAGE_SIZE
    });
    index = page.allIds.indexOf(id);
  }
  if (index === -1) return null;

  appointmentPageNumber = Math.floor(index / DEFAULT_APPOINTMENT_PAGE_SIZE) + 1;
  renderAppointmentList();
  return elements.appointments.querySelector(
    `[data-appointment-card="${CSS.escape(id)}"]`
  );
}

/**
 * 批次操作列。
 *
 * 按鈕的啟用條件是「**每一筆**選取的預約都能執行這個處置」，而不是「有任何一筆
 * 可以」——後者會讓使用者以為十筆都處理了，實際上只動到三筆。狀態不符時直接
 * 停用並在摘要裡說明，不讓人按下去才發現失敗。
 */
function renderBatchBar() {
  const bar = elements['appointment-batch-bar'];
  const rows = [
    ...elements.appointments.querySelectorAll('[data-appointment-select]')
  ];
  // 沒有任何可選的列時整條收起來，畫面上不留一條空工具列。
  bar.hidden = rows.length === 0;
  if (bar.hidden) return;

  const rowIds = new Set(rows.map((row) => row.dataset.appointmentSelect));
  const selected = [...selectedAppointments].filter((id) => rowIds.has(id));
  const permissions = state.session?.permissions ?? [];
  const statusOf = (id) =>
    state.appointments.find((item) => item.id === id)?.status;
  const eligible = (action) =>
    selected.length > 0 &&
    selected.every((id) =>
      BATCH_ELIGIBLE_STATUS[action].includes(statusOf(id))
    );

  elements['appointment-selection-summary'].textContent =
    selected.length === 0
      ? '未選取本頁任何預約'
      : `本頁已選取 ${selected.length} 筆`;

  for (const [action, key] of [
    ['cancel', 'appointment-batch-cancel'],
    ['no_show', 'appointment-batch-no-show']
  ]) {
    const button = elements[key];
    // 沒有權限就整顆不出現，與單筆處置選單一致。
    button.hidden = !permissions.includes(PERMISSIONS.CANCEL_BOOKING);
    button.disabled = !eligible(action);
  }

  // 全選方塊的三態：全選、全不選、部分選取（indeterminate＝無障礙 API 的
  // mixed）。indeterminate 只能用 JS 設，HTML 屬性沒有這個狀態。
  const selectAll = elements['appointment-select-all'];
  const allSelected = rows.length > 0 && selected.length === rows.length;
  selectAll.checked = allSelected;
  selectAll.indeterminate = selected.length > 0 && !allSelected;
}

/**
 * 把某個清單的筆數寫進它的 live region 摘要。
 *
 * 數的是**已經畫在 DOM 上的東西**而不是 state，因為公告的目的就是描述使用者
 * 眼前那份清單；兩者若因為篩選或權限而不一致，以畫面為準才不會誤導。
 */
function countSummary(summaryKey, listKey, selector, unit) {
  const count = elements[listKey].querySelectorAll(selector).length;
  elements[summaryKey].textContent = `${count} ${unit}`;
}

// 時段清單在四個地方重畫（首次 render、切換掛號別、選取時段、建立完成）。
// 集中成一個函式，摘要才不會有某條路徑忘了更新。
function renderSlotList() {
  elements.slots.innerHTML = renderSlots(state, slotKind, selectedSlotId);
  countSummary('slot-summary', 'slots', '[data-select-slot]', '個可預約時段');
}

function renderSummary() {
  elements['available-count'].textContent = String(
    state.slots.filter((slot) => slot.reservationId === undefined).length
  );
  elements['confirmed-count'].textContent = String(
    state.appointments.filter((item) =>
      ['confirmed', 'cancellation_requested'].includes(item.status)
    ).length
  );
  elements['completed-count'].textContent = String(
    state.appointments.filter((item) => item.status === 'completed').length
  );
  elements['task-list'].innerHTML = renderTasks(state);
  elements['next-up'].innerHTML = renderNextUp(state);
  // 待辦件數是「有幾種待辦還沒清掉」，不是總筆數——首頁要回答的是「還有幾件事
  // 要處理」。零筆的待辦本來就不會出現，所以直接數卡片。
  const openTasks = elements['task-list'].querySelectorAll('.task-card').length;
  elements['task-summary'].textContent =
    openTasks === 0 ? '目前沒有待辦事項' : `${openTasks} 類待辦需要處理`;
  elements['schedule-version-chip'].textContent =
    `已發布營業時間 v${state.scheduleMeta.publishedVersion}`;
}

function renderBookingForm() {
  if (elements['booking-items'].querySelector('label') === null)
    elements['booking-items'].insertAdjacentHTML(
      'beforeend',
      renderTagOptions(WORKBENCH_PROCEDURES, [], { data: 'data-booking-item' })
    );
  if (elements['booking-tags'].querySelector('label') === null)
    elements['booking-tags'].insertAdjacentHTML('beforeend', renderTagPicker());
  const slot = state.slots.find((item) => item.id === selectedSlotId);
  elements['booking-slot-hint'].textContent =
    slot === undefined
      ? '請先於下方「可預約時段」選擇一個時間點。'
      : // 走共用的格式化器：時區與格式只有 taipei-time／ui-format 一個來源，
        // 這裡先前自己拼 `toLocaleString('zh-TW', { timeZone: … })`，於是同一個
        // 時間在櫃台的兩處顯示成兩種樣子。
        `已選擇時段：${formatFullDate(slot.startsAt)} ${formatTime(slot.startsAt)}`;
}

function renderCommunicationForms() {
  const a = state.workspace.announcement;
  elements['operations-announcement'].hidden = a.status !== 'published';
  elements['operations-announcement'].innerHTML =
    a.status === 'published'
      ? `<strong>${escapeHtml(a.title)}</strong><span>${escapeHtml(a.body)}</span>`
      : '';
  if (!isAdminSession()) return;
  elements['announcement-status'].value = a.status;
  elements['announcement-title'].value = a.title;
  elements['announcement-body'].value = a.body;
  const m = state.workspace.maintenance;
  elements['maintenance-enabled'].checked = m.enabled;
  elements['maintenance-title'].value = m.title;
  elements['maintenance-body'].value = m.body;
  elements['maintenance-starts-at'].value = m.startsAt ?? '';
  elements['maintenance-resume-at'].value = m.resumeAt ?? '';
  elements['release-list'].innerHTML = renderReleases(state.workspace);
  countSummary(
    'release-list-summary',
    'release-list',
    '.release-row',
    '筆發布紀錄'
  );
}

function renderBlockedTimesForm() {
  const blocked = state.scheduleDraft.blockedTimes ?? {
    initial: [],
    follow_up: []
  };
  if (document.activeElement !== elements['blocked-initial'])
    elements['blocked-initial'].value = (blocked.initial ?? []).join('、');
  if (document.activeElement !== elements['blocked-follow-up'])
    elements['blocked-follow-up'].value = (blocked.follow_up ?? []).join('、');
}

function render() {
  renderGate();
  renderSession();
  renderFilters();
  renderSummary();
  renderBookingForm();
  renderSlotList();
  renderWeek();
  renderAppointmentList();
  elements['follow-up-list'].innerHTML = renderFollowUps(
    state,
    editingFollowUps
  );
  // 每個清單的內容都是整批置換，所以清單本身不是 live region；改由這些簡短的
  // 摘要負責公告「變了、現在有幾筆」。詳見 index.html 裡 #appointments 上方的
  // 說明。計數一律直接數 DOM，數字才不會和實際畫出來的東西分家。
  countSummary(
    'follow-up-summary',
    'follow-up-list',
    '[data-follow-up-form]',
    '筆待確認'
  );
  renderCommunicationForms();
  if (isAdminSession()) {
    elements['published-schedule'].innerHTML = renderSchedule(
      state.schedule,
      false
    );
    elements['draft-schedule'].innerHTML = renderSchedule(
      state.scheduleDraft,
      true
    );
    renderBlockedTimesForm();
    elements['schedule-draft-status'].textContent = state.scheduleMeta
      .draftDirty
      ? '有未發布變更'
      : '草稿與發布版本一致';
    elements['schedule-draft-status'].className =
      `status-chip ${state.scheduleMeta.draftDirty ? 'is-reserved' : 'is-available'}`;
    elements['publish-schedule'].disabled = !state.scheduleMeta.draftDirty;
    elements['discard-schedule'].disabled = !state.scheduleMeta.draftDirty;
    elements['account-list'].innerHTML = renderAccounts(state.workspace);
    countSummary(
      'account-summary',
      'account-list',
      '[data-account-row]',
      '個帳號'
    );
    elements['delegation-list'].innerHTML = renderDelegations(state.workspace);
    countSummary(
      'delegation-summary',
      'delegation-list',
      '[data-authorization-row]',
      '組授權碼'
    );
    elements['audit-events'].innerHTML = renderAudit(
      state,
      elements['audit-filter'].value
    );
    elements['outbox-jobs'].innerHTML = renderOutbox(state);
  }
  syncBell();
  // 某些 render helper 會依資料狀態更新 hidden；最後重新套用工作區可見性，
  // 確保首頁專用的主視覺／公告不會在建立預約等重新渲染後跑到其他工作區。
  applyWorkspacePanel();
}

// 導覽鈴鐺：有「取消待確認」或「已過時未處理」時亮紅點，提醒櫃台別忽略。
// 清單是一般 popover，不掛 aria-live、不使用 modal dialog，也不改變 header 高度。
//
// D-f（業主 2026-07-27）：過時未到**併入現有鈴鐺**，不新增第二個彈窗——櫃台已經
// 有一個要看的地方，再加一個只會讓兩個都被忽略。
const OVERDUE_REASON = '已過時未處理';

function bellItems() {
  const overdue = new Set(overdueAppointments(state));
  return (
    state.appointments
      .filter(
        (item) =>
          item.status === 'cancellation_requested' || overdue.has(item.id)
      )
      .map((item) => ({
        appointment: item,
        reason: overdue.has(item.id) ? OVERDUE_REASON : '取消待確認'
      }))
      // 過時的排前面：那是現場正在發生的事。
      .sort((left, right) =>
        left.reason === right.reason
          ? String(left.appointment.startsAt).localeCompare(
              String(right.appointment.startsAt)
            )
          : left.reason === OVERDUE_REASON
            ? -1
            : 1
      )
  );
}

function setNotificationOpen(open, { returnFocus = false } = {}) {
  elements['notification-popover'].hidden = !open;
  elements['nav-bell'].setAttribute('aria-expanded', String(open));
  if (!open && returnFocus) elements['nav-bell'].focus();
}

function syncBell() {
  const pending = bellItems();
  elements['nav-bell-dot'].hidden = pending.length === 0;
  elements['nav-bell'].classList.toggle('has-alert', pending.length > 0);
  elements['nav-bell'].setAttribute(
    'aria-label',
    pending.length === 0 ? '通知，沒有未讀' : `通知，${pending.length} 筆未讀`
  );
  const overdueCount = pending.filter(
    (entry) => entry.reason === OVERDUE_REASON
  ).length;
  const cancelCount = pending.length - overdueCount;
  elements['notification-summary'].textContent =
    pending.length === 0
      ? '目前沒有待處理的通知。'
      : `${[
          overdueCount > 0 ? `${overdueCount} 筆已過時未處理` : '',
          cancelCount > 0 ? `${cancelCount} 筆取消要求待聯絡確認` : ''
        ]
          .filter((part) => part !== '')
          .join('；')}。`;
  elements['notification-list'].innerHTML = pending
    .map(({ appointment: item, reason }) => {
      const person = state.patients.find((p) => p.id === item.patientId);
      // 原因要寫出來。清單裡現在有兩種通知，而「排在前面」不是任何人讀得到的線索。
      return `<li class="bell-row"><strong>${escapeHtml(person?.name ?? item.patientId)}</strong><span class="bell-reason">${escapeHtml(reason)}</span><a href="tel:${escapeHtml(person?.phone ?? '')}">${escapeHtml(person?.phone ?? '—')}</a><span class="code">${escapeHtml(formatFullDate(item.startsAt))} ${escapeHtml(formatTime(item.startsAt))} · ${escapeHtml(item.id)}</span></li>`;
    })
    .join('');
  elements['notification-goto'].hidden = pending.length === 0;
  if (pending.length === 0) setNotificationOpen(false);
}

// 「已過時未處理」是**時間**造成的狀態改變：沒有任何使用者動作會觸發它，櫃台
// 開著同一個畫面，某一筆預約會在某一分鐘自己變成待處理。所以這裡需要一個計時器
// ——這是全站唯一一個。
//
// 每分鐘一次而不是每秒：門檻是十分鐘，一分鐘的解析度綽綽有餘，而每秒重畫會在
// 一台整天開著的櫃台機器上白白燒電。而且**只更新鈴鐺與首頁待辦**，不重畫整張
// 清單——重畫會把使用者正在展開的改期或備註表單收起來。
const OVERDUE_POLL_MS = 60_000;
window.setInterval(() => {
  if (state === undefined) return;
  syncBell();
  renderSummary();
}, OVERDUE_POLL_MS);

elements['nav-bell'].addEventListener('click', () => {
  const opening = elements['notification-popover'].hidden;
  setNotificationOpen(opening);
  if (opening) elements['notification-close'].focus();
});
elements['notification-close'].addEventListener('click', () =>
  setNotificationOpen(false, { returnFocus: true })
);
elements['notification-goto'].addEventListener('click', () => {
  // 鈴鐺自 2026-07-27 起有兩種通知。只篩「取消待確認」會把剛剛在鈴鐺裡看到的
  // 過時未處理那幾筆藏起來——按下「前往處理」卻找不到那一筆，是最糟的結果。
  const hasOverdue = overdueAppointments(state).length > 0;
  filters = {
    status: hasOverdue ? 'all' : 'cancellation_requested',
    kind: 'all',
    query: ''
  };
  setNotificationOpen(false);
  renderFilters();
  resetAppointmentPage();
  renderAppointmentList();
});

function isEditableShortcutTarget(target) {
  return (
    target instanceof Element &&
    target.closest(
      'input, textarea, select, [contenteditable]:not([contenteditable="false"])'
    ) !== null
  );
}

function focusAppointmentSearch() {
  window.location.hash = 'appointments-section';
  window.setTimeout(() => elements['appointment-search'].focus(), 0);
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !elements['notification-popover'].hidden) {
    event.preventDefault();
    setNotificationOpen(false, { returnFocus: true });
    return;
  }
  if (
    event.defaultPrevented ||
    event.repeat ||
    state?.session?.authenticated !== true ||
    isEditableShortcutTarget(event.target)
  )
    return;

  if (event.key === '/' && !event.altKey && !event.ctrlKey && !event.metaKey) {
    event.preventDefault();
    focusAppointmentSearch();
    return;
  }
  if (
    event.key.toLocaleLowerCase('en-US') === 'n' &&
    event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey
  ) {
    event.preventDefault();
    openBookingWorkflow({ focusFirstField: true });
  }
});
document.addEventListener('pointerdown', (event) => {
  if (
    !elements['notification-popover'].hidden &&
    event.target.closest('.notification-center') === null
  )
    setNotificationOpen(false);
});
document.addEventListener('focusin', (event) => {
  if (
    !elements['notification-popover'].hidden &&
    !elements['notification-popover'].contains(event.target) &&
    event.target !== elements['nav-bell']
  )
    setNotificationOpen(false);
});

async function updateDraft(
  mutator,
  text,
  anchorId,
  control,
  failurePrefix = '未套用'
) {
  const draft = structuredClone(state.scheduleDraft);
  mutator(draft);
  return runUiAction({
    control,
    pendingLabel: '儲存中…',
    anchorId,
    action: () => post('/schedule/draft', draft),
    onSuccess: () => message(text, 'success', anchorId),
    failureMessage: (error) => `${failurePrefix}：${error.message}`
  });
}

function parseTimeList(value) {
  return value
    .split(/[、,，\s]+/)
    .map((item) => item.trim())
    .filter((item) => item !== '');
}

elements['login-form'].addEventListener('submit', async (event) => {
  event.preventDefault();
  await runUiAction({
    control: event.submitter,
    pendingLabel: '登入中…',
    anchorId: 'login-error',
    action: () =>
      post('/workspace/login', {
        username: elements['login-account'].value,
        password: elements['login-password'].value
      }),
    onSuccess: () => {
      elements['login-password'].value = '';
      elements['login-error'].hidden = true;
      elements['login-error'].textContent = '';
      window.location.hash = 'overview';
      message(`已登入為 ${state.session.account.label}。`, 'success');
      elements['main-content'].focus({ preventScroll: true });
    },
    failureMessage: (error) => {
      // 登入失敗把訊息就地顯示在登入表單旁（工作臺的 #status 這時隱藏）。
      elements['login-error'].textContent = error.message;
      elements['login-error'].hidden = false;
      elements['login-password'].value = '';
      elements['login-password'].focus();
      return error.message;
    }
  });
});

elements['logout'].addEventListener('click', async () => {
  await runUiAction({
    control: elements['logout'],
    pendingLabel: '登出中…',
    action: () => post('/workspace/logout'),
    onSuccess: () => {
      window.location.hash = 'overview';
      window.location.reload();
    }
  });
});

elements['reset-state'].addEventListener('click', async () => {
  if (
    !(await confirmDialog(
      '你即將清除這個瀏覽器內的全部合成測試資料，包含預約、患者、營業時間草稿與操作紀錄。此動作無法復原；確定繼續？',
      { danger: true, confirmLabel: '清除全部測試資料' }
    ))
  )
    return;
  await runUiAction({
    control: elements['reset-state'],
    pendingLabel: '清除中…',
    action: () => post('/reset'),
    onSuccess: () => window.location.reload(),
    failureMessage: (error) => `未能清除：${error.message}`
  });
});

function openBookingWorkflow({ focusFirstField = false } = {}) {
  window.location.hash = 'appointments-section';
  elements['booking-workflow'].open = true;
  window.setTimeout(() => {
    elements['booking-workflow'].scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
    const target = focusFirstField
      ? elements['booking-name']
      : elements['booking-workflow'].querySelector('summary');
    target?.focus();
  }, 0);
}

for (const shortcut of document.querySelectorAll('[data-booking-shortcut]')) {
  shortcut.addEventListener('click', () => openBookingWorkflow());
}

elements['slot-kind-filter'].addEventListener('change', () => {
  slotKind = elements['slot-kind-filter'].value;
  elements['booking-kind'].value = slotKind;
  selectedSlotId = undefined;
  renderSlotList();
  renderBookingForm();
});

elements['booking-kind'].addEventListener('change', () => {
  slotKind = elements['booking-kind'].value;
  elements['slot-kind-filter'].value = slotKind;
  selectedSlotId = undefined;
  renderSlotList();
  renderBookingForm();
});

function shiftWeek(days) {
  const date = new Date(`${weekStart}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  weekStart = date.toISOString().slice(0, 10);
  renderWeek();
}
elements['week-prev'].addEventListener('click', () => shiftWeek(-7));
elements['week-next'].addEventListener('click', () => shiftWeek(7));
elements['week-today'].addEventListener('click', () => {
  weekStart = weekStartOf(taipeiTodayDate());
  renderWeek();
});

// 點週檢視的事件 → 捲到下方預約清單的對應卡片並短暫highlight。
elements['week-view'].addEventListener('click', (event) => {
  const button = event.target.closest('[data-week-event]');
  if (button === null) return;
  const card = revealAppointmentCard(button.dataset.weekEvent, {
    resetFiltersIfMissing: true
  });
  if (card === null) return;
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  card.classList.add('is-flash');
  window.setTimeout(() => card.classList.remove('is-flash'), 1600);
});

elements['appointment-status-filter'].addEventListener('change', () => {
  filters.status = elements['appointment-status-filter'].value;
  resetAppointmentPage();
  renderAppointmentList();
});
elements['appointment-kind-filter'].addEventListener('change', () => {
  filters.kind = elements['appointment-kind-filter'].value;
  resetAppointmentPage();
  renderAppointmentList();
});
elements['appointment-search'].addEventListener('input', () => {
  filters.query = elements['appointment-search'].value;
  resetAppointmentPage();
  renderAppointmentList();
});
elements['appointment-filter-reset'].addEventListener('click', () => {
  filters = { status: 'today', kind: 'all', query: '' };
  renderFilters();
  resetAppointmentPage();
  renderAppointmentList();
  elements['appointment-search'].focus();
});
elements['appointment-page-prev'].addEventListener('click', () => {
  appointmentPageNumber -= 1;
  renderAppointmentList();
});
elements['appointment-page-next'].addEventListener('click', () => {
  appointmentPageNumber += 1;
  renderAppointmentList();
});

elements.slots.addEventListener('click', (event) => {
  const button = event.target.closest('[data-select-slot]');
  if (button === null) return;
  selectedSlotId = button.dataset.selectSlot;
  renderSlotList();
  renderBookingForm();
  message(
    '已選擇時段，請確認上方預約資料後建立。',
    'success',
    'booking-form-status'
  );
});

elements['booking-form'].addEventListener('submit', async (event) => {
  event.preventDefault();
  if (selectedSlotId === undefined)
    return message(
      '尚未建立：請先於下方「可預約時段」選擇一個時間點。',
      'error',
      'booking-form-status'
    );
  const noteTags = [
    ...elements['booking-tags'].querySelectorAll('[data-booking-tag]:checked')
  ].map((item) => item.dataset.bookingTag);
  const itemIds = [
    ...elements['booking-items'].querySelectorAll('[data-booking-item]:checked')
  ].map((item) => item.dataset.bookingItem);
  // 在送出之前先講清楚，而不是讓 store 丟一句「請選擇看診項目」——那句話會出現
  // 在表單狀態列上，但使用者要往回捲才看得到自己漏了哪一組勾選。
  if (itemIds.length === 0)
    return message(
      '尚未建立：請至少勾選一個療程／看診項目。',
      'error',
      'booking-form-status'
    );
  const bookedSlotId = selectedSlotId;
  await runUiAction({
    control: event.submitter,
    pendingLabel: '建立中…',
    pendingMessage: '正在建立預約，請稍候。',
    anchorId: 'booking-form-status',
    action: () =>
      post('/bookings', {
        slotId: bookedSlotId,
        bookingKind: elements['booking-kind'].value,
        itemIds,
        noteTags,
        noteText: elements['booking-note'].value,
        patient: {
          name: elements['booking-name'].value,
          phone: elements['booking-phone'].value,
          birthDate: elements['booking-birth'].value,
          nationalId: elements['booking-national-id'].value,
          hasNhiCard: elements['booking-nhi-card'].checked
        },
        origin: 'staff'
      }),
    onSuccess: () => {
      // 成功訊息講清楚建立哪一筆，操作者不必捲到清單才能確認。
      const created = state.appointments.find(
        (item) => item.slotId === bookedSlotId && item.status === 'confirmed'
      );
      selectedSlotId = undefined;
      elements['booking-form'].reset();
      render();
      const successMessage =
        created === undefined
          ? '預約已建立，可於「櫃台處理清單」查看。'
          : `預約已建立：${created.id} · ${formatFullDate(created.startsAt)} ${formatTime(created.startsAt)}。`;
      elements['booking-workflow'].open = false;
      message(successMessage, 'success');
      if (created !== undefined)
        window.setTimeout(() => {
          document
            .querySelector(`[data-appointment-card="${created.id}"]`)
            ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 0);
    },
    failureMessage: (error) => `未建立預約：${error.message}`
  });
});

// 回診版卡片的「調整回診」：把該筆放回逐筆回診確認暫時顯示，捲過去可再改。
// 欄位排序。點同一欄切換遞增／遞減，點另一欄則從遞增開始——遞增是「從頭看起」，
// 換欄位時使用者要的幾乎都是這個。排序只影響呈現，不動任何資料。
elements.appointments.addEventListener('click', (event) => {
  const button = event.target.closest('[data-sort-column]');
  if (button === null) return;
  const column = button.dataset.sortColumn;
  appointmentSort =
    appointmentSort.column === column
      ? {
          column,
          direction:
            appointmentSort.direction === 'ascending'
              ? 'descending'
              : 'ascending'
        }
      : { column, direction: 'ascending' };
  resetAppointmentPage();
  renderAppointmentList();
  // 重畫會換掉整個表頭，焦點會掉回 body。把焦點放回剛按的那一欄，鍵盤與螢幕
  // 閱讀器使用者才能連續調整排序，而不是每按一次就要重新找位置。
  elements.appointments
    .querySelector(`[data-sort-column="${column}"]`)
    ?.focus();
});

// 逐列勾選。只更新選取狀態與工具列，不重畫整張表——重畫會把焦點從剛勾的
// 方塊上打掉，連續勾選就變得沒辦法用鍵盤完成。
elements.appointments.addEventListener('change', (event) => {
  const box = event.target.closest('[data-appointment-select]');
  if (box === null) return;
  const id = box.dataset.appointmentSelect;
  if (box.checked) selectedAppointments.add(id);
  else selectedAppointments.delete(id);
  renderBatchBar();
});

elements['appointment-select-all'].addEventListener('change', (event) => {
  const boxes = [
    ...elements.appointments.querySelectorAll('[data-appointment-select]')
  ];
  selectedAppointments.clear();
  for (const box of boxes) {
    box.checked = event.target.checked;
    if (event.target.checked)
      selectedAppointments.add(box.dataset.appointmentSelect);
  }
  renderBatchBar();
});

elements['appointment-selection-clear'].addEventListener('click', () => {
  selectedAppointments.clear();
  renderAppointmentList();
  message('已清除選取。', 'info');
});

// 批次處置。逐筆送出，而不是新增一條「批次」路徑：每一筆仍各自經過 domain
// 的狀態守衛、冪等與稽核，批次只是連續呼叫同一個處置。
const BATCH_LABELS = {
  cancel: { verb: '確認取消', done: '已取消並釋放時段' },
  no_show: { verb: '標記未到', done: '已標記未到並釋放時段' }
};
elements['appointment-batch-bar'].addEventListener('click', async (event) => {
  const button = event.target.closest('[data-batch-action]');
  if (button === null) return;
  const action = button.dataset.batchAction;
  const ids = [...selectedAppointments];
  if (ids.length === 0) return;
  const { verb, done } = BATCH_LABELS[action];
  const confirmed = await confirmDialog(
    `確定將選取的 ${ids.length} 筆預約全部${verb}？時段會一併釋放，此動作會逐筆寫入稽核。`,
    { danger: true, confirmLabel: `${verb} ${ids.length} 筆` }
  );
  if (!confirmed) return;

  const paths = { cancel: 'cancel', no_show: 'no-show' };
  const failures = [];
  await runUiAction({
    control: button,
    pendingLabel: '處理中…',
    pendingMessage: `正在${verb} ${ids.length} 筆預約，請稍候。`,
    action: async () => {
      for (const id of ids) {
        try {
          await post(`/bookings/${id}/${paths[action]}`);
        } catch (error) {
          // 一筆失敗不該讓其餘幾筆停下來，但也不能假裝全部成功——收集起來
          // 一次照實回報。
          failures.push(`${id}：${error.message}`);
        }
      }
    },
    onSuccess: () => {
      selectedAppointments.clear();
      renderAppointmentList();
      if (failures.length === 0) {
        message(`${ids.length} 筆${done}。`, 'success');
        return;
      }
      message(
        `${ids.length - failures.length} 筆${done}；${failures.length} 筆未處理（${failures.join('、')}）。`,
        'error'
      );
    }
  });
});

elements.appointments.addEventListener('click', (event) => {
  const edit = event.target.closest('[data-follow-up-edit]');
  if (edit === null) return;
  const id = edit.dataset.followUpEdit;
  editingFollowUps.add(id);
  render();
  document
    .querySelector(`[data-follow-up-form="${id}"]`)
    ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  message('已重新開啟回診指示，依醫師指示調整後儲存即可。', 'info');
});

/**
 * 「確認回診」＝現在就替這位患者約下一次。
 *
 * 不新增任何 domain 路徑：它只是把建立預約的表單**預先填好**（患者資料、掛號別
 * 選回診、日期跳到回診目標日），送出後仍走既有的 `/bookings`。domain 會自動把
 * 這筆新預約與來源回診連起來（`scheduledAppointmentId`），移除「尚待安排」的
 * 日曆提醒，這一列也就從佇列消失。
 *
 * **回診可以發生很多次**：那筆新預約完成到診後會再登錄一次回診指示，如此循環。
 */
elements.appointments.addEventListener('click', (event) => {
  const book = event.target.closest('[data-follow-up-book]');
  if (book === null) return;
  const sourceId = book.dataset.followUpBook;
  const decision = state.followUps.find(
    (item) => item.appointmentId === sourceId
  );
  const source = state.appointments.find((item) => item.id === sourceId);
  if (decision === undefined || source === undefined) return;
  const record = state.patients.find((item) => item.id === source.patientId);

  elements['booking-workflow'].open = true;
  slotKind = 'follow_up';
  elements['booking-kind'].value = 'follow_up';
  // 時段類型的下拉也要跟著切，否則清單已經換成回診時段、選單卻還顯示「初診」，
  // 櫃台會以為自己在挑初診的格子。
  elements['slot-kind-filter'].value = 'follow_up';
  if (record !== undefined) {
    elements['booking-name'].value = record.name;
    elements['booking-phone'].value = record.phone;
    elements['booking-birth'].value = record.birthDate;
    elements['booking-national-id'].value = record.nationalId;
    elements['booking-nhi-card'].checked = record.hasNhiCard === true;
  }
  // 時段清單跳到回診目標日，櫃台不必自己翻頁找。
  selectedSlotId = undefined;
  renderSlotList();
  renderBookingForm();
  elements['booking-workflow'].scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
  message(
    `已帶入 ${record?.name ?? sourceId} 的回診資料，請選擇 ${decision.dueDate} 附近的時段後送出。`,
    'info'
  );
});

/**
 * 「取消回診」＝這位患者不用回來了。
 *
 * 走的是既有的回診指示路徑、把狀態記成 `not_required`，因此**日曆上的回診提醒
 * 會一併移除**（domain 的 replaceFollowUpProjection）。到診紀錄本身留著。
 *
 * 這裡刻意不是「刪除紀錄」——刪除會把整筆已完成的看診事實清掉、只留稽核，用它
 * 來表達「不用回診」是錯的。
 */
elements.appointments.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-follow-up-cancel]');
  if (button === null) return;
  const id = button.dataset.followUpCancel;
  const confirmed = await confirmDialog(
    '確定取消這筆回診安排？日曆上的回診提醒會一併移除，已完成的到診紀錄仍會保留。',
    { danger: true, confirmLabel: '取消回診' }
  );
  if (!confirmed) return;
  const decision = state.followUps.find((item) => item.appointmentId === id);
  await runUiAction({
    control: button,
    pendingLabel: '取消中…',
    pendingMessage: '正在取消回診安排，請稍候。',
    action: () =>
      post(`/follow-ups/${id}`, {
        status: 'not_required',
        // 保留原本的備註與診斷書份數，只改「需不需要回診」這一件事。
        tags: decision?.tags ?? [],
        noteText: decision?.noteText ?? '',
        certificateCopies: decision?.certificateCopies ?? 0
      }),
    onSuccess: () => message('回診已取消，日曆上的回診提醒已移除。', 'success'),
    failureMessage: (error) => `未取消：${error.message}`
  });
});

elements.appointments.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-appointment-action]');
  if (button === null) return;
  const action = button.dataset.appointmentAction;
  const id = button.dataset.appointmentId;

  if (action === 'follow_up_confirm') {
    document
      .querySelector(`[data-follow-up-form="${id}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    message('請於下方「登錄回診指示」依醫師指示設定回診。', 'info');
    return;
  }
  if (action === 'reschedule') {
    const form = document.querySelector(`[data-reschedule-form="${id}"]`);
    if (form !== null) {
      form.hidden = !form.hidden;
      if (!form.hidden) form.querySelector('select')?.focus();
    }
    return;
  }

  // W7：列印初診基本資料。不改任何狀態、不寫稽核——它只是把已有的資料排版。
  // 內容用完就清掉：那張表上有完整的身分證字號，沒有理由讓它留在 DOM 裡等著
  // 被下一個看螢幕的人捲到。
  if (action === 'print_intake') {
    const sheet = elements['intake-print'];
    sheet.innerHTML = renderIntakeSheet(state, id);
    sheet.hidden = false;
    sheet.removeAttribute('aria-hidden');
    window.print();
    sheet.hidden = true;
    sheet.setAttribute('aria-hidden', 'true');
    sheet.innerHTML = '';
    message('已送出列印。未填的欄位請於到診時手寫補齊。', 'success');
    return;
  }

  // 刪除是唯一需要理由的處置：紀錄消失後，稽核事件是它存在過的唯一證據。
  if (action === 'delete') {
    // 管理者天生就能刪，不必輸入授權碼；櫃台是被委派的，同一步要出示授權碼。
    const needsAuthorization = (state.session?.delegatable ?? []).includes(
      PERMISSIONS.DELETE_APPOINTMENT
    );
    const answer = await confirmWithReason(
      '確定刪除這筆預約紀錄？時段會釋放、日曆事件會移除，紀錄不會再出現在清單上（稽核仍會留下這次刪除）。此動作無法復原。',
      {
        reasons: DELETE_APPOINTMENT_REASONS,
        label: '刪除理由',
        confirmLabel: '刪除紀錄',
        ...(needsAuthorization
          ? { secret: { label: '管理者提供的授權碼' } }
          : {})
      }
    );
    if (answer === undefined) return;
    await runUiAction({
      control: button,
      pendingLabel: '刪除中…',
      pendingMessage: '正在刪除預約紀錄，請稍候。',
      action: () =>
        post(`/bookings/${id}/delete`, {
          reasonCode: answer.reasonCode,
          authorizationSecret: answer.secret
        }),
      onSuccess: () =>
        message('預約紀錄已刪除，時段已釋放，稽核已留存。', 'success'),
      failureMessage: (error) => `未刪除：${error.message}`
    });
    return;
  }

  const completing = action.startsWith('complete');
  const questions = {
    cancel: '確認取消此預約並釋放時段？',
    no_show: '確認將此預約標記為未到？時段會釋放。',
    complete: '確認患者已到診並完成本次看診？完成後可登錄回診指示。',
    complete_without_card:
      '確認患者已到診，但本次未攜帶健保卡？這只記錄這一次的情況，不會改變患者「預計攜帶健保卡」的登記。'
  };
  const confirmed = await confirmDialog(questions[action], {
    danger: !completing,
    confirmLabel: {
      cancel: '取消預約',
      no_show: '標記未到',
      complete: '確認到診',
      complete_without_card: '確認到診（未帶卡）'
    }[action]
  });
  if (!confirmed) return;
  const paths = {
    cancel: 'cancel',
    no_show: 'no-show',
    complete: 'complete',
    complete_without_card: 'complete-without-card'
  };
  await runUiAction({
    control: button,
    pendingLabel: '處理中…',
    pendingMessage: '正在更新預約狀態，請稍候。',
    action: () => post(`/bookings/${id}/${paths[action]}`),
    onSuccess: () => {
      const done = {
        cancel: '預約已取消並釋放時段。',
        no_show: '已標記未到並釋放時段。',
        complete: '到診已記錄，請接續處理回診指示。',
        complete_without_card:
          '到診已記錄，並註記本次未攜帶健保卡。請接續處理回診指示。'
      };
      message(done[action], 'success');
      if (completing && !elements['follow-up-workflow'].hidden) {
        const followUpForm = document.querySelector(
          `[data-follow-up-form="${id}"]`
        );
        followUpForm?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  });
});

// 修改備註：展開／收合卡片內的表單。備註不改狀態也不動時段，因此不放進
// 「處置」選單，直接一鍵可按。
elements.appointments.addEventListener('click', (event) => {
  const toggle = event.target.closest('[data-notes-toggle]');
  const cancel = event.target.closest('[data-notes-cancel]');
  const id = toggle?.dataset.notesToggle ?? cancel?.dataset.notesCancel;
  if (id === undefined) return;
  const form = document.querySelector(`[data-notes-form="${id}"]`);
  const button = document.querySelector(`[data-notes-toggle="${id}"]`);
  if (form === null || button === null) return;
  form.hidden = cancel !== null ? true : !form.hidden;
  button.setAttribute('aria-expanded', String(!form.hidden));
  if (!form.hidden) form.querySelector('input')?.focus();
  else button.focus();
});

elements.appointments.addEventListener('submit', async (event) => {
  const notesForm = event.target.closest('[data-notes-form]');
  if (notesForm !== null) {
    event.preventDefault();
    const data = new FormData(notesForm);
    await runUiAction({
      control: event.submitter,
      pendingLabel: '儲存中…',
      pendingMessage: '正在更新備註，請稍候。',
      action: () =>
        post(`/bookings/${notesForm.dataset.notesForm}/notes`, {
          noteTags: data.getAll('noteTags'),
          noteText: data.get('noteText')
        }),
      onSuccess: () => message('備註已更新。', 'success'),
      failureMessage: (error) => `未更新備註：${error.message}`
    });
    return;
  }

  const form = event.target.closest('[data-reschedule-form]');
  if (form === null) return;
  event.preventDefault();
  const slotId = new FormData(form).get('slotId');
  if (!slotId) return message('沒有可改期的時段。', 'error');
  await runUiAction({
    control: event.submitter,
    pendingLabel: '改期中…',
    pendingMessage: '正在改期，請稍候。',
    action: () =>
      post(`/bookings/${form.dataset.rescheduleForm}/reschedule`, {
        slotId
      }),
    onSuccess: () => message('預約已改期。', 'success')
  });
});

elements['weekly-form'].addEventListener('submit', async (event) => {
  event.preventDefault();
  const weekdays = [
    ...document.querySelectorAll('.weekday-picker input:checked')
  ].map((item) => Number(item.value));
  if (weekdays.length === 0)
    return message(
      '未加入草稿：至少選擇一個星期。',
      'error',
      'weekly-form-status'
    );
  await updateDraft(
    (draft) => {
      for (const weekday of weekdays) {
        let entry = draft.weeklyAvailability.find(
          (item) => item.weekday === weekday
        );
        if (entry === undefined) {
          entry = { weekday, intervals: [] };
          draft.weeklyAvailability.push(entry);
        }
        entry.intervals.push({
          startLocalTime: elements['weekly-start'].value,
          endLocalTime: elements['weekly-end'].value
        });
        entry.intervals.sort((a, b) =>
          a.startLocalTime.localeCompare(b.startLocalTime)
        );
      }
      draft.weeklyAvailability.sort((a, b) => a.weekday - b.weekday);
    },
    `已為 ${weekdays.length} 個星期加入營業時間草稿。`,
    'weekly-form-status',
    event.submitter,
    '未加入草稿'
  );
});

elements['date-exception-form'].addEventListener('submit', async (event) => {
  event.preventDefault();
  await updateDraft(
    (draft) => {
      const kind = elements['exception-kind'].value;
      const entry = {
        date: elements['exception-date'].value,
        kind,
        intervals:
          kind === 'extra_open'
            ? [
                {
                  startLocalTime: elements['exception-start'].value,
                  endLocalTime: elements['exception-end'].value
                }
              ]
            : []
      };
      draft.dateExceptions = [
        ...draft.dateExceptions.filter((item) => item.date !== entry.date),
        entry
      ].sort((a, b) => a.date.localeCompare(b.date));
    },
    '日期例外已加入營業時間草稿。',
    'date-exception-form-status',
    event.submitter,
    '未加入草稿'
  );
});

elements['blocked-times-form'].addEventListener('submit', async (event) => {
  event.preventDefault();
  await updateDraft(
    (draft) => {
      draft.blockedTimes = {
        initial: parseTimeList(elements['blocked-initial'].value),
        follow_up: parseTimeList(elements['blocked-follow-up'].value)
      };
    },
    '固定不開放時間已加入營業時間草稿。',
    'blocked-times-form-status',
    event.submitter,
    '未套用'
  );
});

elements['draft-schedule'].addEventListener('click', async (event) => {
  const weekly = event.target.closest('[data-remove-weekly]');
  const exception = event.target.closest('[data-remove-exception]');
  if (weekly === null && exception === null) return;
  if (
    !(await confirmDialog('確定從營業時間草稿刪除此設定？', {
      danger: true,
      confirmLabel: '刪除'
    }))
  )
    return;
  await updateDraft(
    (draft) => {
      if (weekly !== null) {
        const [weekdayText, indexText] = weekly.dataset.removeWeekly.split(':');
        const entry = draft.weeklyAvailability.find(
          (item) => item.weekday === Number(weekdayText)
        );
        entry.intervals.splice(Number(indexText), 1);
        draft.weeklyAvailability = draft.weeklyAvailability.filter(
          (item) => item.intervals.length > 0
        );
      } else
        draft.dateExceptions = draft.dateExceptions.filter(
          (item) => item.date !== exception.dataset.removeException
        );
    },
    '營業時間草稿項目已刪除。',
    'schedule-toolbar-status',
    weekly ?? exception,
    '未刪除'
  );
});

elements['publish-schedule'].addEventListener('click', async () => {
  if (
    !(await confirmDialog(
      '發布後將重新產生患者可預約時段。系統會阻擋影響既有預約的變更，是否繼續？',
      { confirmLabel: '發布營業時間' }
    ))
  )
    return;
  await runUiAction({
    control: elements['publish-schedule'],
    pendingLabel: '發布中…',
    pendingMessage: '正在發布營業時間，請稍候。',
    anchorId: 'schedule-toolbar-status',
    // 送出畫面所根據的版本；若另一分頁已發布，store 會擋下而不靜默覆蓋。
    action: () =>
      post('/schedule/publish', {
        expectedVersion: state.scheduleMeta.publishedVersion
      }),
    onSuccess: () =>
      message(
        '營業時間已發布，患者端可預約時段已同步更新。',
        'success',
        'schedule-toolbar-status'
      ),
    failureMessage: (error) => `未發布：${error.message}`
  });
});

elements['discard-schedule'].addEventListener('click', async () => {
  if (
    !(await confirmDialog('確定捨棄所有未發布的營業時間變更？', {
      danger: true,
      confirmLabel: '捨棄草稿'
    }))
  )
    return;
  await runUiAction({
    control: elements['discard-schedule'],
    pendingLabel: '捨棄中…',
    anchorId: 'schedule-toolbar-status',
    action: () => post('/schedule/discard'),
    onSuccess: () =>
      message(
        '未發布營業時間變更已捨棄。',
        'success',
        'schedule-toolbar-status'
      ),
    failureMessage: (error) => `未能捨棄：${error.message}`
  });
});

// 目標日期改變時，重建當天的回診時間選單；未營業日直接標示，
// 不留下可送出的空值（送出端 domain 仍會再擋一次）。
elements['follow-up-list'].addEventListener('change', (event) => {
  const dateInput = event.target.closest('input[name="dueDate"]');
  if (dateInput === null) return;
  const select = dateInput
    .closest('[data-follow-up-form]')
    ?.querySelector('select[name="dueTime"]');
  if (select === undefined || select === null) return;
  const times = followUpDueTimes(state.schedule, dateInput.value);
  select.innerHTML = times.length
    ? times
        .map((time) => `<option value="${escapeHtml(time)}">${time}</option>`)
        .join('')
    : '<option value="">當天未營業</option>';
  if (times.length === 0)
    message('目標日期當天未營業，請改選有門診的日期。', 'error');
});

elements['follow-up-list'].addEventListener('submit', async (event) => {
  const form = event.target.closest('[data-follow-up-form]');
  if (form === null) return;
  event.preventDefault();
  const appointmentId = form.dataset.followUpForm;
  const data = new FormData(form);
  // 決定存檔後即從逐筆回診確認消失（需要回診→清單回診版、不需要→移除）。
  // 先移出編輯集合，post() 內部重繪就已反映；失敗時仍為未決定，照樣顯示。
  editingFollowUps.delete(appointmentId);
  await runUiAction({
    control: event.submitter,
    pendingLabel: '儲存中…',
    pendingMessage: '正在儲存回診指示，請稍候。',
    action: () =>
      post(`/follow-ups/${appointmentId}`, {
        status: data.get('status'),
        dueDate: data.get('dueDate'),
        dueTime: data.get('dueTime'),
        tags: data.getAll('tags'),
        noteText: data.get('noteText'),
        certificateCopies: Number(data.get('certificateCopies') ?? 0),
        // W4：病歷號碼掛在患者身上，順著這張表單一起送。
        medicalRecordNumber: data.get('medicalRecordNumber') ?? ''
      }),
    onSuccess: () => {
      if (data.get('status') === 'required') {
        weekStart = weekStartOf(data.get('dueDate'));
        renderWeek();
      }
      message('回診指示已登錄。', 'success');
    }
  });
});

elements['account-form'].addEventListener('submit', async (event) => {
  event.preventDefault();
  const label = elements['account-label'].value;
  await runUiAction({
    control: event.submitter,
    pendingLabel: '建立中…',
    anchorId: 'account-form-status',
    action: () =>
      post('/workspace/accounts', {
        label,
        role: elements['account-role'].value
      }),
    onSuccess: () => {
      // 成功即清空輸入，避免殘留的標籤被再按一次送出。
      elements['account-form'].reset();
      message(
        `帳號「${label.trim()}」已建立。`,
        'success',
        'account-form-status'
      );
    },
    failureMessage: (error) => `未建立帳號：${error.message}`
  });
});

elements['account-list'].addEventListener('click', async (event) => {
  const button = event.target.closest('[data-account-toggle]');
  if (button === null) return;
  if (
    !(await confirmDialog('確定變更此帳號的啟用狀態？', {
      confirmLabel: '變更狀態'
    }))
  )
    return;
  await runUiAction({
    control: button,
    pendingLabel: '更新中…',
    action: () =>
      post(`/workspace/accounts/${button.dataset.accountToggle}/toggle`),
    onSuccess: () => message('帳號狀態已更新。', 'success')
  });
});

elements['delegation-form'].addEventListener('submit', async (event) => {
  event.preventDefault();
  const label = elements['delegation-label'].value;
  await runUiAction({
    control: event.submitter,
    pendingLabel: '新增中…',
    anchorId: 'delegation-form-status',
    action: () =>
      post('/workspace/delegations', {
        permission: PERMISSIONS.DELETE_APPOINTMENT,
        label,
        secret: elements['delegation-secret'].value
      }),
    onSuccess: () => {
      // 一定要清空：授權碼留在輸入框裡，下一個走過來的人就看得到（即使是
      // password 欄位，複製貼上與開發者工具都拿得到）。
      elements['delegation-form'].reset();
      message(
        `授權碼「${label.trim()}」已新增並啟用。`,
        'success',
        'delegation-form-status'
      );
    },
    failureMessage: (error) => `未新增授權碼：${error.message}`
  });
});

elements['delegation-list'].addEventListener('click', async (event) => {
  const delegationToggle = event.target.closest('[data-delegation-toggle]');
  if (delegationToggle !== null) {
    const permission = delegationToggle.dataset.delegationToggle;
    if (
      !(await confirmDialog(
        '確定變更這項委派的開關？關閉後櫃台將無法刪除預約，已設定的授權碼會保留。',
        { confirmLabel: '變更委派' }
      ))
    )
      return;
    await runUiAction({
      control: delegationToggle,
      pendingLabel: '更新中…',
      action: () => post(`/workspace/delegations/${permission}/toggle`),
      onSuccess: () => message('委派設定已更新。', 'success')
    });
    return;
  }

  const authorizationToggle = event.target.closest(
    '[data-authorization-toggle]'
  );
  if (authorizationToggle === null) return;
  if (
    !(await confirmDialog(
      '確定變更這組授權碼的啟用狀態？停用後，使用這組授權碼的人會立即無法刪除預約。',
      { confirmLabel: '變更狀態' }
    ))
  )
    return;
  await runUiAction({
    control: authorizationToggle,
    pendingLabel: '更新中…',
    action: () =>
      post(
        `/workspace/delegations/${authorizationToggle.dataset.delegation}/authorizations/${authorizationToggle.dataset.authorizationToggle}/toggle`
      ),
    onSuccess: () => message('授權碼狀態已更新。', 'success')
  });
});

elements['announcement-form'].addEventListener('submit', async (event) => {
  event.preventDefault();
  await runUiAction({
    control: event.submitter,
    pendingLabel: '儲存中…',
    anchorId: 'announcement-form-status',
    action: () =>
      post('/workspace/announcement', {
        status: elements['announcement-status'].value,
        title: elements['announcement-title'].value,
        body: elements['announcement-body'].value
      }),
    onSuccess: () =>
      message('患者公告已儲存。', 'success', 'announcement-form-status'),
    failureMessage: (error) => `未儲存：${error.message}`
  });
});

elements['maintenance-form'].addEventListener('submit', async (event) => {
  event.preventDefault();
  if (
    elements['maintenance-enabled'].checked &&
    !(await confirmDialog(
      '啟用後，生效時間內患者端將無法建立預約。確定套用？',
      { danger: true, confirmLabel: '套用維護模式' }
    ))
  )
    return;
  await runUiAction({
    control: event.submitter,
    pendingLabel: '套用中…',
    anchorId: 'maintenance-form-status',
    action: () =>
      post('/workspace/maintenance', {
        enabled: elements['maintenance-enabled'].checked,
        title: elements['maintenance-title'].value,
        body: elements['maintenance-body'].value,
        startsAt: elements['maintenance-starts-at'].value,
        resumeAt: elements['maintenance-resume-at'].value
      }),
    onSuccess: () =>
      message(
        state.maintenanceActive
          ? '患者端維護模式目前生效中。'
          : '維護排程已儲存，目前尚未生效或已自動恢復。',
        'success',
        'maintenance-form-status'
      ),
    failureMessage: (error) => `未套用：${error.message}`
  });
});

elements['release-form'].addEventListener('submit', async (event) => {
  event.preventDefault();
  await runUiAction({
    control: event.submitter,
    pendingLabel: '新增中…',
    anchorId: 'release-form-status',
    action: () =>
      post('/workspace/releases', {
        version: elements['release-version'].value,
        summary: elements['release-summary'].value
      }),
    onSuccess: () =>
      message(
        '發布紀錄已新增；未觸發真實部署。',
        'success',
        'release-form-status'
      ),
    failureMessage: (error) => `未新增：${error.message}`
  });
});

elements['audit-filter'].addEventListener('change', () => {
  elements['audit-events'].innerHTML = renderAudit(
    state,
    elements['audit-filter'].value
  );
});

// 日曆投影的合成示範：模擬一次同步（可設為失敗以產生死信）。
elements['outbox-simulate'].addEventListener('click', async () => {
  const fail = elements['outbox-fail-next'].checked;
  await runUiAction({
    control: elements['outbox-simulate'],
    pendingLabel: '模擬中…',
    anchorId: 'outbox-form-status',
    action: () => post('/outbox/simulate', { fail }),
    onSuccess: () => {
      elements['outbox-fail-next'].checked = false;
      message(
        fail
          ? '已模擬同步失敗，工作進入死信，可在下方重新排入。'
          : '已模擬同步成功。',
        'success',
        'outbox-form-status'
      );
    },
    failureMessage: (error) => `未能模擬同步：${error.message}`
  });
});

// 死信補回入口：對映 apps/worker 的 requeue，只作用於死信。
elements['outbox-jobs'].addEventListener('click', async (event) => {
  const button = event.target.closest('[data-outbox-requeue]');
  if (button === null) return;
  await runUiAction({
    control: button,
    pendingLabel: '排入中…',
    anchorId: 'outbox-form-status',
    action: () =>
      post('/outbox/requeue', { jobId: button.dataset.outboxRequeue }),
    onSuccess: () =>
      message(
        '死信已重新排入，狀態回到待同步。',
        'success',
        'outbox-form-status'
      ),
    failureMessage: (error) => `未能重新排入：${error.message}`
  });
});

document.querySelector('.skip-link').addEventListener('click', (event) => {
  event.preventDefault();
  window.location.hash = 'main-content';
  elements['main-content'].focus({ preventScroll: true });
});

if (!isOnline) elements['environment-label'].textContent = 'LOCAL TEST ONLY';

try {
  state = await apiClient.request('/state');
  enforceRoleDomBoundary();
  let accessDenied = false;
  initWorkspaceTabs({
    onDenied: () => {
      accessDenied = true;
      message('你目前沒有權限開啟這個主管工作區，已返回營運首頁。', 'error');
      elements.status.setAttribute('tabindex', '-1');
      elements.status.focus({ preventScroll: true });
    }
  });
  render();
  if (state.session.authenticated === true && !accessDenied)
    message('工作臺已就緒。資料只保存在這台裝置的瀏覽器。', 'success');
  else elements['login-account'].focus();
} catch (error) {
  message(error instanceof Error ? error.message : '無法載入工作臺。', 'error');
}
