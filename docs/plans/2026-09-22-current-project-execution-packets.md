# 現有專案逐包執行計畫（Luna-ready）

狀態：PLAN_ONLY；此文件定義後續工作，不是雲端、資料刪除或正式文件編輯授權。
基線與順序見[主計畫](2026-09-22-current-project-acceptance-master-plan.md)。
每包皆有 24 個 PR 欄位、最小讀取集、操作順序、停損及可直接交辦 prompt。
SOURCE PR 和 RUNTIME EVIDENCE PR 可以有同一 CP 的後綴 S/E；沒有後者不能把 BD 標完成。

## 共用執行規則

- 開始只讀 AGENTS.md、CLAUDE.md、本包、被引用的政策段落；定位先 rg/rg --files。不要掃真資料、.env、credential cache 或所有歷史附件。
- fresh fetch origin/main、核對 current HEAD/dirty tree；獨立 branch/worktree。不覆蓋他人變更，不 force push main，不自動 merge。
- 以 source、test、CI、runtime、cloud、human 六層回報；「合併」只證明 source。缺資料填 UNKNOWN/NOT_PROVEN，不編造。
- source功能需另獲本包施工委派；此規劃PR本身不自動派發全部實作。owner已決產品答案不可重問。
- 雲端/正式Drive/不可逆操作前，新 exact-SHA、資源、開始/截止時間、mutation budget、rollback 必須具明確核准；舊「最高授權」不續期。
- domain輸出重用六個 business-delivery 模組。新檔案/collection/route 標 PROPOSED，實作時用 ADR/API contract 固定後再建，不能把本計畫名字當既有工具。
- 簡單測試/索引/文件核對可派 Luna xhigh。主代理負責 identity collision、政策、IAM/full plan、irreversible scope與gate判定。代理共享的測試狀態必須隔離。
- 首次必要 assertion FAIL 停該sequence。先交故障證據，再另source fix與新授權，不自動加流量或無界重試。
- 公開PR不得帶原始HTTP headers、cookie/token/CSRF/TOTP、UID/email/病患值、secret payload、私有Drive IDs或完整商務文件。

## 驗證命令集

下列均在該PR repository root；先確認 Node/pnpm符合 package.json、node_modules 存在。
安裝是明確環境準備，不能隱藏在驗證指令裡；不用舊Node忽略engine。

~~~powershell
# G0 — 每包最低門檻（docs-only亦適用）
corepack pnpm run check:docs
corepack pnpm run check:governance
corepack pnpm run check:structure
corepack pnpm run check:format
corepack pnpm run check:lint

# G1 — source包；先窄測試再全verify
corepack pnpm exec vitest run packages/domain/src/patient-identity.test.ts apps/api/src/patients/patient-directory.test.ts apps/api/src/appointments/appointment.patient-flow.test.ts
corepack pnpm exec vitest run packages/domain/src/business-delivery.test.ts packages/domain/src/business-delivery-export.test.ts packages/domain/src/business-delivery-retention.test.ts packages/domain/src/business-delivery-reporting.test.ts packages/domain/src/business-delivery-termination.test.ts packages/domain/src/business-delivery-backup.test.ts
corepack pnpm run verify

# G3 — Firestore schema/rules/transaction；依既有測試分組
corepack pnpm run test:rules
corepack pnpm run test:e2e
~~~

G2 = exact-head GitHub Actions 的完整 required matrix + Verification evidence。
先依 repo verify-gates skill 判定本地資源；不能執行的本地重測列 NOT_RUN/UNAVAILABLE 和原因，
由 exact-commit CI 取代場地，不弱化門檻。未改 source 的 evidence PR 不需假造 runtime rerun。

## 共用 R-DEPLOY（CP-03/04/05/07 每包 S→E 必經）

1. S PR 合併且其 source exact CI PASS；fresh main與已核准SHA不同即停，不把別包新schema夾帶部署。
2. 另出 C1 packet：API/web/worker變更清單、必要新storage/IAM/index、所有mutation及synthetic test數量、start/end、rollback。沒有新resource也需部署授權。
3. 有核准才build/push immutable artifacts；完整 reviewed Terraform/Hosting diff，拒絕無關changes。
4. readback source labels/digests/DB/secret pins/schedulers/Hosting；新endpoint權限failclosed。
5. 只跑本包矩陣列的synthetic positive+negative+partial failure/retry，計入所有client重試，budget有界。
6. API/UI同source，存去識別 evidence；必要assertion失敗停，不順手修source。
7. 成功開E evidence PR回填矩陣；SOURCE merged與RUNTIME PROVEN分列。新部署影響共用auth/booking則重跑相依行。
8. CP-06是真Google recovery，另用其演練資源授權，不能套一般deploy授權去restore。

## 每包交付 packet（固定格式）

### BD runtime 接線藍圖（全部 PROPOSED，不是既有入口）

CP-03 首包建立 apps/api/src/business-delivery/business-delivery.module.ts，後續包在同 module 擴充，
不要每包另建一套身分或 client。入口搭配現有 staff session / accountActive / CSRF / rate limiter /
durable denial audit；新 BD 動作角色只讀 CP-POLICY 映射，未給 policy 或功能 disabled 時 fail closed。
PROPOSED env BUSINESS_DELIVERY_ENABLED 預設 false，production 不因 C1 merge 自動啟用。
scopeId 由可信環境/session決定，不接受 client 任意指診所、Firestore path或storage object。

新增檔案與責任（各包只建自己使用到的部分）：

- packages/contracts/src/business-delivery.ts：strict requests/responses，不把 domain proof 暴露給 client 自填。
- apps/api/src/business-delivery/{usage,milestones,exports,retention,termination}.controller.ts：解析、guard、呼叫 application service，無直接 Firestore 寫入。
- 同目錄對應 .application-service.ts：組合既有 domain 函式、trusted receipts、transaction與safe failure；旁放 .test.ts。
- apps/api/src/firestore/business-delivery.repository.ts：versioned records、idempotency、atomic event append、checkpoint；.emulator.test.ts 驗並行/部分失敗。
- apps/web/public/modules/business-delivery-client.js / business-delivery-view.js：沿用 API client/session；在既有 staff shell 加核准入口，不建公開管理頁。
- tests/e2e/business-delivery.spec.ts：依角色及已啟用包分群；disabled policy 不能觸發 fake success。

本表是待實作的固定路由草案；若與 fresh contract 衝突，先在 source PR ADR 記錄差異，不默默另創 route。

| 包 | PROPOSED HTTP route | 最小 request / response 與守門 |
| --- | --- | --- |
| CP-03 | GET /v1/business-delivery/monthly-usage?month=YYYY-MM | 只收 month；回 counts、coverage、classification、policyVersion、revision，不回 individual events/PII |
| CP-03 | GET /v1/business-delivery/milestones | 回計算日期、status、evidenceRefs、revision；沒有真實營運月不可自動滿足 |
| CP-03 | POST /v1/business-delivery/milestones/:id/acknowledgements | evidenceRef、expectedVersion、idempotencyKey；人/時間由 server，必要 fresh reauth |
| CP-04 | POST /v1/business-delivery/exports | format、requestedFields、from/to、idempotencyKey；server核准scope/allowlist/reauth後回jobId/status |
| CP-04 | GET /v1/business-delivery/exports/:id | status/expiry/checksum/安全錯誤分類；不提供任意objectlocator |
| CP-04 | GET /v1/business-delivery/exports/:id/download | 每次重驗scope/角色/到期，ready才串流；不可因取得jobId繞驗權 |
| CP-04 | POST /v1/business-delivery/exports/:id/revoke | expectedVersion、idempotencyKey；立即禁止後續下載，清理結果另列 |
| CP-05 | POST /v1/business-delivery/retention/previews | action、opaque recordRefs、idempotencyKey；bounded IDs，不支援全庫；回previewId/hash/count/eligible/blocked |
| CP-05 | POST /v1/business-delivery/retention/:previewId/confirm | previewHash、expectedVersion、idempotencyKey；重查policy/hold/reauth；回operationId/各層status |
| CP-05 | GET /v1/business-delivery/retention/:operationId | 各層completed/retained/pending/failed；不讓client自己回報已刪除 |
| CP-07 | POST /v1/business-delivery/terminations | approved scope/evidenceRefs、idempotencyKey；server建立synthetic case；不自動停用服務 |
| CP-07 | GET /v1/business-delivery/terminations/:id | checklist、missing evidence、各層status、revision |
| CP-07 | POST /v1/business-delivery/terminations/:id/acknowledgements | receiptKind、artifactRef、expectedVersion、idempotencyKey；綁artifact hash及操作人 |
| CP-07 | POST /v1/business-delivery/terminations/:id/close | expectedVersion、idempotencyKey；所有domain requiredfacts由server取，不收complete=true |

共用 records 至少含 schemaVersion、scopeId、policyVersion、createdAt/updatedAt（server UTC）、
revision、opaque requestId、status、safe evidenceRefs；dates與requestId皆有schema邊界，無自由metadata袋。
PROPOSED collections 使用 bd_usage_events / bd_monthly_reports / bd_milestones / bd_export_jobs /
bd_retention_operations / bd_termination_cases；client rules deny direct reads/writes，API repository做授權。
artifact bytes在已准storage，不塞audit。以 scope＋requestId 定位idempotency，異payload conflict；
相同payload返回原operation，不重播side effect。query需要index才在該sourcePR加最小index並測，雲端apply另准。

CP-04 保留契約 csv/xlsx；目前只有 CSV renderer。若既定交付需兩格式，source PR補 XLSX adapter、
欄位白名單/公式注入/中文可讀測試與同級runtime下載證據，不能把csv換副檔名成xlsx；
若policy明定本期只CSV，需記錄範圍並明確拒絕xlsx，不默默忽略既有format契約。

### 完成回報

~~~text
PACKAGE_ID =
BASE_SHA =
HEAD_SHA =
PR_URL =
FILES_CHANGED =
POLICY_VERSION =
TEST_COUNTS =
CI_RUN_AND_SHA =
RUNTIME_SOURCE_AND_DIGESTS =
AUTHORITY_WINDOW = NONE | exact reference and UTC start/end
EVIDENCE_ROWS =
CLOUD_MUTATIONS = NONE | approved list with actual results
HUMAN_EVIDENCE = NOT_PROVEN | evidence reference
FAILURES_AND_REMAINING =
ROLLBACK_STATE =
PACKAGE_STATUS = PLANNED | SOURCE_COMPLETE | RUNTIME_PROVEN | BLOCKED | FAIL
NEXT_PACKAGE_AND_PRECONDITIONS =
~~~

## CP-00 — P1-09 runtime 與關帳

| # | PR 欄位 | 本包定義 |
| --- | --- | --- |
| 1 | PR NAME | docs: close P1-09 with bounded C1 runtime evidence |
| 2 | GOAL | 完成既有 P1-09；只在所有必要證據齊全時關帳 |
| 3 | WHY NEEDED | main #159–161 與已部署 4f31b00 不一致，candidate／429 未證明 |
| 4 | PRECONDITIONS | 本包新 SHA/期限/完整 mutation 核准；19 gates 全部通過；舊 gate 不沿用 |
| 5 | FILES / MODULES | operator packet 的 FILES_TO_READ；新增 dated docs/reviews 關帳紀錄與 docs/README |
| 6 | DOMAIN IMPACT | 不改 domain |
| 7 | API IMPACT | 部署既有 #159–161，不加功能 |
| 8 | WEB IMPACT | 只切 isolated preview 的 API target |
| 9 | FIRESTORE IMPACT | 經核准的 config、合成候選／audit/outbox／limiter；不碰真資料 |
| 10 | CALENDAR IMPACT | 唯一核准 synthetic Calendar；修改→待審→拒絕→恢復 |
| 11 | INFRA IMPACT | 兩階 Terraform、image push、secret、ACL、Hosting；完整 diff |
| 12 | SECURITY IMPACT | 精確身分與 secret pin；inbound PAUSED；20 次總上限 |
| 13 | DATA MIGRATION IMPACT | 無一般 migration；只有核准合成 fixture |
| 14 | BACKWARD COMPATIBILITY | 舊 API/worker/Hosting rollback 可用且實際讀回 |
| 15 | TESTS | operator 19 gates；candidate replay；429 durable identity；strict F matrix |
| 16 | CI GATES | G0 + G2；runtime 所用 source 的 CI 必須 PASS |
| 17 | RUNTIME EVIDENCE | P09-01～14、部署圖、Firestore/Calendar/audit/monitoring 可攜索引 |
| 18 | HUMAN EVIDENCE | P1-06 收件對應 incident；必要 UI 動作／TOTP 由已獲授權操作方式 |
| 19 | CLOUD MUTATION | YES：執行階段；此規劃 PR 為 NO |
| 20 | OWNER AUTHORITY REQUIRED | YES：新 exact-SHA C1 packet，明列 UTC start/end 及 gate renewal |
| 21 | ROLLBACK | 依 operator 回退分項表；不得整份 terraform destroy |
| 22 | STOP CONDITIONS | 任何範圍／期限／SHA／plan／rollback 漂移，必要 assertion 首次失敗 |
| 23 | ACCEPTANCE | P1_09=PASS 且舊 evaluator + strict Stage F 同時 PASS 才提交 closeout |
| 24 | WHAT THIS PR MUST NOT DO | 不接 booking 新欄位、不做 BD/AWS/官網、不宣稱 production |

### 執行步驟與交辦內容

1. 只讀主計畫與 operator packet；依其第 0～18 gate 執行，不以本表取代操作書。
2. 沒有新雲端核准時，只完成唯讀預檢及待核准差異清單；狀態 WAITING_AUTHORITY，不執行。
3. 執行完成後，把私有原始證據、去識別摘要、SHA/digest/UTC 建立可攜對照；所有聲稱都指向檔案。
4. 只提交關帳文件 PR；若 assertion 失敗則提交可審 failure handoff，不寫 PASS，不順便修 source。
5. CP-01 的依賴是這包真正 PASS，不是「source 已合併」或「已開 evidence PR」。

交接 prompt：只執行 CP-00。先驗證授權及 19 gates；缺授權只準備。不得直接開始下一包。

## CP-01 — BOOKING-DATA-MINIMIZATION source

| # | PR 欄位 | 本包定義 |
| --- | --- | --- |
| 1 | PR NAME | feat: minimize new booking data without replacement identity factors |
| 2 | GOAL | 生日只月日、國籍本國/外國、移除指定欄位整條新寫入鏈 |
| 3 | WHY NEEDED | 當前 UI/schema/legacy identity 與 owner 新需求不一致 |
| 4 | PRECONDITIONS | CP-00 PASS；fresh main；產品決定已定；任何真資料 repair 另准 |
| 5 | FILES / MODULES | R1 檔案集（下表）；新增/更新合約與 fixtures；由 rg 定位，不掃全 repo |
| 6 | DOMAIN IMPACT | 新 intake 身分不依賴 ID/passport/year；historical DTO 隔離 |
| 7 | API IMPACT | strict 新 write schema；return lookup 改 phone+MM-DD；成功 response 不洩漏 DOB |
| 8 | WEB IMPACT | 月/日、二國籍；移除 ID/passport/source/referrer/NHI 意向；保留到診事實功能 |
| 9 | FIRESTORE IMPACT | 新 lookup schema 需可表達 ambiguity；舊 hash-only 不可反推 |
| 10 | CALENDAR IMPACT | 投影仍最小白名單，不新增生日/國籍/證件到 Calendar |
| 11 | INFRA IMPACT | NO；必要 index/rules source 隨 PR，實際 apply 另准 |
| 12 | SECURITY IMPACT | 電話+月日辨識力降低；不唯一 fail closed；不得增加回診額外輸入 |
| 13 | DATA MIGRATION IMPACT | 不做 mass rewrite；相容 alias 只用有合法來源資料；repair 另作 reviewed dry-run |
| 14 | BACKWARD COMPATIBILITY | 舊 full-DOB/證件記錄只讀相容，不能由新 payload 回填；API/UI coherent release |
| 15 | TESTS | R1 targeted；collision/race/legacy/cancel/duplicate/privacy；E2E 雙 flow |
| 16 | CI GATES | G0 + G1 + G3（修改 rules/index 時）；G2 |
| 17 | RUNTIME EVIDENCE | 本 PR 僅 SOURCE；CP-02 提供 BKG-01～12 |
| 18 | HUMAN EVIDENCE | 業主確認既定畫面與碰撞風險，不再詢問是否加替代 factor |
| 19 | CLOUD MUTATION | NO |
| 20 | OWNER AUTHORITY REQUIRED | YES：引用 BOOKING-MINIMIZATION-2026-09-22 已給定產品決定，不重問替代欄位；施工依當包委派，歷史修復/部署另准 |
| 21 | ROLLBACK | 回退 source；新 schema 以 additive compatibility 保留；舊 binary 不可誤讀新 index |
| 22 | STOP CONDITIONS | 需要猜年份、不能證明 identity uniqueness、刪除歷史或擴大產品要求 |
| 23 | ACCEPTANCE | 新資料鏈零收集被刪欄位；舊記錄不誤連；負向／並行測試全綠 |
| 24 | WHAT THIS PR MUST NOT DO | 不加 OTP/查詢碼/問題/證件；不批次改舊病患；不部署 |

### 執行步驟與交辦內容

R1 / FILES_TO_READ（需要對應層時才讀）：

- packages/domain/src/patient-identity.ts 及 .test.ts：normalisePatientIdentity、patientIdentityIssues、birthDateHasYear、patientIdentityKey。
- packages/contracts/src/appointments.ts；apps/api/src/patients/patient-directory.ts 及 .test.ts。
- apps/api/src/appointments/appointment.application-service.ts、appointment.patient-flow.test.ts、appointment.rate-limit-and-denial.test.ts。
- apps/web/public/patient.html、patient-app.js；modules/internal-test-booking-transport.js、patient-registry.js、appointment-domain.js、admin-view.js（modules 均在 apps/web/public/ 下）。
- 以 rg 搜尋 tests/e2e 中 birthDate、nationalId、passportNumber、hasNhiCard、sourceTags、referrerName、return lookup，只讀命中的測試。
- docs/architecture/api-v1-contract.md、docs/adr/0005-patient-intake-and-appointment-command-are-separate.md，以及 decision register 的 BOOKING-MINIMIZATION-2026-09-22；不得創造另一份平行 Canon。

執行順序：

1. 先寫資料流 inventory：每欄在 UI/state/types/transport/contract/domain/persistence/index/audit/export/report/fixtures 的舊用途及新處置。C1 不存 raw field 不能誤寫「刪除 Firestore 該欄」；legacy local state 有存則要堵新寫入。
2. 定義唯一新 canonical birthDate 為 --MM-DD；驗證 02-29 可用，拒絕 02-30/00/13；不產生虛構年份。新 public write/lookup 不接受 YYYY-MM-DD。舊 internal compatibility parser 不對外開放。
3. 拆新 intake 與 historical record types；明確改 patientIdentityIssues 的「至少一種證件」要求及 normalisePatientIdentity 呼叫鏈，否則新 schema 通過仍會被 domain 拒絕。新 strict schema 對移除欄位 reject，不 silent-accept 存入任意 metadata。刪除表單取值、暫存、mapper、validation、submit body，非只 hidden。
4. 明確設計 versioned lookup index（建議 v2 namespace；名稱待本 PR ADR 固定，不宣稱已存在）。保留 v1。既有姓名只能發現 conflict 並拒絕，不能作 positive match、選出或合併 patient；不能成為新增回診驗證因子。電話＋月日是 owner 已選查詢條件，索引唯一不等於已證明自然人唯一，殘餘共用電話風險須明示。
5. 決策表分三種 operation：new create 在 v2 無候選時建立新 patient lineage，不冒連未知 legacy；既有唯一可信 lineage 只按既定 phone＋月日關係重用，姓名不得促成合併，發現 conflict 就拒絕。return lookup 只有唯一可用 lineage 且 follow-up 條件成立才發 session；0、多候選、hash-only 不可映射都使用同一 public denial surface（HTTP/code/message），無摘要。legacy alias 只從合法 server 已持有來源建立。交易中鎖定索引，禁止 concurrent create 覆蓋成單人或遺失 ambiguity。
6. 只有合法已持有原值才能建相容 alias；只剩舊 hash 的 row 留原狀、計入 incompatible count，不枚舉年份、不合併、不刪。不能用使用者這次輸入「推定就是舊人」。合成建立可觀察的舊、新、重複、未知四種 fixture。
7. 檢查 cancel/reschedule/duplicate/idempotency key 與 return-session：成功查得身分後仍用原 patientId/appointment lineage；查詢 body 改變不繞過 durable rate limit；generic denial 不洩漏候選數或 PII。
8. 更新 localStorage 新草稿與舊草稿讀取邊界：不把 legacy 敏感欄位偷偷重送。曖昧 draft fail closed，明確提示重新填允許欄位，不清掉全部使用者資料。
9. 新 intake 的 PROPOSED wire 欄位 nationality，enum domestic/foreign，UI 恰本國/外國；CP-01 ADR 固定此技術映射。只作 appointment intake metadata，不進 patientIdentityKey、lookup、碰撞選人、月報或 Calendar；audit 不放值，export 預設排除，除非 owner allowlist 明准。same-day procedure request 與國籍分開，未授權不刪其他臨床功能。移除的是新 public intake 的 source/referrer/hasNhiCard；歷史 staff facts 的來源讀取及到診 nhiCardMissing 不刪，也不能回填新 intake。
10. 更新測試/文件、sync:domain 後檢查生成物；同一 PR coherent API+UI 合併，禁止中間版本要求不存在欄位。按 G1/G3/G2。
11. 提交 source PR，提供 breaking payload 與 rollback compatibility 說明。實際 runtime 交 CP-02。

必測：可用舊合法 alias、hash-only 不可修、共用電話同月日異名、同名同月日仍無證據不得猜、並行寫 collision、閏日、舊取消/改約、duplicate replay、被移除欄位注入、audit/log/Calendar 沒有敏感 fixture。

交接 prompt：依 CP-01 實作完整資料鏈；不改 owner 欄位決定。任何身分無法唯一安全連結就 fail closed；不讀真資料、不做雲端 repair。

## CP-02 — 新預約 runtime / 相容驗收

| # | PR 欄位 | 本包定義 |
| --- | --- | --- |
| 1 | PR NAME | docs: verify minimized booking and safe return lookup on C1 |
| 2 | GOAL | 證明新 API 與實際 UI 同源，既定欄位及回診在 C1 可用 |
| 3 | WHY NEEDED | unit/E2E/local transport 不等於已部署 backend |
| 4 | PRECONDITIONS | CP-01 merged exact CI；獨立 C1 部署/測試期限、fixtures、數量核准 |
| 5 | FILES / MODULES | CP-01 source diff；現有 preview/deploy runbook；新增 dated runtime evidence |
| 6 | DOMAIN IMPACT | 無新增 domain |
| 7 | API IMPACT | 部署 CP-01 API；不修功能 |
| 8 | WEB IMPACT | 部署對應 web 至 isolated preview |
| 9 | FIRESTORE IMPACT | 僅核准合成 fixtures、transactions、sessions/index；非歷史真資料 migration |
| 10 | CALENDAR IMPACT | 合成 projection 單事件，無 raw removed field |
| 11 | INFRA IMPACT | 既有 C1 image/Hosting deployment，完整 reviewed diff |
| 12 | SECURITY IMPACT | 禁止 expired gate、真 PII；新 lookup collision fail closed |
| 13 | DATA MIGRATION IMPACT | NO mass migration；測試可恢復 synthetic fixture |
| 14 | BACKWARD COMPATIBILITY | 舊 v1、可合法映射 v2、不可映射三組分別驗證 |
| 15 | TESTS | BKG-01～12；RBAC/CSRF/logout 最小回歸 |
| 16 | CI GATES | G0 + G2；source 完整 G1 證據 |
| 17 | RUNTIME EVIDENCE | UI network + Firestore index/appointment + denied audit + Calendar/readback |
| 18 | HUMAN EVIDENCE | 業主/操作人核對月日、二國籍與無多收欄位 |
| 19 | CLOUD MUTATION | YES：另行 exact-SHA C1 授權 |
| 20 | OWNER AUTHORITY REQUIRED | YES |
| 21 | ROLLBACK | 讀回已知好 source/digest/tag；保留 schema compatibility；不刪共用資料 |
| 22 | STOP CONDITIONS | 出現 他人摘要、不可證明病患對應、跨環境、失敗即停 |
| 23 | ACCEPTANCE | 所有 BKG rows PROVEN；不唯一確實拒絕且不生成 session |
| 24 | WHAT THIS PR MUST NOT DO | 不藉測試修 source、不改 BD、不重開 production |

### 執行步驟與交辦內容

1. 記錄 fresh source、image digests、preview release 與 authority expiry；完整檢查部署 diff。
2. 同一 preview 走首次預約→Workbench 檢視→回診查詢→回診預約→允許的取消/改約；明列每次寫入 budget。
3. 查看瀏覽器 request body 與合成後端 row：不是只看欄位消失。撤除欄位 injection 必須拒絕。
4. 跑 CP-01 四組 identity fixture（安全舊 alias、hash-only、唯一新、碰撞），不唯一不得顯示姓名/時段或建立 return-session。
5. 驗證 slot/reservation/audit/outbox 一致、Calendar 同一 event，不因 retry 生重複；logout/reload 後工作台不復活。
6. 首次必要 assertion FAIL 停止，提供可重現 source issue；修復另 PR、再取新部署核准，不能無界 retry。
7. 成功後 dated evidence PR，回填矩陣 row；source 完成與 runtime 完成分列。

交接 prompt：只做 CP-02 已獲准 C1 驗收。沒有 exact-SHA 窗口就交待核准 packet，不把本計畫當部署授權。

## CP-POLICY — BD 未決政策封板

| # | PR 欄位 | 本包定義 |
| --- | --- | --- |
| 1 | PR NAME | docs: record bounded business-delivery policy decisions |
| 2 | GOAL | 只補 runtime 必需但現有契約未注入的政策 |
| 3 | WHY NEEDED | agent 不可猜 export/retention/termination 權限與期限 |
| 4 | PRECONDITIONS | CP-02 完成；fresh Drive/current decision register；既定價格/欄位不重問 |
| 5 | FILES / MODULES | 2026-09-18-business-delivery-follow-up.md；六個 business-delivery*.ts 型別；decision register |
| 6 | DOMAIN IMPACT | 不改 domain；把每個 policy 欄位映射有證據 answer |
| 7 | API IMPACT | 無 |
| 8 | WEB IMPACT | 無 |
| 9 | FIRESTORE IMPACT | 無 |
| 10 | CALENDAR IMPACT | 無 |
| 11 | INFRA IMPACT | 無 |
| 12 | SECURITY IMPACT | 資料/金鑰/匯出授權、reauth、保留、hold、操作 separation |
| 13 | DATA MIGRATION IMPACT | 列出未知 hash legacy 處理邊界，不授權 repair |
| 14 | BACKWARD COMPATIBILITY | 舊商務文件保留 dated 事實，遠端原檔為準 |
| 15 | TESTS | policy completeness table；unknown/empty 不得自動走 default |
| 16 | CI GATES | G0 + G2 |
| 17 | RUNTIME EVIDENCE | NO；政策核准不是 runtime |
| 18 | HUMAN EVIDENCE | 具名 owner/必要隱私法律審查；current acceptance vs 實際運行月映射 |
| 19 | CLOUD MUTATION | NO |
| 20 | OWNER AUTHORITY REQUIRED | YES：決策答案；不是一攬子雲端/資料刪除核准 |
| 21 | ROLLBACK | 更正/撤銷 decision record，保留追蹤；不覆寫歷史 |
| 22 | STOP CONDITIONS | 政策衝突、缺 professional review、要求以新factor代替年份 |
| 23 | ACCEPTANCE | 每個當前阻塞 policy 有版本/適用環境/核准者/日期/排除項 |
| 24 | WHAT THIS PR MUST NOT DO | 不自行定法定保存期限、不豁免一月營運/尾款、不建 AWS |

### 執行步驟與交辦內容

只收這組缺口，已有答案直接引用：

1. export：允許角色、欄位/期間、fresh reauth 有效窗、下載 TTL/次數、檔案保留、接收方式、失敗清理、加密 key owner。
2. retention：各資料層 archive/soft-delete/restore/permanent-delete 期間、legal hold/解除者、二人或指定確認、backup/PITR 自然淘汰的處理；不把所有層宣稱即時刪除。
3. usage：事件觀察來源、synthetic/測試 staff 排除、日曆月與補收事件 cutoff、事件 coverage 缺口/人審/更正方式、維護開始點。金額及 AND 的「完全未使用」不再問。
4. milestone：正式上線實際一個月、驗收/尾款/維護啟動事件由誰確認與何種證據；CURRENT_PROJECT_ACCEPTANCE 是工程驗收還是含真實運行月。未釐清前保留 gate NOT_PASSED。
5. recovery：Google restore 演練範圍、RPO/RTO 成功標準、clone isolation、清理期限及明確資源/費用授權；AWS 後置已決，不重問排序。
6. termination：匯出/接收確認、權限撤銷、各層保存/刪除 proof、失敗時延後而非假結案。
7. 把結果做 dependency table：哪個 CP 可開始、哪個 HOLD。可先做的非政策依賴 source 才做，不把 owner 不在當作批准。

交接 prompt：只封板上述未決 policy；不得把推測填為 approved，不改 D-series production 狀態。

### CP-POLICY 必填型別對照（不可將 fixture 值當核准）

| 契約／函式 | 需要注入的欄位 | 僅測試樣例，非核准值 |
| --- | --- | --- |
| BusinessDeliveryPolicy / calculateBusinessDeliveryMilestones | trialCalendarDays > 0、maxAdjustmentDays >= 0、formalOperationCalendarMonths > 0 | 20 / 10 / 1 |
| BusinessExportAuthorizationProof / planBusinessDataExport | scopeId、requestId、authorizationReference、reauthenticationReference、authorized、reauthenticated；allowedFields/requestedFields 非空唯一，proof 必須由 server 驗真 | 測試 true 不代表角色核准 |
| RetentionPolicy / planRetentionOperation | recoverableDays >= 1；permanent delete 另需到期、legalHold=false、dependenciesReconciled=true | 30 |
| assessBusinessBackupEvidence 的 policy | minimumCopyCount、minimumRetentionDays、requireIndependentCopy、requireDistinctLocation、requireRestoreDrill、requireFailureAlert；optional maximumRpoMinutes/maximumRtoMinutes | 2 / 30 / true / true / true / true / 60 / 240；Google current profile 不照搬獨立供應商條件 |
| summarizeMonthlyBusinessUsage input | scope、month、events、completeness；runtime staff_login 有 opaque actorId，重用 eventId 異內容 fail closed | internal_synthetic / 2030-10 / complete |
| BusinessTerminationPolicy / planBusinessTerminationOperation | minimumNoticeDays >= 1、controlledCopyRetentionDays >= 1；manual close 需 backup/audit disposition confirmed 及保留期滿 | 30 / 30 |

函式所在檔案均在 packages/domain/src/business-delivery*.ts；沒有 test:business-delivery 指令。
scope、正式 policy 版本與核准證據要隨 runtime 注入，不能拿合成常數進 production。

## CP-03 — 可信用量與交付里程碑接線

| # | PR 欄位 | 本包定義 |
| --- | --- | --- |
| 1 | PR NAME | feat: wire business-delivery usage and milestone evidence |
| 2 | GOAL | 把 #149/#152 契約接可信事件、持久化及 staff review |
| 3 | WHY NEEDED | domain 算得出月報，但目前缺登入/booking event ingress 與 UI |
| 4 | PRECONDITIONS | CP-POLICY 對本包欄位核准；CP-02；契約先重用 |
| 5 | FILES / MODULES | R2：business-delivery.ts、business-delivery-reporting.ts/tests；calendar-pilot-session.ts、appointment.application-service.ts；新 business-delivery adapter/module |
| 6 | DOMAIN IMPACT | 沿用 milestone/usage reducer；新增 adapter-facing interfaces 而非另一套金額計算 |
| 7 | API IMPACT | 新增版本化 staff-only report/milestone query/ack（PROPOSED，實作 PR 固定 routes） |
| 8 | WEB IMPACT | staff 月報/coverage/人工確認；不做自動扣款 |
| 9 | FIRESTORE IMPACT | 建議 additive bd_usage_events、bd_monthly_reports、bd_milestones（PROPOSED）；server timestamps、unique event key |
| 10 | CALENDAR IMPACT | 不依靠 Calendar 活動數作 booking authority |
| 11 | INFRA IMPACT | source only；任何新 job/IAM 另包 reviewed deploy，不預設 Scheduler |
| 12 | SECURITY IMPACT | 可信 server event；RBAC/CSRF；無 UID/email/raw DOB 進聚合或 logs |
| 13 | DATA MIGRATION IMPACT | 不以空集合代表過去沒活動；無可證來源過去月為 insufficient_evidence |
| 14 | BACKWARD COMPATIBILITY | raw domain contract 保留；新增 DB 只有被部署版本使用 |
| 15 | TESTS | duplicate login/create、booking replay、month boundary、late event、incomplete month、manual ack replay |
| 16 | CI GATES | G0 + G1 + G3 + G2 |
| 17 | RUNTIME EVIDENCE | 核准 C1 用固定時鐘/fixture 產出 active/unused/insufficient 三月報；MILE/USE rows |
| 18 | HUMAN EVIDENCE | owner 對付款/維護事件人工確認；不可造真實營運月 |
| 19 | CLOUD MUTATION | NO：source PR；後續 R-DEPLOY 才 YES |
| 20 | OWNER AUTHORITY REQUIRED | YES：policy；C1 runtime 另核准 |
| 21 | ROLLBACK | 停新 event ingress/report route；事件不可刪掉重算消失；版本化重算留 correction audit |
| 22 | STOP CONDITIONS | coverage不完整卻判 unused、client可造server event、重播計費、暗中開始收費 |
| 23 | ACCEPTANCE | 契約+API/UI 完整；相應 runtime 尚待獨立證據時不得稱 BD 完成 |
| 24 | WHAT THIS PR MUST NOT DO | 不做支付閘道、帳務/薪資解凍、不偽造商務 milestone |

### 執行步驟與交辦內容

R2 最小讀取：packages/domain/src/business-delivery.ts、business-delivery-reporting.ts 及各自 .test.ts，apps/api/src/auth/calendar-pilot-session.ts、apps/api/src/appointments/appointment.application-service.ts；RBAC guard 與 audit repository 的現有模式只讀相關實作。

1. 先畫事件判斷表：成功 staff Workbench session 與成功 patient booking create；booking completed 是 create 成功，不是就診 status=completed。refresh/被拒/失敗不得算首次事件；idempotent replay 不重記。
2. server-side transactional outbox/同等可證 atomicity 綁 domain commit。不能 HTTP 201 後用 fire-and-forget 寫月報而不留 coverage gap。事件 key、clinic scope、occurredAt、observedAt、source receipt、schema version 固定。
3. 定義完整觀測期、進入維護月邊界、late event correction。用 Asia/Taipei 半開區間 [monthStart,nextMonthStart)；inject clock，不能硬改電腦時間或真的等月結。
4. API 只讓核准角色查 aggregate 與 ack；拒絕 cross-clinic/不新鮮 session/CSRF；error/telemetry 不記個人值。
5. UI 明示 counts、coverage、rateClass、NT$1800/500 或 insufficient_evidence，不自動標 invoice paid。里程碑需要 evidenceRef+人審而非 UI button 自證正式上線。
6. 寫 integration/emulator：事件與 business commit partial failure、重播、連續/並行登錄、月底 23:59:59/次月00:00、完全無使用 AND、任一有使用、缺日coverage。
7. source PR exact CI；再用 R-DEPLOY 模板另取 runtime 核准，提交同名 evidence follow-up PR。沒有 runtime 只填 CONTRACT/IMPLEMENTED，不能寫 VERIFIED。

交接 prompt：重用 #149/#152，把 event→storage→API→UI→audit 接通；正式付款仍由人工證據控制。

## CP-04 — 安全匯出 runtime

| # | PR 欄位 | 本包定義 |
| --- | --- | --- |
| 1 | PR NAME | feat: expose safe audited business data export |
| 2 | GOAL | 可授權申請、產檔、下載、過期、失敗清理 |
| 3 | WHY NEEDED |  #150 僅 sanitizer/contract，不等於可操作匯出 |
| 4 | PRECONDITIONS | CP-POLICY export/retention subset approved；CP-02 |
| 5 | FILES / MODULES | business-delivery-export.ts/test；新 API application/repository；staff UI；rules/tests |
| 6 | DOMAIN IMPACT | 沿用欄位白名單/CSV 注入保護 |
| 7 | API IMPACT | PROPOSED export create/status/download/revoke；須由 implementation PR 固定 contracts/routes |
| 8 | WEB IMPACT | staff scope preview、reauth、progress、一次明確下載、過期/失敗提示 |
| 9 | FIRESTORE IMPACT | export job metadata+status/receipt；內容不放 audit；immutable scope |
| 10 | CALENDAR IMPACT | 不含 Calendar credentials/event private data |
| 11 | INFRA IMPACT | source 新 storage adapter 可有；cloud bucket/IAM/TTL 另核准且僅最小權限 |
| 12 | SECURITY IMPACT | RBAC+fresh reauth+CSRF；field whitelist；防跨診所/路徑 traversal/CSV formula；不可長效公開URL |
| 13 | DATA MIGRATION IMPACT | 無；歷史欄位只有政策白名單可輸出，不以原 row spread |
| 14 | BACKWARD COMPATIBILITY | 既有 UI不受影響；新export feature fail closed disabled |
| 15 | TESTS | unauth/denied/stale reauth、CSV/Unicode/newline、scope、TTL、重放、partial output cleanup |
| 16 | CI GATES | G0 + G1 + G3 + G2 |
| 17 | RUNTIME EVIDENCE | EXP-01～05：實際合成檔案 bytes/schema、下載/過期與audit |
| 18 | HUMAN EVIDENCE | owner確認輸出可讀及欄位正確；真資料返還另准 |
| 19 | CLOUD MUTATION | NO：source；R-DEPLOY YES |
| 20 | OWNER AUTHORITY REQUIRED | YES：policy、storage/runtime packet |
| 21 | ROLLBACK | disable endpoint；撤銷新下載；依已准TTL清理 job；不可刪使用者原資料 |
| 22 | STOP CONDITIONS | secret/PII進log、未准欄位出現、下載繞權限、清理誤刪原資料 |
| 23 | ACCEPTANCE | unit+API+UI+emulator；runtime downloaded artifact 與audit對帳後才 VERIFIED |
| 24 | WHAT THIS PR MUST NOT DO | 不匯出實際病患、不公開 signed URL、不永久保存 raw exports |

### 執行步驟與交辦內容

1. 讀既有 sanitizer 的允許欄位與 policy 型別；任何新增欄位先列審查，不對 patient record 做 object spread。
2. 分離 metadata repository 與 artifact store。狀態 proposed pending→running→ready/failed→expired/revoked；不得在 upload/checksum 完成前 ready。具體 schema 由 source PR 新 ADR 固定。
3. 以 server 核准的 scope+requestId idempotency；同 key 異 scope 拒絕，重播不生更多可下載副本。
4. download 每次重新驗權/到期/clinic scope；storage locator 不讓 client 指任意 path。url/token 不記 logs或永久 audit。
5. 測試 Excel formula 開頭字元、引用換行、非ASCII、空值；文件說明 redaction，不展示真實資料。
6. 部分產檔/取消/逾期/重試測試：只清 export-owned objects，未上傳完成不假成功；保留安全 failure classification。
7. G0/G1/G3/G2→source PR→新 R-DEPLOY→合成下載證據 follow-up PR。

交接 prompt：只完成 CP-04 安全匯出；不把檔案存在視為接收人已收件。

## CP-05 — 封存、刪除與復原 lifecycle

| # | PR 欄位 | 本包定義 |
| --- | --- | --- |
| 1 | PR NAME | feat: wire policy-gated retention lifecycle |
| 2 | GOAL | 把 #151 接持久狀態、staff 操作及各層刪除proof |
| 3 | WHY NEEDED | domain rules 不會自行執行安全刪除 |
| 4 | PRECONDITIONS | CP-POLICY retention/hold/roles/期間核准；CP-04交付可用 |
| 5 | FILES / MODULES | business-delivery-retention.ts/test；新 lifecycle application/repository；staff UI；backup/runbook |
| 6 | DOMAIN IMPACT | 沿用狀態與 policy，不硬編碼法定天數 |
| 7 | API IMPACT | PROPOSED preview/archive/restore/delete-request/confirm/status；無 GET mutation |
| 8 | WEB IMPACT | 影響 preview、二次確認、hold拒絕、分層完成狀態 |
| 9 | FIRESTORE IMPACT | 每record tombstone+job/checkpoint/receipt；scope顯式；transaction/etag |
| 10 | CALENDAR IMPACT | Calendar投影刪/還原另分層，不由行事曆反建SoT |
| 11 | INFRA IMPACT | source only；不能順手建立定時永久刪除 job |
| 12 | SECURITY IMPACT | hold > deletion、最小角色/reauth、重播不越權、無PII telemetry |
| 13 | DATA MIGRATION IMPACT | 不對歷史mass delete；dry-run 先列count/hash，owner另准範圍 |
| 14 | BACKWARD COMPATIBILITY | archived/soft-deleted 舊read path failclosed；restore不復活 revoked auth session |
| 15 | TESTS | state graph、期限邊界、legal hold race、重試、部分刪除、多層失敗、0/多選 |
| 16 | CI GATES | G0 + G1 + G3 + G2 |
| 17 | RUNTIME EVIDENCE | RET-01～06 合成 archive/restore/permanent deletion，backup仍保留須明示 |
| 18 | HUMAN EVIDENCE | owner確認每次不可逆合成演練；政策簽准不等於批量刪除同意 |
| 19 | CLOUD MUTATION | NO：source；R-DEPLOY和合成刪除另 YES |
| 20 | OWNER AUTHORITY REQUIRED | YES：policy；不可逆 operations 精確 scope approval |
| 21 | ROLLBACK | archive/soft delete在允許窗restore；permanent無一般rollback，執行前先證範圍與復原限制 |
| 22 | STOP CONDITIONS | 未准政策、hold、scope增大、dry-run與apply不同、刪到真資料、任層假結案 |
| 23 | ACCEPTANCE | 所有層evidence齊才complete；失敗留partial/retryable，不偽造一次性成功 |
| 24 | WHAT THIS PR MUST NOT DO | 不定production purge日期、不抹歷史全庫、不稱backup立即消失 |

### 執行步驟與交辦內容

1. 先把 contract 狀態/轉移與 policy 值抄成測試表，每個轉移都包含角色、deadline、hold、reauth。
2. 選取只能 server-resolved scope；dry-run 回候選數、版本與安全摘要，不在PR附病患清單。confirm 綁同版本/計畫hash，發現集合改變即重新preview。
3. 分離 active data、audit、export artifacts、Calendar projection、backup/PITR retention 層；不能刪應保留audit，也不能聲稱PITR立即無痕。
4. 用 transaction/lease 避免 restore與purge/hold與purge race；worker每批重查hold/authority。部分失敗可重試但不重生被刪病患或撤銷session。
5. UI區分 archived、soft-deleted、restore-eligible、deletion-pending、partial、complete；真正不可逆動作明確文字確認，不以通用「儲存」觸發。
6. 僅 emulator先證destroy路徑；source PR合併後另核准小量synthetic IDs的C1演練，禁止「全部」selector。
7. 回報deleted/retained/pending各層與理由；backup自然淘汰以freshread證明，不做偽造刪除證明。

交接 prompt：只做 CP-05，永久刪除沒有默認授權，任何 hold或集合漂移都停。

## CP-06 — Google 真還原驗證

| # | PR 欄位 | 本包定義 |
| --- | --- | --- |
| 1 | PR NAME | docs: prove isolated Google Firestore recovery |
| 2 | GOAL | 在新隔離DB實際還原並完成V1–V6/RPO/RTO證據 |
| 3 | WHY NEEDED | daily READY/PITR enabled/#154 contract 都不是restore成功 |
| 4 | PRECONDITIONS | CP-POLICY演練目標/費用/資料範圍/清理核准；只C1 synthetic |
| 5 | FILES / MODULES | docs/runbooks/backup-and-restore.md；internal-test-backup-inspect.mjs/test；business-delivery-backup.ts/test |
| 6 | DOMAIN IMPACT | 重用 #154 evidence assessor；不強行把AWS欄標true |
| 7 | API IMPACT | 主服務不cutover；隔離驗證reader固定clone DB |
| 8 | WEB IMPACT | 無主preview變更；如驗UI必須隔離target另核准 |
| 9 | FIRESTORE IMPACT | 新且唯一clone DB；原incident/default永不覆蓋 |
| 10 | CALENDAR IMPACT | 不以Calendar為backup；clone不得跑outbox或同步投影 |
| 11 | INFRA IMPACT | Google-only restore/clone、readback；費用/DB/quota/region先核准 |
| 12 | SECURITY IMPACT | 禁止真patient；clone IAM限縮、無worker/egress副作用；artifact redacted |
| 13 | DATA MIGRATION IMPACT | 不是migration切換；可恢復性測試 |
| 14 | BACKWARD COMPATIBILITY | default保持不變；clone去識別/獨立權限 |
| 15 | TESTS | V1–V6、row/hash/invariants、RPO/RTO計時、failedrestore安全、外部sideeffect零 |
| 16 | CI GATES | G0 + G2；如需修helper另source PR G1 |
| 17 | RUNTIME EVIDENCE | REC-01～07；操作ID、backup/snapshot、clone READY、檢查結果、起訖時間 |
| 18 | HUMAN EVIDENCE | owner/操作人確認演練；未達RPO/RTO據實FAIL |
| 19 | CLOUD MUTATION | YES：獨立 exact resources/window approval |
| 20 | OWNER AUTHORITY REQUIRED | YES |
| 21 | ROLLBACK | 主服務無切換；clone保留到證據接受；清理須已列授權，勿廣泛刪除 |
| 22 | STOP CONDITIONS | 目標default、不同project/region、真資料、無可用backup、權限過廣、將要外部投影 |
| 23 | ACCEPTANCE | Google保護與真還原達核准範圍；AWS DEFERRED不列failure |
| 24 | WHAT THIS PR MUST NOT DO | 不建立AWS、不切production、不冒稱已滿足地區全毀復原 |

### 執行步驟與交辦內容

1. 只讀 runbook 與 source inspect：確認哪些命令只做 JSON assessment，不能把 planOnly PASS 叫 restore。
2. fresh-read C1 default database PITR、delete protection、backup schedules、backup READY、retention、位置；查官方 Firestore PITR/backup/clone docs 的當前限制。
3. 寫待核准操作表：source DB、backup/snapshot timestamp、唯一 NEW destination、region、identity、預算、start/end、cleanup；核准後再次核對source非真資料。
4. 執行 runbook 適合該backup型別的 restore/clone；等待long-running operation成功與新DB READY。不存在現成自動runner時明確標 MANUAL_REVIEWED_OPERATION，不虛構 npm restore 指令。
5. V1～V6逐項用合成expected fixture檢查；對appointments/patients/slots/index/audit/outbox對帳。outbox保留資料不代表允許重播，clone不得被liveworker讀取。
6. 量測事故cutoff→可用snapshot為RPO、開始restore→完成驗證為RTO；把實際秒數與核准target對比。default health/Hosting/Calendar須無變化。
7. 析出安全摘要與私有原始證據manifest；#154 assessor依Google-only current profile判定，不偽造independent-provider欄，必要profile變更另source PR。
8. 只有已批准clone清理scope才清理；先讀回精確clone ID，刪除後報是否可恢復。無清理授權則列保留成本與後續，不私自destroy。

交接 prompt：只完成Google restore proof，PITR/READY不是還原證據，禁止覆蓋(default)。

### CP-06-S / CP-06-E 執行拆分與 V1～V6

先提交小型 CP-06-S source PR，沿用本包 24 欄位，但 CLOUD MUTATION=NO、
PR NAME=fix: prepare fail-closed isolated recovery verification。
修 restore planner/tests；若沒有安全 named-database runner，再新增 recovery 驗證 runner。
不改主服務預設 DB、不開 cloud。runner 必須要求 approved C1 project、明確 NEW DB、
獨立 recovery synthetic Calendar、exactSHA/window，拒絕空值/(default)/正式 Calendar，
以 emulator 測每個 adapter 實際取得 named DB。不得啟動主 outbox/inbound。
若不能把所有 repository/worker/fixture 綁 clone，停 V5/V6，先修 source；
不拿 main API 對 (default) 測來冒充 clone 驗收。CP-06-S exact CI 並合併後，
CP-06-E 才另取 restore、隔離 runner、專屬 recovery Calendar/ACL、合成寫入與 cleanup 精確授權。

| 驗證 | 實際執行方式 | 不足以通過的替代品 |
| --- | --- | --- |
| V1 | clone 的 appointments/patients/schedule 筆數與 cutoff 前合成 manifest 對帳 | 只看 DB READY |
| V2 | 至少 10 筆預先核准 synthetic 預約逐欄比對；不足先列 fixture 建立 scope | 隨意抽真患者或只看 count |
| V3 | cutoff 前 audit sequence/receipt 連續，遺失部分列明 | 有 audit collection 即 PASS |
| V4 | 已完成 outbox/idempotency 不重播；pending 用隔離 runner/專屬 recovery Calendar 安全恢復 | main worker 讀 clone |
| V5 | named-DB 應用建立並完成一筆合成預約，另建立並取消一筆，再 DB readback | 主 preview 在 (default) 成功 |
| V6 | 一次有界對帳、專屬 recovery Calendar 事件/漂移/重播核對；main Calendar 無變化 | fake adapter 或 emulator 結果 |

既有 inspect:internal-test-backup 的 plan 模式需 INTERNAL_TEST_RESTORE_SHA/PROJECT/
DESTINATION_DATABASE/SNAPSHOT_TIME/OPERATOR/APPROVER；只輸出 execute:false，不會 restore。
目前 helper 輸出 positional (default)，與 2026-09-22 官方 gcloud 語法不一致；
CP-06-S 須修 planner 與 command-argument tests，不能照抄舊輸出執行。
官方入口如下，**仍需 CP-06-E 核准才執行**：

~~~text
gcloud firestore databases clone --source-database='projects/beauessence-clinic-stg-c1a01/databases/(default)' --destination-database=<approved-new-id> --snapshot-time=<approved-whole-minute-UTC> --project=beauessence-clinic-stg-c1a01
~~~

PITR 最多七日且不得早於 earliestVersionTime；clone 同區且是新 DB，需 datastore.databases.clone，
不能因此授予 broad owner。來源：[PITR 概述](https://docs.cloud.google.com/firestore/native/docs/pitr)、
[clone 官方操作](https://docs.cloud.google.com/firestore/native/docs/use-pitr#clone_from_a_database)（2026-09-22 核對）。
每日 backup restore 與 PITR clone 是不同來源；若核准要求兩者，分別記操作與結果，不互相代替。

## CP-07 — 終止與資料返還接線

| # | PR 欄位 | 本包定義 |
| --- | --- | --- |
| 1 | PR NAME | feat: wire termination and data-return evidence |
| 2 | GOAL | 把 #153 checklist 接匯出/收件/撤權/分層保留刪除 |
| 3 | WHY NEEDED | 契約目前缺可操作返還與關閉證明 |
| 4 | PRECONDITIONS | CP-04/05/06有證據；CP-POLICY termination批准 |
| 5 | FILES / MODULES | business-delivery-termination.ts/test；CP-04 export、CP-05 retention adapters；staff UI |
| 6 | DOMAIN IMPACT | 沿用termination assessment；未齊required evidence不得complete |
| 7 | API IMPACT | PROPOSED termination preview/open/ack/status；close僅server驗证全部conditions |
| 8 | WEB IMPACT | 逐項操作/待收件/partial/hold，不單一按鈕假完成 |
| 9 | FIRESTORE IMPACT | termination case、refs、recipient acknowledgement、layer receipts；audit留存 |
| 10 | CALENDAR IMPACT | scope內projection處置；Calendar非正本/不替代資料返還 |
| 11 | INFRA IMPACT | source only；撤cloud access等另核准小範圍operation |
| 12 | SECURITY IMPACT | 不可刪最後export前假定收件；禁止附檔含secret；最小角色與reauth |
| 13 | DATA MIGRATION IMPACT | 不在本包實際終止現有專案 |
| 14 | BACKWARD COMPATIBILITY | 新增流程disabled；既有資料不因建case改動 |
| 15 | TESTS | missingreceipt、expiredexport、partialpurge、hold、concurrentack/retry、scope/role/CSRF |
| 16 | CI GATES | G0 + G1 + G3 + G2 |
| 17 | RUNTIME EVIDENCE | TERM-01～05全synthetic lifecycle；人證與receipt一致 |
| 18 | HUMAN EVIDENCE | 有對應case/artifact的收件確認，不以下載HTTP200等同收件人認可 |
| 19 | CLOUD MUTATION | NO：source；R-DEPLOY後synthetic操作另 YES |
| 20 | OWNER AUTHORITY REQUIRED | YES：policy、返還與不可逆演練scope |
| 21 | ROLLBACK | 未終止前可取消case；已不可逆步驟誠實列無rollback；active服務不隨測試停用 |
| 22 | STOP CONDITIONS | 缺收件、層proof不足、真資料/服務停用、expiredartifact、hold |
| 23 | ACCEPTANCE | checklist所有適用項可追蹤；任一缺失保持incomplete |
| 24 | WHAT THIS PR MUST NOT DO | 不終止owner真實合約、不刪production、不產生法律保證 |

### 執行步驟與交辦內容

1. 讀contract required facts，將每個輸入綁到可信 CP-04/05/06 receipt；client只送ID，不能傳「已刪除=true」通關。
2. export hash/版本/範圍→接收確認→policy保留/撤權→逐層刪除/例外→final audit；嚴守順序。
3. 人工receipt綁case、artifact hash、角色、時間，不存多餘個資；逾期/改版檔案須重新確認。
4. case完成判斷server-only；部分成功顯示remaining tasks，safe retry不重複返還或繞過hold。
5. emulator+API+UI測缺每一必要項、cross-case注入、並行ack/close。C1演練用synthetic-only case，不影響本專案服務。
6. source→exactCI→R-DEPLOY→human receipt與層proof follow-up PR。

交接 prompt：只接 CP-07 termination evidence，不實際終止或停用診所服務。

## CP-08 — 全系統 regression

| # | PR 欄位 | 本包定義 |
| --- | --- | --- |
| 1 | PR NAME | test: prove current-project end-to-end acceptance matrix |
| 2 | GOAL | 對同一 release 逐列重驗全現有scope |
| 3 | WHY NEEDED | 不同舊SHA的局部PASS不能相加成目前完整驗收 |
| 4 | PRECONDITIONS | CP-00/02/03～07 requiredruntime齊；CP-POLICY閉合；一份release manifest |
| 5 | FILES / MODULES | acceptance matrix；現有 tests/e2e/tests/firestore/scripts inspectors；只新增缺少tests/evidence |
| 6 | DOMAIN IMPACT | 必要時只補測試，不混功能修改 |
| 7 | API IMPACT | 同release已部署API；API真路徑與legacypreview分列 |
| 8 | WEB IMPACT | Google+TOTP Workbench、booking/return、calendar、BD完整使用旅程 |
| 9 | FIRESTORE IMPACT | 核准合成資料、rules與不可見資料邊界 |
| 10 | CALENDAR IMPACT | 投影/候選/拒絕restore/replay；同事件一致 |
| 11 | INFRA IMPACT | 測試需要C1變更須列明；不重建基礎環境 |
| 12 | SECURITY IMPACT | Auth/logout/CSRF/RBAC/rate/log/export/retention負向全覆蓋 |
| 13 | DATA MIGRATION IMPACT | 無新migration；既有相容fixture |
| 14 | BACKWARD COMPATIBILITY | 舊preview/source證據只做回歸線索 |
| 15 | TESTS | 所有矩陣適用rows；全部必要unit/emulator/E2E/CI與runtime |
| 16 | CI GATES | G0/G1/G3/G2，依改動選本地；遠端完整必過 |
| 17 | RUNTIME EVIDENCE | 每row PROVEN或明列FAIL/NOT_RUN；無未解當前重大問題 |
| 18 | HUMAN EVIDENCE | 操作手冊盲走、通知收件、匯出/資料返還確認、業主UAT |
| 19 | CLOUD MUTATION | YES：只對已核准synthetic測試 |
| 20 | OWNER AUTHORITY REQUIRED | YES：release綁定測試packet及budget |
| 21 | ROLLBACK | 回到已知好release；測試資料按已准scope清理，保留audit |
| 22 | STOP CONDITIONS | 任何mandatory assertion FAIL、scope漂移、證據混SHA、違反資料/流量上限 |
| 23 | ACCEPTANCE | 所有current適用rows PROVEN；DEFERRED僅真正future，非藏缺口 |
| 24 | WHAT THIS PR MUST NOT DO | 不降低coverage/CI、不把AWS/官網設blocker、不用真資料 |

### 執行步驟與交辦內容

1. 列 release source/digest/Hosting與policy版本；每個test case指一個matrix ID，expected/actual/artifact/UTC完整。
2. 先跑local與CI；成功後依包所需授權執行C1。Google登入/TOTP只能透過合法已授權登入途徑，不導出密碼/seed/token。
3. 測普通使用者不能到staff、其他角色不能匯出/永久刪除；缺/壞CSRF；logout 500fail-safe及成功清除；oldsession reload。
4. 走new/return booking、schedule、slot/cancel/reschedule、Calendar投影/candidate、monitoring告警/恢復、BD flows與Google restore證據重有效性確認。
5. 固定risk-based source delta rule：auth/index/transport變更重跑其全部dependentrows；docs-only差異用tree對帳不得更名runtimeSHA。
6. FAIL立刻記錄source issue/owningboundary，停止affected sequence；任何修復新PR，改SHA即重綁並重跑受影響rows。
7. 矩陣全齊才標 regression PASS，保留formal signed/production/realmonth另外gate。

交接 prompt：只完成 CP-08；逐列證明，不能以單一總結PASS代替證據。

## CP-09 — 遠端文件與操作手冊同步

| # | PR 欄位 | 本包定義 |
| --- | --- | --- |
| 1 | PR NAME | docs: reconcile formal delivery documents with verified behavior |
| 2 | GOAL | 遠端Drive、repo規格、實際介面與驗收條件一致 |
| 3 | WHY NEEDED | 本機DOCX舊；價格遠端已改好但字段/backup/狀態仍需核對 |
| 4 | PRECONDITIONS | CP-08 PASS；owner授權遠端編輯；只讀Drive最新00～08及相關現行說明 |
| 5 | FILES / MODULES | docs specs/legal/runbooks/README與formalDrive originals（私有，不入repo） |
| 6 | DOMAIN IMPACT | 文件描述真實已驗證contract |
| 7 | API IMPACT | 更新API欄位/errors/auth範圍，不創造未實作endpoint |
| 8 | WEB IMPACT | 手冊用當前實際UI／合成截圖 |
| 9 | FIRESTORE IMPACT | 說明歷史hash限制、retention層及privacy |
| 10 | CALENDAR IMPACT | Calendar是projection、拒絕後restore與異常操作 |
| 11 | INFRA IMPACT | NO infra；Drive edit是external mutation需授權 |
| 12 | SECURITY IMPACT | 隱私文字與資料收集一致；無真PII/秘密截圖 |
| 13 | DATA MIGRATION IMPACT | 不從本機舊DOCX反覆覆蓋remote |
| 14 | BACKWARD COMPATIBILITY | 歷史review保留原日期；加現行權威指向 |
| 15 | TESTS | remote讀回對照、全文舊值/欄位矛盾掃描、手冊盲走、連結 |
| 16 | CI GATES | G0 + G2；文件若需render按對應文書skill驗證 |
| 17 | RUNTIME EVIDENCE | 引用CP-00～08不可攜私有證據需有受控索引 |
| 18 | HUMAN EVIDENCE | owner核對金額/驗收/一月條件/差異範圍、簽署日期 |
| 19 | CLOUD MUTATION | YES：僅已准Drive文件更新；NO cloud infra |
| 20 | OWNER AUTHORITY REQUIRED | YES：正式遠端文件編輯/簽核；不把編輯當簽署 |
| 21 | ROLLBACK | 保留Drive revision/native copy，核對後才寫；不得改簽名或用本地舊版還原 |
| 22 | STOP CONDITIONS | remote已變、未授權條款/付款更動、私有正文入git、未完成被寫完成 |
| 23 | ACCEPTANCE | 00～08及實際手冊freshread一致；所有差異/未適用有清楚disposition |
| 24 | WHAT THIS PR MUST NOT DO | 不加入九份原始文件、不造簽名/收據、不改未准法律條款 |

### 執行步驟與交辦內容

1. 啟用Google Drive skill，從遠端當前folder定位原檔；metadata modifiedTime/version記錄私有manifest，讀取必要的00～08與新增owner說明。不要先讀F: DOCX作authority。
2. 建差異表：80,000；30,000/30,000/20,000；1,800/500；unused為兩條都零且coverage完整；no year；本國/外國；移除四欄與referrer；auth；Google restore；AWS/site後置；各gate真實狀態。
3. 00索引、01報價/付款、02建置使用授權/維護合約、03分階段交付/驗收、04使用手冊、05維運、06月報、07資安權限備份、08匯出刪除返還終止，均先核對 remote 實際名稱及版本；新 owner 說明文件也要對齊，不猜內容。
4. 實際運行滿一月不因synthetic通過而刪掉。AWS「不同位置獨立副本」舊要求以owner排序修訂，但不得假寫已實施。
5. 先產redline/變更對照並取得所需核准；用對應Docs/DOCX原生保全結構流程更新。日期/簽名/已簽版本不可冒改。
6. 讀回/必要render檢查頁數、表格、標題、金額、checkbox、簽名區及截圖；repo只放差異摘要/版本時間/狀態，不放私有ID/整篇正文。
7. 操作人依手冊走登入→排班→預約→候選拒絕→匯出→封存/復原→月報→告警→復原/返還程序，未知步驟即手冊缺口。

交接 prompt：以Drive現行原檔為準，先核對再授權編輯；價格已正確不要重做或回退。

## CP-10 — 現有專案正式驗收與交接

| # | PR 欄位 | 本包定義 |
| --- | --- | --- |
| 1 | PR NAME | docs: record current-project acceptance and handoff |
| 2 | GOAL | 產可稽核的current acceptance結論與交接 |
| 3 | WHY NEEDED | 工程完成/現場驗證/人簽/production是不同gate |
| 4 | PRECONDITIONS | CP-08 regression PASS、CP-09 docs一致、所有currentmatrix PROVEN；政策映射已核准 |
| 5 | FILES / MODULES | acceptance matrix、release/ evidence manifest、approved policy record、dated docs/reviews closure、docs/README |
| 6 | DOMAIN IMPACT | 無 |
| 7 | API IMPACT | 無 |
| 8 | WEB IMPACT | 無 |
| 9 | FIRESTORE IMPACT | 無 |
| 10 | CALENDAR IMPACT | 無 |
| 11 | INFRA IMPACT | 無 |
| 12 | SECURITY IMPACT | 證據分級、私有資料存取與owner custody |
| 13 | DATA MIGRATION IMPACT | 無 |
| 14 | BACKWARD COMPATIBILITY | 保留歷史各gate，不重寫舊失敗原因 |
| 15 | TESTS | manifest完整/連結/hash/SHA核對；未結issue列影響 |
| 16 | CI GATES | G0 + G2 |
| 17 | RUNTIME EVIDENCE | 全部currentrows具對應actual evidence，不以CI代runtime |
| 18 | HUMAN EVIDENCE | 具名owner驗收、範圍/排除/日期；若映射含真運行月須真月proof |
| 19 | CLOUD MUTATION | NO |
| 20 | OWNER AUTHORITY REQUIRED | YES：最終驗收；另production不是本包 |
| 21 | ROLLBACK | 如證據被推翻以新record撤銷/降級，保留audit |
| 22 | STOP CONDITIONS | 必要row缺失、仍有current重大缺陷、人證不存在、one-month條件未滿且屬gate |
| 23 | ACCEPTANCE | 僅所有條件齊才 CURRENT_PROJECT_ACCEPTANCE=PASS |
| 24 | WHAT THIS PR MUST NOT DO | 不自動合併、不啟動AWS/網站/production、不自動觸發尾款 |

### 執行步驟與交辦內容

1. 以matrix逐row檢查source/run/cloud/human證據可訪問、期限適用、SHA相容；未證明就是NOT_PROVEN，不補文字充數。
2. 明列INTERNAL_PREPRODUCTION_COMPLETE、CURRENT_PROJECT_ACCEPTANCE、PRODUCTION_READY、PUBLIC_PRODUCTION_LAUNCHED、REAL_PATIENT_DATA_AUTHORIZED。
3. 依CP-POLICY決定處理「正式上線實際一月」；不得縮成一個合成月份。付款/維護開始另由實際里程碑。
4. owner簽的是具體release/範圍/限制，非空白PASS。附剩餘非blocker：AWS、官網、production另准、合約營運里程碑（若另分）。
5. 交接：啟動/停止/runbook、rollback、監控收件人、backup恢復、出問題誰處理、權限接管、未來排程與私有evidence存放。密碼/金鑰只用受控交接機制不入PR。
6. 產docs PR報headSHA和CI；未簽可交PENDING_ACCEPTANCE packet但不可宣稱完成。只有gate PASS之後，另請求開AWS新專案；官網仍最後。

交接 prompt：只做驗收判定與交接；沒有具名/範圍完整簽准不得寫PASS。
