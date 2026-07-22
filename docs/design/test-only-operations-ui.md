# 工作臺與患者預約 UI／UX

## 適用範圍

本文件規範 `apps/web/public` 的測試版本。它可在本機旗標下運行，也可發布到已記錄的 Firebase Hosting preview channel。所有狀態僅存在目前瀏覽器的 `localStorage`，沒有後端、資料庫或登入系統。

D-001～D-011 尚未核准，因此本頁的政策、角色與文字都不得被推定為診所已核准的正式規則。

## 資料範圍（2026-07-21 依專案負責人決定調整）

患者端**會收集**姓名、電話、生日（西元）、身分證字號與健保卡欄位；身分證是「同一人同時只能有一筆未完成預約」的識別依據。

這些值只存在**訪客自己瀏覽器的 `localStorage`**，不會傳送或保存於診所。這與早期「只用不透明合成 ID」的設計不同，該決定與其緩解措施記錄於[決策登錄](../product/phase-1-decision-register.md)。

緩解措施（不得回退）：

- 清單一律以 `maskNationalId` 遮罩顯示（`A12****789`），`check:ui` 會驗證這一點。
- 患者端必須明示「資料只會保存在我這台裝置的瀏覽器」。
- 欄位採允許清單，新增任何欄位都必須是刻意的決定。
- D-001～D-003 核准前，不得以此預覽蒐集真實病患資料作為營運用途。

## 角色與最小權限

| 視角 | 可使用功能 | 不可使用功能 |
| --- | --- | --- |
| 管理者（模擬） | 多日多時段排班、固定不開放時間、刪除時段、加開／休診、回診確認、帳號建立／停用／恢復、患者公告、維護模式、發布紀錄 | 真實登入、正式授權、外部整合 |
| 櫃台員工（模擬） | 查看排班、建立預約、取消、改期、標記未到、標記到診、查看非金額個管工作量 | 排班與例外設定、回診確認、帳號治理、公告與維護設定 |
| 患者 | 選擇初診或已確認的回診、選項目、選時段、填基本資料、提出取消、匯出行事曆 | 直接取消（須櫃台確認）、查看他人資料、任何治理功能 |

目前的角色選單只用於 UX 與最小權限驗證，**不是 Authentication**。正式版必須由後端驗證身分與角色，不能只依賴前端隱藏控制項。

## 工作臺功能契約

1. 每週排班可一次選取多個星期，並為每批星期加入相同的起訖時間。
2. 同一天可重複加入多段互不重疊時段；重疊、結束早於開始與未選星期必須拒絕。
3. 管理者可逐筆刪除每週時段與日期例外；`closed` 休診優先於 `extra_open` 加開。
4. 固定不開放時間可自訂；初診限整點／30 分，回診限 15 分／45 分，格式不符須拒絕。
5. 預約清單依看診時間排序（越近的越前面），並可依狀態、掛號別與患者篩選。
6. 櫃台處置集中為單一選單：回診確認、改期、取消、未到、到診；不合法的動作依狀態停用。
7. 回診只能呈現授權人員的明確決定；系統與 AI 不得自行做臨床判斷。回診項目可複選，並可記錄診斷書份數。
8. 個管工作量只顯示個管 ID、月份、不重複患者數與規則版本，不計算或顯示薪資。
9. 帳號管理只建立標籤與角色；至少保留一個啟用中的管理者。
10. 患者公告只在 `published` 時顯示；維護模式啟用後，患者預約流程必須完全隱藏。
11. 發布紀錄只代表目前瀏覽器中的操作紀錄，不會觸發 Firebase 或正式環境部署。

## 患者端流程

患者頁使用四個可返回修改的步驟：

1. 選擇「初診」或「回診」，再選看診項目（止鼾／醫美）。回診尚未經醫師確認時不可進入選時段。
2. 時段依日期分組，以 `Asia/Taipei` 顯示**單一時間點**（24 小時制）。掛號本來就只需要起始時間，不顯示區間。
3. 填寫姓名、電話、生日、身分證與健保卡，並勾選資料保存告知後才可送出。
4. 顯示預約編號與狀態，並提供 `.ics` 下載與 Google 日曆連結。若取消同一筆預約，完成卡與下方預約卡必須同步改為「取消待診所確認」。

行事曆匯出的內容只包含診所名稱、掛號別、時間與地址，**不含身分證、看診項目或備註**——許多人的行事曆與家人共用，因此適用與日曆投影相同的最小化原則。

頁首提供主導覽、環境徽章與患者公告；頁尾說明資料保存範圍。桌面、平板與 375px 手機寬度不得水平溢出，互動控制需保留清楚的鍵盤焦點樣式。

## UI/UX 基線（2026-07-21 依外部準則檢核後訂定）

依據時段選擇器與無障礙表單的公開設計準則，以下為兩端共用、且不得回退的規則：

| 規則 | 為什麼 | 落點 |
| --- | --- | --- |
| 時段依日期分組，日期只在群組標題出現一次 | 平鋪清單會讓每格重複日期，無法快速掃視「這天有哪些時間」 | `ui-format.js` 的 `groupSlotsByDate` |
| 時段只顯示單一時間點，24 小時制 | 避免 AM/PM 誤讀；掛號本來就只需要起始時間 | `admin-view.js`、`patient-app.js` |
| 明確標示時區為 Asia/Taipei（台北時間） | 沒有時區脈絡的時間在跨裝置情境會出錯 | 兩端的時段說明文字 |
| 選取狀態不單靠顏色 | 色覺障礙者無法辨識 | 邊框粗細 + 勾號 + `aria-pressed` |
| 觸控目標至少 44px | 行動裝置誤觸 | `.slot-chip`、`.text-button` |
| **送出按鈕不得因驗證未過而停用** | 停用的按鈕不會說明「為什麼不能按」，使用者只能猜 | 按下後逐欄提示並聚焦第一個問題欄位 |
| 錯誤在離開欄位後才提示，送出時全部攤開 | 邊打邊報錯很煩躁；送出時則要一次講完 | `patient-app.js` 的 `touched` 集合 |
| 錯誤訊息以 `aria-describedby` 綁定欄位，並帶 `role="alert"` 與 `aria-invalid` | 螢幕報讀者需要知道是哪一欄、錯在哪 | `patient.html` |
| 必填以文字說明加符號標示，不只用顏色 | 同上 | `.required-mark` 與表單說明 |
| 錯誤訊息要說「怎麼填才對」而非只說「格式錯誤」 | 可行動的訊息才有用 | `patient-registry.js` 的 `fieldErrors` |
| **回饋出現在操作點**：每個表單旁有就地 `form-status`，成功與失敗原因顯示在剛按下的按鈕旁；全域狀態列為 sticky，任何捲動位置皆可見 | 長頁面上只寫頁首等於沒有回饋，體感是「按了沒反應」（2026-07-22 實測 838px 外） | `message(text, tone, anchorId)`（兩端）、`.status-banner`／`.status-message` sticky |
| 預約失敗必須寫出原因（「未建立預約：…」），成功寫出編號與時間 | 使用者要能不捲動就確認結果與補救方向 | `admin-bootstrap.js`、`patient-app.js` 的 booking handlers |
| 每個必勾項目未勾時要有文字錯誤，不得只移動焦點 | 沒有文字的拒絕看起來像沒反應（WCAG 3.3.1） | `synthetic-confirmation-error` |
| 步驟切換把焦點移到新步驟標題，指示器帶 `aria-current="step"` | 鍵盤與報讀使用者不會停留在原地迷失 | `patient-app.js` 的 `showStep` |
| 患者資料步驟包在 `<form novalidate>` 內，Enter 可送出並走同一套驗證 | 鍵盤慣例；novalidate 保留「一次攤開全部錯誤」模式 | `patient.html` 的 `patient-booking-form` |
| 狀態不允許的操作不渲染或停用（含改期表單），與 `actionEnabled` 同一閘門 | 可按但必被拒絕的按鈕等於「按了沒反應」 | `admin-view.js` 的 `renderAppointments` |
| 建立類表單成功後清空輸入；同名帳號在狀態轉換層拒絕 | 防止殘留值連按兩次建立重複資料 | `workspace-domain.js` 的 `createAccount` |
| sticky 導覽列與狀態列必須不透明 | 半透明會與底下內容疊字（2026-07-22 截圖實證） | `.workspace-nav`、`.status-banner` 用 `--surface` |
| 確認一律走自製 `<dialog>` 彈窗，禁止 `window.confirm` | 原生 confirm 無法設樣式與主題；`showModal` 內建焦點陷阱與 Esc，取消鈕優先聚焦 | `modules/confirm-dialog.js`；`check:ui` 強制 |
| 色彩一律用 design token，不得硬編碼 | 主題系統靠 token 覆蓋；硬編碼會在護眼／深色主題漏網 | `styles.css` 的 `:root` 與 `[data-theme]` 區塊 |
| 主題四段：自動／淺色／護眼／深色；深色對比 ≥ WCAG AA | 尊重系統偏好與護眼需求；實測全配對 ≥ 6.19:1 | `theme.js`（head 同步載入防閃爍）＋ `#theme-picker` |
| 患者端第 2 步顯示目前選擇並可返回；第 3 步可直達第 1 步重選 | 選錯類型的人要能發現並輕鬆重來（NN/g #3） | `#booking-context` 與雙返回鈕 |
| 二元選擇按鈕（類型／項目）帶 `aria-pressed` | 選取狀態不能只靠顏色 | `renderBookingTypeButtons`、`renderServices` |

驗證方式：`corepack pnpm check:ui` 檢查結構與安全界線；版面與焦點行為需以
瀏覽器在桌面與 375px 寬度各確認一次，且不得出現水平溢出。

## 安全與可維護性規則

- 患者資料欄位採允許清單（見上方「資料範圍」），身分證一律遮罩顯示。
- 自訂公告、維護說明、帳號標籤與發布摘要不得輸入患者、員工或憑證資料。
- 所有動態內容都必須經過 `escapeHtml`。這一點以實際 payload 驗證過，不只靠閱讀程式碼：`<img onerror>`、`<svg onload>` 與 `<script>` 注入姓名、備註與公告後，注入節點數為 0。
- 不載入外部字型、追蹤碼、遠端圖片或第三方 UI 資產；`check:ui` 會掃描客戶端程式碼中的任何 http(s) 端點。
- `index.html`（工作臺）／`patient.html`（患者端）負責語意結構，`styles.css` 與 `workbench.css` 集中設計 token 與元件樣式，`admin-bootstrap.js`／`patient-app.js` 只處理互動與渲染，`store.js` 與 `modules/` 集中狀態轉換。
- 正式 API、行動 App 與 NAS 必須共用 domain API；不得讓任何客戶端直接寫 Firestore。

## 回歸驗證

每次變更至少執行：

```powershell
corepack pnpm verify
```

`verify` 已包含格式（Prettier）與 lint（ESLint），兩者不再由人工維持；CI 於每次 push 與 PR 執行同一組檢查。

實機瀏覽器需覆蓋：管理者／櫃台切換、建立預約、五種櫃台處置、改期、回診確認、排班發布、公告與維護啟閉、患者四步驟預約、行事曆匯出、桌面與 375px 手機版，以及 0 console errors／warnings。

## 最近驗證

2026-07-22（第二輪）於本機實機驗證（詳見[主題、彈窗與動線優化](../reviews/ui-theme-dialog-and-flow-review-2026-07-22.md)）：不透明導覽列、四段主題切換與持久化、深色對比 ≥ 6.19:1、自製彈窗取消／確認／Esc 路徑、患者端脈絡列與雙返回鈕、`aria-pressed`／`aria-current`、主控台 0 errors。

2026-07-22 於本機實機驗證（詳見[回饋可見性檢查](../reviews/ui-feedback-review-and-remediation-2026-07-22.md)）：工作臺與患者端全部建立／失敗路徑的就地回饋、sticky 狀態列、帳號重複防護、完成後改期閘門、患者端焦點與 `aria-current`、Enter 送出、主控台 0 errors／0 warnings。

2026-07-21 於本機與 Hosting preview 實機驗證：管理者／櫃台權限差異、初診與回診分流時段、防重複預約、改期、未到、到診、回診項目與診斷書份數、逐欄表單驗證與焦點管理、`.ics` 內容、桌面與 375px 版面、主控台 0 errors／0 warnings。

同日修正的兩個實機 bug：患者送出後顯示到別人的預約（以 `slotId` 反查時撈到已釋出時段的舊紀錄），以及本機 CSP 缺少 `'self'` 導致工作臺無法載入。

## 模組化工作臺 v2

2026-07-21 起，管理工作臺由 `index.html`（標記）、`admin-bootstrap.js`（事件）、`modules/admin-view.js`（渲染）與 `store.js`（狀態）組成。排班、權限、預約、逐筆回診、個管統計、帳號與維護排程各自位於獨立模組。

同日的兩次清理：舊 `app.js`、`patient.js`、`staging-store.js` 已刪除，歷史基線改由 Git 保存；`admin-shell.html` 已併入 `index.html`，取消執行期 `fetch` 後抽換 `document.body` 的做法——那會多一次往返、造成畫面跳動，也是先前 CSP 事故的成因。檔名的 `-v2` 後綴一併移除（`staging-store-v2.js` → `store.js`、`patient-app-v2.js` → `patient-app.js`、`admin-v2.css` → `workbench.css`），因為 v1 已不存在。

新版必須保持：草稿排班不影響患者、發布前檢查既有預約、病患取消與櫃台確認分離、回診決定綁定單筆到診、個管統計由指派及完成到診推導，以及管理者權限在狀態轉換層強制執行。

完整模組導航見 [`../architecture/synthetic-web-modular-architecture.md`](../architecture/synthetic-web-modular-architecture.md)，管理者問題與修正證據見 [`../reviews/manager-workflow-analysis-and-remediation-2026-07-21.md`](../reviews/manager-workflow-analysis-and-remediation-2026-07-21.md)。
