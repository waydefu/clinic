# CAL-PILOT 30 天雙向同步操作手冊

**適用範圍：** `beauessence-clinic-staging` 的 synthetic-only 測試。
**不適用：** 正式專案、正式日曆、真實姓名、電話、病歷、臨床內容或金流。

## 1. 使用者會看到什麼

- 員工工作臺與患者測試頁讀取同一個 API 可用時段鏡像。
- 初診使用整點／半點，回診使用 15／45 分；週三至週五
  12:00–20:00、週六 10:00–18:00。
- 預約只擋同一線別；`[忙碌]` 事件會擋所有重疊線別。
- Google 新增、修改或刪除不直接改預約；先進入待審佇列，核准時重新檢查
  時段、合成患者重複預約與版本衝突。
- 只有 `manager` 可切換或回滾來源；`manager` 與 `front_desk` 可審核。

## 2. 唯一允許的 Google 標題

| 類型 | 格式 | 例子 |
| --- | --- | --- |
| 預約 | `[預約] 患者代碼｜掛號別｜項目` | `[預約] A17｜初診｜止鼾` |
| 忙碌 | `[忙碌] 原因` | `[忙碌] 會議` |

患者代碼只能是已啟用的 A01～A30；掛號別只能是「初診／回診」；項目只能是
「止鼾／醫美」；忙碌原因只能是「會議／休假／教育訓練／其他」。說明、地點、
與會者與其他自由文字不會匯入。格式錯誤只會產生「需修正」候選。

## 3. 架構與秘密邊界

```text
Hosting /v1/** → Cloud Run API → Firestore（瀏覽器規則全面拒絕）
                                   ↑ outbox / candidate
Cloud Scheduler → private Worker → Google Calendar API
```

Calendar ID、原始 Google event ID、etag、sync token、服務帳號金鑰與 HMAC
金鑰只存在私人 Worker／Secret Manager 邊界，不得回傳瀏覽器、寫入日誌、提交 Git
或進入 Hosting 建置產物。讀取與寫入使用不同服務帳號與不同最小 scope。

## 4. 部署前必要證據

1. 工作樹乾淨，候選 commit 已固定。
2. `pnpm verify`、Firestore Rules、供應鏈／秘密掃描及 Cloud Build
   容器建置通過。
3. API、Worker 映像以 registry `@sha256:` digest 固定。
4. Terraform plan 只含已核准的 staging／`asia-east1` 資源；Firestore `(default)`
   與 Identity Platform 既有資源先 import，禁止 replace。
5. 已記錄舊 API revision、舊 Worker revision 與舊 Hosting version。
6. Firebase CLI 先撤銷舊工作階段再重新登入；不可執行會印出 token 的登入清單。
7. 兩本 CAL-PILOT 日曆已分別授予 reader 唯讀與 writer 編輯權。

部署腳本預設拒絕執行；只有傳入兩個 immutable digest、精確 UTC 到期時間與
`-ConfirmApply` 才會繼續。輸入檔會先驗證：兩把服務帳號必須不同、source map
恰好兩個核准 ID、初始 manager allowlist 恰好一個 Google 帳號。

## 5. 部署順序

1. 套用 reviewed Terraform foundation；Scheduler 必須維持 paused。
2. 以專用 builder 在 Cloud Build 建立兩個映像，取得 Artifact Registry digest，
   再建立 API／Worker 0% tagged revision。
3. 執行 API 與私人 Worker synthetic smoke。
4. 將流量切到精確 revision，更新 Scheduler 私人 URL，但仍保持 paused。
5. seed A01～A30、兩個 opaque source summary 與 30 天到期 kill switch。
6. 先部署 Firebase Auth Google provider、Firestore deny-all rules 與 indexes，再發布
   `cal-pilot` 30 天 Hosting preview。
7. 初始化 Identity Platform，把 preview domain 加入 allowlist，並強制啟用 TOTP。
8. 驗證 Google provider、TOTP 與 Firestore 規則後，才開啟 inbound／outbound；最後
   resume 五分鐘 Scheduler。

## 6. 每日操作與來源切換

- 狀態列須顯示健康度、待審數、衝突數與到期日。
- 來源切換先按「驗證」；完整視窗讀取、格式掃描與 write probe 全通過後才可切換。
- 切換成功後 Worker 先在新來源 upsert 並讀回驗證所有未來的系統事件，才刪除舊
  來源由系統管理的副本；外部事件不動。
- 切換失敗不更動 active source；上一來源保留為一鍵回滾。
- `410 Gone` 會清掉失效 sync token 並重建鏡像；重建只產生候選，不直接改預約。

## 7. 緊急停止與回滾

順序固定：

1. pause `cal-pilot-five-minute-sync`。
2. 把 `inboundEnabled`、`outboundEnabled` 設為 `false`，寫入匿名 audit。
3. API／Worker 流量切回記錄的前一 revision。
4. Hosting `cal-pilot` channel 切回前一 version。

不要刪除合成預約、mirror、候選或匿名 audit。若疑似金鑰外洩，另停用對應
Secret version、撤銷 Google Calendar ACL 並輪替服務帳號金鑰。

## 8. 到期與費用

部署後 30 天，API 與 Worker 都會 fail closed；Scheduler 與 Hosting channel 也須
停止／到期。NT$30 的 50%／80%／100% 通知（約 NT$15／24／30）是告警，不是硬上限。低流量可能接近
免費，但 Cloud Run、Scheduler、Firestore、Secret Manager、Artifact Registry、
日誌或流量都可能產生費用；正式環境不得假設免費。

延長測試、增加帳號、改 Calendar 白名單或接正式資料，全部視為新核准。
