# 給下一位 Luna：D-006 本地 hardening 階段交接（2026-09-13）

## 交接狀態

本階段已暫停，沒有進入下一個 phase。

- **角色：** `LUNA_SOLE_EXECUTOR`；`GROK_RESTS`
- **Repository：** `waydefu/clinic`
- **Base main：** `36f81011fcc2f9c82a51f83b79a285b5fa2cc794`
- **Branch：** `agent/luna-d006-authorization`
- **Implementation commit：** `f1f366d` (`fix(auth): harden delegated authorization storage`)
- **PR：** #117 — `fix(auth): harden delegated authorization storage`
- **PR URL：** https://github.com/waydefu/clinic/pull/117
- **既有 PR #116：** 仍 OPEN，head `de2075f4325360766874c8ebaecca62c6098d941`；不要重建、不要把本階段變更塞回 #116。
- **本階段 merge：** 尚未執行；merge 是獨立決策，下一位先等 exact-head required CI 再處理。

## 本階段完成內容

1. server persistence 的 delegated authorization 不再暴露明碼 `secret`；改用 `secretKdf`、`secretSalt`、`secretHash`。
2. API server-only adapter 使用 Node 內建 scrypt、每筆獨立 salt、`timingSafeEqual`；malformed／disabled／unsupported-KDF／錯誤輸入 fail closed。
3. domain 改由 server 注入 verifier，不在 domain 直接比較明碼。
4. 新增純函式 attempt-state transition：呼叫端明確提供 1–10 上限；達上限鎖定，不能默默解鎖；持久化與 atomic write 留給後續 application slice。
5. browser 的既有明碼只留在明確命名的 `synthetic-delegated-authorization`；這是 synthetic-only、非 production authentication，不得誤接正式 route。
6. 新增 server/domain/synthetic regression tests；更新 vendor、unrouted inventory、D-006 review 與相關文件。
7. checkpoint 工具新增 authority／cloud／identity／browser／resolved blockers／human blocker queue 欄位，並以 `Asia/Taipei` 顯示時間；evidence 寫入 gitignored `output/evidence/luna-checkpoint.txt`。

## 驗證證據

- `CI=true pnpm run verify`：**PASS**；113 test files、1492 tests；build、lint、types、docs、architecture、vendor sync、performance、tracked-secret、format 全通過。
- `CI=true pnpm run test:rules`：**PASS**；13 files、102 tests。
- delegated authorization targeted Vitest：**PASS**；3 files、24 tests。
- `node scripts/luna-checkpoint.mjs ...`：**PASS**；輸出沒有秘密值，checkpoint 未追蹤。
- `CI=true pnpm run test:e2e`：**UNAVAILABLE（本機環境）**；Chromium GPU process 在建立 context 前反覆 exit 256，未執行 assertion。不可把它報成測試 PASS；依賴 exact-head CI 或合格瀏覽器環境。
- 本機 Node：`v24.20.0`；`scryptSync`、`timingSafeEqual`、`randomBytes` 可用。

## 仍未完成／不可自行解除

### D-006 完整證據仍未 close

以下都還沒有正式接線，不能把 decision register 的 implementation evidence 改成 complete：

- C2/C3 identity 與 server-side session
- IdP claim mapping
- routed action enforcement／完整 RBAC
- denied-event audit sink
- UI role migration
- field-level filtering
- persistence 與 atomic attempt-state wiring
- production security-parameter review

### 其他 blockers

- D-001～D-005 仍是 `pending`：正式 booking 仍必須 `UNROUTED`，不可掛 `/v1/bookings`。
- D-009／D-016 production Calendar approval 未取得：不可寫 production Calendar。
- D-011 URL／DNS ownership 未取得：不可改 official DNS。
- exact-SHA production deploy authority 未取得：不可 `terraform apply`、Cloud Run deploy、live Hosting deploy、production IAM mutation 或 production credential use。
- real-data authority 未取得：只准 anonymized fixture、synthetic dry-run、reconciliation／rollback tooling；不可碰真實病患資料。
- TW-05 manual accessibility acceptance 未完成：保持 `HUMAN_BLOCKED`，不偽造人工驗收。
- 本機 `gcloud`、`terraform` 缺失；Firebase CLI 可讀 isolated project，但尚未形成 gcloud／ADC／Firebase／Terraform 五層一致性證據。
- owner Chrome `clinic-synthetic` profile 在本機不可證明；本機 Chromium GPU 也不可用。

## 重要邊界

- 不要讀、要求貼上或提交 password、2FA、token、ADC JSON、service-account key 或任何秘密。
- 不要把 browser synthetic secret 當成 production credential。
- 不要因 D-006 已 approved 就推導出 deployment、Firestore/Auth、booking、Calendar 或 real-data authority。
- 不要調高 performance budget、跳過 E2E、關閉 required check、`|| true` 或改弱測試。
- 不要 merge PR #117；先 fresh read PR state、exact head 與 required checks，再依 merge authority 決定。

## 下一位的精確續跑順序

1. `git fetch origin --prune`
2. `git status --short && git branch --show-current && git rev-parse HEAD && git rev-parse origin/main`
3. `gh pr view 117 --json state,headRefOid,mergeable,mergeStateStatus,url`
4. `gh pr checks 117`
5. 若 PR #117 的 head 已漂移，先確認是哪個 commit 造成漂移，不要假設 CI 適用於目前內容。
6. 若 exact-head required CI 全綠，停在 merge decision；不要自行跨過未授權 merge。
7. 重新讀 `docs/product/phase-1-decision-register.md` 與本交接；只有 fresh formal approval 才能解除相應 gate。
8. 若收到新 human-only authority，先更新對應 approval packet／register／checkpoint，再只做該 authority 明確涵蓋的最小 slice。
9. 若沒有新 authority，下一個安全方向是完成 D-006 C2/C3/C4 的設計／測試準備，但不得接 production route；先建立新的獨立 branch 和 acceptance criteria。

## Checkpoint

下一位不要相信這份文件中的動態 Git 狀態；先執行上面的 fresh verify。重新產生：

```bash
node scripts/luna-checkpoint.mjs \
  --phase D-006 \
  --completed "D-006 local hardening slice" \
  --in-progress "PR #117 exact-head CI / merge decision" \
  --blockers "D-006 full evidence; D-001-D-005; production authority; real-data authority; TW-05" \
  --test-state "local verify PASS 113 files/1492 tests; rules PASS 13 files/102 tests; local Chromium E2E UNAVAILABLE GPU process" \
  --authority "PRODUCTION=NO REAL_DATA=NO DNS=NO LIVE_HOSTING=NO PROD_CALENDAR=NO BOOKING=UNROUTED" \
  --cloud-state "isolated=beauessence-clinic-stg-c1a01 production=NOT_AUTHORIZED" \
  --identity-state "gcloud=missing adc=UNAVAILABLE firebase=verified terraform=missing" \
  --browser-state "clinic-synthetic=UNAVAILABLE default-browser-unsupported" \
  --resolved-blockers "Firebase CLI login/project-list read-back; branch protection read-back" \
  --human-blocker-queue "PR #117 merge authority; PR #116 merge authority; owner Chrome profile; gcloud/ADC; terraform; D-series approvals; TW-05" \
  --next-action "Fresh verify PR #117 exact head and required CI; stop before merge"
```

## 本次停工點

階段目標已完成到「可驗證的 D-006 local hardening slice + PR + 交接」；現在暫時停工。除非收到新的明確 authority 或下一輪工作指令，不要自動進入下一個 phase。
