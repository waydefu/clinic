# 2026-11-16 INGRESS 唯讀讀回與 RC-06 前提檢查

狀態：**INGRESS 唯讀部分完成；RC-06 被擋住，未執行**。2026-11-16 負責人同意後，Claude 以負責人帳號對 C1 專案 `beauessence-clinic-stg-c1a01` 做唯讀讀回。沒有任何寫入，沒有送合成寫入請求，沒有使用真實資料。

## INGRESS：入口設定與呼叫權限（唯讀）

| 服務 | 入口（雲端實際） | Terraform 宣告 | 可呼叫者（`roles/run.invoker`） |
| --- | --- | --- | --- |
| `internal-test-api` | `all` | `INGRESS_TRAFFIC_ALL` | `allUsers` |
| `internal-test-outbox` | `all` | `INGRESS_TRAFFIC_ALL` | 服務帳號 `internal-test-scheduler` |
| `internal-test-calendar-sync` | `all` | `INGRESS_TRAFFIC_ALL` | 服務帳號 `internal-test-scheduler` |

雲端實際值與 `infra/terraform/c1-internal-test-run/main.tf` 一致。依[外部驗收 runsheet](../plans/2026-10-25-external-acceptance-runsheet.md) §3，測試期接受直連 `run.app` 可達，安全控制不依賴入口或 IP，因此「可達」本身不判失敗。

**未證明（`NOT_PROVEN`）：** 同一身分桶在換 IP、偽造 `X-Forwarded-For`、換入口後是否持續計數與鎖定，以及 handler／writer 前後增量。repo 沒有可對外讀取身分桶與 handler／writer 計數的工具（runsheet §3.1），且下一節的前提也不成立。實發合成請求需另核一張精確授權（兩個目標、UTC 時窗、請求上限、允許寫入）。

## RC-06 前提檢查：兩項不成立

1. **預約閘門已過期。** `internal-test-api` 設定 `INTERNAL_TEST_BOOKING_ENABLED=false`、`INTERNAL_TEST_BOOKING_EXPIRES_AT_UTC=2026-10-02T12:00:00Z`；`BUSINESS_DELIVERY_ENABLED=false`。對直連 API 送無資料的 `GET /v1/slots?kind=initial` 回 `503 SERVICE_UNAVAILABLE`，與閘門關閉相符（推斷，未查服務內部日誌）。
2. **Hosting 沒有 `/v1/**` 轉送。** C1 站台只有 `live` 與 `synthetic-review`（2026-12-09 到期）兩個頻道；對兩者的 `/v1/slots?kind=initial` 都回 404 頁面。細部包所說帶轉送的 `internal-preproduction` 預覽頻道已不存在。員工端網頁因此連不到 API。

重新開閘門與部署帶轉送的預覽頻道都是雲端變更（Terraform apply／Hosting 部署），須負責人另行逐項核准，本次未做。

## 其他讀回

- C1 API 部署的是 2026-11-07 的 revision（見 [RC-05 讀回](2026-11-16-rc05-traffic-readback.md)），不含其後合併的程式。
