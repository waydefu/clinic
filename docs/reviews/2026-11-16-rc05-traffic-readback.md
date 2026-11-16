# 2026-11-16 RC-05 Cloud Run 流量讀回

狀態：**整包完成（唯讀）**。2026-11-16 負責人同意後，Claude 以負責人帳號對 C1 專案 `beauessence-clinic-stg-c1a01`（`asia-east1`）做唯讀讀回。沒有任何寫入，沒有 `terraform apply`，沒有使用真實資料。

## 結果

| 服務 | 100% 流量 | 是否跟隨最新 | 最新就緒 revision | 狀態 |
| --- | --- | --- | --- | --- |
| `internal-test-api` | `internal-test-api-00035-sqd` | 是 | `00035-sqd`（2026-11-07 建立） | Ready |
| `internal-test-outbox` | `internal-test-outbox-00019-fzg` | 是 | `00019-fzg` | Ready |
| `internal-test-calendar-sync` | `internal-test-calendar-sync-00008-62z` | 是 | `00008-62z` | Ready |

三個服務都是 `latestRevision: true`、`percent: 100`，沒有固定在舊 revision，因此不需要切回，也沒有要負責人逐服務核准的項目。

映像檔 digest（讀回當下）：

- api：`sha256:c701e9d4e492e0f3ba6affdebefa65f038af1805763ba017a5a0319688ed1098`
- outbox、calendar-sync（同一個 worker 映像）：`sha256:c334aa778d7e4ec9733756331c8c7d9a76f56916b78d2dba50d752ca4280fa8a`

C1 api 實際跑的是 2026-11-07 部署的版本。其後合併的程式（含七日登入）尚未部署，等 C3 部署（11/18）。

## 細部包所說「讀到 `00001-2vv`」的原因

`internal-test-api-00001-2vv` 是 Firebase Hosting pinTag 留下的 0% 標記（tag `fh-682add043d339a6a`），不承載流量。流量由 `latestRevision: true` 那一筆承載。這與 `ignore_changes = [traffic]` 的裁定一致：移除它會讓 Terraform 刪掉這些 0% 標記，Hosting 轉送會斷。

## 殘留標記（記錄，不處理）

- api 有 22 個 0% 標記，outbox、calendar-sync 各 3 個。
- api 的部分標記指向 `00036` 到 `00050` 的 revision，這些 revision 目前不存在（最新 revision 是 `00035-sqd`）。對流量沒有影響。是否清理，之後另行決定。
