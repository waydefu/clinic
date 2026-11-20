# 2026-11-16 RC-07 日曆續期讀回

狀態：**部分完成：C1 日曆設定已續期；50 次實測尚未開始**。2026-11-16 負責人同意後執行。不含 token，不含真實資料。

## 已做

- 對象：C1 專案 `beauessence-clinic-stg-c1a01` 的 `calendar_pilot_configuration/active`（合成資料，來源 `c1_synthetic_calendar`）。
- 續期前讀回：`expiresAt` 為 `2026-09-30T10:00:00Z`（已過期），`version` 1，無 worker lease，`synthetic: true`。
- 執行：`scripts/c1-calendar-sync-bootstrap.mjs --renew-expired`，來源 SHA `e725cad925b6e87494e1de87e7d2733b42a181de`，新到期 `2026-12-16T04:51:37.000Z`（距當時不到 31 天）。
- 續期後讀回：`expiresAt` `2026-12-16T04:51:37.000Z`，`version` 2，健康狀態 `healthy`，無 worker lease。該腳本同一個交易內另寫一筆 `c1_calendar_sync_renewed` 稽核紀錄。

## CAL-PILOT Hosting 預覽頻道：不重建

日曆試行專案 `beauessence-clinic-staging` 的 `cal-pilot` 預覽頻道已於 2026-10-01 到期並被刪除（讀回當下只剩 `live` 與 `synthetic-review`）。`cal-pilot-api`、`cal-pilot-worker` 兩個 Cloud Run 服務仍在。

RC-07 細部包要求的是專用測試日曆續期與 50 次實測，不需要這個預覽頻道，因此 2026-11-16 負責人決定不重建。`scripts/cal-pilot-renew-hosting.ps1` 對不存在的頻道無法續期，也沒有執行。

## 尚未做

- 12 月中需再續期一次，才能到 12/31（每次續期上限 31 天）。
- 50 次正常收斂實測：另行授權，並需負責人登入取得 session／CSRF。
- 故障情境另列，未授權前不製造。
