# 死碼清理、安全複核與 UI/UX 優化 — 2026-07-21

承接同日的預約流程改版，對工作區做一次清理、安全複核與介面優化。
修正前後 `corepack pnpm verify` 皆通過；測試由 61 項增加為 66 項。

## 死碼與工作區清理

以「逐一比對每個 export 是否被其他檔案引用」的方式掃描 `apps/`、`packages/`、
`scripts/` 與 `tests/`。`packages/` 與 `apps/api` 沒有未使用的匯出；瀏覽器模組有
八項，處置如下：

| 項目 | 狀況 | 處置 |
| --- | --- | --- |
| `ui-format.formatDate` | 真的沒有人用 | 刪除 |
| `ui-format.weekdayLabel` | 真的沒有人用（各處直接用 `WEEKDAY_LABELS`） | 刪除 |
| `constants.APPOINTMENT_ACTIONS` | 定義了卻沒使用，處置選單把五個動作硬寫在 HTML 字串裡 | 改由 `admin-view.js` 讀取，成為選單的唯一來源 |
| `patient-registry.findPatientByIdentity` | 僅自身檔案內使用 | 取消匯出 |
| `patient-registry.validatePatientInput` | 僅間接使用 | 保留匯出並補上直接測試（安全相關驗證值得單獨覆蓋） |
| `schedule-engine.blockedTimesOf` | 僅自身檔案內使用 | 取消匯出 |
| `state-schema.defaultSchedule` | 僅自身檔案內使用 | 取消匯出 |
| `workspace-domain.safeText` | 僅自身檔案內使用 | 取消匯出 |

清理後重新掃描為零。`output/` 僅存 gitignore 的 Playwright 產物，無殘留成品。

## 安全複核

**跨站腳本**：以實際 payload 在瀏覽器驗證，而非僅靠閱讀程式碼。將
`<img src=x onerror=…>`、`<svg onload=…>` 與 `<script>` 分別注入患者姓名、
自填備註與患者端公告，重新載入兩個頁面後：

- 注入的 `img`／`svg`／`script` 節點數為 **0**
- payload 以純文字呈現
- 注入的函式未被執行

所有動態內容都經 `escapeHtml`；少數未包裹的插值經複核為識別碼或
`textContent` 指派，不構成注入面。

**身分證字號**：清單一律以 `maskNationalId` 遮罩（`A12****789`），
`check:ui` 會檢查 `admin-view.js` 仍呼叫該函式，避免日後改回完整顯示。
比對身分時大小寫不敏感，已有測試。

**輸入驗證**：姓名 30 字、備註 120 字、診斷書 0–10 份、身分證格式、
生日西元年與不得晚於今日，皆在 domain 層擋下，介面只是提前說明。

## UI/UX 優化

依外部設計準則（見下方來源）逐項檢核後修正：

| 問題 | 修正 |
| --- | --- |
| 時段平鋪 24 筆，每張卡重複顯示日期 | 依日期分組，日期只出現在群組標題，時間以 chip 排列；可見範圍由 24 格擴為 5 天 |
| 送出鈕在驗證未過時停用，使用者不知道為什麼不能按 | 改為維持可按，按下後逐欄提示並把焦點移到第一個問題欄位 |
| 錯誤只在送出後出現在頁面頂端橫幅 | 改為欄位下方逐欄提示，離開欄位（on-blur）才顯示，送出時全部攤開 |
| 必填未標示 | 加上必填符號與文字說明 |
| `autocomplete="off"` 妨礙填寫 | 姓名／電話／生日改用 `name`／`tel`／`bday`；身分證維持 off |
| 選取狀態僅靠顏色 | 加上邊框粗細、勾號與 `aria-pressed` |
| 排班區行內文字按鈕僅 18px 高 | 提高至 44px 觸控目標 |
| 缺少時區脈絡 | 時段說明明示「Asia/Taipei（台北時間）」 |

無障礙：錯誤訊息以 `aria-describedby` 綁定欄位，帶 `role="alert"` 與
`aria-invalid`；身分證欄另有格式範例提示。

實機驗證（桌面與 375px）：時段分組正確、chip 觸控目標 109×45–49px、
無水平溢出、空白送出列出四項欄位錯誤並聚焦第一欄、未勾選確認項目會提示並
聚焦、填妥後成功建立預約。

固定準則已寫入
[`../design/test-only-operations-ui.md`](../design/test-only-operations-ui.md)
的「UI/UX 基線」一節，避免日後回退。

## 來源

- [Time Picker UX: Best Practices, Patterns & Trends](https://www.eleken.co/blog-posts/time-picker-ux)
- [Ultimate Guide to Accessible Form Design](https://www.uxpin.com/studio/blog/ultimate-guide-to-accessible-form-design/)
- [Accessible Form Validation: Best Practices](https://www.uxpin.com/studio/blog/accessible-form-validation-best-practices/)
- [7 Essential Best Practices for Form Design](https://add-to-calendar-pro.com/articles/best-practices-for-form-design)

## 尚未變更

D-001～D-011 仍為 pending。本次未觸及正式寫入路徑、Authentication、
Google Calendar、薪資規則或 NAS 整合。

## 線上預覽部署紀錄（2026-07-21）

依 [synthetic-online-preview runbook](../runbooks/synthetic-online-preview.md)
部署至 `beauessence-clinic-staging` 的到期預覽頻道。

- 指令：`firebase hosting:channel:deploy synthetic-review --expires 7d --project beauessence-clinic-staging`
- 頻道網址：`https://beauessence-clinic-staging--synthetic-review-gpt86j36.web.app`
- 到期：2026-07-28
- **live 頻道未受影響**：部署後 `hosting:channel:list` 顯示 live 最後發布時間
  仍為當日稍早的 11:05（建站時的空發布），實際存取回應 `Site Not Found`。

驗收結果：

| 項目 | 結果 |
| --- | --- |
| 環境標示 | `ONLINE PREVIEW` |
| 患者端輸入欄位 | 僅允許清單內的 6 項，無其他資料欄位 |
| 資料去向告知 | 「公開網址持有人可存取 · 資料只保存在本機瀏覽器」 |
| 安全標頭 | CSP `default-src 'self'`、`X-Robots-Tag: noindex`、`Referrer-Policy: no-referrer`、`Cache-Control: no-store`、`X-Frame-Options: DENY` |
| 外部請求 | 無。頁面資源來源只有預覽網域本身 |
| 管理工作臺 | 正常掛載，時段分組與門診時間正確 |

後續：整合規劃見
[Calendar 與資料庫整合測試計畫](../architecture/calendar-and-database-integration-plan.md)。
