# C3 讀回：七天員工 session 到期（11/23）

狀態：**PASS（到期設定與自然到期成立）；「第 7 天仍可用」未實測**。只讀 `beauessence-clinic-stg-c1a01`（C1 隔離預覽）的 Firestore，沒有寫入、沒有登出或撤銷任何 session，沒有開窗。

- 依據：[11/16 C1 窗口 C3 章節](2026-11-16-c1-window-rc06-c3-c4.md)（session 11/16 建立、11/23 到期，讀回排在 11/23～11/25）
- 讀取時間：`2026-11-23T08:31:52Z`（到期後約 8 分鐘）
- 身分：負責人 gcloud ADC（唯讀讀取）

## 1. 讀法

用一支一次性的唯讀腳本讀 `calendar_pilot_sessions` 全部 42 筆，只輸出 `actorRole`、`createdAt`、`expiresAt`、`revokedAt`、`lastSeenAt`；不輸出 uid、email、token 或文件 ID。腳本與輸出存在負責人私有資料夾，不入版控。沒有執行任何寫入或撤銷腳本。

## 2. 結果

到期時間為 `2026-11-23T08:23:46Z` 的 manager session 共 2 筆：

| # | createdAt (UTC) | expiresAt (UTC) | revokedAt | lastSeenAt (UTC) |
| --- | --- | --- | --- | --- |
| 1 | 2026-11-16 08:23:47 | 2026-11-23 08:23:46 | null | 2026-11-16 10:37:18 |
| 2 | 2026-11-16 10:37:19 | 2026-11-23 08:23:46 | null | 2026-11-16 10:50:53 |

- 兩筆都是 7 天 session（11/07 的 session 是 12 小時），與 11/16 部署的 C3 設定一致。
- `revokedAt` 都是 null，讀取時已過 `expiresAt`：屬於自然到期，不是被撤銷。
- 第 2 筆建立時沿用第 1 筆的 `expiresAt`，沒有重新起算 7 天（絕對期限沒有被延長）。

## 3. 限制

- `lastSeenAt` 停在 11/16，這 7 天內沒有人用這兩個 session 打 API；所以「第 6～7 天仍可正常使用」與「到期後 API 拒絕」都**沒有實測**，本報告只證明資料層的到期設定與未被撤銷。
- 「自然到期」的判斷只依 `revokedAt` 為 null，沒有查伺服器日誌。
- 到期後拒絕由單元測試涵蓋（`apps/api/src/auth/calendar-pilot-session.test.ts`「enforces absolute, disabled and revocation boundaries」）；若 RC 需要實機證據，排進下一個開窗：用新登入的 session 在到期前後各打一次受保護路由。

## 4. 留下的事

- 不需清除資料；兩筆過期 session 留在集合中（Terraform 沒有對 `calendar_pilot_sessions` 設 TTL），不影響登入判斷。
