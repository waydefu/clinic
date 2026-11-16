# 2026-11-07 C1 三次雲端窗口（補登）

狀態：**補登紀錄**。2026-11-07 在 C1 專案 `beauessence-clinic-stg-c1a01` 做了三次窗口，當時報告只留在負責人本機的私有資料夾，沒有進 repo。2026-11-16 讀回時找不到紀錄，誤判雲端狀態不明，因此補登。本文件不含私有設定值、密鑰內容、email 或 token；原始報告與私有 tfvars 仍留在負責人本機（路徑不入庫）。

Terraform 狀態檔的時間與此相符：`c5-firestore` 2026-11-06T18:53Z（第一次窗口的 C5 TTL apply），`c1-internal-test-run` 2026-11-07T13:42Z（第三次窗口關閉）。

## 第一次（台北 02:00–04:00）：部署成功，預約 API 全部 503

| 步驟 | 結果 |
| --- | --- |
| Cloud Build | 1 次，5m37s |
| C5 Firestore TTL | 1 add（`bd_export_chunks.purgeAt`） |
| C1 Stage 1 | 0 add / 4 change / 0 destroy |
| C1 Stage 2a | 0 add / 2 change |
| Hosting | 固定網址 `beauessence-clinic-stg-c1a01.web.app` 部署 API 版 |
| 合成預約 | 全部 503，依規定停止，未建立任何預約 |
| 關閉 | 0 add / 2 change / 0 destroy；Hosting 換回靜態版 |

根因：`apps/api/src/main.ts` 沒有接上讀取 Firestore 維護開關的實作，維護閘門預設拒絕。之後由 #447 修正。

偏離：用了 `-target` 建維護密鑰容器與 IAM（部署文件禁止）；加過 0% 流量 tag `c1-1107`，關閉時移除。

## 第二次（台北 11:55–12:20）：公開預約 API 跑通

- Cloud Build 1 次（3m46s）；Stage 1 0/4/0、Stage 2a 0/2/0；維護文件 `platform_controls/maintenance` 設為開放並帶到期時間。
- 第二層根因：Terraform `ignore_changes = [traffic]` 讓流量停在 9/27 的 `00050-gis`。負責人手動 `update-traffic --to-latest` 解決。
- 合成測試約 32 次請求，0 個 5xx：`GET /v1/slots` 200；`POST /v1/bookings` 建立 1 筆合成預約 `b6f3056a…a076`（11/12 時段）；冪等成立；非法內容 400；匿名讀取、取消、改期 401／403。
- 關閉：維護文件改回維護中（API 立即 503）、Stage 1 關閉、Hosting 回靜態版。關閉後流量留在新版，沒有切回舊映像。

## 第三次：員工端登入成功，改期 409

- 映像升到 `6d3fdc52`（含 #447、#448、#449、#450）。api `sha256:c701e9d4…`、worker `sha256:c334aa77…`，與 2026-11-16 RC-05 讀回一致。
- OAuth 用戶端 `clinic-c1-internal-preproduction-staff` 的 redirect URI 由負責人新增（安全設定，Claude 未改）。
- 員工登入（Google 加 TOTP）成功。改期回 409 CONFLICT，原因未查出。取消、到診、CSV、封存、報表、Business Delivery Stage 2b 未測。
- 關閉：維護文件 `underMaintenance=true`；Terraform 0 add / 2 change / 0 destroy，閘門 `false`、到期 `2026-10-02T12:00:00Z`；兩個排程 PAUSED；Hosting 回靜態版。
- 事故：一次中斷的 plan 留下 Terraform 狀態鎖，由負責人解鎖。GCS 後端的鎖 ID 是物件世代號（數字），不是鎖內容裡的 UUID。
- 殘留：合成預約 `b6f3056a…a076` 未取消，留待 RC-06。

## 窗口實際程序（給下次用）

1. 以當下 main 為凍結版本，main CI 綠燈。
2. Cloud Build 1 次，建 api 與 worker 映像，digest 填入私有 tfvars。
3. C1 Stage 1 plan → apply（換映像、閘門關、排程暫停）；Stage 2a plan → apply（掛密鑰版本、開閘門與到期）。plan 只要出現刪除、重建或範圍外改動就停。
4. 打開 Firestore `platform_controls/maintenance`（帶到期時間）。不開的話 API 除 health 外一律 503。
5. 確認 API 流量 100% 在新 revision。
6. Hosting 固定網址用 `firebase.isolated-api-preview.json` 部署 API 版（不用預覽頻道）。**之後每次 API apply（例如 Stage 2b）都要重新部署 Hosting**：rewrite 的 `pinTag` 會固定在部署當下的 revision（2026-11-16 實際踩到，見[當天報告](2026-11-16-c1-window-rc06-c3-c4.md)）。
7. 合成測試；要測 Business Delivery 時，Stage 2b plan → apply（observed_since 由負責人確認），再做第 6 步。
8. 關閉：維護文件改回維護中、Stage 1 關閉 plan → apply、Hosting 用 `firebase.isolated-preview.json` 換回靜態版、讀回。
9. **當天**把去除私有值的報告寫進 `docs/reviews/`，並在 README §7 Review record 加一列。
