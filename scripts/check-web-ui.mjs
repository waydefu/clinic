import { readFile } from 'node:fs/promises';
import process from 'node:process';

// 工作臺的標記自 2026-07-21 起直接寫在 index.html，不再有獨立的 shell 檔。
const paths = {
  adminShell: 'apps/web/public/index.html',
  adminClient: 'apps/web/public/admin-bootstrap.js',
  patientHtml: 'apps/web/public/patient.html',
  patientClient: 'apps/web/public/patient-app.js',
  store: 'apps/web/public/store.js',
  domainRules: 'apps/web/public/modules/domain-rules.js',
  adminView: 'apps/web/public/modules/admin-view.js',
  schedule: 'apps/web/public/modules/schedule-engine.js',
  cases: 'apps/web/public/modules/case-management.js',
  permissions: 'apps/web/public/modules/permissions.js',
  confirmDialog: 'apps/web/public/modules/confirm-dialog.js',
  apiClient: 'apps/web/public/modules/api-client.js',
  asyncAction: 'apps/web/public/modules/async-action.js',
  theme: 'apps/web/public/theme.js',
  stateSchema: 'apps/web/public/modules/state-schema.js',
  css: 'apps/web/public/workbench.css',
  // 患者頁與工作臺共用 styles.css。先前這份檔案完全不在守衛範圍內，於是
  // 2026-07-26 修掉工作臺「手機隱藏英文副標」之後，患者頁那一份原封不動地留著。
  patientCss: 'apps/web/public/styles.css',
  robots: 'apps/web/public/robots.txt',
  sitemap: 'apps/web/public/sitemap.xml',
  privacyHtml: 'apps/web/public/privacy.html'
};
const entries = await Promise.all(
  Object.entries(paths).map(async ([key, path]) => [
    key,
    await readFile(path, 'utf8')
  ])
);
const files = Object.fromEntries(entries);
const failures = [];
// Compare with whitespace removed. These assertions describe which construct
// must exist, not how it is laid out; matching raw text would pin the sources
// to one exact formatting and make them impossible to run a formatter over.
const normalize = (value) => value.replace(/\s+/g, '');
function requireText(source, text, description) {
  if (!normalize(source).includes(normalize(text))) failures.push(description);
}

/** 反向守衛：某些寫法一旦回來就是退步，光要求正確寫法在場擋不住它。 */
function refuseText(source, text, description) {
  if (normalize(source).includes(normalize(text))) failures.push(description);
}

requireText(
  files.adminShell,
  'id="environment-label"',
  'Workbench no longer states which environment it is running in.'
);
requireText(
  files.adminShell,
  '127.0.0.1',
  'Workbench is missing the loopback boundary notice.'
);
requireText(
  files.adminShell,
  'src="/admin-bootstrap.js"',
  'Root page does not load the modular admin bootstrap.'
);
requireText(
  files.adminShell,
  'href="#main-content"',
  'Admin shell is missing skip navigation.'
);
requireText(
  files.adminShell,
  'id="login-account"',
  'Admin shell is missing the synthetic account+password login gate.'
);
requireText(
  files.adminShell,
  'id="logout"',
  'Admin shell is missing the logout control for the login gate.'
);
requireText(
  files.adminShell,
  '營業時間草稿與發布',
  'Admin shell is missing schedule draft/publish workflow.'
);
requireText(
  files.adminShell,
  '登錄回診指示',
  'Admin shell is missing per-appointment follow-up decisions.'
);
requireText(
  files.adminShell,
  '個管指派與工作量',
  'Admin shell is missing case assignment workflow.'
);
requireText(
  files.adminShell,
  'maintenance-starts-at',
  'Admin shell is missing scheduled maintenance start.'
);
requireText(
  files.adminClient,
  "import { apiClient } from './modules/api-client.js'",
  'Admin client bypasses the API client adapter.'
);
requireText(
  files.patientClient,
  "import { apiClient } from './modules/api-client.js'",
  'Patient client bypasses the API client adapter.'
);
requireText(
  files.apiClient,
  "import { stagingRequest } from '../store.js'",
  'Synthetic API client is no longer backed by the modular store.'
);
requireText(
  files.apiClient,
  "method === 'GET' && clientError.retryable",
  'API client no longer limits automatic retry to safe GET requests.'
);
// 忙碌狀態的正確表達方式。
//
// 這條規則原本要求按鈕上必須有 `aria-busy`，那是錯的：MDN 明載 `aria-busy` 是給
// live region、複合元件與 feed 用的——語意是「這一塊正在改，先別唸」，因此會把
// 該元素的子內容對輔助技術隱藏。設在按鈕上等於在忙碌期間讓按鈕失去名稱，而且
// 螢幕閱讀器不會立即播報，只有重新聚焦時才帶得到。
//
// 改成守住真正有效的兩件事：按鈕換成忙碌文字（視覺與可及名稱），以及重複送出的
// 程式閘門。公告責任在 `role="status"` 的狀態列。
requireText(
  files.asyncAction,
  'control.textContent = pendingLabel;',
  'Pending actions no longer swap the control label, which is what actually communicates the busy state.'
);
requireText(
  files.asyncAction,
  "control?.dataset.busy === 'true'",
  'Pending actions no longer guard against a second submission while one is in flight.'
);
refuseText(
  files.asyncAction,
  "setAttribute('aria-busy'",
  'aria-busy is back on a control. It is a live-region/composite-widget state and it hides the element’s own children from assistive technology — see the comment in async-action.js.'
);
requireText(
  files.adminClient,
  "elements['main-content'].focus({preventScroll:true});",
  'Skip navigation does not move keyboard focus.'
);
requireText(
  files.patientHtml,
  'src="/patient-app.js"',
  'Patient page does not load the modular client.'
);
requireText(
  files.patientClient,
  'latestFollowUp()',
  'Patient flow is not linked to a per-patient follow-up decision.'
);
requireText(
  files.store,
  "path==='/schedule/publish'",
  'Store is missing schedule publishing.'
);
requireText(
  files.store,
  "path==='/case-assignments'",
  'Store is missing case-manager assignment.'
);
requireText(
  files.schedule,
  'scheduleImpact',
  'Schedule engine is missing active-booking impact checks.'
);
requireText(
  files.cases,
  'uniquePatientCount',
  'Case module is missing distinct-patient workload.'
);
requireText(
  files.permissions,
  'requirePermission',
  'Permission module is missing action enforcement.'
);
// 2026-07-24 負責人方向（D-006）：刪除只給管理者。路由的權限檢查與選單的
// 權限過濾必須同時在位——只藏按鈕不是授權，只擋路由則會留下按了才失敗的入口。
requireText(
  files.store,
  'PERMISSIONS.DELETE_APPOINTMENT',
  'Store no longer enforces the administrator-only appointment deletion.'
);
requireText(
  files.adminView,
  'permissions.includes(action.permission)',
  'Workbench action menu no longer filters processes by permission.'
);
// 2026-07-27：權限有兩種來源——角色天生的，與憑授權碼委派的。**每一個依權限
// 過濾的地方都必須同時看兩種**，否則會出現「入口看得到、按下去卻在送出前就被
// 自己擋掉」。這正是委派刪除第一次實作時踩到的：送出前的自我檢查只讀
// session.permissions，請求根本沒離開畫面，授權碼永遠沒機會被驗證。
requireText(
  files.adminClient,
  '!(state.session.delegatable ?? []).includes(requiredPermission)',
  'The workbench pre-flight permission check ignores delegated permissions, so a delegated action is rejected before its authorization can be presented.'
);
requireText(
  files.adminView,
  '...(state.session?.delegatable ?? [])',
  'The workbench action list ignores delegated permissions, so the delegated entry point never appears.'
);
requireText(
  files.css,
  '.workspace-nav',
  'Admin navigation styling is missing.'
);
requireText(
  files.css,
  ':focus-visible',
  'Modular admin CSS must preserve visible focus.'
);
// 小手機仍要完整保留中英文品牌名稱。品牌區可縮排、英文副標可換行，但不能靠
// display:none 解決空間，否則使用者無法辨識診所或失去原有的英文品牌資訊。
requireText(
  files.css,
  '.topbar .brand small { overflow-wrap: anywhere; }',
  'Small-screen workbench CSS must allow the English brand subtitle to wrap.'
);
refuseText(
  files.css,
  '.topbar .brand > span { display: none; }',
  'Small-screen workbench CSS hides the clinic name together with the subtitle.'
);
refuseText(
  files.css,
  '.topbar .brand small { display: none; }',
  'Small-screen workbench CSS hides the English brand subtitle.'
);
// 患者頁是對外的那一面，同一條規則更嚴格地適用。兩份客戶端的品牌列各有一套
// 手機樣式，所以守衛也要各有一條——只釘工作臺那一份擋不住這一份。
requireText(
  files.patientCss,
  '.patient-header .brand small { overflow-wrap: anywhere; }',
  'Small-screen patient CSS must allow the English brand subtitle to wrap.'
);
refuseText(
  files.patientCss,
  '.patient-header .brand small { display: none; }',
  'Small-screen patient CSS hides the English brand subtitle.'
);
refuseText(
  files.patientCss,
  '.patient-header .brand > span { display: none; }',
  'Small-screen patient CSS hides the clinic name together with the subtitle.'
);
// 週檢視是可捲動區塊，必須能被鍵盤聚焦後捲動（WCAG 2.1.1，axe 會擋）。
// requireText 會先去掉所有空白再比對，所以這裡寫成單行即可。
requireText(
  files.adminShell,
  'id="week-view" class="week-view" role="group" tabindex="0"',
  'Week view must stay keyboard-focusable (role=group, tabindex=0).'
);

// 2026-07-21 決定（專案負責人）：預約流程改為收集姓名、電話、生日與身分證，
// 公開預覽一併更新。因此這裡不再是「不得有任何輸入欄位」，而是「只允許清單內
// 的欄位」——新增任何欄位都必須是刻意的決定，並回頭確認 D-001～D-003。
const allowedControls = new Set([
  // 合成帳密登入閘門的欄位（browser-local、非安全邊界）。
  'login-account',
  'login-password',
  'booking-name',
  'booking-phone',
  'booking-birth',
  'booking-national-id',
  'booking-nhi-card',
  'booking-kind',
  'booking-item',
  'booking-note',
  'slot-kind-filter',
  'appointment-status-filter',
  'appointment-kind-filter',
  'appointment-patient-filter',
  // 2026-07-23：只在已載入的清單內篩選姓名、電話或預約編號，不新增保存欄位。
  'appointment-search',
  'blocked-initial',
  'blocked-follow-up',
  'weekday-0',
  'weekday-1',
  'weekday-2',
  'weekday-3',
  'weekday-4',
  'weekday-5',
  'weekday-6',
  'weekly-start',
  'weekly-end',
  'exception-date',
  'exception-kind',
  'exception-start',
  'exception-end',
  'account-label',
  'account-role',
  'announcement-status',
  'announcement-title',
  'maintenance-enabled',
  'maintenance-title',
  'maintenance-starts-at',
  'maintenance-resume-at',
  'release-version',
  'audit-filter',
  // 2026-07-22：顯示主題切換（自動／淺色／護眼／深色），不觸碰任何資料。
  'theme-picker',
  // 2026-07-23：日曆投影死信補回的合成示範，不觸碰任何病患資料。
  'outbox-fail-next',
  // 2026-07-25：櫃台清單的批次選取。只決定「哪幾列被勾起來」，本身不改任何
  // 資料；真正的處置仍逐筆走既有的 /bookings/{id}/... 路徑，狀態守衛、權限與
  // 稽核都不因為批次而放寬。
  'appointment-select-all',
  // 2026-07-27：把刪除預約委派給櫃台用的授權碼。管理者自訂名稱與授權碼，不觸碰
  // 任何患者資料；授權碼只寫進本機狀態，且**不會**回填到畫面或稽核紀錄上。
  'delegation-label',
  'delegation-secret'
]);
for (const control of files.adminShell.matchAll(
  /<(?:input|select)\b[^>]*\bid="([^"]+)"[^>]*>/gi
)) {
  if (!allowedControls.has(control[1]))
    failures.push(`Unexpected modular admin input: ${control[1]}.`);
}
const allowedTextareas = new Set([
  'announcement-body',
  'maintenance-body',
  'release-summary'
]);
for (const control of files.adminShell.matchAll(
  /<textarea\b[^>]*\bid="([^"]+)"[^>]*>/gi
)) {
  if (!allowedTextareas.has(control[1]))
    failures.push(`Unexpected modular admin textarea: ${control[1]}.`);
}
const allowedPatientControls = new Set([
  'patient-name',
  'patient-phone',
  // 2026-07-27（P11）：生日拆成三格，年份選填。日期是 R-7「一個資料一個欄位」
  // 的具名例外——它是三個獨立的數字，而 <input type="date"> 無法表達「年可不填」。
  'patient-birth-year',
  'patient-birth-month',
  'patient-birth-day',
  'patient-national-id',
  // 2026-07-27（P10）：外籍患者改填護照。與身分證**擇一**，畫面上一次只出現
  // 一個，切換時另一欄連值一起清空。
  'patient-passport',
  'patient-nhi-card',
  'synthetic-confirmation',
  // 2026-07-22：顯示主題切換（自動／淺色／護眼／深色），不觸碰任何資料。
  'theme-picker',
  // 2026-07-23：時段清單的日期跳轉，只是檢視用篩選，不收集任何患者資料。
  'patient-slot-date',
  // 2026-07-27：個資法第 8 條的同意勾選。它不收集資料，而是記錄「已被告知」；
  // 與既有的 synthetic-confirmation 分開，因為那是「測試版本資料留在本機」的
  // 確認，兩者是不同的事，合併會讓人不知道自己同意了什麼。
  'privacy-consent',
  // 2026-07-27（P7）：患者自己的備註，上限 120 字。存成 appointment.patientNote，
  // 與櫃台的 noteText 分開——否則櫃台一按「修改備註」就會把患者寫的話蓋掉。
  'patient-note',
  // 2026-07-27（P9）：介紹人姓名。**這是第三人的個資**，所以只在勾了親友介紹
  // 或員工介紹時才出現，取消勾選時由 patient-app.js 清空，後端也只在需要時才收。
  'patient-referrer'
]);
for (const control of files.patientHtml.matchAll(
  /<(?:input|select|textarea)\b[^>]*\bid="([^"]+)"[^>]*>/gi
)) {
  if (!allowedPatientControls.has(control[1]))
    failures.push(`Unexpected patient data input: ${control[1]}.`);
}
// The patient page must keep telling visitors where their data goes, and the
// list must never render an unmasked national ID.
requireText(
  files.patientHtml,
  '只會保存在我這台裝置的瀏覽器',
  'Patient form no longer states where the data is stored.'
);
const localOnlyLinks =
  files.patientHtml.match(/\bdata-local-only-link\b/g)?.length ?? 0;
if (localOnlyLinks !== 2)
  failures.push(
    'Patient header and footer must both mark their workbench links as local-only.'
  );
requireText(
  files.patientClient,
  "document.querySelectorAll('[data-local-only-link]')",
  'Online patient preview no longer hides every internal workbench link.'
);
// 2026-07-27：改釘 `maskIdentityDocument`。外籍患者給的是護照，只遮身分證那一欄
// 會讓他們的識別碼要嘛整串裸露、要嘛顯示成破折號（看起來像資料缺漏）。
requireText(
  files.adminView,
  'maskIdentityDocument',
  'Workbench must render every patient identity document masked, whichever kind it is.'
);
const combinedClient = `${files.adminClient}\n${files.patientClient}\n${files.store}\n${files.domainRules}\n${files.schedule}\n${files.cases}\n${files.confirmDialog}\n${files.theme}`;
const externalUrls = combinedClient.match(/https?:\/\/[^'"\s`]+/g) ?? [];
for (const url of externalUrls)
  failures.push(`Unexpected external client endpoint: ${url}`);
// 2026-07-22 基線：確認一律走自製 <dialog> 彈窗（焦點陷阱、主題一致），
// 不得退回無樣式且無法自訂的 window.confirm。
if (/window\.confirm/.test(combinedClient))
  failures.push('window.confirm is banned; use modules/confirm-dialog.js.');
for (const key of ['adminClient', 'patientClient'])
  requireText(
    files[key],
    "from './modules/confirm-dialog.js'",
    `${key} must use the shared confirm dialog.`
  );

// 整批置換內容的清單容器**不得**是 live region。掛上去的話，螢幕閱讀器會在每次
// 重畫時把整份清單逐項重唸——搜尋框每打一個字就重唸一次結果集。正確做法是給一個
// 簡短的 .result-summary 並把 aria-live 掛在那上面（MDN 的 live region 指引也是
// 這樣建議）。2026-07-25 全站統一，這條擋它回來。
for (const id of [
  'appointments',
  'task-list',
  'slots',
  'follow-up-list',
  'case-assignment-list',
  'workload',
  'account-list',
  'release-list'
]) {
  const container = new RegExp(`id="${id}"[^>]*aria-live`, 'i');
  if (container.test(files.adminShell.replace(/\s+/g, ' ')))
    failures.push(
      `#${id} must not be a live region; announce changes with a short .result-summary instead.`
    );
}

// 重複的 id 在這個專案不是小瑕疵，是會壞掉的事：兩份客戶端都用
// `Object.fromEntries(document.querySelectorAll('[id]'))` 建 elements 表，後出現
// 的那個會直接蓋掉前一個，於是某個控制項被悄悄換成另一個元素——沒有錯誤訊息，
// 只有讀到 undefined 的值或寫錯地方。2026-07-25 就發生過一次：新增的清單摘要
// 用了 `release-summary`，撞到發布表單裡同名的 <textarea>。
for (const [key, path] of [
  ['adminShell', paths.adminShell],
  ['patientHtml', paths.patientHtml]
]) {
  const ids = [...files[key].matchAll(/\sid="([^"]+)"/g)].map(
    (match) => match[1]
  );
  const seen = new Set();
  const duplicates = new Set();
  for (const id of ids) {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  for (const id of duplicates)
    failures.push(`${path} has a duplicate id="${id}".`);
}

// ---------------------------------------------------------------------------
// 門診時間不得在 patient.html 與 defaultSchedule 之間漂移。
//
// 同一組時間在 patient.html 出現三次：JSON-LD 的 openingHoursSpecification、
// meta description，以及 <noscript> 後備與頁尾的靜態文字。這三份**無法消除**：
// 結構化資料要機器讀的形狀，後備要的是 JS 沒跑也看得到的字。真正的來源是
// state-schema.js 的 defaultSchedule。
//
// 所以不硬合併，改成讓漂移在 CI 就被抓到。先前這件事只靠註解裡的一句「修改時
// 請一併更新」，而那種約定遲早會有人漏掉——漏掉的後果是診所對外公告的門診時間
// 與系統實際開放的時段不一致。
const scheduleHours = [
  ...files.stateSchema.matchAll(
    /startLocalTime:\s*'(\d{2}:\d{2})',\s*endLocalTime:\s*'(\d{2}:\d{2})'/g
  )
].map((match) => `${match[1]}–${match[2]}`);

if (scheduleHours.length === 0) {
  failures.push(
    'Could not read any weeklyAvailability interval from state-schema.js; the opening-hours drift check cannot run.'
  );
} else {
  for (const hours of new Set(scheduleHours)) {
    if (!files.patientHtml.includes(hours)) {
      failures.push(
        `patient.html does not mention the ${hours} opening hours declared in state-schema.js defaultSchedule.`
      );
    }
  }
  // 結構化資料是**第四份**同樣的時間，而且形狀不同：`"opens": "12:00"` 配
  // `"closes": "20:00"`，不是給人看的 `12:00–20:00`。上面那兩條字面比對因此
  // 完全掃不到它——JSON-LD 可以停在舊時間而檢查全綠。
  //
  // 這一份漂移的後果比其他三份嚴重：Google 直接把 openingHoursSpecification
  // 顯示在搜尋結果與地圖上，患者會照著一個沒有人在看診的時間到診所。
  const structuredHours = [
    ...files.patientHtml.matchAll(
      /"opens":\s*"(\d{2}:\d{2})",\s*"closes":\s*"(\d{2}:\d{2})"/g
    )
  ].map((match) => `${match[1]}–${match[2]}`);

  if (structuredHours.length === 0) {
    failures.push(
      'patient.html has no openingHoursSpecification with opens/closes; the structured-data drift check cannot run.'
    );
  }
  for (const hours of new Set(structuredHours)) {
    if (!scheduleHours.includes(hours)) {
      failures.push(
        `patient.html structured data publishes ${hours} to search engines, which no weeklyAvailability interval in state-schema.js provides.`
      );
    }
  }
  for (const hours of new Set(scheduleHours)) {
    if (!structuredHours.includes(hours)) {
      failures.push(
        `state-schema.js opens ${hours} but patient.html structured data never declares it, so search results will understate the clinic's hours.`
      );
    }
  }

  // 反向也要成立：patient.html 不得宣傳一個排班裡沒有的時段。
  const advertised = new Set(
    (files.patientHtml.match(/\d{2}:\d{2}–\d{2}:\d{2}/g) ?? []).map(String)
  );
  for (const hours of advertised) {
    if (!scheduleHours.includes(hours)) {
      failures.push(
        `patient.html advertises ${hours}, which no weeklyAvailability interval in state-schema.js provides.`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// R-7：個人資料欄位要用**標準的** autocomplete token。
//
// 為什麼是規則而不是偏好：token 正確時，瀏覽器與密碼管理器能自動填入，行動裝置
// 上少打十幾個字；token 自造（例如 `autocomplete="patient-name"`）時，瀏覽器只當
// 它是未知值而忽略，**畫面上完全看不出差別**——這正是會靜默退步的那種設定。
// WCAG 1.3.5 Identify Input Purpose 也要求用規範裡的名稱。
//
// 身分證欄位刻意是 `off`：那是共用機台上不該被自動填入的欄位（見政策頁）。這是
// 走過例外程序的具名決定，不是漏寫。
//
// 2026-07-27：生日拆成三格之後，token 也必須跟著拆——`bday` 是給單一日期欄位
// 的，套在三格上瀏覽器一格都填不了。`bday-year`／`bday-month`／`bday-day` 是
// 規範裡就有的名稱，GOV.UK 的 date input 也是這樣用。護照與身分證同樣是共用
// 機台上不該被自動填入的欄位，一樣走具名決定的 `off`。
const AUTOCOMPLETE_EXPECTED = {
  'patient-name': 'name',
  'patient-phone': 'tel',
  'patient-birth-year': 'bday-year',
  'patient-birth-month': 'bday-month',
  'patient-birth-day': 'bday-day',
  'patient-national-id': 'off',
  'patient-passport': 'off'
};
for (const [id, token] of Object.entries(AUTOCOMPLETE_EXPECTED)) {
  const field = files.patientHtml.match(
    new RegExp(`<input[^>]*\\bid="${id}"[^>]*>`, 'i')
  );
  if (field === null) {
    failures.push(`patient.html no longer has the ${id} field.`);
    continue;
  }
  const declared = field[0].match(/\bautocomplete="([^"]*)"/i);
  if (declared === null) {
    failures.push(
      `${id} has no autocomplete token, so browsers and password managers cannot fill it and WCAG 1.3.5 is not met.`
    );
  } else if (declared[1] !== token) {
    failures.push(
      `${id} declares autocomplete="${declared[1]}" but must be "${token}"; a non-standard token is silently ignored by browsers.`
    );
  }
}

// 個資告知必須在「蒐集當下」看得到，而不是只有頁尾一個連結。
//
// 2026-07-27（P6）：呈現由「攤開的六項摘要」改為一行勾選＋句中入口。**業主要的
// 是低調，不是省略**，所以守衛跟著改成釘住三件仍然必須成立的事：
//   1. 表單裡有獨立的同意勾選（不與「資料留在本機」合併）；
//   2. 入口就在那句話裡，而且是真的 `<a href="/privacy">`——沒有 JavaScript 時
//      仍走得到完整告知（先前那顆 <button> 在無腳本時完全沒有替代路徑）；
//   3. 有腳本時就地展開全文，讀完不必放棄填到一半的表單。
// 換成摘要式或只留頁尾連結都會讓這裡紅。
requireText(
  files.patientHtml,
  'id="privacy-consent"',
  'The booking form has no separate consent checkbox for the data-collection notice.'
);
{
  const consentEntry = files.patientHtml
    .replace(/\s+/g, ' ')
    .match(/<a[^>]*id="open-privacy-policy"[^>]*>/i);
  if (consentEntry === null) {
    failures.push(
      'The consent line has no #open-privacy-policy entry point, so the notice is only reachable from the footer.'
    );
  } else if (!/href="\/privacy"/i.test(consentEntry[0])) {
    failures.push(
      'The consent entry point is not a real link to /privacy, so with JavaScript unavailable there is no route to the notice at all.'
    );
  }
}
requireText(
  files.patientClient,
  "elements['privacy-consent'].checked",
  'Submitting a booking no longer requires the data-collection consent.'
);
requireText(
  files.patientClient,
  "import { openPolicyDialog } from './modules/policy-dialog.js'",
  'The booking form can no longer open the full policy in place, so reading it means abandoning a half-filled form.'
);
// 介紹人是**第三人**的姓名，那個人不在現場、也沒有被告知。取消勾選「親友介紹」
// 之後欄位會收起來，但輸入過的名字如果留在 DOM 裡仍會被一起送出——畫面上看不到
// 的資料照樣離開了表單。收起來的同時必須清空。
requireText(
  files.patientClient,
  "if (!needed) elements['patient-referrer'].value = '';",
  'The referrer field keeps a third party’s name after the referral option is unticked, so a name the patient no longer offers is still submitted.'
);
// 政策頁沒有指令碼，所以「我同意」只能靠網址把狀態帶回預約頁。
requireText(
  files.privacyHtml,
  'href="/booking?consent=1"',
  'The policy page has no way back to the booking form that carries the consent, so reading it to the end costs the reader the checkbox anyway.'
);
requireText(
  files.patientClient,
  "url.searchParams.get('consent')",
  'The booking page ignores the consent flag the policy page sends back.'
);
// 讀完必須把旗標從網址抹掉，否則重新整理或把連結分享出去都會自帶同意。
requireText(
  files.patientClient,
  "url.searchParams.delete('consent')",
  'The consent flag is left in the URL, so a refreshed or shared link silently consents on someone else’s behalf.'
);
// 儲存鍵只能有一份來源。抄成字面值時，SCHEMA_VERSION 一改就靜默失去跨分頁同步
// ——沒有錯誤、沒有紅字（v4→v5 當下就發生過）。
for (const [name, source] of [
  ['patient-app.js', files.patientClient],
  ['admin-bootstrap.js', files.adminClient]
]) {
  if (/'beauessence_synthetic_online_preview_v\d+'/.test(source)) {
    failures.push(
      `${name} hard-codes the storage key instead of importing it; it will silently stop matching when the schema version changes.`
    );
  }
}

// sitemap 的網址必須就是 patient.html 宣告的正規網址。
//
// 兩者不一致時不會有任何錯誤：搜尋引擎照樣收下 sitemap，然後發現它指的網址
// 自己宣告正規網址是別人，於是那一筆的權重被拆開或直接丟掉。這是那種「設定
// 看起來都有做」卻沒有效果的典型。
const canonicalOf = (source, label) => {
  const match = source.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i);
  if (match === null) {
    failures.push(`${label} has no rel="canonical".`);
    return undefined;
  }
  return match[1];
};

// 每一個對外頁面都必須在 sitemap 裡，而且用的是它自己宣告的正規網址。
const publicPages = [
  {
    canonical: canonicalOf(files.patientHtml, 'patient.html'),
    label: '預約頁'
  },
  {
    canonical: canonicalOf(files.privacyHtml, 'privacy.html'),
    label: '隱私權政策'
  }
];
const sitemapLocations = [
  ...files.sitemap.matchAll(/<loc>([^<]+)<\/loc>/gi)
].map((match) => match[1]);

if (sitemapLocations.length === 0) {
  failures.push('sitemap.xml has no <loc>.');
}
for (const { canonical, label } of publicPages) {
  if (canonical !== undefined && !sitemapLocations.includes(canonical)) {
    failures.push(
      `sitemap.xml does not list ${canonical} (${label}), so that page relies on being discovered by luck.`
    );
  }
}
// 反向：sitemap 不得列出沒有任何頁面宣告為正規網址的位址。
const canonicals = publicPages
  .map((page) => page.canonical)
  .filter((value) => value !== undefined);
for (const location of sitemapLocations) {
  if (!canonicals.includes(location)) {
    failures.push(
      `sitemap.xml lists ${location}, which no page declares as its canonical; search engines will discard it.`
    );
  }
}

// robots.txt 必須指向 sitemap，否則 sitemap 只有手動送交才會被發現。
if (!files.robots.includes('Sitemap:')) {
  failures.push('robots.txt does not point to a Sitemap.');
}

if (failures.length > 0) {
  console.error('Modular test-only UI guard failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    'Modular test-only UI guard passed (permissions, published schedule, case flow, safety and accessibility).'
  );
}
