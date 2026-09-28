# P1-09 關帳追加額度核准（2026-09-27）

**狀態：** `APPROVED_IN_CHAT`，業主在對話中核准（單人核准，沒有第二組審查）。
**母 packet：** [P1-09 C1 有界操作 packet](2026-09-22-p1-09-operator-packet.md)
（`P1-09-C1-SYNTHETIC-CLOSEOUT`）。本文件只在母 packet 的時窗內追加下列額度，
不改母 packet 的任何停止條件或 rollback 規則。
**缺口來源：** [P1-09 交接紀錄補記二](../reviews/2026-09-26-p1-09-handoff.md)。

這份文件記錄的是核准範圍，不是執行結果。每一項執行後都要另寫帶日期的紀錄。

## 授權欄位

```text
PACKET = P1-09-C1-SYNTHETIC-CLOSEOUT（追加額度 2026-09-27）
STATUS = APPROVED_IN_CHAT（業主，2026-09-27）
AUTHORITY_SHA = c390c9eeaba5ef6bc1158e293d76b64d2c38fa38
APPROVER = 業主
OPERATOR = <未指定：須由業主指定具 C1 憑證的操作者>
VALID_UNTIL_UTC = 2026-09-30T12:00:00Z
BOOKING_GATE_EXPIRES_UTC = 2026-09-30T10:00:00Z（C 項須在此之前完成）
PROJECT = beauessence-clinic-stg-c1a01
REGION = asia-east1
DATABASE = (default)
HOSTING_CHANNEL = internal-preproduction（本追加不改 Hosting）
DEPLOYED_API_DIGEST = sha256:80b323f68163d91d3b8112eeccc56cda2bd2bf0d06063ab6902ebe6761246019（ffa5d33）
CLEANUP = D 項的 2 個 revision tag；其餘 NONE
STOP_ON_UNEXPECTED_CHANGE = true
```

**AUTHORITY_SHA 的對帳規則：** 合併本文件會讓 `main` 前進。Gate 00 執行時，
`main` 與 `AUTHORITY_SHA` 之間若只有文件變更，記下 diff 後即可繼續。若出現任何
非文件變更，就停止，重新請業主核准。

**操作者：** 撰寫本文件的 session 沒有 C1 憑證，也沒有 Stage F 私有證據清單，
不能執行任何一項。依 `CLAUDE.md`，Claude Code session 不自行執行部署或
`terraform apply`，要把確切指令交給操作者。操作者未指定前，下列會改動 C1 的項目
一律不執行。

## 核准的 C1 變更

| # | 驗收列 | 內容 | 額度上限 | 停止條件 |
| --- | --- | --- | --- | --- |
| A | P09-02 | run stack 重新 plan，只 apply 同一份 saved plan | 1 plan、1 apply | plan 出現 image、traffic、env、IAM、secret、Scheduler 狀態的變更，或任何 replace／destroy；前次唯讀 plan 只有 gcloud metadata 與 `max_doublings` 5→0 |
| C | P09-10 | 同一個冪等 key 同時送出合成預約建立 | 5 個請求；最多 1 筆預約（含 1 筆 outbox、1 個合成日曆事件）；事後取消 1 次 | 出現第二筆預約、outbox 或事件 |
| D | SEC-13 | 用上方 API digest 建 2 個 0% 流量的 tagged revision，一個 `INTERNAL_TEST_BOOKING_ENABLED=false`，一個 `INTERNAL_TEST_BOOKING_EXPIRES_AT_UTC` 設為過去時間；經 tag URL 打寫入路徑 | 2 個 revision、2 個 tag、最多 6 個請求 | 任一請求不是 503（404 也算失敗）、Firestore 有寫入、正式流量離開 `internal-test-api-00047-suy` |
| E2 | SEC-14 | 已存在的合成員工帳號在 Firebase Auth 停用後打 1 次受保護 API，再啟用後打 1 次 | 2 次 Auth 使用者更新、2 個請求 | 停用後仍被放行；涉及任何非合成帳號 |
| I | OPS-06（選做） | 套用 `c1-foundation` 的 `C1 IAM SetIamPolicy` 告警條件修正 | 1 plan、1 apply，只改該條件 | plan 出現該條件以外的變更；缺帳單帳戶等輸入時不執行 |

**D 項注意：** Firebase Hosting 的 `pinTag` 會釘到最新建立的 revision。做完 D 之後，
任何 Hosting 部署前都要先核對 `/v1/**` 指向的 tag。

**E2 項要順便釐清的疑點：** `apps/api/src/platform/authorization/rbac-appointment-policy.ts`
把 `accountActive` 寫死為 `true`，註解說停用檢查在上游的 Firebase 驗證。F-12 要求
不能寫死。分類 `NEEDS-RUNTIME-REPRODUCTION`，由 E2 的實測決定。

## 不需額外核准的項目（唯讀或只改文件）

| # | 驗收列 | 內容 |
| --- | --- | --- |
| B | P09-03 | 唯讀的完整 IAM 審查，逐項對照最小權限 |
| E1 | SEC-14 | 讀回 `internal-preproduction` 的實際回應標頭，確認 CSP 不含禁用的 staging auth origin |
| D0 | SEC-13 | 用原始碼測試或 emulator 證明缺設定時拒絕開機 |
| F | F-01～14 | 依[原 closure 定義](../reviews/2026-09-15-wp-b1-b11-signed-authority-and-f-closure.md)逐項對帳 |
| G | Gate 17 | 在私有 runner 帶入 11 個案例的 artifact 重跑 Stage F evaluator |
| H | Gate 18 | 以上全部 PASS 後才寫關帳 PR；任一項沒過就維持 `P1_09 = NOT_CLOSED` |

## Rollback

- A、I：依 Gate 02 讀回的 baseline 恢復；不做 `terraform destroy`。
- C：取消該筆合成預約；不刪預約、outbox 或 audit。
- D：移除 2 個 tag；正式流量本來就沒離開 `00047-suy`，只需讀回確認。
- E2：重新啟用該合成員工帳號並讀回。

## 追記：操作者與授權 SHA（2026-09-27）

- **操作者：** 業主在對話中指定 Claude Code session，以業主帳號的 gcloud 與 ADC 身分執行，業主在場。
- **Gate 00：** `c390c9e` 之後唯一的非文件變更是 `0f48d4d` 的單元測試；業主同意以 `b857749` 繼續。
- **A 項：** 執行前發現 run stack 用單一值寫入三個服務的 `INTERNAL_TEST_SOURCE_SHA`，無法對上現場，以 #186 修正；業主同意 A 改綁 `d2af1637e59552c313f7029b59f60feffa8763b0`。其餘項目仍依上方欄位。
- 執行結果見 [P1-09 C1 操作者執行紀錄](../reviews/2026-09-27-p1-09-c1-operator-run.md)。

## 追記二：E2 擴充與停止條件修訂（2026-09-28）

業主於 2026-09-28 在對話中核准，綁 `main` `81ec2ee`，時窗到 `2026-09-30T10:00:00Z`：

- **額度擴充：** E2 原本只有帳號停用／啟用與請求。為了讓測試帳號能登入，追加 1 個櫃台白名單 secret 版本、1 次 run stack plan 加 1 次 apply、1 次流量與 Hosting 標籤切換，以及測完後切回。
- **停止條件修訂：** 業主決定允許使用業主本人在用的帳號做 E2，取代「涉及任何非合成帳號」這個停止條件。測完後以流量切回的方式，讓它不再出現在服務中的白名單。
- **重做：** 第一次嘗試因員工工作階段 30 分鐘閒置逾時，無法判定 401 的原因，記為無效。業主核准重做，帳號更新總數由 2 次增為 4 次。
- 結果見 [E2 停用員工實測](../reviews/2026-09-28-p1-09-e2-disabled-staff.md)。

## 本文件不是什麼

不是 production、live Hosting、官方 DNS、真實資料、CP-01、BD runtime、Google 真實
還原、AWS 或官網的授權；不延長 `2026-09-30T12:00:00Z` 的時窗；不改任何 D-series
狀態。時窗到期前沒做完的項目，要重新申請。
