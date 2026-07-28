# Runbook：接上真實 Google Calendar（測試整合）

**狀態：** 用戶端已完成，尚未實際連線。依 2026-07-23 專案負責人的測試授權
（見[決策登錄](../product/phase-1-decision-register.md)）。D-009 正式核准仍為
pending，正式上線不適用本文件。

## 要「服務帳號」，不是「OAuth 用戶端」

Google Cloud 有兩種容易混淆的憑證，**這裡要的是服務帳號**：

| | 服務帳號（要這個） | OAuth 用戶端（不是這個） |
| --- | --- | --- |
| 用途 | 背景服務自己的身分，直接簽章換 token | 代表某個使用者，需開瀏覽器按「同意」 |
| JSON 欄位 | `client_email`、`private_key` | `client_id`、`client_secret` |
| 適合 | 沒有人在旁邊的 worker | 有使用者互動的網頁登入 |

worker 沒有人可以按同意畫面，因此用服務帳號：把測試日曆**分享給服務帳號的
email**（可編輯權限）即可，不需要任何同意流程。若手邊已建了 OAuth 用戶端，
那份用不到，請直接刪除或停用（它的 `client_secret` 是機密）。

## 誰做什麼

| 步驟 | 由誰做 | 為什麼 |
| --- | --- | --- |
| 建 Google Cloud 專案、啟用 Calendar API | **專案負責人** | 涉及建立帳號 |
| 建**服務帳號**（IAM 與管理 → 服務帳號 → 建立），並「新增金鑰 → JSON」下載 | **專案負責人** | 涉及憑證，助理不做也不能做 |
| 建一個**專用測試日曆**，在日曆設定裡把它分享給服務帳號 email（可編輯） | **專案負責人** | 事件寫在這裡，不得用醫師私人或正式日曆 |
| 設定環境變數把憑證注入 worker | **專案負責人** | 金鑰只走 env，絕不進 repo |
| 用戶端程式（insert／patch／delete、409／410、欄位最小化） | 已完成 | `apps/worker/src/google-calendar.ts` |

## 設定

worker 執行環境需要兩個變數（**不要**寫進 `.env` 或提交任何金鑰檔）：

```bash
# 專用測試日曆的 ID（形如 xxxx@group.calendar.google.com）
GOOGLE_CALENDAR_ID=...
# 服務帳號 JSON 的完整內容（一行字串），由密鑰管理注入，不落地
GOOGLE_SERVICE_ACCOUNT_JSON={"client_email":"...","private_key":"..."}
```

`createCalendarPort()` 會在**兩者都齊備**時回傳真實用戶端；否則回退到假日曆，
因此沒設憑證的環境不會意外對外呼叫。用戶端在啟動時就會驗證金鑰型別（必含
`client_email` 與 `private_key`）——若誤放 OAuth 用戶端會直接被拒。

## 本機煙霧測試（負責人執行）

> **狀態（2026-07-23）：** 負責人已備妥專用測試日曆 ID 與服務帳戶金鑰檔（金鑰
> 留在本機、未進版控）。真實連線的煙霧測試**尚未執行**，須由負責人自行在本機
> 跑下列指令——助理不讀金鑰內容，也不代跑會在真實日曆建立／刪除事件的連線。

`apps/worker/src/calendar-smoke.ts` 會對真實日曆做一次 upsert 再 cancel，只建立
並隨即刪除**一筆**合成、無 PII 的事件；未注入憑證時直接中止、不對外呼叫。

PowerShell（把金鑰檔內容讀進 env，不落地、不入庫）：

```powershell
corepack pnpm --filter @beauessence/worker build
$env:GOOGLE_CALENDAR_ID = '<你的測試日曆 ID>'
$env:GOOGLE_SERVICE_ACCOUNT_JSON = Get-Content '<你的服務帳戶金鑰檔路徑>' -Raw
node apps/worker/dist/calendar-smoke.js
```

預期輸出兩個 ✓（建立、刪除）並印出完成訊息。跑完後清掉環境變數：

```powershell
Remove-Item Env:GOOGLE_SERVICE_ACCOUNT_JSON, Env:GOOGLE_CALENDAR_ID
```

> 界線：此測試只碰**測試日曆**與合成事件，**不代表** D-009 核准，也不允許連
> 正式／私人日曆、真實病患資料或線上預覽。

## 驗收

在測試日曆上，用一筆合成預約走一輪：

1. 建立 → 日曆出現一個事件（目前合成 fixture 為一小時、綠色、標題只有
   「診所名 掛號別」）。此一小時不代表正式服務／實際療程時長；正式整合應投影
   系統核准的 operational reservation interval。
2. 改期 → **同一個事件**移到新時間，不新增第二個。
3. 到診 → 事件內容更新，仍是同一個。
4. 取消 → 事件消失。
5. 事件內容檢查：**沒有**姓名、電話、身分證、手術種類或備註。

同步失敗時的重試、退避、死信與人工補回，見
[calendar-sync-failure runbook](calendar-sync-failure.md)。

## 界線

- 只連測試日曆、只用合成資料。真實病患資料需 D-001～D-003 核准。
- 服務帳號金鑰永遠不進 Git、日誌或前端。
- 工作臺（瀏覽器）永遠不直接呼叫 Google——只有 worker 會，且經 outbox
  （ADR-0002、ADR-0003）。
