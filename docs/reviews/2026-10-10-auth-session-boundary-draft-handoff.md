# 身份、工作階段與 API 邊界修補：Draft 交接

**日期：2026-10-10。狀態：DRAFT_REVIEW_ONLY / NOT_MERGE_READY。**

這是去敏工程交接，不是利用報告、production 驗收或部署授權。對應獨立分支 `agent/sol-auth-trust-boundary-20261008`，基準為 `ede751bd64d1ba213e5584908033aa51d8ee5ec9`；交付前 fetch 比較時，該基準與 `origin/main` 相同。本文涵蓋本分支累積的本機 source/test 修補，並取代 [2026-10-08 首批 checkpoint](2026-10-08-sol-auth-session-boundary-handoff.md) 作為新的交接入口。舊文件保留其當時的失敗與限制，不把舊 receipt 當本次證據。

**本次已完成的窄範圍驗收：** 登出、提供新的合成 server session、重新載入並由 server 驗證後開啟工作臺；先前患者建議不得帶進下一筆普通預約。相關 Chromium suites 為 **35 PASS / 0 FAIL / 0 SKIP / 0 flaky**。這不代表整個安全工作包逐列結案。

本文不嵌入自己的 commit hash，也不承諾尚未完成的 CI。定位本文版本用 `git log -- docs/reviews/2026-10-10-auth-session-boundary-draft-handoff.md`；遠端 PR、head SHA、CI run 和 artifact readback 另外記錄在交付 receipt。不得借用其他 PR 的綠燈。

## 1. 已交付的程式範圍

| 邊界 | Owning source | 本分支行為與限制 |
| --- | --- | --- |
| 身份正規化 | `packages/domain/src/patient-identity.ts` | 電話 digits 長度、有效月日與短識別值遮罩；只用合成 fixtures，不接真實患者。 |
| Intake 與預約交易 | `apps/api/src/patients/patient-directory.ts`、`apps/api/src/firestore/booking.repository.ts`、`apps/api/src/appointments/appointment.application-service.ts` | 在預約交易內準備／套用 intake，避免預約失敗留下獨立 patient/contact 寫入；無 verified identity 的 follow-up 不從新 intake 取得 return 身份。這不是 production 資料修復。 |
| Auth 與 session | `apps/api/src/auth/calendar-pilot-session.ts`、`calendar-pilot-session.controller.ts` | 檢查儲存 expiry、帳號／角色與已驗證 auth proof；12 小時 absolute bound 依 auth_time，而不是新增 idle 政策。lastSeenAt 是節流更新的 operational metadata。cookie 簽發後再次核帳號不等於 Firebase/Firestore 跨系統原子保證。 |
| Ingress 與 feature gate | `apps/api/src/platform/runtime/client-ip.ts`、`apps/api/src/internal-test-booking/` | 合法 IP 正規化、憑證來源的拒絕與 UTC/loopback emulator gate；沒有確認線上 proxy、IAM 或服務暴露設定。 |
| Lookup 與 durable quota | `packages/domain/src/patient-lookup-identity.node.ts`、`apps/api/src/firestore/rate-limit.repository.ts`、`docs/architecture/api-v1-contract.md` | full-key namespace 與 synthetic regression。HMAC 僅為候選設計，未建立 protected key；identifier cutover 有獨立相容性／授權 blocker，見下節。 |
| HTTP error boundary | `apps/api/src/app.module.ts`、`apps/api/src/firestore/api-safety.module.ts`、`apps/api/src/platform/errors/` | root-owned APP_FILTER、共用 safety providers、不依賴 Calendar feature 偶然載入；AppointmentController 必須取得 limiter，不能缺少它仍靜默啟動。 |
| Browser authority | `apps/web/public/modules/calendar-pilot-authority.js`、`hydrate-staff.js`、`pilot-google-totp-session.js`、`api-client.js`、`internal-test-booking-transport.js` | 共用 in-memory principal/generation；storage hint 不是身分權威。晚到的舊 response 不能直接清除較新的 generation。patient transport 不繼承 staff credentials。 |
| 工作臺啟動／退出 | `apps/web/public/admin-bootstrap.js`、`calendar-pilot-entry.js`、`apps/web/src/calendar-pilot-entry.js`、`scripts/build-web.mjs` | 分開 prototype transport opt-in 與 server identity mode；先驗證 server actor 再開工作臺。共享 authority 在 deferred bundle 外保留單一實例。未登入時 render 不再 dereference 空 account。 |

相關 regression 位於既有 owning tests，以及新增的 auth-boundary、sol29-boundaries、patient-directory、HTTP-boundary、bootstrap-authority-order、frontend-session-authority／trust-boundary tests。vendored domain 是依既有 sync 腳本產出的對應變更，不是另一套手寫 domain。

## 2. 最後一筆瀏覽器失敗的根因與修正

`tests/e2e/calendar-pilot-correction.spec.ts` 的最後段落，原先在登出後只寫 storage，再導向同路徑／query 的另一個 hash。這是同文件導航，**不會重新執行登入 boot 或 /me 驗證**。所以登出後的工作臺仍應保持 hidden；不能靠 storage 寫入把它升級為 authenticated。

現在 fixture 明確維護有效的 synthetic CSRF，/me 只對匹配的 header 回應成功。提供新 session 後，測試完整 reload，並另外確認新的 /me 驗證真的發生，再確認工作臺可見。它仍保留登出失敗、舊建議清除、下一筆預約不使用舊 opaque patient ID 的 assertions；沒有刪除失敗 case 或放寬 visibility assertion。

同時核對到另一個組合路徑問題：logout teardown 先清 storage，而 DELETE helper 之後才讀取 CSRF，因而丟失原本要送出的 header。現在在清除前只為該次 request 快照 header 值；不把 token 重新存回 storage，也不寫入 log。新的 wrapper regression 在修正前實跑 RED，修正後與相關 unit suites 一起通過。

**界線：** 現有 API 的 DELETE lifecycle controller 未自行 assert CSRF；本次只恢復 client contract，未新增後端 CSRF 政策。缺 header 不是上述 hash-navigation failure 的根因，測試中的 DELETE 503 也是明確的合成失敗 fixture。

交付檢查另發現既有 controller RBAC harness 缺少現在必需的 limiter provider，Nest bootstrap 因此 abort，30 個 assertions 未執行。已為該用途明確提供 synthetic limiter，並新增「缺 limiter 必須拒絕 startup」的測試；不能把未執行的 assertions算通過。quota 本身仍由專屬 rate-limit tests 驗證，未改動 production dependency requirement。

## 3. 驗證與 evidence limits

所有本機執行使用 Node 24.20.0；不改 package manifest、lockfile、CI gate 或既有測試門檻。以下 status 只對各自明列的範圍有效。

| Gate | 狀態 | 能證明什麼／仍缺什麼 |
| --- | --- | --- |
| 最後相關 Chromium suites | PASS | 35/35、0 skip、0 flaky；legacy-login-flash、calendar-pilot-correction、internal-test-booking。後端與 Firebase 以 synthetic fixtures/stubs 替代，不是真 OAuth／MFA 驗收。 |
| 相關 frontend unit | PASS | 34 assertions，含 DELETE header regression、authority boot 與 handoff。 |
| 必需 limiter 的 controller harness | PASS | 32/32 assertions 已重跑；包括缺 provider 拒絕 startup。 |
| Build/type、lint、architecture、performance | PASS | 本分支 source 在最後修正後已完成相應 producer。先前 performance 超標是舊 checkpoint 的 FAIL，不以口頭說法消除；新 producer 已通過，未放寬 budget。 |
| Structure、clinic-freeze、UI、pages、tokens、docs、governance、e2e-groups、tracked-secrets、domain sync、capture config、diff | PASS | 本機 gating；既有 governance size warnings 保留，沒有改 threshold。新交接文件加入後另跑 docs/format/secrets。 |
| 完整 unit | FAIL / CI 接續 | 最後完整 run：2669 PASS / 1 FAIL / 1 SKIP / 0 pending，213 個 test files。唯一 FAIL 是 Windows FTP 相容性測試，pristine 基準相同 producer 為 1 PASS / 1 FAIL；不 skip、不 waive。第一次交付 run 另含 30 個因 harness 缺 provider 未執行的 cases，最終已全部執行；不能用 focused PASS 代替 full suite。 |
| 完整 Firestore Emulator | FAIL / CI 接續 | local runner exit 1、另一 direct run timeout 300 秒，未取得完整 JSON。保留先前受影響 subset 的 61 PASS，但它不代表 full suite。必須讀取 exact-head CI rules job。 |
| Secret value scan | PASS | 發布前 staged source/test 由官方 checksum 核對的 Gitleaks 8.30.1、redact 模式掃描，0 findings；最終文件加入後再掃一次。tracked-secrets 檢查本身只證明 tracked-file policy，不能代替 value scan。 |
| Full browser matrix、Linux unit／Emulator、audit／SAST | NOT_RUN 本機全量／以 exact-head CI 接續 | PR workflow 原樣執行，不取消、不 skip、不縮減覆蓋；CI 結果另讀回。 |
| Real provider／second account／live ingress／production | NOT_RUN | 無本次授權，不可從 source、mock、Emulator 或 CI 推論正式環境已安全。 |

早期 FTP baseline 的 package-manager entry 曾拒絕 worktree cache metadata；後續用 pinned Node 直接執行既有 Vitest entry，記錄實際 producer，不把該拒絕當作測試失敗證據。full-suite receipt 必須同時列 passed、failed、skipped、pending 與 suite errors，而不是只摘錄 passed。

最高 evidence rung 是各窄範圍的 TEST/GATE-VERIFIED；只有讀回目前 PR 的 exact-head required jobs 後才可使用 CI-VERIFIED。

另外保留兩次多跑的失敗：在後續只有 controller fixture／交接文件變更時，一次整鏈 build 重跑在 workspace tsc 成功後、web build 階段 timeout 300 秒；一次 full lint 重跑 timeout 260 秒。先前成功的 source gates 不會因此變成這兩次 producer 的成功；交付 receipt 分別記錄，changed-file lint／文件檢查與 exact-head CI 接續驗證。

## 4. 不可略過的 blockers 與後續順序

1. **持久化 limiter key 相容性／識別鍵 cutover：BLOCKED。** 新舊 IPv6 spelling 與既有 counter/lock 的關係尚不能以目前 canonical key完整恢復。現有 source 只延續能匹配的 legacy alias；不可宣稱做過線上資料轉換。先做離線 synthetic transition 設計與 sibling review，再取得明確的 quiesced cutover 或 alias/data transition 授權。不得混跑新舊 writers。此為部署 blocker，不是已確認的線上利用聲明。
2. **Protected HMAC key 與實際 identifier transition：BLOCKED。** 未建立 secret、未執行 migration；不得把候選向量測試當完成。
3. **完整 CI 與 bootstrap composition：待 exact-head 結果。** 必須檢查 verify、rules、全部 E2E groups、audit、SAST／Gitleaks 及 aggregate；失敗需定位 owning source，不可以局部綠燈蓋過。
4. **逐 finding closure：DEFERRED。** 本次結束的是上述窄範圍瀏覽器驗收與 Draft source/test 交付，不是 29 項逐列 terminal assessment。其詳細對照與未完成項留在非公開 task checkpoint；frozen planning manifest 保持不變，缺失的 historical evidence 也沒有被 current source補成已驗證。
5. **政策／runtime：BLOCKED。** session 實體保留期限、未決角色政策與 live ingress/provider proof 維持原有 owner/operator gate；不自行決定或部署。

下一位工程師先 checkout PR 的確切 head，讀取 required jobs與 artifacts，再從 rate-limit cutover blocker 與逐列 closure worksheet 接續。新資料、migration、IAM、secret、正式環境 probe、merge、deploy 都需新明確授權；本 Draft 不提供這些授權。

## 5. 重跑與回滾

所有命令在 repository 根目錄執行，使用 repo pin 的 Node/pnpm。狹窄驗證命令：

```sh
pnpm exec vitest run apps/web/src/calendar-pilot-google-totp-session.test.ts apps/web/src/bootstrap-authority-order.test.ts apps/web/src/frontend-session-authority.test.ts apps/web/src/pilot-handoff-regression.test.ts --maxWorkers 2
pnpm exec vitest run apps/api/src/appointments/appointment.controller.test.ts --maxWorkers 1
pnpm exec playwright test tests/e2e/legacy-login-flash.spec.ts tests/e2e/calendar-pilot-correction.spec.ts tests/e2e/internal-test-booking.spec.ts --project chromium --workers 1
pnpm verify
pnpm test:rules
```

不要重用來源／dist 不符的舊 web server；Playwright 必須對本次 build 啟動 server。只停止自己啟動、可核對 worktree 與 command 的程序，不做全機 Node/Java cleanup。最後一筆跨登入測試必須 full reload，hash navigation 不是新的登入 boot。

回滾界線是本獨立分支的 source/test/docs commits；沒有 production、資料或 cloud rollback。本機未 merge、未 deploy，也沒有寫入真實患者或 Calendar payload。不要 reset/stash 其他人的 worktree；若將來獲准 cutover，必須先有獨立資料相容性與 rollback packet，不能只 revert source 就宣稱資料可回復。
