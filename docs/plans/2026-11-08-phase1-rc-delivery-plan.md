# 第一階段上線候選版（RC）交付計畫（2026-11-08 至 11-30）

**狀態：** PLAN-ONLY／CURRENT_ENTRY（2026-11-08 起為現行唯一計畫入口與進度台帳）。這份是計畫，不是核准，也不是任何證據；下列各項都尚未執行。不得以合成資料、Emulator、預覽站或文件冒充正式環境證據（`MP:43-46`）。
**細部包：** [phase1-rc-packets](2026-11-08-phase1-rc-packets.md)（70 包逐包作法，含 254 個 finding）。
**機器權威：** [safe-manifest](2026-10-06-sol00-safe-manifest.json)、[finding 清單](2026-10-06-sol00-finding-manifest.md)。

## 一、目標與定義

負責人 2026-11-08 決定：11/30 交付的是**第一階段上線候選版（RC）**，不是正式上線。

RC 完成條件（全部要有可查證據）：

1. 59 包的來源工作全部結束：完成合併，或明確延後並寫理由與歸屬（Expansion S／Stage 6／12 月）。
2. C1 內部測試環境的員工端完整流程以合成資料跑過：預約、改期、取消、到診、CSV、封存、報表、Business Delivery Stage 2b。[CP-08 回歸 worksheet](2026-10-01-cp-08-regression-evidence-worksheet.md) 在 RC 精確 commit 上填完；[CP-10 清單](2026-10-01-cp-10-current-project-acceptance-checklist.md)由負責人簽。
3. C2～C6 測試環境切片：逐片提出 request（排除項、成本、operator、approver、plan/apply、rollback），負責人逐片核准後部署並讀回。做不到的片 11/22 前標明並移到 12 月。
4. Gate 2：專用測試日曆續期、真實日曆實測（至少 50 次正常收斂；故障情境另列）。CAL-PILOT 合成子範圍 2026-11-28T04:51:37Z 到期，11/25 前決定是否延期。
5. 決策：第二節的待決事項在期限前有具名答案、日期、適用範圍、排除項（格式依 [核准紀錄格式](../product/current-execution-and-approval-plan.md)）。需法律／隱私／醫療專業審查者，RC 只要求「答案定案＋審查安排」，審查完成列為正式上線前條件。
6. RC 精確 commit 打 tag（例如 `phase1-rc1`），附 exact-head CI 全綠證據。

**不在 RC**（排到 12 月正式上線計畫，見第八節）：真實病患資料、正式隱私政策發布、公開預約寫入、Stage 6 的備份還原／區域故障／負載／事故演練／人工無障礙、五方（clinic、privacy、security、operations、technical）簽核。

### CP-10 清單逐項歸屬

| 項目 | 內容 | 歸屬 | 備註 |
| --- | --- | --- | --- |
| A-01 | 發佈版本與授權範圍 | RC | exact SHA、digest、C1 project 一致 |
| A-02 | CP-08 全系統回歸 | RC | 人工無障礙（human AT）部分 12 月 |
| A-03 | 新預約及 Workbench 操作 | RC | |
| A-04 | CP-03 月用量與里程碑 | RC | |
| A-05 | CP-04 CSV 匯出 | RC | 併入 RC-06 |
| A-06 | CP-05 封存與資料權限 | RC | 備份尚在保存期不宣稱已徹底刪除 |
| A-07 | Google 真實 restore（CP-06-E） | 12 月 | Stage 6 備份還原 |
| A-08 | 合作終止與返還收據 | RC（拒絕路徑）／12 月（期滿路徑） | 期滿路徑需 30 日，RC 內無法完成 |
| A-09 | 繁中管理手冊盲走與截圖 | RC | 只用合成截圖 |
| A-10 | Drive 文件與規則 crosswalk | RC（待負責人決定） | 商務差異需負責人定案；歸屬待確認 |
| A-11 | AWS 與官網範圍 | RC | 範圍聲明；官網實機接受（PUB-03）可 12 月 |
| 驗收列 1 | Engineering current-project acceptance | RC | CP-06-E 部分 12 月 |
| 驗收列 2 | 試用期／調整期 | 12 月 | 以第一位真實員工登入起算 |
| 驗收列 3 | 真實日曆月付款 | 12 月 | 與工程驗收獨立 |

## 二、負責人待決事項

期限為台北日期。「已知答案」欄是既有輸入，不等於核准；要轉成正式核准紀錄（Approval ID、Answer、Approved by、日期、證據、範圍與排除項）。

### 11/12 前

| ID | 問題 | 已知答案／建議預設 | 阻擋什麼 |
| --- | --- | --- | --- |
| D-004 | 容量、預約期間、多服務時長 | 容量 1、預約期 1 個月、多服務不加總（08-16 輸入）；建議轉正式核准 | slot 與排程相關包 |
| D-005 | 取消截止、爽約 | 當日 10:00 截止；建議轉正式核准 | 取消流程驗收 |
| D-011 | 正式網址、人工預約備援 | 內部預覽用 `.web.app`；正式 URL 未定 | 公開預約（12 月）；RC 只要答案 |
| OR-22 | 重複預約上限與同一人判定 | 未定，屬 D-004 | 預約防重 |
| OR-48 | 休診日／國定假日管理者 override | 超出營業時間僅管理者可 override 已定；休診日未決 | 排班規則 |
| OR-37 | 止鼾療程時長 | 已改為到診後確認；請確認不再回頭 | 無（關閉題目） |
| D-24 | 試用調整模型是否採用 | DESIGN-PROPOSED／BLOCKED-OWNER | SOL-BUSINESS 延伸工作 |
| LEASE Gate 2 | 真實 runtime 接入範圍 | `2026-10-22-sol-calendar-lease-coordination.md` 檔頭與 :17、:176 不一致，請釐清 | RC-07 |

### 11/19 前

D-001、D-002（含 Google DPA、備份刪除語意、legal hold）、D-003（RC 只需草稿定案與審查安排）、D-009、D-016、Q-BACKUP、SOL-PRIVACY Q3／Q5、2026-10-24 第 6～9 題、#268 [H] 告知文字審閱、CP-10 A-10（Drive 文件與規則 crosswalk 的商務差異定案）、PUB-03 官網實機接受（可 12 月）。

### 隨時可回答

- 醫師照片書面同意：負責人 11/07 表示沒有書面但官網已使用；建議補 email 同意，存 repo 外（RC-03）。
- staff-*.png 內容檢視（RC-03）。

### 已決，不再問

return_sessions 24 小時（`DR:316`、`DR:999`）；E4-09 個管師＝諮詢師（`DR:1003`）；braces（11/08 依解除條件處理，RC-01）；supportEmail（由 PR #451 處理，RC-03）。
D-007、D-008（月結）、D-014、D-015 已 deferred，不在 RC。

## 三、時程（倒排到 11/30）

| 週 | 日期 | 內容 |
| --- | --- | --- |
| W1 | 11/09–11/15 | 長跑重啟（Codex 週額度 11/9 重置，RC-10）；負責人第一批決策（11/12）；RC-01、RC-02、RC-03、RC-05、RC-11；C1 員工端第二窗口（RC-06）；日曆續期與實測（RC-07）；INGRESS、MAINTENANCE、SECRETS 外證；C2～C6 request 草擬 |
| W2 | 11/16–11/22 | IAM、SESSION 外部證據（解開最多下游）；無來源包依上游解鎖順序開工；第二批決策（11/19）；C2～C6 逐片核准與部署；11/22 決定哪些切片移到 12 月；RC-04 |
| W3 | 11/23–11/29 | 程式凍結 11/26；CAL-PILOT 延期決定 11/25；CP-08 在凍結 commit 上跑；CP-10 負責人驗收 11/28–29；RC-08 量測、RC-09 |
| 交付 | 11/30 | 打 RC tag，交接 12 月正式上線計畫 |

關鍵路徑：INGRESS → IAM／SESSION 外證 → 下游包 → 凍結 → CP-08 → CP-10。任何一項延誤超過 2 天，本檔要記錄並提出縮範圍選項（先砍：C2～C6 中做不到的切片、W3 才開工的無來源包、SOL-INTEGRATION 整合）。

**下游包分兩段做，避免全部擠在 W3：** 表中排 W3 的包，若還有來源工作（補回歸、補程式），W2 就以 source-only 方式平行開工，不等上游外證；W3 只做「上游外證到位後的整包收尾驗收」。IAM、SESSION 的唯讀盤點與差異表在 W1 先做，W2 只剩負責人核准後的變更與讀回。無來源 7 包中，SOL-CALENDAR-RESTORE、SOL-HTML、SOL-RELEASE 在 W2 開始寫來源；SOL-INTEGRATION 維持最後。

## 四、59 包總表

欄位出自 manifest；finding 層的回歸測試要求「依 manifest」，本表不複製。歸屬裁定：#419 K1 屬 NO-WORK；E1-26 屬 SOL-RUNTIME-EVIDENCE；E1-05 屬 SOL-RELEASE（#308 誤列）。manifest 過時：SOL-TTL、SOL-RBAC 的 OWNER_POLICY_PREREQUISITE 已有登記簿答案，由 RC-02 同步。

| 包 | manifest status | risk | dependsOn | findings | write-set（前 3） | 現況 | 已合併 PR | RC 波次 | 執行者 | 需負責人核准 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SOL-CUSTODY | PLANNING_TERMINAL_NO_IMPLEMENTATION | MEDIUM | — | B-24、E1-19、E1-27、E1-29、E1-33、E1-34、E1-35、E2-11、E3-18、E4-05、E4-06、E4-11、E3-21、E3-22、E3-23、E3-26、E3-27、E3-28、E3-29、E3-30、E3-33、E3-36、E3-37、E4-16、E4-17、E4-18、E4-19、E4-20、E4-22、E4-25、E4-26 | — | NO-WORK（已終態） | manifest PLANNING_TERMINAL_NO_IMPLEMENTATION；歷史 claim 未標驗證 | — | — | 無 |
| SOL-NOTIFICATION | PLANNED_CURRENT_EVIDENCE_SCOPE | HIGH | — | B-08 | infra/terraform/wp-b4-alerting/main.tf | 已有來源切片 | #384、#404、#407 | W2 | 負責人（ADR 核准）、Haiku（讀回） | ADR 核准；告警通知 IAM |
| LUNA-E2E-INVENTORY | PLANNED_CURRENT_EVIDENCE_SCOPE | MEDIUM | — | E3-32 | docs/architecture/test-strategy.md | DONE-MERGED（已終態） | #269 | — | — | 無 |
| LUNA-FIRESTORE-RUNNER | PLANNED_CURRENT_EVIDENCE_SCOPE | MEDIUM | — | E2-03 | scripts/run-firestore-vitest.mjs，scripts/run-firestore-vitest.test.mjs | DONE-MERGED（已終態） | #273 | — | — | 無 |
| SOL-READ-FAILURE | PLANNED_CURRENT_EVIDENCE_SCOPE | MEDIUM | SOL-SESSION-UI | C04、X-C01 | apps/web/public/modules/internal-test-booking-transport.js，apps/web/public/patient-app.js，apps/web/src/internal-test-boo… | DONE-MERGED（已終態） | 沿用 #268 對帳留言 6562505748 | — | — | 無 |
| LUNA-ROBOTS-COMMENTS | PLANNED_CURRENT_EVIDENCE_SCOPE | MEDIUM | — | B-23、C06 | apps/web/public/robots.txt | DONE-MERGED（已終態） | #270 | — | — | 無 |
| LUNA-WORKBENCH-START | SOL_CORE_LEASE_REQUIRED | MEDIUM | — | C01 | apps/web/public/admin-bootstrap.js，apps/web/src/admin-bootstrap.test.ts | DONE-MERGED（已終態） | #271 | — | — | 無 |
| NO-WORK | PLANNING_TERMINAL_NO_IMPLEMENTATION | HIGH | — | B-39、B-43、A07、A10、E3-16、E3-34、E4-23、K1、B-52、X-C07 | — | NO-WORK（已終態） | manifest PLANNING_TERMINAL_NO_IMPLEMENTATION | — | — | 無 |
| SOL-ARCH-GATE | PLANNED_CURRENT_EVIDENCE_SCOPE | HIGH | — | E1-09、E1-20 | scripts/architecture-rules.mjs，scripts/architecture-rules.test.mjs，scripts/check-architecture.mjs | DONE-MERGED（已終態） | #253、#263 | — | — | 無 |
| SOL-ASSET-BUILD | PLANNED_CURRENT_EVIDENCE_SCOPE | MEDIUM | — | E1-32 | scripts/build-brand-assets.mjs，scripts/build-brand-assets.test.mjs，scripts/build-clinic-assets.mjs | DONE-MERGED（已終態） | #256 | — | — | 無 |
| SOL-BUILD | PLANNED_CURRENT_EVIDENCE_SCOPE | MEDIUM | — | E1-10、E1-28 | apps/web/src/build-web.test.ts，scripts/build-web.mjs，scripts/build-web.test.mjs | DONE-MERGED（已終態） | #260 | — | — | 無 |
| SOL-BUSINESS | PLANNED_CURRENT_EVIDENCE_SCOPE | MEDIUM | — | D-24、D-35、E3-25 | apps/api/src/business-delivery/business-delivery.application-service.ts，docs/plans/2026-09-18-business-delivery-follow-u… | DONE-MERGED（已終態） | 沿用 #268 對帳留言 6562505748 | — | — | 無 |
| SOL-CALENDAR-CANDIDATE | PLANNED_CURRENT_EVIDENCE_SCOPE | HIGH | SOL-SCHEDULE | D-33 | apps/api/src/calendar/calendar-pilot.application-service.test.ts，apps/api/src/firestore/calendar-pilot.repository.ts | 已有來源切片 | #363（D-33 決策矩陣） | W3 | 長跑（gpt-6.1-terra） | 無 |
| SOL-CALENDAR-ENVELOPE | PLANNED_CURRENT_EVIDENCE_SCOPE | MEDIUM | SOL-CALENDAR-LEASE | D-11、D-17、NEW-09 | apps/worker/src/calendar-sync/firestore-calendar-sync.repository.ts，apps/worker/src/calendar-sync/google-sync-client.ts，… | 已有來源切片 | #408（D-17 競態守護） | W2 | 長跑（gpt-6.1-terra） | 無（來源）；provider 外證需負責人開窗 |
| SOL-CALENDAR-LEASE | PLANNED_CURRENT_EVIDENCE_SCOPE | MEDIUM | — | D-05、D-12 | apps/worker/src/calendar-sync/calendar-pilot-runtime.ts | 已有來源切片 | #434（Gate 2 決策）、#436–#446 | W1 | Haiku（實測）、負責人（登入與核准） | 續期執行；真實日曆寫入；LEASE 真實 runtime 接入範圍釐清（D 清單 11/12） |
| SOL-CALENDAR-RESTORE | PLANNED_CURRENT_EVIDENCE_SCOPE | HIGH | SOL-CALENDAR-ENVELOPE | D-31、D-32、D-01、D-02、D-03 | apps/worker/src/calendar-smoke.ts，apps/worker/src/calendar-sync/google-sync-client.ts，apps/worker/src/google-calendar.ts | 無來源 | 無來源 PR | W3 | 長跑（gpt-6.1-terra） | 無（來源）；真實日曆還原演練屬 12 月 |
| SOL-CALENDAR-TESTS | PLANNED_CURRENT_EVIDENCE_SCOPE | MEDIUM | SOL-CALENDAR-ENVELOPE | D-41 | tests/firestore/calendar-stage-d-inbound.test.ts | 已有來源切片 | #362（D-41） | W3 | 長跑（gpt-6.1-terra） | 無 |
| SOL-CALENDAR-WATCH | PLANNED_CURRENT_EVIDENCE_SCOPE | MEDIUM | — | D-28、D-29 | apps/worker/src/calendar-sync/watch-channel-lifecycle.test.ts，apps/worker/src/calendar-sync/watch-channel-lifecycle.ts，a… | DONE-MERGED（已終態） | 沿用 #268 對帳留言 6562505748 | — | — | 無 |
| SOL-CI-IAC | PLANNED_CURRENT_EVIDENCE_SCOPE | MEDIUM | SOL-CI-SECURITY、SOL-IAC-LIFECYCLE、SOL-IAM、SOL-SUPPLY | B-05 | .github/workflows/verify.yml，infra/terraform/c1-foundation/noop.tftest.hcl | 無來源 | 無來源 PR（#378 只是 B-05 決定紀錄） | W3 | 長跑（gpt-6.1-terra） | 無（B-05 的受保護部分不動） |
| SOL-CI-SECURITY | PLANNED_CURRENT_EVIDENCE_SCOPE | HIGH | — | B-27 | .github/workflows/verify.yml | DONE-MERGED（已終態） | #272 | — | — | 無 |
| SOL-CLI | PLANNED_CURRENT_EVIDENCE_SCOPE | MEDIUM | SOL-CONFIG、SOL-OBSERVABILITY | E2-04、E2-05、E2-07 | scripts/historical-artifacts.mjs，scripts/phase0-snapshot.mjs，scripts/phase0-snapshot.test.mjs | 已有來源切片 | #372（E2-07，11/02 前） | W3 | 長跑（gpt-6.1-terra） | 無 |
| SOL-CONFIG | PLANNED_CURRENT_EVIDENCE_SCOPE | HIGH | SOL-IAC-LIFECYCLE | B-45、E1-15、E2-09 | apps/api/src/business-delivery/business-delivery.config.ts，apps/api/src/platform/runtime/c1-required-config.ts，infra/con… | 已有來源切片 | #366（B-45、E1-15、E2-09） | W3 | 長跑（gpt-6.1-terra） | 無 |
| SOL-CONTAINERS | PLANNED_CURRENT_EVIDENCE_SCOPE | MEDIUM | — | B-26 | containers/api.Dockerfile，containers/internal-test-outbox.Dockerfile，containers/worker.Dockerfile | ALREADY_FIXED（已終態） | #255 | — | — | 無 |
| SOL-CONTRACTS | PLANNED_CURRENT_EVIDENCE_SCOPE | HIGH | — | B-15、B-17、B-16、B-33、B-36、B-37、D-21、D-43、E4-15 | apps/api/src/appointments/appointment.application-service.ts，apps/api/src/appointments/appointment.controller.ts，apps/ap… | DONE-MERGED（已終態） | 沿用 #268 對帳留言 6562505748 | — | — | 無 |
| SOL-DESIGN-GATE | PLANNED_CURRENT_EVIDENCE_SCOPE | MEDIUM | — | E1-22、E3-14 | docs/README.md，docs/design/test-only-operations-ui.md，docs/design/ui-ux-rules.md | DONE-MERGED（已終態） | 沿用 #268 對帳留言 6562505748 | — | — | 無 |
| SOL-DOC-GATE | PLANNED_CURRENT_EVIDENCE_SCOPE | MEDIUM | — | E1-23 | scripts/check-docs-links.mjs，scripts/check-docs-links.test.mjs | DONE-MERGED（已終態） | #259、#248 | — | — | 無 |
| SOL-DOCS | PLANNED_CURRENT_EVIDENCE_SCOPE | MEDIUM | SOL-GOVERNANCE、SOL-HTTP、SOL-PRIVACY、SOL-SESSION | B-46、D-39、E3-13、E3-31、B-12、C05、E3-04 | README.md，apps/api/src/app.module.ts，apps/api/src/calendar/calendar-watch.controller.ts | 已有來源切片 | #415、#424–#426（文件標註） | W3 | Sonnet（文件） | 文件類外證適用性（隨本計畫第二節決策一併問） |
| SOL-EXPORT | PLANNED_CURRENT_EVIDENCE_SCOPE | HIGH | SOL-CONTRACTS、SOL-RBAC | B-38、D-37、A09、NEW-06 | apps/api/src/business-delivery/business-export.application-service.test.ts，apps/api/src/business-delivery/business-expor… | 已有來源切片 | #328（schemaVersion 准入）、#422（閏年範圍） | W3 | 長跑（gpt-6.1-terra） | 無 |
| SOL-GOVERNANCE | PLANNED_CURRENT_EVIDENCE_SCOPE | HIGH | SOL-PRIVACY | B-18、E1-21、E1-25、E3-11、E3-20 | .claude/hooks/guard-commands.mjs，.claude/hooks/guard-commands.test.mjs，README.md | 已有來源切片 | #412（E1-21） | W3 | Sonnet | 無 |
| SOL-HTML | PLANNED_CURRENT_EVIDENCE_SCOPE | HIGH | SOL-PRIVACY、SOL-RUNTIME-EVIDENCE | B-22、X-C03 | apps/web/csp-policy.mjs，apps/web/public/modules/trusted-html.js，apps/web/src/security-headers.test.ts | 無來源 | 無來源 PR | W3 | 長跑（gpt-6.1-terra） | 無 |
| SOL-HTTP | PLANNED_CURRENT_EVIDENCE_SCOPE | HIGH | SOL-CONTRACTS、SOL-SESSION | K5、A01、A11、NEW-04 | apps/api/src/app.module.ts，apps/api/src/appointments/appointment.controller.ts，apps/api/src/auth/calendar-pilot.guard.ts | DONE-MERGED（已終態） | #245 | — | — | 無 |
| SOL-IAC-LIFECYCLE | PLANNED_CURRENT_EVIDENCE_SCOPE | HIGH | SOL-IAM、SOL-INGRESS | B-10、B-11、B-50、E2-08 | infra/terraform/c1-foundation/main.tf，infra/terraform/c1-foundation/noop.tftest.hcl，infra/terraform/c5-firestore/main.tf | 無來源 | 無來源 PR | W2 | 長跑（gpt-6.1-terra） | Terraform apply 需負責人核准（來源 PR 不需） |
| SOL-IAM | PLANNED_CURRENT_EVIDENCE_SCOPE | HIGH | SOL-INGRESS | B-49、E1-06、E1-24、E2-01、E3-08、E3-09、B-01、B-02、B-09、B-41、E1-12、NEW-10 | docs/README.md，docs/runbooks/cal-pilot-import.md，docs/runbooks/calendar-go-live.md | 已有來源切片 | #388、#392 | W2 | 負責人（IAM 核准）、Haiku（唯讀讀回）、長跑（gpt-6.1-terra） | IAM 變更與讀回窗口（逐批） |
| SOL-IDENTITY | PLANNED_CURRENT_EVIDENCE_SCOPE | HIGH | SOL-CONTRACTS、SOL-SESSION | B-34、D-10、K2、NEW-01 | apps/api/src/appointments/appointment.application-service.ts，apps/api/src/internal-test-booking/internal-test-booking.au… | 已有來源切片 | #389（K2）、#417（B-34） | W3 | 長跑（gpt-6.1-terra） | 無 |
| SOL-INGRESS | PLANNED_CURRENT_EVIDENCE_SCOPE | HIGH | — | K9、E1-04、E1-14、K6、B-03、X-C06 | apps/api/src/internal-test-booking/internal-test-booking.gate.test.ts，apps/api/src/internal-test-booking/internal-test-b… | 已有來源切片 | #385、#390、#391、#416、#437 | W1 | Haiku（唯讀讀回）、負責人（開窗） | 入口驗收窗口 |
| SOL-INTEGRATION | PLANNED_CURRENT_EVIDENCE_SCOPE | HIGH | SOL-ARCH-GATE、SOL-ASSET-BUILD、SOL-BUILD、SOL-BUSINESS、SOL-CALENDAR-CANDIDATE、SOL-CALENDAR-ENVELOPE、SOL-CALENDAR-LEASE、SOL-CALENDAR-RESTORE、SOL-CALENDAR-TESTS、SOL-CALENDAR-WATCH、SOL-CI-IAC、SOL-CI-SECURITY、SOL-CLI、SOL-CONFIG、SOL-CONTAINERS、SOL-CONTRACTS、SOL-DESIGN-GATE、SOL-DOC-GATE、SOL-DOCS、SOL-EXPORT、SOL-GOVERNANCE、SOL-HTML、SOL-HTTP、SOL-IAC-LIFECYCLE、SOL-IAM、SOL-IDENTITY、SOL-INGRESS、SOL-LIFECYCLE、SOL-LIST、SOL-MAINTENANCE、SOL-OBSERVABILITY、SOL-OUTBOX、SOL-PRIVACY、SOL-QUERY-INDEX、SOL-RBAC、SOL-RELEASE、SOL-RETENTION、SOL-RETURN、SOL-ROUTE-INVENTORY、SOL-RUNTIME-EVIDENCE、SOL-SAST、SOL-SCHEDULE、SOL-SECRETS、SOL-SESSION、SOL-SESSION-DOCS、SOL-SESSION-UI、SOL-STRUCTURE-GATE、SOL-SUPPLY、SOL-TTL、SOL-VISUAL-EVIDENCE | D-40、E3-12、E4-02、E4-04、E4-13、E4-01、E4-03、E4-12 | docs/implementation/phase-1-booking-mvp-execution-log.md，docs/plans/2026-09-14-internal-preproduction-remediation-plan.m… | 無來源 | 無來源 PR | W3（最後；上游未結則延後 12 月） | 長跑（gpt-6.1-terra） | 無（凍結前由 Claude 驗收） |
| SOL-LIFECYCLE | PLANNED_CURRENT_EVIDENCE_SCOPE | HIGH | SOL-CONTRACTS | A06、D-09、D-23、E3-15 | docs/product/front-desk-followup-and-patient-ux-spec-2026-07-23.md，packages/contracts/src/payroll.ts，packages/domain/src… | DONE-MERGED（已終態） | #383 | — | — | 無 |
| SOL-LIST | PLANNED_CURRENT_EVIDENCE_SCOPE | MEDIUM | SOL-CONTRACTS、SOL-IDENTITY、SOL-RETURN | K7、C07、E4-24 | apps/api/src/appointments/appointment.application-service.ts，apps/web/public/modules/admin-view.js，docs/architecture/api… | 已有來源切片 | #437（決定）、#448（K7 續讀 cursor） | W3 | 長跑（gpt-6.1-terra） | 無 |
| SOL-MAINTENANCE | PLANNED_CURRENT_EVIDENCE_SCOPE | MEDIUM | — | E3-07 | apps/api/src/platform/runtime/maintenance-gate.ts，docs/runbooks/backup-and-restore.md，docs/runbooks/incident-response.md | 已有來源切片 | #386、#405、#447 | W1 | Haiku（實測）、負責人（開窗） | C1 維護開關實測窗口 |
| SOL-OBSERVABILITY | PLANNED_CURRENT_EVIDENCE_SCOPE | HIGH | SOL-IAC-LIFECYCLE、SOL-IAM | B-25、B-51、D-15、D-27、D-34、A12、B-06、B-07、B-54、D-25 | apps/api/src/health.controller.ts，apps/api/src/platform/errors/api-error.ts，apps/api/src/platform/runtime/api-metrics.ts | 已有來源切片 | #409（B-54） | W3 | 長跑（gpt-6.1-terra） | 無（日誌 sink 目的需負責人決定時再問） |
| SOL-OUTBOX | PLANNED_CURRENT_EVIDENCE_SCOPE | MEDIUM | — | E4-21 | apps/worker/src/outbox-processor.ts | DONE-MERGED（已終態） | #258 | — | — | 無 |
| SOL-PRIVACY | PLANNED_CURRENT_EVIDENCE_SCOPE | HIGH | SOL-CALENDAR-ENVELOPE、SOL-CALENDAR-RESTORE、SOL-IDENTITY | D-14、D-16、D-30、E3-05、B-21、E3-01、E3-02、E3-03、E4-10 | .firebaserc，apps/web/public/privacy.html，apps/worker/README.md | 已有來源切片 | #364、#365 | W3（正式發布 12 月） | 長跑（gpt-6.1-terra）、負責人（文字審閱） | D-001～D-003；告知文字審閱（11/19） |
| SOL-QUERY-INDEX | PLANNED_CURRENT_EVIDENCE_SCOPE | MEDIUM | SOL-CONTRACTS、SOL-EXPORT、SOL-TTL | B-44 | apps/api/src/firestore/business-delivery-export.repository.ts，apps/api/src/firestore/business-delivery.repository.ts，fir… | 已有來源切片 | #414、#427–#432（B-44） | W3 | 長跑（gpt-6.1-terra） | 索引部署需負責人核准（Firestore 索引屬雲端狀態） |
| SOL-RBAC | OWNER_POLICY_PREREQUISITE | HIGH | SOL-CONTRACTS、SOL-SESSION | A04、D-22、E3-17、E4-09 | apps/api/src/platform/authorization/rbac-appointment-policy.ts，apps/api/src/schedule/schedule.application-service.ts，app… | 無來源 | #241、#251（文件） | W1（manifest 同步，RC-02）／W3（實作） | Sonnet（同步）、長跑（gpt-6.1-terra）（實作） | 無（E4-09 已決） |
| SOL-RELEASE | PLANNED_CURRENT_EVIDENCE_SCOPE | HIGH | SOL-IAC-LIFECYCLE、SOL-IAM、SOL-INGRESS | E1-03、E1-05、E1-07、E1-13、E1-01、E1-02、E1-11 | scripts/cal-pilot-build-images.ps1，scripts/cal-pilot-extension-policy.mjs，scripts/cal-pilot-extension-policy.test.mjs | 無來源 | 無來源 PR | W3 | 長跑（gpt-6.1-terra） | 部署相關變更需負責人核准 |
| SOL-RETENTION | PLANNED_CURRENT_EVIDENCE_SCOPE | HIGH | SOL-CONTRACTS | A03、D-36 | apps/api/src/business-delivery/business-retention.application-service.test.ts，apps/api/src/business-delivery/business-re… | ALREADY_FIXED（已終態） | 沿用 #268 對帳留言 6562505748 | — | — | 無 |
| SOL-RETURN | PLANNED_CURRENT_EVIDENCE_SCOPE | HIGH | SOL-CONTRACTS、SOL-IDENTITY、SOL-INGRESS | K4、D-08、E3-19 | apps/api/src/firestore/rate-limit.repository.ts，apps/api/src/patients/patient-directory.ts，apps/api/src/platform/runtime… | 已有來源切片 | #419（自述 K1，已裁定為額外回歸測試） | W3 | 長跑（gpt-6.1-terra） | 無（return_sessions 24 小時已決） |
| SOL-ROUTE-INVENTORY | PLANNED_CURRENT_EVIDENCE_SCOPE | HIGH | SOL-LIST、SOL-RETURN | E1-16、E1-17、E3-10 | docs/architecture/api-v1-contract.md，scripts/booking-route-truth.mjs，scripts/booking-route-truth.test.mjs | 已有來源切片 | #415、#420（E1-16、E1-17） | W3 | 長跑（gpt-6.1-terra） | 無 |
| SOL-RUNTIME-EVIDENCE | PLANNED_CURRENT_EVIDENCE_SCOPE | MEDIUM | SOL-IAM、SOL-PRIVACY | E1-18、E1-26、E2-02、E2-06、E2-10、E4-07 | docs/reviews/ui-visual-cp01-2026-09-29.md，firebase.json，scripts/generate-ci-evidence.mjs | 已有來源切片 | #421、#423（E1-26，分支名的 config 為命名沿用） | W3 | 長跑（gpt-6.1-terra）、Haiku | 無 |
| SOL-SAST | PLANNED_CURRENT_EVIDENCE_SCOPE | HIGH | — | B-14、B-30、B-28 | .github/workflows/sast-scan.yml，security/semgrep/clinic-javascript.js，security/semgrep/clinic-javascript.yml | ALREADY_FIXED（已終態） | 沿用 #268 對帳留言 6562505748 | — | — | 無 |
| SOL-SCHEDULE | PLANNED_CURRENT_EVIDENCE_SCOPE | HIGH | SOL-CONTRACTS、SOL-IDENTITY、SOL-LIFECYCLE、SOL-RBAC、SOL-RETURN、SOL-TTL | B-35、A08、K8、A02、D-07、D-42 | apps/api/src/calendar/calendar-pilot.application-service.test.ts，apps/api/src/firestore/booking.repository.ts，apps/api/s… | 已有來源切片 | #410、#411（D-42） | W3 | 長跑（gpt-6.1-terra） | 排程啟用需負責人核准 |
| SOL-SECRETS | PLANNED_CURRENT_EVIDENCE_SCOPE | HIGH | — | B-29、E1-31、B-13、B-31、B-55 | .claude/settings.json，.gcloudignore，.gitignore | 已有來源切片 | #277、#291、#320、#330（宣告層） | W1 | 負責人（重新登入）、Haiku（canary） | 登入與 canary 窗口 |
| SOL-SESSION | PLANNED_CURRENT_EVIDENCE_SCOPE | HIGH | SOL-CONTRACTS、SOL-INGRESS | K3、E4-14、C02、X-C02、NEW-02、NEW-03、NEW-07、NEW-08 | apps/api/src/appointments/appointment.controller.ts，apps/api/src/auth/calendar-pilot-session.controller.ts，apps/api/src/… | 已有來源切片 | #387、#394、#397–#403、#406 | W2 | Haiku（實測）、負責人（決定） | E4-14 authority；C3 session 窗口 |
| SOL-SESSION-DOCS | PLANNED_CURRENT_EVIDENCE_SCOPE | HIGH | SOL-RBAC、SOL-SESSION | E3-24、E3-35、D-38、E3-06 | docs/architecture/rbac-matrix.md，docs/plans/2026-10-01-cp-08-regression-evidence-worksheet.md，docs/runbooks/cal-pilot-30… | 已有來源切片 | #360 | W3 | Sonnet | 無 |
| SOL-SESSION-UI | PLANNED_CURRENT_EVIDENCE_SCOPE | HIGH | SOL-SESSION | C03、C09、X-C04、X-C05 | apps/web/public/admin-bootstrap.js，apps/web/public/calendar-pilot.css，apps/web/public/index.html | DONE-MERGED（已終態） | #245 | — | — | 無 |
| SOL-STRUCTURE-GATE | PLANNED_CURRENT_EVIDENCE_SCOPE | MEDIUM | — | E1-30 | scripts/check-structure.mjs，scripts/check-structure.test.mjs | DONE-MERGED（已終態） | #254 | — | — | 無 |
| SOL-SUPPLY | PLANNED_CURRENT_EVIDENCE_SCOPE | HIGH | SOL-CI-SECURITY、SOL-CONTRACTS、SOL-OBSERVABILITY | B-19、B-32、B-20、B-42、E1-08、E2-12、B-48、E4-08 | .github/workflows/verify.yml，.npmrc，docs/product/luna-local-project-completion-master-plan.md | 部分／待政策或文件 | #280（最小修補）、#281（決定） | W1（braces，RC-01）／W3（整包） | 長跑（gpt-6.1-terra） | 無（不新增例外） |
| SOL-TTL | OWNER_POLICY_PREREQUISITE | HIGH | SOL-IAC-LIFECYCLE、SOL-IDENTITY、SOL-RETURN、SOL-SESSION | A05、B-04、NEW-05 | apps/api/src/firestore/rate-limit.repository.ts，apps/api/src/internal-test-booking/internal-test-booking.authenticator.t… | 部分／待政策或文件 | #371（A05、B-04、B-52、NEW-05） | W1（manifest 同步，RC-02） | Sonnet | 無（已決） |
| SOL-VISUAL-EVIDENCE | PLANNED_CURRENT_EVIDENCE_SCOPE | MEDIUM | — | E5-01、E5-02、E5-03、E5-04、E5-05、E5-06、E5-07、E5-08、E5-09、E5-10 | — | DONE-MERGED（已終態） | 沿用 #268 對帳留言 6562505748 | — | — | 無 |

## 五、RC 新增包（11）摘要

逐包內容見[細部包](2026-11-08-phase1-rc-packets.md)第三節。

| ID | 名稱 | 目的 | 波次 | 執行者 | 需核准 |
| --- | --- | --- | --- | --- | --- |
| RC-01 | 供應鏈 braces | 移除 braces 例外，firebase-tools 升 15.35.0。 | W1 | Claude（PR #453） | 無（Claude 驗收後合併） |
| RC-02 | manifest 與台帳同步 | 把 manifest 狀態與歸屬裁定同步，並讓本檔取代 #268 承載台帳。 | W1 | Sonnet | 關閉 #268 需負責人同意；manifest 是機器權威，修改前先向負責人說明 |
| RC-03 | 公開 repo 隱私收尾 | 清掉公開 repo 的個資疑慮。 | W1 | Haiku（掃描）、負責人（補同意） | 負責人補照片同意紀錄 |
| RC-04 | 分支保護定期讀回 | 用腳本定期讀回 main 分支保護，不手寫現況。 | W2 | Sonnet | 新增 workflow 屬 CI 變更，先向負責人說明 |
| RC-05 | Terraform 流量跟隨最新 revision | apply 後流量自動到最新 revision。 | W1 | Sonnet（寫） | Terraform apply 需負責人逐批核准 |
| RC-06 | C1 員工端第二窗口 | 補完 C1 員工端流程的未測項目。 | W1 | Haiku（實測）、負責人（開窗） | 開窗；observed_since |
| RC-07 | 日曆 Gate 2 | 專用測試日曆續期與真實日曆實測。 | W1–W2 | Haiku、負責人 | 續期；真實日曆寫入；延期決定 |
| RC-08 | 程式可維護性量測 | 建立量測基準，不擋 PR。 | W3（量測）／12 月（切分） | Sonnet | CI 變更先向負責人說明 |
| RC-09 | 文件入口整理 | 讓本計畫成為唯一現行入口。 | W3 | Sonnet | 無 |
| RC-10 | 長跑重啟與分工 | 11/9 重啟長跑並確立分工。 | W1 | Claude、長跑（gpt-6.1-terra） | 無 |
| RC-11 | 專案治理 | 把負責人的合併授權與角色分工落檔，並建立每週治理讀回。 | W1 | Sonnet（寫）、負責人（審） | 屬治理規則變更（邏輯變更），合併前必須先給負責人看 |

## 六、執行規則

- 實作交子代理：Sonnet 寫程式、Haiku 唯讀與實測；Claude 判斷與驗收；長跑（gpt-6.1-terra）照波次取包。
- 合併：CI 綠燈、驗收過由 Claude 合併；有邏輯變更先向負責人說明。
- 部署、雲端狀態、IAM、金鑰、業務決定、C1～C6：每批由負責人明確同意，核准不延伸到未列項目。
- 不得以合成、Emulator、預覽站或文件冒充正式環境證據。
- 電腦資源有限：本機只跑相關少數測試，完整測試以 exact-head CI 為準。

## 七、計畫檔現行／歷史對照

依 2026-11-08 對 `docs/plans/` 28 個檔的盤點（只依檔頭狀態與明文取代字樣；不改歷史檔內容）。

| # | 檔名 | 主旨 | 判斷 |
| --- | --- | --- | --- |
| 1 | 2026-09-14-agent-tooling-adoption.md | Agent 工具導入評估與計畫 | 歷史 |
| 2 | 2026-09-14-internal-preproduction-remediation-plan.md | INTERNAL_PREPRODUCTION 補強施工計畫（獨立稽核） | 歷史 |
| 3 | 2026-09-17-phase1-completion-packets.md | Phase 1 完成封包（plan-only，M11/M12 等） | 歷史 |
| 4 | 2026-09-18-business-delivery-follow-up.md | 正式交付與商務需求的後續程式規劃 | 部分現行、部分歷史 |
| 5 | 2026-09-22-current-project-acceptance-master-plan.md | 現有診所專案完整驗收主計畫 | 現行 |
| 6 | 2026-09-22-current-project-acceptance-matrix.md | 現有專案驗收矩陣與證據格式 | 現行 |
| 7 | 2026-09-22-current-project-execution-packets.md | 現有專案逐包執行計畫（Luna-ready） | 現行 |
| 8 | 2026-09-22-current-project-pr-history.md | PR #1～#161 全歷史與有效性 | 歷史 |
| 9 | 2026-09-22-p1-09-operator-packet.md | P1-09 C1 有界操作與關帳 packet | 歷史 |
| 10 | 2026-09-27-p1-09-closeout-quota-approval.md | P1-09 關帳追加額度核准 | 歷史 |
| 11 | 2026-09-28-cp-02-c1-runtime-approval.md | CP-02 C1 新預約驗收核准 | 歷史 |
| 12 | 2026-09-30-luna-execution-plan.md | GPT-6 Luna 逐步執行計畫 | 歷史 |
| 13 | 2026-10-01-c1-batch-deployment-packet.md | C1 商務交付批次部署 packet | 現行 |
| 14 | 2026-10-01-cp-08-regression-evidence-worksheet.md | CP-08 全系統回歸證據 worksheet | 現行 |
| 15 | 2026-10-01-cp-10-current-project-acceptance-checklist.md | CP-10 現有專案業主驗收清單 | 現行 |
| 16 | 2026-10-05-audit-followup-luna-plan.md | 外部稽核後續逐步計畫（Luna） | 待確認 |
| 17 | 2026-10-05-audit-gap-sol-luna-execution-plan.md | 稽核漏網複核與 Sol／Luna 執行圖補充 | 歷史（疑似已被取代，待確認） |
| 18 | 2026-10-06-sol00-finding-manifest.md | SOL-00 254 ID current-evidence 索引（v3） | 現行 |
| 19 | 2026-10-06-sol00-safe-manifest-closeout-plan.md | SOL-00 current-evidence planning closeout | 現行 |
| 20 | 2026-10-06-sol00-safe-manifest.json | SOL-00 safe manifest（機器權威） | 現行 |
| 21 | 2026-10-18-sol-luna-autorun-prompts.md | Sol／Luna 一路跑完：設定與提示詞 | 待確認 |
| 22 | 2026-10-22-sol-business-adjustment-design.md | SOL-BUSINESS 可追溯試用調整模型提案 | 現行 |
| 23 | 2026-10-22-sol-calendar-lease-coordination.md | SOL-CALENDAR-LEASE 協調設計候選 | 現行 |
| 24 | 2026-10-25-external-acceptance-runsheet.md | Sol v2 外部驗收測試單 | 現行 |
| 25 | 2026-10-25-utc-caller-matrix.json | UTC caller 矩陣（參考盤點） | 現行 |
| 26 | 2026-10-30-sol-notification-design.md | SOL-NOTIFICATION publisher 範圍與 consumer 路徑提案 | 現行 |
| 27 | 2026-11-02-sol-maintenance-source-control.md | E3-07 共用停寫來源候選 | 現行 |
| 28 | verified-staging-execution-plan-v1.3-frozen.md | VERIFIED STAGING 執行計畫 v1.3 凍結版 | 歷史 |

`2026-11-08-phase1-rc-*` 兩份為新增現行。#23 的 Gate 2 敘述（檔頭與 :17、:176）不一致，待負責人釐清。

## 八、12 月正式上線草案（不排日期）

| 項目 | 前置條件 |
| --- | --- |
| 真實病患資料 | D-001～D-003、D-010 核准；Stage 4 實作證據；法律／隱私審查完成 |
| 正式隱私政策發布 | D-003 全文核准與審查；官網 PUB-03 實機接受 |
| 公開預約寫入 | D-004、D-005、D-011 正式核准；public API 與身分流程 |
| 備份還原、區域故障 | D-002 備份語意；實際還原一次並比對 |
| 負載、事故演練、人工無障礙 | RC 凍結後以同一 candidate 執行 |
| 五方簽核 | clinic、privacy、security、operations、technical 對同一 RC 共同決定 |
| 程式切分（RC-08） | Gate 2 結束；先補回歸 |
| 其餘 CP-10 12 月項目 | 見第一節表 |

## 九、台帳現況（更新日 2026-11-09）

本節取代 #268 本文；#268 已於 2026-11-08 關閉。以下分別記已合併來源切片與尚在審查的 PR；CI 或來源文件不等於雲端／provider 實測、整包完成或操作授權。

### 第一批：2026-11-09 已合併

| 包 | PR 與 repo 來源切片 | 剩餘範圍 |
| --- | --- | --- |
| RC-02 | #454：manifest 兩項政策狀態及 finding 歸屬對帳 | 不代表相關實作或整包完成；本節為後續台帳 |
| RC-11 | #455：決定記錄、角色分工提案及每週讀回清單 | 每週實際讀回及適用的後續審閱仍須執行 |
| SOL-MAINTENANCE | #456：驗收單反映 #447 的來源入口接線 | 實際 store、跨程序、全 writer、排空與恢復外證未完成；雲端窗口待負責人 |
| RC-07 | #457：續期邊界與拒絕測試；#450 已提供續期來源 | 尚未實際續期、50 次試跑或 staging／雲端呼叫；窗口待負責人 |
| SOL-INGRESS | #458：合成轉送位址正反例 | 同桶與 handler／writer 安全觀測、兩入口外證尚缺；窗口待負責人 |
| SOL-SECRETS | #459：排除宣告測試 | 逐工具讀前拒絕、零外送與 upload-list 外證尚缺；窗口待負責人 |

### 第二批：2026-11-09 已合併

| 包 | PR 與來源範圍 | 尚未完成 |
| --- | --- | --- |
| CI 修補 | #460：固定 Gitleaks 下載有限次重試 | 未實際模擬 504 後恢復 |
| SOL-CALENDAR-LEASE | #461：合成來源證據索引 | 真實 runtime 接入範圍待釐清，續期、寫入與 Gate 2 窗口待負責人；先前 Draft 首輪 504 為歷史紀錄 |
| SOL-CALENDAR-ENVELOPE | #462：既有 inbound 拆批整數邊界測試 | 只屬來源切片；byte／time 與 provider 外證未完成，窗口待負責人 |
| SOL-IAC-LIFECYCLE | #463：B-10 占位目標拒絕及 mock 測試 | B-11、B-50、E2-08 與其他來源前置仍待處理；真實狀態 plan／apply 未執行且須逐次核准 |
| 台帳 | #464：本節記錄第一、二批來源切片與缺口 | 後續狀態由台帳負責人持續更新 |

### 第三批 A：來源切片審查中

| 包 | PR 與來源範圍 | 尚未完成 |
| --- | --- | --- |
| SOL-CALENDAR-CANDIDATE | #465：未授權拒絕不進入任一路徑 | 不同患者比對、SCHEDULE 依賴與 IAM／SESSION 外證 |
| SOL-CALENDAR-RESTORE | #466：既存衝突 link 不符不得 PATCH | cancelled 還原／read-back、smoke 唯一識別及其他 finding；真實日曆演練屬 12 月 |
| SOL-CALENDAR-TESTS | #467：合成非建檔時無關患者文件不變 | 獨跑、整套、反序與最終 RC 凍結 head 證據 |
| SOL-CI-IAC | #468：mock runner 中途 init 失敗即停 | 未改 workflow 或 gate；受保護部分及外部依賴仍未完成 |
| SOL-CLI | #469：合成 PATH 的明確 PATHEXT 正反例 | 其餘 CLI 入口／參數與依賴證據 |
| SOL-CONFIG | #470：未知值遮蔽與輸入不變 | 雙向 inventory、其他 consumer 與 IAC-LIFECYCLE 依賴 |
| SOL-EXPORT | #471：合成 CSV 引號與換行轉義 | 資源上限、交付額度、RBAC 及 RC-06 實測 |
| SOL-GOVERNANCE | #472：waiver 缺 owner／approver／evidence 的拒絕測試 | 其他 waiver 案例、B-18、文件對帳及 PRIVACY 依賴；不宣稱遠端讀回 |
| 台帳 | #473：本節更新第二批及第三批 A | 待審查，後續狀態以遠端讀回為準 |

上列第三批均為 PR 來源切片，不代表已合併、整包完成或雲端實測；實際 PR、CI 狀態以遠端 exact head 為準。

歷史基準：2026-11-07 main `63e59c94` 時，59 包中 25 包為台帳終態，另 34 包未整包完成；該快照不是目前重新盤點的數字。2026-11-08 已合併 #451（RC-03）。各包細節及依賴見第四節與細部包；外部證據仍以 IAM 與 SESSION 為主要依賴。
