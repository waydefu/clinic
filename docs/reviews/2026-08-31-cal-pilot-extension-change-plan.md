# CAL-PILOT synthetic-only 延期 change plan（2026-08-31）

## 1. 核准結果與停止點

業主核准把既有 application kill switch 從 `2026-09-29T04:51:37Z` 延至
`2026-11-28T04:51:37Z`。這次先建立精確候選、兩個 stacked pull requests 與
完整驗證證據；任何 cloud mutation 仍停在 exact commit 確認點。

Production D-009／D-016、真實資料、正式 Calendar、新帳號、`/clinic`、Payroll、
手術、麻醉、臨床與付款全部不在範圍內。

## 2. PR 與線上邊界

- PR #31／`282d64ef3454dd82c69654b39c56794b6744e962` 保持為已部署基線。
- PR A 只包含延期工具、NT$30 custom-period budget、治理文件與移除「30 天」字樣。
- PR B 從 PR A 堆疊，新增受控候選修正；只在 local／CI 驗證，禁止部署。
- PR A 的 Hosting 發布不部署 PR B，也不部署新的 API／Worker image。

## 3. 預期 cloud diff

| 資源 | 唯一允許差異 | 必須不變 |
| --- | --- | --- |
| Firestore `calendar_pilot_configuration/active` | `expiresAt` 改為 `2026-11-28T04:51:37Z` | source、version、sync token、開關與其他資料 |
| Firestore audit | 新增一筆匿名 expiry extension event | 既有 audit 不更新／不刪除 |
| Billing budget | 靜態 2026-08-30～2026-11-28 custom period；API exclusive `endDate` 為 2026-11-29；NT$30 與 50／80／100% 不變 | 其他資源、IAM、billing account |
| Hosting | 只移除「30 天」字樣；首次產生一個新 static version | `/v1` rewrite、CSP、Auth、功能與資料 |
| Hosting 後續續期 | 只 PATCH channel `expireTime` | release／version／files |

Terraform plan 必須是 `0 added, 1 changed, 0 destroyed`。Cloud Run API／Worker
revision 與 immutable digest、Scheduler `*/5 * * * *`、六個 Secret containers／
versions、兩本 allowlisted sources 與單一 manager allowlist 都必須相同。
Terraform 的 `paused = false` 只把宣告對齊早已啟用的既有 Scheduler；核准 plan
不得包含 Scheduler action。

## 4. Apply gate 與驗證

1. 工作樹乾淨；PR A exact SHA 的全部 CI 通過。
2. `cal-pilot-extend.ps1` 先核對舊 expiry、精確 Cloud Run／Hosting baseline、
   Scheduler、六個 Secret 的 enabled version manifest、精確兩本 enabled source ID
   與 source generation，
   並預設拒絕執行；manifest 只含版本號，不含任何 secret 值。
3. 記錄 Terraform plan、Hosting file manifest 與 recovery list，再取得 exact SHA
   的 `-ConfirmApply` 核准。
4. 先套用 budget 與 application expiry，再只發布 PR A 文案；PR B 永不發布。
5. 從登入頁、API status、Firestore sanitized fields、Scheduler 與 Cloud Run
   describe 收集證據；不得輸出 secret、Calendar ID、event ID、token 或完整 billing ID。

## 5. Hosting 續期

Firebase preview channel 的單次期限不超過 30 天。當剩餘七天內，執行
metadata-only renewal；腳本把下一期限設為
`min(now + 30 days, 2026-11-28T04:51:37Z)`，並證明 release version 前後相同。
續期不是 deployment authority，不得夾帶網站或 Identity 變更。

## 6. 回復／安全停止

- 原期限仍在未來時，expiry transaction 可用同樣 expected-value guard 恢復原值；
  跨過原期限後不偽稱回復，改走安全停止。
- 文案有誤時，以 PR #31 exact SHA 重建、做 file manifest 比對後 forward-fix。
- 緊急停止順序仍是 pause Scheduler → 關閉 inbound／outbound → 移除 API 公開呼叫
  → 讓 preview 到期；不刪 appointments、mirror、candidate 或 anonymous audit。

## 7. PR A 候選證據（尚未套用）

- PR A：[#32](https://github.com/waydefu/clinic/pull/32)。
- exact SHA：`f6ebbff93b1ec1f9901f2b83dce5804f52f2a57d`。
- Terraform plan：`0 added, 1 changed, 0 destroyed`，只更新既有 budget；
  plan SHA-256 為
  `326D4991294AA46659BA81E9F369DA58F03F3C9B8777D5EA393E780C6482D46E`。
- 本機完整 verify、Firestore Emulator、334 個 E2E、供應鏈／秘密掃描與
  Terraform validate 已通過；GitHub CI 以 PR checks 為最終準據。
- read-only cloud preflight 已通過，但 mutation guard 依設計停在再次確認前；
  因此下列線上值仍未變更。
- Terraform plan hash／結果：待 exact apply 確認。
- 新 Hosting release／version／expiry：待 exact apply 確認。
- Firestore expiry／health、Scheduler 與 unchanged revisions：待 exact apply 確認。

## 8. PR B 受控候選修正（禁止部署）

PR B 從 PR A exact SHA 堆疊，只提供 code review 與 CI 證據：

- `CorrectCalendarCandidateRequest` 是嚴格的 appointment／busy 判別聯集；預約
  只接受 A01～A30、初診／回診、止鼾／醫美與合法 30 分鐘格線，忙碌只接受
  封閉原因與 timed／all-day 起訖。
- 任意姓名、電話、小編、來源、麻醉、臨床或自由文字欄位都不在 contract 中，
  會由 strict schema 拒絕。
- `POST /v1/calendar/candidates/{candidateId}/correct` 只允許 manager／front_desk。
  Firestore transaction 重新檢查版本、source generation、患者、重複預約與重疊，
  原子寫入 projection、block／appointment、mirror、outbox、audit 與 idempotency。
- mirror 保留原始 server-only external event ID；Worker 以該 ID 更新同一事件並加入
  私有 opaque link，不建立副本。整天與跨日忙碌保留 Google 的 exclusive end date。
- 工作臺只顯示 sanitized candidate，提供類型篩選、中文錯誤、修改前後差異及
  受控修正 dialog；沒有強制覆蓋，也沒有自由文字欄位。

PR B URL／exact SHA／GitHub CI 在 PR 建立後記入交付報告；不寫入 deployment
runbook，也不得成為 PR A Hosting build 的來源。
