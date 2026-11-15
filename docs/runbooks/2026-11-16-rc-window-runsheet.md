# 2026-11-16 RC 雲端窗口執行單

狀態：**草稿／執行前清單**。本文件不授權任何雲端操作。每一項動手前，Claude 先列出「要動什麼、怎麼退回、會不會花錢」，負責人對該項明確同意後才執行；同意不延伸到其他項。不得使用真實資料、正式日曆或正式網域。

依據：[RC 交付計畫](../plans/2026-11-08-phase1-rc-delivery-plan.md)第三節窗口表、[細部包](../plans/2026-11-08-phase1-rc-packets.md) RC-05／RC-06／RC-07／SOL-INGRESS、[C1 批次部署包](../plans/2026-10-01-c1-batch-deployment-packet.md)。

## 0. 前置（負責人本人）

- 本機以負責人帳號登入：`gcloud auth application-default login`（或已核准的 impersonation）。不下載 JSON key，不用 `firebase login:ci`（[C1 執行包](c1-local-execution-packet.md)）。Claude 不代輸入密碼或驗證碼。
- 兩個專案不可混用：C1 = `beauessence-clinic-stg-c1a01`；CAL-PILOT = `beauessence-clinic-staging`。
- Claude 第一步只做唯讀確認：目前登入帳號與預設專案。

## 執行順序

| 順序 | 項目 | 依賴 | 預期寫入 | 預期費用 |
| --- | --- | --- | --- | --- |
| 1 | RC-05 流量讀回 | 無 | 無；若有固定 revision 才需逐服務核准切回最新 | 無新增 |
| 2 | RC-07 日曆續期 | CAL-PILOT 12/31 常數 PR 已合併 | Firestore 設定與稽核紀錄；Hosting 預覽頻道到期時間 | 預期極少，未讀帳單 |
| 3 | SOL-INGRESS | 無 | 明天只讀；實發合成請求另核 | 無新增 |
| 4 | RC-06 員工端第二窗口 | RC-05 | 合成預約資料 | 預期極少，未讀帳單 |

## 1. RC-05：流量跟隨最新 revision

**工程裁定（Claude，2026-11-15）**：保留 `infra/terraform/c1-internal-test-run/main.tf` 三個服務的 `ignore_changes = [traffic]`。原因：Firebase Hosting pinTag 會加一個 0% 的 tagged revision，移除後 Terraform 會把它刪掉，Hosting 轉送會斷。RC-05 改以「apply 前後讀回」的程序把關（C1 批次部署包 :135–146），不改 Terraform。

1. 唯讀：讀三個服務（`internal-test-api`、`internal-test-outbox`、`internal-test-calendar-sync`）的 `spec.traffic` 與 `status.latestReadyRevisionName`，記下每個服務目前的 revision 名稱與 image digest。
2. 判定：`percent: 100` 那筆都是 `latestRevision: true` → 記錄即可，不需變更。任一服務固定在某個 revision → 列出，負責人逐服務核准後才切回最新。
3. 同時釐清細部包所說「關閉後讀到 `00001-2vv`」的原因，寫進讀回紀錄。
4. 回滾：切回步驟 1 記下的 revision。
5. 本次不 `terraform apply`。

## 2. RC-07：日曆續期與真實測試日曆實測

前提：CAL-PILOT 到期常數改為 `2026-12-31T04:51:37Z` 的 PR 已合併（APPROVAL-RC-2026-11-14）。

1. **C1 日曆同步續期**：`scripts/c1-calendar-sync-bootstrap.mjs --renew-expired`。它會改 Firestore `calendar_pilot_configuration/active` 的 `expiresAt`、版本加 1、寫稽核紀錄，**沒有 dry-run**。新到期須在 31 天內，建議 `2026-12-16T04:51:37Z`，12 月中再續到 12/31。所需環境變數名稱見 [故障觀察 runbook](calendar-pilot-synthetic-fault-observations.md):16–19。
2. **CAL-PILOT 預覽頻道**：`scripts/cal-pilot-renew-hosting.ps1`，先不加 `-ConfirmApply` 只讀確認，負責人同意後再加。受 30 天上限限制，實際到期約 12/16。
3. **50 次正常收斂**：`scripts/calendar-pilot-fault-trials.mjs` 預設 dry-run；實跑需 `--execute-synthetic-trials`，另行授權，並需負責人登入取得 session／CSRF。至少 50 次、唯一流水號、逐 linkId 全分頁核對（runbook :24、:30），再用 `scripts/calendar-pilot-observation-check.mjs` 離線檢查。
4. 證據：`docs/reviews/2026-11-16-calendar-gate2-readback.md`，不含 token。
5. 回滾：到期時間可再改回；測試日曆上的合成事件手動清理。

## 3. SOL-INGRESS 外部證據

依[外部驗收 runsheet](../plans/2026-10-25-external-acceptance-runsheet.md) §3。實發合成請求前，負責人須另核一張精確授權：兩個目標（核准的 Hosting host 與 direct Run）、UTC 時窗、合成請求上限、允許寫入的範圍。

- 明天只做：唯讀讀回目前設定，並把上述授權表填好交負責人。
- 已知限制：repo 沒有可對外讀回身分桶或 handler／writer 計數的工具（runsheet §3.1），「同桶比較」與「計數增量」可能只能記 `NOT_PROVEN`。

## 4. RC-06：C1 員工端第二窗口

依賴 RC-05 讀回完成。測的是**目前部署在 C1 的版本**，先記下 image digest。

1. 以 `GET /v1/slots?kind=initial` 選合格初診時段重試改期；仍回 409，就先加只寫日誌的領域錯誤碼再測（另一個 PR）。
2. 取消殘留合成預約 `b6f3056a…a076`。
3. 到診、CSV、封存、報表；Business Delivery Stage 2b。
4. `observed_since`：Stage 2a apply 後負責人量到的第一筆完整分類 capture 的 UTC 時間，不得預填或用部署時間（C1 批次部署包 :92、:99）。
5. **7 日登入測試不在 11/16 開始。** 七天 session（2026-11-09 決定）只在原始碼，C1 目前跑的版本還沒有它；要等 C3 部署（11/18）後才開始，11/25 讀結果，仍在 11/26 凍結前。做法：負責人以合成員工帳號登入一次並記下 UTC 時間；第 6 天仍應維持登入；滿 7 天後應被要求重新登入。
6. 證據：`docs/reviews/2026-11-16-c1-staff-second-window.md`。

## 不做

不 `terraform apply`；不碰正式日曆、真實資料、正式網域；不改 IAM 或金鑰。
