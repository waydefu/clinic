# 現有專案驗收矩陣與證據格式

狀態：基線盤點，**不是已通過的驗收表**。來源日期與authority見[主計畫](2026-09-22-current-project-acceptance-master-plan.md)。
實作順序/24欄位見[工作包](2026-09-22-current-project-execution-packets.md)，
P1-09實際操作見[operator packet](2026-09-22-p1-09-operator-packet.md)。

## 如何填，不可怎麼填

每列「目前證據分類」恰一項：
SOURCE_PROVEN、UNIT_PROVEN、INTEGRATION_PROVEN、EMULATOR_PROVEN、CI_PROVEN、
CLOUD_READBACK_PROVEN、RUNTIME_PROVEN、HUMAN_PROVEN、NOT_PROVEN、BLOCKED。
這是**已觀察證據的種類，不是可相互替代的等級**。RUNTIME_PROVEN的datedoldSHA不代表新release已驗；
CI_PROVEN在此僅指e387f252主線的CI與對應source，沒有新wiring的row仍NOT_PROVEN。
最終每列另填 result=PASS/FAIL/NOT_RUN；不能把「SOURCE_PROVEN」誤作runtimePASS。

過往對話中4f31b00的P1-05R/P1-07、P1-06、P1-08報告目前是本機operatorartifact，
其源SHA/環境/時間已知，但還需要CP-00建立受控可攜manifest及human對應。
只憑本文轉述不升級新驗收。失去原始證據可訪問性時，該列退回NOT_PROVEN。

每列runner都必須寫下：

~~~text
requirementId =
sourceSha =
apiRevisionAndDigest =
workerRevisionAndDigest =
hostingVersionAndTarget =
projectAndDatabase =
policyVersion =
authorityRefAndUtcWindow =
startedAtUtc =
endedAtUtc =
fixtureIdSafeReference =
preconditionsActual =
actionAndRequestCount =
expected =
actual =
result = PASS | FAIL | NOT_RUN
evidenceClassification = <exactly one of allowed types>
artifactRefsWithSha256 =
humanReceiptRef = NOT_REQUIRED | NOT_PROVEN | verified reference
cleanupAndRollbackState =
~~~

公開repo只放去識別summary/相對artifact名稱/hash及受控存放索引，不貼cookie/token/CSRF/TOTP/
UID/email/電話/生日/CalendarID/rawheaders/私有DriveID。私有證據保留原始上下文並限制讀者；
hash不能取代證據本體可訪問性。未核准的雲端/人證行保持NOT_RUN，不用人工true填平。

## 驗收行（88項）

| ID | 要求 | 目前證據分類（單一） | 基線證據／限制 | 執行包 | 必須通過與負向斷言 | 最少證據 |
| --- | --- | --- | --- | --- | --- | --- |
| P09-01 | 源/CI/新授權與完整部署圖 | CI_PROVEN | 主計畫main CI；不是new runtime | CP-00 | exactSHA與digest/UTC一致；staleSHA或過期拒絕 | fresh manifest + ownerpacket + readbacks |
| P09-02 | Stage1 prerequisites | SOURCE_PROVEN |  #161 Terraform；當前資源未建 | CP-00 | 身份/容器/binding存在；syncservice/job仍無；API/outbox按完整plan | fullplan/apply/readback |
| P09-03 | secret pin與最小ACL | NOT_PROVEN | 目前無pseudonymcontainer/version | CP-00 | numericpin及最小reader；無latest/worker新secret權限 | safe version/ACL/IAM receipts |
| P09-04 | config bootstrap | SOURCE_PROVEN | 腳本create3docs；目前最終config缺freshproof | CP-00 | expiry/source/synthetic正確；exists時拒覆寫 | transaction/audit/readback |
| P09-05 | Stage2 runtime/排程 | SOURCE_PROVEN | #160/161尚未部署 | CP-00 | 三service/digests/entrypoints正確；syncPAUSED retry0 | fullplan/apply/runtime graph |
| P09-06 | isolatedHosting→newAPI | CLOUD_READBACK_PROVEN | dated readback仍指舊4f31 API | CP-00 | 新tag目標正確；live/DNS無變；authDomain有效 | before/after release+network |
| P09-07 | 合成修改→pending | SOURCE_PROVEN | #160及candidatecontracts | CP-00 | 唯一candidate/link；SoT不偷偷改；真Calendar禁止 | event+candidate+appointment snapshots |
| P09-08 | pending→reject→audit | SOURCE_PROVEN | reviewapplication/repository | CP-00 | staffreject、audit、returnresponse對帳；unauth不能決策 | network+candidate+audit |
| P09-09 | restore投影到同event | SOURCE_PROVEN | #160restoreoutbox path | CP-00 | sameevent恢復；無第二event；失敗留partial | outboxsettlement+independentCalendarreadback |
| P09-10 | 重播與無重複 | SOURCE_PROVEN | idempotency/lease source | CP-00 | 同input重播不再生candidate/event；並行有界 | before/aftercounts+attempts+audit |
| P09-11 | HTTP429 + durable拒絕 | SOURCE_PROVEN | #159proxy2hop；online仍1hop | CP-00 | ≤20固定identity；429+RetryAfter；排除burst-only假證據 | requestledger+stablehash+store/branchproof |
| P09-12 | StageF11case與舊inspect | NOT_PROVEN | 目前缺candidate/429等 | CP-00 | 全部requiredcase；humanInboxProof；非只空CLI | 11case manifest + both evaluatorresults |
| P09-13 | 回退/告警/lease健康 | CLOUD_READBACK_PROVEN | 舊known-goodrevision與outboxENABLED | CP-00 | 基線healthy且可回退；新inbound不resume；無DLQ/duplicate | rollbackrecord+monitoring+state |
| P09-14 | P1-09關帳交接 | BLOCKED | 新雲端授權、runtime/人證未齊 | CP-00 | 所有P09列完成；datedPRexactCI；不得雲端證據推定 | closurePR+headCI+artifactmanifest |
| BKG-01 | 生日只月日新UI/payload | NOT_PROVEN | 當前year仍可收集；CP-01未實作 | CP-01/02 | 無year；只--MM-DD；閏日/非法日期 | UI+network+strictschema+unit |
| BKG-02 | 本國/外國恰二選一 | NOT_PROVEN | 當前legacytag/label未收斂 | CP-01/02 | 無當日/外籍等舊分類；其他procedure不混國籍 | DOM+payload+domainfixture |
| BKG-03 | 移除證件/來源/referrer/NHI意向 | NOT_PROVEN | 目前多層仍收；C1部分未persist不代表全鏈已移 | CP-01/02 | UI/state/transport/API/domain/persist零新收集；注入被拒 | fieldpath inventory+schema/DB/logdiff |
| BKG-04 | 新預約serverSoT/reload | RUNTIME_PROVEN | 4f31 dated既有合成write；非新欄位版 | CP-02/08 | 新versionbookingcreate/reloadserver仍有；localStorage不是SoT | network+booking/slot/audit/outbox |
| BKG-05 | phone+MM-DD回診查詢 | NOT_PROVEN | 舊fullDOB flow datedpass；新lookup未作 | CP-01/02 | 唯一合法lineage才給returnsession；genericnomatch | lookup/session/API/DBproof |
| BKG-06 | 舊fullDOB合法alias | NOT_PROVEN | hash-only不可反推 | CP-01/02 | 有合法source可建alias；保留patientId/舊預約；不得猜年 | fixedlegacyfixture+transitiontests |
| BKG-07 | hash-only不能安全相容 | NOT_PROVEN | 已識別不可逆限制，缺新safehandling | CP-01/02 | 保留舊row；不生成假alias、不wipe；查詢通用失敗 | negativefixture+no-session/no-writeproof |
| BKG-08 | 共用電話/月日碰撞並行 | NOT_PROVEN | 當前singlepatientIdindex不能完整表ambiguity | CP-01/02 | 多候選/不可辨識failclosed；不顯示他人資料；交易不overwrite | collision/raceemulator+runtime |
| BKG-09 | returnrequired+unscheduled | RUNTIME_PROVEN | 4f31 datedP1-07 flow | CP-02/08 | required/unscheduled才排followup；nonce/expiry/version守門 | APIdomain+returnsession+followup |
| BKG-10 | 取消/改約/duplicate | CI_PROVEN | main既有contract/tests；新identity需重跑 | CP-01/02/08 | 沿原patientIdlineage；cutoff/slot/重播/衝突不繞過 | targetedtests+boundedruntime |
| BKG-11 | 歷史相容read不再收集 | NOT_PROVEN | 新DTO separation未作 | CP-01/02 | 舊read保留；新draft不重送移除欄位；無massrewrite | legacy/newpayload+fixturecounts |
| BKG-12 | audit/export/Calendar無新PII | SOURCE_PROVEN | 既有redaction/exportcontract；待新字段回歸 | CP-01/02/04/08 | 敏感fixture不在log/audit/Calendar或非白名單export | safeartifactscan+negativeassertions |
| SEC-01 | Google+TOTP登入 | RUNTIME_PROVEN | 4f31 datedP1-05R/07；非本計畫runtime | CP-00/02/08 | freshGoogle+TOTP→session→Workbench；錯/過期MFA拒 | privateUI+HTTPsessionreceipts |
| SEC-02 | logout完整成功 | RUNTIME_PROVEN | 4f31 DELETE200及reloadgate | CP-00/02/08 | cookieverify+兩段revoke成功才clearcookie/signedOut | unit+network+session/clientflags |
| SEC-03 | logout部分/雙失敗與安全重試 | CI_PROVEN | #148revoke telemetry/tests | CP-08 | 任一失敗不假成功；每retry兩段；revoked不復活；diag不含PII | revokeunit+controller+telemetrytests |
| SEC-04 | logout/reload/新登入相互隔離 | RUNTIME_PROVEN | P1-05R/07datedsuccess | CP-02/08 | 舊session不rehydrate；freshGoogle/TOTP後真正回Workbench | before/afterUI+HTTP/flags |
| SEC-05 | sessioncookie/roles/TTL | CI_PROVEN | authmodule/tests | CP-08 | 無/過期/撤銷/篡改cookie拒；role偽造無效 | negativeAPI+deny-audit |
| SEC-06 | CSRF write守門 | CI_PROVEN | sourceguards/tests | CP-08 | 缺/壞/跨session/跨originCSRF拒，無businesswrite | boundednegativeHTTP+DBnochange |
| SEC-07 | RBAC最小權限 | CI_PROVEN | appointment/calendarpolicies | CP-08 | frontdesk/manager/未登入分矩陣；export/delete另允角色 | role×actiontable+denialaudit |
| SEC-08 | anti-enumeration | CI_PROVEN | 既有lookup/denialtests | CP-02/08 | 不存在/碰撞/無followupgenericresponse；無病患洩漏 | HTTPshape+latencyreasonedcheck+no-session |
| SEC-09 | denied audit真落庫 | CI_PROVEN | #156denied audit emulator/path；runtime需對帳 | CP-00/08 | deniedrequest有action/classification，沒有token/IP原值任意散佈 | request→audithash+emulator/runtime |
| SEC-10 | session失敗diagnostics安全 | CI_PROVEN | #148cookie/firestore/tokenoperationtelemetry | CP-08 | unknown分類收斂；logger失敗不改結果；parallel各錯皆留 | redaction+loggerthrow+delayedtests |
| SEC-11 | API-onlyAuthIAM | CLOUD_READBACK_PROVEN | datedC1三項permission修復snapshot | CP-00/08 | users.get/createSession/update恰三項；worker不綁；update非用途級限制 | role+bindingreadback+Terraformtests |
| SEC-12 | browser/Firestore/worker邊界 | CI_PROVEN | rules/unauthinvoker/tests | CP-08 | client不能直寫敏感collections；worker需OIDC；APIpublictransport不解staffguard | emulator+401/403+policyreadback |
| SEC-13 | P1-04 missing/off/expired gate fail closed | CI_PROVEN | gate/controller source tests；deployed smoke 尚需補 | CP-00/08 | missing settings 拒boot；off/expired/misconfigured 必要路徑回503且無寫入；不得以404當成功 | isolated negative-revision/env packet + HTTP/DB no-change + source tests |
| SEC-14 | C1 CSP/auth origin 與 disabled staff | CI_PROVEN | Stage E/auth source；需要當前部署證據 | CP-00/08 | CSP 無 forbidden staging origin；停用staff下一protectedcall被拒；不可擴 physician/consultant | actual response headers + bounded disabled synthetic-role proof |
| OPS-01 | 排班發布/14day語意/重播 | RUNTIME_PROVEN | 4f31 P1-07date-specificscheduleevidence | CP-08 | 當前approved horizon；週日/slotcount/version；samekeyreplay | scheduleAPI+slotcounts+UI |
| OPS-02 | Workbench arrived/completed | CI_PROVEN | appointmenttransition source/tests | CP-00/08 | 合法狀態鏈；非法跳躍拒；同eventpatch | UI+appointmentversion+audit/Calendar |
| OPS-03 | outbox投影/lease/重試 | RUNTIME_PROVEN | P1-08datedadaptersettlement；無獨立Calendarlistproof | CP-00/08 | exactevent外部讀回；lease互斥、無重播已完成 | outbox/lease/audit+Calendar |
| OPS-04 | WP-B4 alert開啟/恢復 | RUNTIME_PROVEN | 4f31 P1-06incidentrecovered；人證映射未齊 | CP-00/08 | 告警產生、恢復CLOSED、無舊狀態假警 | monitoringincident/metric/UTC |
| OPS-05 | 真人通知收件 | NOT_PROVEN | user『已收到』但artifact仍pending；未綁incident | CP-00/08 | 一次真收件與incident/ref/time對應，不輸出信箱PII | humanacknowledgement+incidentreceipt |
| OPS-06 | monitoring/IAM告警定義 | CLOUD_READBACK_PROVEN | datedpolicies現存；freshrequired | CP-00/08 | policy/filter/channel正確、非停用；應用health正常 | readback+safeincidenttestscope |
| OPS-07 | migration/version/artifact安全 | CI_PROVEN | 既有inspectors/historicalartifactgates | CP-00/08 | C1baseline/version/rules/index對齊；historicalartifact非liveauthority | migration+artifactinspectJSON |
| OPS-08 | operationaldegrade與事故手冊 | NOT_PROVEN | runbook有程序，當前人走證據未齊 | CP-08/09 | 紙本/事後補登tabletop、權責/通知/恢復；不真停診 | synthetictabletop+operatorreceipt |
| MILE-01 | 首次合格事件與milestone計算 | CI_PROVEN | #149contract/tests；fixture不是policy | CP-POLICY/03 | approvedtrial/adjustment/month；replay穩定、scope隔離 | policyversion+serverevent+tests |
| MILE-02 | 里程碑持久化/API/UI/人確認 | NOT_PROVEN | runtimewiring未有 | CP-03 | 可信receipts、role/reauth、重播不啟動重複計費 | emulator+API/UI+humanack |
| MILE-03 | 正式上線實際一月與尾款 | BLOCKED | Drive01/03條件仍在；不可用synthetic代替 | CP-POLICY/10 | 依核准gate映射；若必要則真operatingmonth證據 | signedmapping+authorizedrealmilestoneproof |
| USE-01 | monthcounts/dedupe/AND | CI_PROVEN | #152contract/tests | CP-03 | stafflogin=0 AND bookingcreate=0才unused；完成預約不是visitcompleted | fixedclock+dedupe+monthboundarytests |
| USE-02 | trustedserver event ingress | NOT_PROVEN | 無BDAPI/workerwiring | CP-03 | 成功businesscommit與receipt一致；失敗/重播不重記 | atomicity/race/integration+runtime |
| USE-03 | 完整/不完整觀測與lateevent | CI_PROVEN | contractcompleteness支援；sourceingress缺 | CP-03 | gap→insufficientevidence不是零；latecorrection有audit | coverage+timewindow+lateeventfixtures |
| USE-04 | 月報UI/1800或500/人審 | NOT_PROVEN | 僅domaincounts | CP-03/09 | 三種結果清楚；不自動invoicepaid；source範圍排synthetic | UI/reportrow+ownerreceipt |
| EXP-01 | safeexport白名單/CSV | CI_PROVEN | #150contracttests | CP-04 | 正確欄/期間；formulaescape；PII非任意spread | downloadbytes/schema+negativefixtures |
| EXP-02 | role+reauth+scope | SOURCE_PROVEN | contractauthproof；runtimeguard缺 | CP-04 | 6欄proof由server建；denied/跨clinic/stalereauth拒 | APInegative+audit |
| EXP-03 | request→生成→ready/partial | NOT_PROVEN | exportjob/storeadapter缺 | CP-04 | uploadhash完成才ready；retry同scope不duplicated | jobstates/artifacthash+failures |
| EXP-04 | download/TTL/revoke/cleanup | NOT_PROVEN | runtimeendpoint/UI缺 | CP-04 | 到期拒；重驗權；cleanup只export-owned | privateHTTP+objectmetadata+audit |
| EXP-05 | 可讀檔案與人確認 | NOT_PROVEN | 未取得合成actualdownloadproof | CP-04/09 | 中文/換行/日期/欄位可讀，接收用途明確 | artifactQA+operatorack |
| RET-01 | archive/softdelete/restore規則 | CI_PROVEN | #151contracttests | CP-05 | approvedwindow；角色/hold；拒無效轉移 | stategraph+boundarytests |
| RET-02 | persisted lifecycle/API/UI | NOT_PROVEN | runtime缺 | CP-05 | 使用者明確可辨狀態；archive後讀權不繞過 | UI/API/DB+audit |
| RET-03 | legalhold與並行刪除 | CI_PROVEN | contracthold；cloudrace未證 | CP-05 | hold競爭先重驗；永久刪除不可跳過授權 | emulatorrace+boundedruntime |
| RET-04 | preview→confirm exactscope | NOT_PROVEN | plan/executeadapter缺 | CP-05 | version/hash相符；集合改變停；非全部selector | previewreceipt+confirmbinding |
| RET-05 | 多層partialfailure/retry | NOT_PROVEN | executor缺 | CP-05 | primary/export/Calendar/audit/backup分層，不假complete | layerreceipts+failure/retryproof |
| RET-06 | backups自然淘汰與刪除清單 | SOURCE_PROVEN | runbook原則；policy/runtime缺 | CP-POLICY/05/06 | 備份未過期不能稱已刪；restore重套approvedtombstones | policy+retentionreadback+restoredcheck |
| REC-01 | PITR+deleteprotection+daily30d | CLOUD_READBACK_PROVEN | 9/22datedC1(default)readback | CP-06 | freshDB(location/type/retention)及schedule | backupinspect+exactDBsnapshot |
| REC-02 | 當日backupREADY與失敗監控 | CLOUD_READBACK_PROVEN | 9/22READY；alert proof另需 | CP-06 | backupusable且alertcurrent；missing/failed有通報 | backupID/state+policy/receipt |
| REC-03 | 新隔離DB真restore/clone | NOT_PROVEN | 只有restoreplan helper | CP-06 | NEWID/操作成功/DBREADY；default不變 | authorizedopID+before/afterreadback |
| REC-04 | V1–V4資料與audit/idempotency | NOT_PROVEN | 2026-07-26emulator非cloudproof | CP-06 | count/10syntheticrows/auditcontinuity/冪等同步 | clonescopevalidationreport |
| REC-05 | V5/V6隔離應用與Calendar對帳 | NOT_PROVEN | 安全cloneboundrunner尚需確認/source補齊 | CP-06 | clonebooking完成+取消；專屬recoveryCalendar無重複；default不變 | runnerbinding+API/DB+Calendarproof |
| REC-06 | 實測RPO/RTO | NOT_PROVEN | D010target1h/4h不是實測 | CP-06 | 明確scenario、cutoff/snapshot/start/usable；比較actualtarget | timestamps+data-losswindow+elapsed |
| REC-07 | 隔離/rollback/cleanuphandoff | NOT_PROVEN | 尚未clone | CP-06 | clone不跑mainworker；cleanup只approvedexactID；noAWS | IAM/dbbinding+sideeffectzero+cleanupreceipt |
| TERM-01 | terminationrequiredfacts | CI_PROVEN | #153contracttests | CP-07 | notice/copyretention核准；缺項incomplete | policyversion+contracttests |
| TERM-02 | case/API/UI與serverchecklist | NOT_PROVEN | wiringmissing | CP-07 | client不能送true假通；跨case拒；deadline/hold | API/UI+negativeemulator |
| TERM-03 | 資料返還/收件對應 | NOT_PROVEN | export+recipientreceipt尚缺 | CP-04/07 | filehash/case/收件人角色/時間一致；下載不等於確認 | artifactreceipt+humanack |
| TERM-04 | backup/audit disposition | SOURCE_PROVEN | contractrequiresconfirmed；actualmissing | CP-05/07 | 每層retained/pending/deleted有evidence；不earlyclose | layerproof+holdtest |
| TERM-05 | partialretry/安全結案 | NOT_PROVEN | executor/runtime缺 | CP-07 | 缺收件或刪除失敗不結案；重播安全；不真停服務 | syntheticcaselifecycle+audit |
| DOC-01 | 正式價格currentauthority | HUMAN_PROVEN | owner指示+Drive00/01/02/03/05/06已freshread | CP-09 | 80k/30-30-20/1800-500一致；未讀04/07/08不可標同步 | privateDriveversiondiff+ownerrecord |
| DOC-02 | 資料欄位/privacy/API說明 | NOT_PROVEN | 新表單尚未實作/文檔未同步 | CP-01/09 | 不收year/四欄；legacy限制及國籍一致 | repo/Drivecrosswalk+runtimeUI |
| DOC-03 | Googlebackup/AWS/site排序 | SOURCE_PROVEN | 最新owner排序；遠端03/05舊independentcopy文字 | CP-09 | currentGoogle能力據實；AWS/site後置非已實現 | remoteapprovedredline/readback |
| DOC-04 | 手冊可獨立操作與截圖 | NOT_PROVEN | 04未freshread；缺新版walkthrough | CP-09 | operator盲走所有核心flow；無真PII/憑證截圖 | manualQA+syntheticcaptures |
| DOC-05 | 正式驗收/具名簽署/權限交接 | NOT_PROVEN | 未取得currentrelease正式acceptance | CP-10 | 版本/範圍/日期/owner；私有credential交接不入PR | signedacceptance+custodyreceipt |
| GATE-01 | INTERNAL_PREPRODUCTION_COMPLETE | BLOCKED | P1-09未閉合 | CP-00 | 舊inspect+strictF全部、runtime/cloud/human一致 | P09closuremanifest |
| GATE-02 | CURRENT_PROJECT_ACCEPTANCE | BLOCKED | newbooking/BD/restore/regression/docs/owner仍缺 | CP-10 | 所有current適用rows PROVEN；無重大未結；milestonemapping清楚 | finalsignedmatrix |
| GATE-03 | PRODUCTION_READY | NOT_PROVEN | productionD-series/隱私/cutover各自未齊 | 獨立productionpacket | 不得由C1/商務acceptance推出PASS | productionownerapprovals/evidence |
| GATE-04 | PUBLIC_PRODUCTION_LAUNCHED | NOT_PROVEN | 本專案C1preview不是publiclaunch | 獨立productionpacket | officialroute/DNS/traffic+獨立cutover批准才true | productionrelease/readback |
| GATE-05 | REAL_PATIENT_DATA_AUTHORIZED | NOT_PROVEN | 目前本計畫無真資料授權 | 獨立productionpacket | 具名合規/隱私/資料scope核准才true | authorizeddatareceipt |

## Stage F 到本矩陣的精確映射

| Stage F case ID | 本矩陣行 |
| --- | --- |
| general_booking_page_create_reload | BKG-04 |
| workbench_arrived_completed | OPS-02 |
| calendar_outbound_same_event | OPS-03、P09-09 |
| return_lookup_existing | BKG-05（CP-00先按當前fullDOB；CP-02改月日重驗） |
| return_required_unscheduled_follow_up | BKG-09 |
| candidate_review_synthetic_manual_change | P09-07～10 |
| security_rate_limit | P09-11 |
| security_anti_enumeration | SEC-08 |
| security_denial_audit | SEC-09 |
| security_one_real_human_alert | OPS-05 |
| persistence_reload_server_readback | BKG-04、OPS-07 |

CP-00驗當時既有產品，不把後續未實作月日輸入倒灌成P1-09隱性條件；
CP-02/08必須以新月日規格重驗受影響行。
P1-09的backup門檻來自既有inspector設定檢查；current acceptance另要求REC-03～07真restore。
跨project/region的D010目標仍獨立NOT_PROVEN，不以單C1restore聲稱全災難場景通過。
AWS未建與官網未做均不是本矩陣當前failure；若formal文件仍寫相反，DOC-03需對齊。

## Gate 計算

### 原 F-01～F-14 不遺漏對帳

依[原 closure 定義](../reviews/2026-09-15-wp-b1-b11-signed-authority-and-f-closure.md)逐項核對；
舊「CONFIRMED/PARTIAL」是當時 finding，不直接抄成今天結論。

| 原 finding | 本矩陣／必需證據 |
| --- | --- |
| F-01 API | P09-05/06、BKG-04、SEC-13；gate-on 真讀寫、gate-off 503，不是404 |
| F-02 route inventory | OPS-07；C2/C6+architecture intentional-failure 歷史證據與現行 source/tests，不亂開 BookPilot/CalendarWatch |
| F-03 durable limiter | P09-11；burst/durable 分層、各policy class、restart persistence |
| F-04 denied audit | SEC-09；拒絕寫入落 audit，重播不重寫 |
| F-05 missing settings | SEC-13；缺token/settings不能boot，禁止optional fail-open |
| F-06 evidence custody | P09-14/DOC-05；redacted可攜bundle；丟失就NEW_EVIDENCE_SET不補hash |
| F-07 server SoT | BKG-04；兩個隔離browser看到同booking，清自身sitecache後serverrow仍在 |
| F-08 patient IdP | 已由WP-B3取代；BKG-04/05須accountless，不新建patientFirebase/OTP |
| F-09 monitoring | OPS-04～06；application告警＋真收件 |
| F-10 CSP | SEC-14；實際C1header不含forbiddenstagingauthorigin |
| F-11 stale authority | DOC-02/03/05；currentoverlay與舊史分開；不偽造approval |
| F-12 disabled staff | SEC-14；下一protectedcall拒，不hard-code accountActive=true |
| F-13 grid permission | SEC-07/OPS-01；本stage記錄create_appointment耦合；不可暗加read_schedule或擴D-006 |
| F-14 roles/reviews | SEC-07；manager/front_desk/accountlesspatient；其他roles仍out-of-scope，reviews=0是已接受政策 |

1. INTERNAL_PREPRODUCTION_COMPLETE：
   P09必要行、StageF全部11cases、舊completenessinspect（CI/Hosting/backup/monitoring/
   migration/smoke/historicalartifact/humannotification）全部有實證；同一scope/release可追溯。
2. CURRENT_PROJECT_ACCEPTANCE：
   技術gate通過、BKG/SEC/OPS/MILE/USE/EXP/RET/REC/TERM/DOC所有**核准current適用行**
   完成，加無未解current重大缺陷及具名業主驗收。
   適用性必須事前記錄owner批准的scope，不能測失敗後才改成notapplicable。
   MILE-03若明確分成日後正式運行付款milestone，可保留PENDING_OUTSIDE_ENGINEERING_GATE；
   必須有owner映射，不能由agent自行排除。
3. PRODUCTION_READY／PUBLIC_PRODUCTION_LAUNCHED／REAL_PATIENT_DATA_AUTHORIZED
   分別保存獨立證據與false/NOT_PROVEN狀態，不是上兩gate的衍生值。
4. source變更後依dependency重驗，auth/index/transport/worker修改會使相關rows過期。
   docs-only只可證tree等價，不能把部署標籤改成新docsSHA。
5. 有必需FAIL或缺證據時總gate保持NOT_PASSED；不將未證明改成不適用，不將人未回覆填收到。
