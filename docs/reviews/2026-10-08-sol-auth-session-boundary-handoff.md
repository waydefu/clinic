# Sol-only 身份／Auth／session／trust boundary 首批本機交接

> 本文是 2026-10-08 歷史 checkpoint，不代表目前交付狀態。新的交接入口為 [2026-10-10 Draft 交接](2026-10-10-auth-session-boundary-draft-handoff.md)；舊 receipt、失敗與限制保留，不作本次 final-state 證據。

**狀態：IN_PROGRESS / FIRST_BATCH_LOCAL_VERIFIED；不是整群完成或 MERGE_READY。**
2026-10-08 使用者指定由 GPT-6.1 Sol 直接開始高風險群；本批只有 parent Sol，沒有 Luna／子代理。基準 main `ede751bd64d1ba213e5584908033aa51d8ee5ec9`；獨立 branch `agent/sol-auth-trust-boundary-20261008`。#241 已由 owner 整合，本批不修改其 frozen planning manifest。

本文件無法引用自己的 commit；尚未 commit／push／建立 PR；10個本批檔案已stage。之後以 `git log -- docs/reviews/2026-10-08-sol-auth-session-boundary-handoff.md` 定位，遠端 delivery readback 必須另外記錄。本文為去敏工程交接，不提供公開 exploit payload 或正式環境利用聲明。

## 本批實作與可證明的界線

- `internal-test-booking.authenticator.ts`：統一處理有歧義、缺失或格式錯誤的憑證來源；staff 使用既有 server session／CSRF，保留 patient 驗證 token、return lookup 與匿名 initial booking 的既有正向路徑。
- `calendar-pilot-session.ts`：既有角色／actor／撤銷與 12-hour domain 控制不變；增加 stored expiry／壞 timestamp 的拒絕、cookie parsing 的錯誤分類，cookie issuance 後、儲存或回傳前再核帳號／角色。最後一項不是 Firebase 與 Firestore 跨系統原子保證；既有 request-time revocation 檢查仍必須保留。
- `calendar-pilot-session.controller.ts`：登出在 cookie 解析失敗時清除無法使用的 cookie，但保留拒絕；有效 cookie 的 server revoke 失敗仍依既有正向契約不清 cookie、不報成功；client auth configuration 不放行未授權 project/domain。
- `appointment.application-service.ts`：follow-up 不得用新 intake 取得 return 身份，先拒絕才進 patient resolution；匿名 initial intake、已驗證 return、staff on-behalf 與既有 idempotency／reserve writer 不變。**沒有聲稱 initial intake 與 reservation 已成單一原子交易。**
- `internal-test-booking.gate.ts`：UTC clock／expiry 與 local emulator authority 驗證；保留既有 isolated project、emulator 例外及 production default-off，不新增 live project、政策或部署授權。
- `client-ip.ts`：驗證與正規化合法 IPv4／IPv6／mapped representation，保持每個受信 host 的 bucket；不發明 IPv6 subnet aggregation，也不聲稱已驗證 live ingress/proxy。
- `auth-boundary.regression.test.ts` 與既有 application-service test：opaque synthetic fixtures、SDK stubs／in-memory ports；沒有真實 OAuth、患者、Calendar 或 private settings。

## 真實回歸證據

在 pristine main worktree 執行**相同最終 assertions**：**69 PASS / 24 FAIL**，不是以 import error 或錯誤 API 當 RED。修補後 focused suite **211 PASS**；full unit **2563 PASS／1 existing FTP FAIL／1 existing SKIP**（202 files）。目前同一最終 assertions 在 pristine baseline **69 PASS／24 FAIL**。

保留兩個反證：原 module 已注入既有 session service；Firebase token verifier 已帶 revocation check。JWT UID 不是 raw caller identity header，不能把舊 label 直接當新漏洞證據。初版追加的 demo-only project 要求與 Canon 例外／positive fixture不符；clear-on-server-revocation-failure也違反既有positive acceptance。兩者已撤回，保留舊test，不將提案假設列為已證實缺陷。

## Gate checkpoint（最後結果由本機 receipt 說明）

| Gate | Result / evidence limit |
| --- | --- |
| Current assertions on pristine baseline | PASS as expected RED：69 PASS／25 security-boundary FAIL；source baseline與case lists存入本機receipt |
| Pinned Node24.20.0／pnpm11.9.0 frozen install | PASS；workspace／lockfile／dependency不改 |
| Build/type、ESLint、architecture | PASS；最後controller/sibling修正後已fresh rerun PASS |
| Focused auth/API suites | PASS：211 tests；含32個新auth boundary assertions與既有application新增1個回歸，正向路徑保留 |
| Full unit | FAIL：最終2563 PASS／1 existing FTP ECONNRESET FAIL／1 existing SKIP（202 files）；該producer在pristine main同樣FAIL。另一次combined gate timeout300s，不代替最後獨立完整run；未skip、改assertion或waive。 |
| Firestore Emulator | FAIL：首輪tool-kernel timeout；direct bounded retry已啟動 demo/loopback emulator，但Java process exit1，command timeout200s，沒有完成JSON。原因UNKNOWN，不稱其與本批無關或通過；未跑共用project的廣域cleanup |
| Docs/governance/format/secrets/sync/performance | PASS：format／docs-links／governance／structure／tracked-secrets／UI／pages／clinic-freeze／sync／perf／tokens／diff checks已fresh完成；原governance警告仍保留，沒有放寬threshold |
| E2E／fresh exact-head CI／Semgrep／Gitleaks | NOT_RUN：未public push、沒有遠端head；沒有假借 #241／#244 綠燈 |
| Independent Sol review | NOT_RUN：本批只有parent Sol，未以Luna或自己review冒充獨立審查；本地不是MERGE_READY |
| Production/provider/data/IAM/secret/migration/deploy | NOT_RUN／未授權 |

## Scope 與尚未處理

本批對應 K2、K6、K9、NEW-03、NEW-08 的可重現子範圍，以及既有 staff/session/authDomain owning boundary；不是整列歷史finding的 blanket closure。完整29-ID群尚有後續 source／runtime／UI／lookup項目，不更改31 historical custody結論或formal global novelty。

下一個 Sol 工作點：`SOL-IDENTITY`／`SOL-RETURN` 的 durable lookup key collision 與身份綁定／idempotency side effects；另對照D-006檢查 authenticated proof time與session reissue的absolute-bound語意。依序source→有效RED→coherent fix，不能從本文件推定新 claim 已 PROVEN。HMAC key與identifier transition需要既有相容設計及另行protected authority；不建立secret或跑migration。Live ingress/direct-service/runtime proof仍須具名、精確授權的隔離operator。

A05實體保留期限與E4-09角色Q1仍不猜。frontend session/UI尚未在本批修改，不宣称其hydration、fetch cancellation或顯示身分已修。

## 本機陷阱與回滾

- F-drive原pnpm store install實際EPERM；改獨立scratch store並使用frozen lock。最初system Node26／nested corepack Node24.15不符合pin；加入本機Bash與CMD shims後，正式build/lint/test使用24.20.0，無project config改動。
- 此次V4A edit及full-write guard拒絕已核對的exact source；保留失敗，不改Hermes guard／settings，改用工具的normal targeted replacement。不將編輯工具問題當repo缺陷。
- Windows FTP producer baseline failure保留；不弱化CI。Emulator是獨立demo project／loopback ports，不停止別人的共用fake project；timeout後只檢查／停止本批精確output-path的owned worker。
- 回滾只針對本分支列出的source/test/doc patch；目前未commit，不reset／stash其他人的worktree，沒有cloud/data rollback。
