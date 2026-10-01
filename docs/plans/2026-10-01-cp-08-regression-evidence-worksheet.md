# CP-08 全系統回歸證據 worksheet（2026-10-01）

本 worksheet 依 [現有專案驗收矩陣](2026-09-22-current-project-acceptance-matrix.md) 的 88 個既有 ID 建立，供同一個正式綁定 release 的逐列回歸。矩陣「目前證據分類」欄只是基線分類，並非本次測試結果。本文撰寫時沒有執行 CP-08；88 個矩陣 ID 中 84 個適用列維持 `NOT_RUN`，manual reauth 與 human acceptance 也維持 `NOT_RUN`。PR #213 current head CI799/run `36852875693`, PR #214 CI795/run `36846590947`, PR #215 CI796/run `36850157553` and PR #216 current head CI800/run `36853002771` passed 12/12. All four source PRs are READY but remain unmerged/undeployed. L3 gate-fix commit `c1658660` passed 32 focused tests and independent review. These source checks do not change current-baseline classification or CP-08 results.

只有在 CP-03～CP-07 source、CP-09 文件衝突、完整 C1 readback 和 CP-08 exact-release 授權條件均處理後，才可填寫執行欄。每次修正使 source SHA 改變時，重新綁定 release 並依依賴重跑；不得拼接不同 SHA 的舊 PASS。首次必要 assertion 失敗即記錄並停止受影響 sequence；不得現場修程式或擴大測試。

## Release manifest（尚未填；不構成部署核准）

| 欄位 | 執行前填寫 |
| --- | --- |
| source SHA（L2b～L6 source 與 CP-03～CP-07 相依變更合併後；可包含本 worksheet 的 docs commit） | `<待最終 root readback／owner 授權 release SHA>` |
| API revision / image digest | `<NOT_RUN>` |
| worker revision / image digest | `<NOT_RUN>` |
| Hosting version / channel | `<NOT_RUN>` |
| project / database / scope | C1 synthetic only；以部署 packet readback 填入 |
| policy version | `BD-POLICY-2026-09-29`（若 CP-09 reconciliation 改版，填入 owner-approved value） |
| authority reference / UTC start-end | `<待 owner 核准 exact SHA、時窗、mutation budget>` |
| startedAtUtc / endedAtUtc | `NOT_RUN` |
| evidence manifest reference | `NOT_RUN` |

## 結果定義與執行安全

- `NOT_RUN` = 本 release 尚未執行或尚無可存取證據。執行前不得改成 PASS。
- `FAIL` = assertion 未達成；記錄實際值、證據參照與 issue，停止受影響 sequence。
- `PASS` = 同一 exact release 上正向、負向及必要部分失敗/retry assertion 均有可存取證據。
- `NOT_APPLICABLE` 只可沿用已記錄 owner 決定；`OUT_OF_SCOPE` 只限矩陣定義的獨立 production gates。不能因缺 UI、source 或 credentials 改成 N/A。
- 公開 repo 只放去識別摘要與受控 artifact ref；不記錄 token、cookie、CSRF、TOTP、UID、email、電話、生日、Calendar ID、raw headers、私有 Drive IDs。

## Acceptance matrix rows

執行人、UTC 時間、結果與 artifact 欄留白；在真實受控執行後填寫。`baseline class` 與 `acceptance` 原樣對應現有矩陣，避免把來源證據或舊 SHA runtime 誤認成本 release 通過。

| ID | 要求 | 基線分類 | 必須通過（含負向） | 最少證據 | CP-08 結果 | 執行者／UTC／artifact ref／issue |
| --- | --- | --- | --- | --- | --- | --- |
| P09-01 | 源/CI/新授權與完整部署圖 | CI_PROVEN | exactSHA與digest/UTC一致；staleSHA或過期拒絕 | fresh manifest + ownerpacket + readbacks | `NOT_RUN` | — |
| P09-02 | Stage1 prerequisites | SOURCE_PROVEN | 身份/容器/binding存在；syncservice/job仍無；API/outbox按完整plan | fullplan/apply/readback | `NOT_RUN` | — |
| P09-03 | secret pin與最小ACL | NOT_PROVEN | numericpin及最小reader；無latest/worker新secret權限 | safe version/ACL/IAM receipts | `NOT_RUN` | — |
| P09-04 | config bootstrap | SOURCE_PROVEN | expiry/source/synthetic正確；exists時拒覆寫 | transaction/audit/readback | `NOT_RUN` | — |
| P09-05 | Stage2 runtime/排程 | SOURCE_PROVEN | 三service/digests/entrypoints正確；syncPAUSED retry0 | fullplan/apply/runtime graph | `NOT_RUN` | — |
| P09-06 | isolatedHosting→newAPI | CLOUD_READBACK_PROVEN | 新tag目標正確；live/DNS無變；authDomain有效 | before/after release+network | `NOT_RUN` | — |
| P09-07 | 合成修改→pending | SOURCE_PROVEN | 唯一candidate/link；SoT不偷偷改；真Calendar禁止 | event+candidate+appointment snapshots | `NOT_RUN` | — |
| P09-08 | pending→reject→audit | SOURCE_PROVEN | staffreject、audit、returnresponse對帳；unauth不能決策 | network+candidate+audit | `NOT_RUN` | — |
| P09-09 | restore投影到同event | SOURCE_PROVEN | sameevent恢復；無第二event；失敗留partial | outboxsettlement+independentCalendarreadback | `NOT_RUN` | — |
| P09-10 | 重播與無重複 | SOURCE_PROVEN | 同input重播不再生candidate/event；並行有界 | before/aftercounts+attempts+audit | `NOT_RUN` | — |
| P09-11 | HTTP429 + durable拒絕 | SOURCE_PROVEN | ≤20固定identity；429+RetryAfter；排除burst-only假證據 | requestledger+stablehash+store/branchproof | `NOT_RUN` | — |
| P09-12 | StageF11case與舊inspect | NOT_PROVEN | 全部requiredcase；humanInboxProof；非只空CLI | 11case manifest + both evaluatorresults | `NOT_RUN` | — |
| P09-13 | 回退/告警/lease健康 | CLOUD_READBACK_PROVEN | 基線healthy且可回退；新inbound不resume；無DLQ/duplicate | rollbackrecord+monitoring+state | `NOT_RUN` | — |
| P09-14 | P1-09關帳交接 | BLOCKED | 所有P09列完成；datedPRexactCI；不得雲端證據推定 | closurePR+headCI+artifactmanifest | `NOT_RUN` | — |
| BKG-01 | 生日只月日新UI/payload | RUNTIME_PROVEN | 無year；只--MM-DD；閏日/非法日期 | UI+network+strictschema+unit | `NOT_RUN` | — |
| BKG-02 | 本國/外國恰二選一 | RUNTIME_PROVEN | 無當日/外籍等舊分類；其他procedure不混國籍 | DOM+payload+domainfixture | `NOT_RUN` | — |
| BKG-03 | 移除證件/來源/referrer/NHI意向 | RUNTIME_PROVEN | UI/state/transport/API/domain/persist零新收集；注入被拒 | fieldpath inventory+schema/DB/logdiff | `NOT_RUN` | — |
| BKG-04 | 新預約serverSoT/reload | RUNTIME_PROVEN | 新versionbookingcreate/reloadserver仍有；localStorage不是SoT | network+booking/slot/audit/outbox | `NOT_RUN` | — |
| BKG-05 | phone+MM-DD回診查詢 | RUNTIME_PROVEN | 唯一合法lineage才給returnsession；genericnomatch | lookup/session/API/DBproof | `NOT_RUN` | — |
| BKG-06 | 舊fullDOB合法alias | NOT_PROVEN | 有合法source可建alias；保留patientId/舊預約；不得猜年 | fixedlegacyfixture+transitiontests | `NOT_APPLICABLE`（owner 決定 `LEGACY-PATIENT-NO-ALIAS-2026-09-28`；以 BKG-07 覆蓋） | owner 決定；不執行 |
| BKG-07 | hash-only不能安全相容 | RUNTIME_PROVEN | 保留舊row；不生成假alias、不wipe；查詢通用失敗 | negativefixture+no-session/no-writeproof | `NOT_RUN` | — |
| BKG-08 | 共用電話/月日碰撞並行 | RUNTIME_PROVEN | 多候選/不可辨識failclosed；不顯示他人資料；交易不overwrite | collision/raceemulator+runtime | `NOT_RUN` | — |
| BKG-09 | returnrequired+unscheduled | RUNTIME_PROVEN | required/unscheduled才排followup；nonce/expiry/version守門 | APIdomain+returnsession+followup | `NOT_RUN` | — |
| BKG-10 | 取消/改約/duplicate | RUNTIME_PROVEN | 沿原patientIdlineage；cutoff/slot/重播/衝突不繞過 | targetedtests+boundedruntime | `NOT_RUN` | — |
| BKG-11 | 歷史相容read不再收集 | RUNTIME_PROVEN | 舊read保留；新draft不重送移除欄位；無massrewrite | legacy/newpayload+fixturecounts | `NOT_RUN` | — |
| BKG-12 | audit/export/Calendar無新PII | RUNTIME_PROVEN | 敏感fixture不在log/audit/Calendar或非白名單export | safeartifactscan+negativeassertions | `NOT_RUN` | — |
| SEC-01 | Google+TOTP登入 | RUNTIME_PROVEN | freshGoogle+TOTP→session→Workbench；錯/過期MFA拒 | privateUI+HTTPsessionreceipts | `NOT_RUN` | — |
| SEC-02 | logout完整成功 | RUNTIME_PROVEN | cookieverify+兩段revoke成功才clearcookie/signedOut | unit+network+session/clientflags | `NOT_RUN` | — |
| SEC-03 | logout部分/雙失敗與安全重試 | CI_PROVEN | 任一失敗不假成功；每retry兩段；revoked不復活；diag不含PII | revokeunit+controller+telemetrytests | `NOT_RUN` | — |
| SEC-04 | logout/reload/新登入相互隔離 | RUNTIME_PROVEN | 舊session不rehydrate；freshGoogle/TOTP後真正回Workbench | before/afterUI+HTTP/flags | `NOT_RUN` | — |
| SEC-05 | sessioncookie/roles/TTL | CI_PROVEN | 無/過期/撤銷/篡改cookie拒；role偽造無效 | negativeAPI+deny-audit | `NOT_RUN` | — |
| SEC-06 | CSRF write守門 | CI_PROVEN | 缺/壞/跨session/跨originCSRF拒，無businesswrite | boundednegativeHTTP+DBnochange | `NOT_RUN` | — |
| SEC-07 | RBAC最小權限 | CI_PROVEN | frontdesk/manager/未登入分矩陣；export/delete另允角色 | role×actiontable+denialaudit | `NOT_RUN` | — |
| SEC-08 | anti-enumeration | CI_PROVEN | 不存在/碰撞/無followupgenericresponse；無病患洩漏 | HTTPshape+latencyreasonedcheck+no-session | `NOT_RUN` | — |
| SEC-09 | denied audit真落庫 | CI_PROVEN | deniedrequest有action/classification，沒有token/IP原值任意散佈 | request→audithash+emulator/runtime | `NOT_RUN` | — |
| SEC-10 | session失敗diagnostics安全 | CI_PROVEN | unknown分類收斂；logger失敗不改結果；parallel各錯皆留 | redaction+loggerthrow+delayedtests | `NOT_RUN` | — |
| SEC-11 | API-onlyAuthIAM | CLOUD_READBACK_PROVEN | users.get/createSession/update恰三項；worker不綁；update非用途級限制 | role+bindingreadback+Terraformtests | `NOT_RUN` | — |
| SEC-12 | browser/Firestore/worker邊界 | CI_PROVEN | client不能直寫敏感collections；worker需OIDC；APIpublictransport不解staffguard | emulator+401/403+policyreadback | `NOT_RUN` | — |
| SEC-13 | P1-04 missing/off/expired gate fail closed | CI_PROVEN | missing settings 拒boot；off/expired/misconfigured 必要路徑回503且無寫入；不得以404當成功 | isolated negative-revision/env packet + HTTP/DB no-change + source tests | `NOT_RUN` | — |
| SEC-14 | C1 CSP/auth origin 與 disabled staff | CI_PROVEN | CSP 無 forbidden staging origin；停用staff下一protectedcall被拒；不可擴 physician/consultant | actual response headers + bounded disabled synthetic-role proof | `NOT_RUN` | — |
| OPS-01 | 排班發布/14day語意/重播 | RUNTIME_PROVEN | 當前approved horizon；週日/slotcount/version；samekeyreplay | scheduleAPI+slotcounts+UI | `NOT_RUN` | — |
| OPS-02 | Workbench arrived/completed | CI_PROVEN | 合法狀態鏈；非法跳躍拒；同eventpatch | UI+appointmentversion+audit/Calendar | `NOT_RUN` | — |
| OPS-03 | outbox投影/lease/重試 | RUNTIME_PROVEN | exactevent外部讀回；lease互斥、無重播已完成 | outbox/lease/audit+Calendar | `NOT_RUN` | — |
| OPS-04 | WP-B4 alert開啟/恢復 | RUNTIME_PROVEN | 告警產生、恢復CLOSED、無舊狀態假警 | monitoringincident/metric/UTC | `NOT_RUN` | — |
| OPS-05 | 真人通知收件 | NOT_PROVEN | 一次真收件與incident/ref/time對應，不輸出信箱PII | humanacknowledgement+incidentreceipt | `NOT_RUN` | — |
| OPS-06 | monitoring/IAM告警定義 | CLOUD_READBACK_PROVEN | policy/filter/channel正確、非停用；應用health正常 | readback+safeincidenttestscope | `NOT_RUN` | — |
| OPS-07 | migration/version/artifact安全 | CI_PROVEN | C1baseline/version/rules/index對齊；historicalartifact非liveauthority | migration+artifactinspectJSON | `NOT_RUN` | — |
| OPS-08 | operationaldegrade與事故手冊 | NOT_PROVEN | 紙本/事後補登tabletop、權責/通知/恢復；不真停診 | synthetictabletop+operatorreceipt | `NOT_RUN` | — |
| MILE-01 | 首次合格事件與milestone計算 | CI_PROVEN | approvedtrial/adjustment/month；replay穩定、scope隔離 | policyversion+serverevent+tests | `NOT_RUN` | — |
| MILE-02 | 里程碑持久化/API/UI/人確認 | SOURCE_PROVEN | API source merged；L3 head `91da1cce…`; gate fix `c1658660` passed 32 focused tests and independent review; CI800 passed 12/12. PR is READY, unmerged/undeployed. Merge/C1 runtime and owner receipt remain pending | emulator+candidate source/CI + future runtime/humanack | `NOT_RUN` | — |
| MILE-03 | 正式上線實際一月與尾款 | BLOCKED | 依核准gate映射；若必要則真operatingmonth證據 | signedmapping+authorizedrealmilestoneproof | `NOT_RUN` | — |
| USE-01 | monthcounts/dedupe/AND | CI_PROVEN | stafflogin=0 AND bookingcreate=0才unused；完成預約不是visitcompleted | fixedclock+dedupe+monthboundarytests | `NOT_RUN` | — |
| USE-02 | trustedserver event ingress | SOURCE_PROVEN | 成功businesscommit與receipt一致；失敗/重播不重記 | atomicity/race/integration+runtime | `NOT_RUN` | — |
| USE-03 | 完整/不完整觀測與lateevent | CI_PROVEN | gap→insufficientevidence不是零；latecorrection有audit | coverage+timewindow+lateeventfixtures | `NOT_RUN` | — |
| USE-04 | 月報UI／人審 | NOT_PROVEN | 顯示分類與證據完整度；不自動invoicepaid；C1 synthetic 可驗 runtime-vs-maintenance 分類邏輯，但正式財務用量依 owner-approved policy/source 決定 | UI/reportrow+ownerreceipt+classificationfixtures | `NOT_RUN` | — |
| EXP-01 | safeexport白名單/CSV | CI_PROVEN | 正確欄/期間；formulaescape；PII非任意spread | downloadbytes/schema+negativefixtures | `NOT_RUN` | — |
| EXP-02 | role+reauth+scope | SOURCE_PROVEN | 6欄proof由server建；denied/跨clinic/stalereauth拒 | APInegative+audit | `NOT_RUN` | — |
| EXP-03 | request→生成→ready/partial | SOURCE_PROVEN | uploadhash完成才ready；retry同scope不duplicated | jobstates/artifacthash+failures | `NOT_RUN` | — |
| EXP-04 | download/TTL/revoke/cleanup | SOURCE_PROVEN | 到期拒；重驗權；cleanup只export-owned | privateHTTP+objectmetadata+audit | `NOT_RUN` | — |
| EXP-05 | 可讀檔案與人確認 | NOT_PROVEN | 中文/換行/日期/欄位可讀，接收用途明確 | artifactQA+operatorack | `NOT_RUN` | — |
| RET-01 | archive/softdelete/restore規則 | CI_PROVEN | approvedwindow；角色/hold；拒無效轉移 | stategraph+boundarytests | `NOT_RUN` | — |
| RET-02 | persisted lifecycle/API/UI | SOURCE_PROVEN | API source merged；L3 head `91da1cce…` adds archive/restore/legal-hold/delete forms and pending-deletion list; gate fix `c1658660` passed 32 focused tests and independent review; CI800 passed 12/12. PR is READY, unmerged/undeployed. C1 runtime remains pending. No preview/fingerprint endpoint. | candidate source + future runtime/UI/API/DB/audit | `NOT_RUN` | — |
| RET-03 | legalhold與並行刪除 | CI_PROVEN | hold競爭先重驗；永久刪除不可跳過授權 | emulatorrace+boundedruntime | `NOT_RUN` | — |
| RET-04 | preview→confirm exactscope | NOT_PROVEN | Current #208 API accepts one patient ID and has no preview/fingerprint or hash-bound confirm endpoint; record this contract gap, do not fabricate a preview test. Until an approved UI/source contract exists, remain NOT_RUN; any eventual test must bind one exact synthetic patient and stop if displayed scope differs. | source/contract review + future UI/runtime evidence | `NOT_RUN` | — |
| RET-05 | 多層partialfailure/retry | NOT_PROVEN | primary/export/Calendar/audit/backup分層，不假complete | layerreceipts+failure/retryproof | `NOT_RUN` | — |
| RET-06 | backups自然淘汰與刪除清單 | SOURCE_PROVEN | 備份未過期不能稱已刪；restore重套approvedtombstones | policy+retentionreadback+restoredcheck | `NOT_RUN` | — |
| REC-01 | PITR+deleteprotection+daily30d | CLOUD_READBACK_PROVEN | freshDB(location/type/retention)及schedule | backupinspect+exactDBsnapshot | `NOT_RUN` | — |
| REC-02 | 當日backupREADY與失敗監控 | CLOUD_READBACK_PROVEN | backupusable且alertcurrent；missing/failed有通報 | backupID/state+policy/receipt | `NOT_RUN` | — |
| REC-03 | 新隔離DB真restore/clone | NOT_PROVEN | NEWID/操作成功/DBREADY；default不變 | authorizedopID+before/afterreadback | `NOT_RUN` | — |
| REC-04 | V1–V4資料與audit/idempotency | NOT_PROVEN | count/10syntheticrows/auditcontinuity/冪等同步 | clonescopevalidationreport | `NOT_RUN` | — |
| REC-05 | V5/V6隔離應用與Calendar對帳 | NOT_PROVEN | clonebooking完成+取消；專屬recoveryCalendar無重複；default不變 | runnerbinding+API/DB+Calendarproof | `NOT_RUN` | — |
| REC-06 | 實測RPO/RTO | NOT_PROVEN | 明確scenario、cutoff/snapshot/start/usable；比較actualtarget | timestamps+data-losswindow+elapsed | `NOT_RUN` | — |
| REC-07 | 隔離/rollback/cleanuphandoff | NOT_PROVEN | clone不跑mainworker；cleanup只approvedexactID；noAWS | IAM/dbbinding+sideeffectzero+cleanupreceipt | `NOT_RUN` | — |
| TERM-01 | terminationrequiredfacts | CI_PROVEN | notice/copyretention核准；缺項incomplete | policyversion+contracttests | `NOT_RUN` | — |
| TERM-02 | case/API/UI與serverchecklist | NOT_PROVEN | Current merged baseline lacks PR #213. Candidate API/domain source `e517f387…` has CI799 12/12 and is READY but unmerged/unreleased. L3 UI PR #216 head `91da1cce…`; gate fix passed 32 focused tests and independent review; CI800 passed 12/12 and is READY but unmerged/unreleased. Merge/C1 runtime/盲走 remain pending. After release: 30-day notice, receipt then 30-day controlled retention, missing steps reject, close yields `manual_close_review`. | source/CI records + future exact-release API/UI/runtime negative evidence | `NOT_RUN` | — |
| TERM-03 | 資料返還/收件對應 | NOT_PROVEN | Candidate source ties data-return receipt to valid export ID and records server hash/actor/time; download alone is not receipt. Human backup/audit/access disposition entries are statements, not proof of cloud deletion/revocation. Current release runtime and human receipt unverified. | candidate contract + future artifact receipt + human acceptance | `NOT_RUN` | — |
| TERM-04 | backup/audit disposition | SOURCE_PROVEN | 每層retained/pending/deleted有evidence；不earlyclose | layerproof+holdtest | `NOT_RUN` | — |
| TERM-05 | partialretry/安全結案 | NOT_PROVEN | 缺收件或刪除失敗不結案；重播安全；不真停服務 | syntheticcaselifecycle+audit | `NOT_RUN` | — |
| DOC-01 | 正式價格／商務條款 current authority | BLOCKED | owner resolves exact current terms; only then crosswalk 00～08 and sign the policy mapping | private versioned redline+owner record | `NOT_RUN` | — |
| DOC-02 | 資料欄位/privacy/API說明 | SOURCE_PROVEN | 不收year/四欄；legacy限制及國籍一致 | repo/Drivecrosswalk+runtimeUI | `NOT_RUN` | — |
| DOC-03 | Googlebackup/AWS/site排序 | SOURCE_PROVEN | currentGoogle能力據實；AWS/site後置非已實現 | remoteapprovedredline/readback | `NOT_RUN` | — |
| DOC-04 | 手冊可獨立操作與截圖 | NOT_PROVEN | Source-guided manual describes PR #216 head `91da1cce…`; gate fix passed 32 focused tests and independent review; CI800 passed 12/12 and PR is READY, unmerged/undeployed. C1 blind walk, fresh synthetic acceptance captures and owner reconciliation remain pending. | manualQA+exact-release synthetic captures | `NOT_RUN` | — |
| DOC-05 | 正式驗收/具名簽署/權限交接 | NOT_PROVEN | 版本/範圍/日期/owner；私有credential交接不入PR | signedacceptance+custodyreceipt | `NOT_RUN` | — |
| GATE-01 | INTERNAL_PREPRODUCTION_COMPLETE | BLOCKED | current scope's internal-preproduction evidence, runtime/cloud/human rows, and dated closure all agree | P09closuremanifest+current matrix | `NOT_RUN` | — |
| GATE-02 | CURRENT_PROJECT_ACCEPTANCE | BLOCKED | 所有current適用rows PROVEN；無重大未結；milestonemapping清楚 | finalsignedmatrix | `NOT_RUN` | — |
| GATE-03 | PRODUCTION_READY | NOT_PROVEN | 不得由C1/商務acceptance推出PASS | productionownerapprovals/evidence | `OUT_OF_SCOPE`（獨立 production / public-launch / real-data gate；本 CP-08 不測、不改 gate 狀態） | — |
| GATE-04 | PUBLIC_PRODUCTION_LAUNCHED | NOT_PROVEN | officialroute/DNS/traffic+獨立cutover批准才true | productionrelease/readback | `OUT_OF_SCOPE`（獨立 production / public-launch / real-data gate；本 CP-08 不測、不改 gate 狀態） | — |
| GATE-05 | REAL_PATIENT_DATA_AUTHORIZED | NOT_PROVEN | 具名合規/隱私/資料scope核准才true | authorizeddatareceipt | `OUT_OF_SCOPE`（獨立 production / public-launch / real-data gate；本 CP-08 不測、不改 gate 狀態） | — |

## Required manual reauthentication and human acceptance checks

下列是現有 matrix ID 的必要人工執行補充；因 manager UI、reauth UI 及當前 C1 尚未驗證，現階段全為 `NOT_RUN`。只用合成資料和業主自行持有的 Google＋TOTP 登入；不得記錄登入密碼、seed 或 token。

| Check ID | Matrix IDs | 正向／負向場景 | 證據 | 結果 | 執行者／UTC／artifact ref |
| --- | --- | --- | --- | --- | --- |
| MANUAL-AUTH-01 | SEC-01/02/04 | 業主使用新鮮 Google＋TOTP session 登入 Workbench，登出後舊 session/reload 不恢復；錯誤或逾期 MFA 拒絕。 | 去識別 UI/network/session receipt；不得記錄秘密 | NOT_RUN | — |
| MANUAL-REAUTH-CP03 | MILE-02/USE-04 | 該確認 POST 要求同一操作者、10 分鐘內 fresh Google＋TOTP 才可完成；缺失、逾期、不同操作者 token 拒絕且不建立/改寫 acknowledgement。 | 請求/拒絕分類、前後版本與 audit；不含 token | NOT_RUN | — |
| MANUAL-REAUTH-CP04 | EXP-02/03/04/05 | manager 對核准合成範圍完成 10 分鐘內 fresh reauth 後可建立 CSV；缺失、逾期或異人 reauth 使建立拒絕且無 job/file side effect。下載不要求 reauth header，但每次仍需同一 manager session、scope、未過期且未撤銷；跨角色/scope、過期／第4次下載及 revoked 均拒。 | safe result、job count、artifact hash、audit/deny record | NOT_RUN | — |
| MANUAL-REAUTH-CP05 | RET-02/03/04/05 | Archive/permanent-delete 由同一 manager fresh-reauthed 時成功；缺失、過期、異人、未到期或有 legal hold 的 permanent-delete 拒絕且無越權寫入。Restore/legal-hold source contracts 不要求 reauth。Current source has no preview/fingerprint call, so do not claim preview-bound evidence. | synthetic record state before/after、operation/audit、deny record；不含 token | NOT_RUN | — |
| MANUAL-REAUTH-CP07 | TERM-02/03/04/05 | 每個 termination POST 均使用該 manager fresh Google＋TOTP（10 分鐘內）；缺失、過期、異人/無權 manager 均拒絕且不改 case。正向只可：notice 到期後記 data-return receipt；receipt 後 30 日 retention；期滿且 steps 齊全 close 只成 `manual_close_review`。同日 close 與 missing receipt/step 必須拒絕。 | case version/state before/after、deny/409 receipts、server receipt metadata；human disposition 不是 cloud delete/revoke proof | NOT_RUN | — |
| MANUAL-HUMAN-AT | DOC-04/05/OPS-08/EXP-05/TERM-03 | 診所操作人盲走登入、建立/查閱預約、月用量/里程碑、CSV、封存/復原/legal hold/刪除、終止流程；L3 head `91da1cce…` provides candidate UI labels/forms, gate fix passed 32 focused tests and independent review, CI800 passed 12/12; PR is READY but unmerged/unreleased. 指出30日通知、receipt後30日保留、`manual_close_review` 非結案，及人工 backup/audit/access statements 不能代替 cloud 證據。reauth popup 若受 COOP 阻擋即停止，不放寬標頭。owner 另簽 CP-10，不用 agent 代簽。 | 逐項匿名觀察紀錄、問題清單、fresh synthetic captures、owner 簽名/日期欄（目前空白） | NOT_RUN | — |
| MANUAL-COOP-DEPENDENCY | MILE-02/EXP-02/RET-02 | 驗證 reauth popup/window 完成後 callback 與動作結果。現有全域 COOP `same-origin` 為已知 popup obstacle；遇阻即停，記錄結果供 L3 source/runtime 決策。不得放寬 security header。 | actual headers 與安全匿名化 popup result；無 secret | NOT_RUN | — |

## CP-08 closure decision

- CP-08 只有在同 release 的所有 current-applicable rows 均有可訪問證據、無 mandatory FAIL、manual reauth/human AT 完成、且 scope 與 signed owner packet 一致後才可提交 PASS。
- `CP-06-E` 的 C1 真 restore 是 final current-project acceptance 前置；雖列為 test-delivery 後 tuning，未完成時 CP-10 / GATE-02 仍不得 PASS。AWS 和官網屬後置 scope，不當作本 gate 的阻塞項。
- `DOC-01` / `USE-04` / `MILE-03` 的商務差異依 CP-09 / CP-10 owner reconciliation；CP-08 worksheet 不自行改費用、試用期、付款條款或正式運行月規則。
