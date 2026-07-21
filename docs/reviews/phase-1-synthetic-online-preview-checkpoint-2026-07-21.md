# Phase 1 合成資料線上預覽檢查點 — 2026-07-21

## 結果

專案負責人明確要求建立非正式實機線上測試版。本次只建立獨立 Firebase 專案
`beauessence-clinic-staging` 的 Hosting preview channel，未部署 live channel，亦未
啟用 Firestore、Realtime Database、Functions、Cloud Run、Storage、Authentication、
Google Calendar、LINE、Meta、NAS 或任何真實資料連線。

預覽網址：
<https://beauessence-clinic-staging--synthetic-review-gpt86j36.web.app>

- 頻道：`synthetic-review`
- 到期時間：2026-07-28 13:30（Asia/Taipei）
- 狀態資料：固定合成識別碼＋目前瀏覽器 `localStorage`
- 存取性：知道網址的人皆可存取；不是身分驗證或私人網址
- 正式決策：D-001～D-011 全部維持 `pending`

## 實作邊界

| 項目 | 線上預覽可做 | 明確未啟用 |
| --- | --- | --- |
| 排班 | 在單一瀏覽器調整合成星期、時間、加開與休診 | 正式門診表、多人同步、資料庫保存 |
| 回診 | 合成授權角色明確設定需要／不需要回診及目標日期 | 系統或 AI 臨床判斷、病歷或醫囑 |
| 患者頁 | 固定 `patient_test_001` 測試回診預約 | 真實患者登入、姓名、電話、Email、病情 |
| 預約流程 | 瀏覽器內建立、取消、完成、重設與合成稽核/outbox | 後端交易、Calendar 投影、通知或持久化 |
| 個管統計 | 合成完成到診產生非金額工作量 | 真實指派、薪資規則、月結或匯出 |

不同裝置與瀏覽器不共享狀態。清除網站資料或按下重設只會清除目前瀏覽器的合成
資料；沒有資料可匯入正式環境。

## 驗證證據

- `corepack pnpm verify`：73 個必要檔案、所有 workspace build 與 33 個單元測試通過。
- `corepack pnpm check:ui`：線上／本機環境標示、允許輸入白名單、無自由文字、
  landmark、live region、鍵盤焦點與端點防呆通過。
- Firebase Hosting channel list 確認只有 `synthetic-review` 有 release；live channel
  沒有 release。
- Hosting 回應包含 `Cache-Control: no-store`、CSP、`Permissions-Policy`、
  `Referrer-Policy: no-referrer`、`X-Content-Type-Options: nosniff`、
  `X-Frame-Options: DENY` 與 `X-Robots-Tag: noindex, nofollow, noarchive`。
- 實機瀏覽器驗證：工作臺記錄「需要回診」及 2030-01-15 合成目標日期後，透過
  頁面連結進入患者頁，正確顯示 Asia/Taipei 09:00／09:30 時段；建立合成預約後
  時段由兩個減為一個。瀏覽器主控台為 0 errors／0 warnings。

## 已發現並排除的問題

1. 初版缺少工作臺到患者頁的明顯入口；已新增「開啟患者測試頁」。
2. 初版患者頁缺少 favicon 而產生 404；已補上既有 `favicon.svg`。
3. 初版患者頁沿用本機 127.0.0.1 文案；線上時已改為公開預覽警示。
4. 初版患者頁直接切取 UTC 字串，顯示為 01:00；已統一依 `Asia/Taipei` 顯示為 09:00。
5. 企業版流程初測時，取消後下方卡片已顯示「取消處理中」，但完成卡仍顯示「預約成立」；已讓標題、說明、圖示與狀態同步更新。

## 企業工作臺與病患端補強

2026-07-21 已在同一 preview channel 完成下列合成測試能力：

- 管理者／櫃台角色模擬；櫃台只保留日常預約、取消、到診完成與工作量操作。
- 管理者可一次選多個星期加入同一時段、同日加入多段時段、逐筆刪除時段，並管理加開／休診例外。
- 管理者可模擬建立、停用與恢復帳號，並控制患者公告、維護模式及瀏覽器內發布紀錄。
- 病患端改為企業式四步驟流程：預約類型、日期時段、內容確認、完成；回診仍受授權決定狀態限制。
- 維護模式會完整隱藏患者預約流程，只顯示管理者自訂的維護說明與預計恢復時間。
- Playwright 實機驗證管理者／櫃台差異、週三與週四批次加入、週三刪除、維護啟閉、建立與取消預約、390×844 行動版；主控台 0 errors／0 warnings。

以上帳號與角色均非真實 Authentication；公告、維護與發布紀錄也只存在目前瀏覽器，正式後端授權、持久化、多人同步及發布管線仍未啟用。

## 管理工作流與模組化回歸（2026-07-21）

- 管理工作臺依「待辦 → 預約 → 排班 → 回診 → 個管 → 治理 → 稽核」重組，並將管理者與櫃台的 UI 及 command 權限分離。
- 排班草稿與發布版本明確分離；發布前會阻擋影響既有成立／取消待確認預約的變更。
- 個管月度統計以個管師、Asia/Taipei 月份與不重複患者為主鍵，另列完成到診與合成 credit，不能直接作為薪資結算依據。
- 排班、預約、回診、個管、權限與治理設定分為獨立 domain module；線上預覽仍只透過 `staging-store-v2.js` 操作 localStorage，未連接 Firebase Database、Calendar 或 NAS。
- Playwright 實機回歸完成：兩位患者到診與同一個管師統計、回診決定、櫃台隱藏治理功能、加開時段發布至患者端、維護模式與重設回初始狀態。

詳細決策及開發導覽見 [管理工作臺流程分析與修正](manager-workflow-analysis-and-remediation-2026-07-21.md) 與 [合成預約網站模組化架構](../architecture/synthetic-web-modular-architecture.md)。

## 運作與下架

部署、驗收與提前刪除方式見
[`../runbooks/synthetic-online-preview.md`](../runbooks/synthetic-online-preview.md)。預覽到期
或刪除不等同刪除 Firebase 專案；任何續期均須保持相同合成資料限制。不得使用
`firebase deploy` 發布 live channel。
