# Runbook：接上真實 Google Calendar（測試整合）

**狀態：** 用戶端已完成，尚未實際連線。依 2026-07-23 專案負責人的測試授權
（見[決策登錄](../product/phase-1-decision-register.md)）。D-009 正式核准仍為
pending，正式上線不適用本文件。

## 誰做什麼

| 步驟 | 由誰做 | 為什麼 |
| --- | --- | --- |
| 建 Google Cloud 專案、啟用 Calendar API、建服務帳號、產金鑰 | **專案負責人** | 涉及建立帳號與憑證，助理不做也不能做 |
| 建一個**專用測試日曆**，分享給服務帳號（可編輯） | **專案負責人** | 事件寫在這裡，不得用醫師私人或正式日曆 |
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
因此沒設憑證的環境不會意外對外呼叫。

## 驗收

在測試日曆上，用一筆合成預約走一輪：

1. 建立 → 日曆出現一個事件（一小時、綠色、標題只有「診所名 掛號別」）。
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
