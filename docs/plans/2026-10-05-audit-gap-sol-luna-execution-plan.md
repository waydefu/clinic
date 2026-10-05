# 2026-10-05 稽核漏網複核與 Sol／Luna 執行圖補充計畫

**狀態：** planning-only／待業主 review；不是修復、架構決策核准、施工放行、merge 或部署授權。
**業主：** `wayde.fu`。Sol 是架構／安全與整合責任角色；Luna 是後續有界施工角色。
**基準：** `origin/main`、HEAD `264e3e09128eb5477103eaa081c66ebe4e0b4865`，唯讀檢查時工作樹乾淨；2026-10-05 20:34 Asia/Taipei 再 fetch，遠端仍為同一 SHA。

## 1. 範圍、權威與非目標

本文件補充 [#239](https://github.com/waydefu/clinic/pull/239) 的
[244 項後續計畫](2026-10-05-audit-followup-luna-plan.md)，不替換該文件、不重寫歷史稽核。
本輪只允許唯讀 source 分析、合成／非破壞性驗證、新計畫與必要文件索引、planning PR。
**不修改 production source、API／domain／worker、Terraform、security control；不 migration、secret mutation、deploy、apply、cloud mutation、合併 PR，也不啟動 Luna 施工 worker。**
三個獨立唯讀審閱角色只提出證據與分類，沒有施工、寫入或雲端權限。

最小權威集合：[AGENTS](../../AGENTS.md)、[GOVERNANCE](../../GOVERNANCE.md)、
[文件 router](../INDEX.md)、[決策登記](../product/phase-1-decision-register.md)、
[SECURITY](../../SECURITY.md)、[domain boundaries](../architecture/domain-boundaries.md)、
[API 契約導覽](../architecture/api-v1-contract.md)、[RBAC matrix](../architecture/rbac-matrix.md)、
[ADR-0007](../adr/0007-minimized-booking-intake-and-identity-resolution.md)、
[ADR-0002](../adr/0002-calendar-is-a-projection-not-the-lock.md)、
[ADR-0009](../adr/0009-business-delivery-export.md)、[ADR-0010](../adr/0010-business-delivery-retention.md)。
程式／runtime 與 prose 不一致時記錄落差，不把舊 prose 當作實作證據；Canon 政策仍須由業主定案。

已讀回 #239 為 MERGED，merge commit 就是上述 baseline。
[#238](https://github.com/waydefu/clinic/pull/238) 也已 MERGED，merge commit
`9e082f6eff87e3e052cb92f98abc856ef87251a1` 是 baseline 的 ancestor。
所以 #239 的「等 #238」是已滿足的 source dependency，不是新授權；舊 AUD-01 文件的 OPEN／待 CI 敘述保留為當時證據，由 SOL-13 作追加式交接，不能推定 AUD-07 或 K2 已結案。

## 2. 與 244 項的關係及資料限制

原報告宣告 **244＝High 12／Medium 80／Low 152**。本輪機械展開 #239 附錄 A，驗證
**244 個唯一 ID、零重複主列**；這是「計畫索引覆蓋」，不是原報告逐項內容／severity 的重新驗證。
不以連號推定存在未列的 finding，也不補造 ID。

其中 **W4 有 176 IDs**，僅有 ID、沒有逐項去識別摘要；原始完整報告依 #239 由業主本機保管，本輪沒有取得。
因此不能把 W4 全部當低風險施工包，也不能證明本輪候選與 W4 原文完全不重複。
176 項先歸 SOL-00／**需要業主提供安全摘要**，不是宣稱全部升級 High。
安全摘要最少要有 ID、標題、原 severity、影響、owning source／tests、決策 lineage；不得包含私有設定、真實資料、secret 或可重放利用步驟。

E4-01／E4-12 的文件／程式分界及 D-42 的核心／歷史時段範圍，#239 正文與表格未充分對齊，亦須 SOL-00 釐清。
B-41 只設一個 primary owner SOL-06，B-05 的 CI wiring 另歸 LUNA-B09。
E1-08 primary 歸 SOL-00；其已知「例外到期」子範圍可在 Q1 核准後交 LUNA-A08，但不得兩個 worker 同時 claim 此 ID。

下節 **10 個 review entries** 是 NEW-01～08 的指定候選加兩個 blind-review 候選：
8 項 `CONFIRMED` 的是本機／source 邊界行為，1 項 `NEEDS_RUNTIME_PROOF`、1 項 `HIGH_CONFIDENCE_CANDIDATE`。
**這不是「原 244 額外淨增加 10 個已成立漏洞」**；SOL-00 取得安全摘要後才決定去重、合併或新增正式 finding。
新 severity 是 remediation 優先級提案，不能改寫原 12／80／152 統計。

## 3. 狀態、severity 與 NEW-01～08 驗證

- `CONFIRMED`：在本輪 baseline 實際執行的 source 邊界／本機 probe 可重現；仍須寫清 mock 與部署限制。
- `HIGH_CONFIDENCE_CANDIDATE`：有明確 source 機制，影響未實測。
- `NEEDS_RUNTIME_PROOF`：provider／大資料／部署邊界未證實，不能據此施工。
- `ALREADY_FIXED`：exact main source 已有修正；要關帳仍須該 ID 的 acceptance evidence。
- `FALSE_POSITIVE`：假說已被反證；保留理由，不創造修復包。
- `NOT_APPLICABLE`：不適用於目前已核准 scope；不是永久安全聲明。

| ID | 狀態／severity 提案 | baseline 證據與根因 | 影響、反證與限制 | primary packet |
| --- | --- | --- | --- | --- |
| NEW-01 | CONFIRMED／High | `apps/api/src/internal-test-booking/internal-test-booking.authenticator.ts:101-122` 將合法、啟用且 email verified 的非員工 Firebase UID 直接當 `verifiedPatientId`；`appointments/appointment.application-service.ts:283-340` 接受該 context；`firestore/booking.repository.ts:101-123` 只拒絕 archived、不拒絕缺患者紀錄。實際 controller→authenticator→service→policy→repository 的本機合成 probe 成立。 | 可產生沒有患者紀錄的 appointment／slot reservation，未經 intake／該 intake 的 consent 記錄。這不證明真實身份錯綁或已發生個資外洩；UID 已有 binding 者不能一概要求重新 intake。accountless 初診仍必須保留，但 intake 不是 return verification；return-session 路徑已有患者存在／非封存檢查。預約 gate 關閉時此 routed 寫入不開放；未驗證真實 Firebase 註冊或 deployed reachability。 | SOL-01 |
| NEW-02 | CONFIRMED／High | 同 authenticator `:83-121`：cookie 分支走 `sessions.authenticate`＋write CSRF；staff Bearer 分支走 Firebase 檢查與 allowlist／TOTP 後直接回 staff context。合成 probe 證實未呼叫 server session、booking write 與 manager schedule-publish policy可授權。`schedule/schedule.controller.ts:65-81` 接相同 authenticator。 | 是 staff session lifecycle 模型不一致，不是「所有 CSRF 被繞過」。Bearer 不是瀏覽器自動攜帶 cookie；Firebase token revoke／disabled／TOTP 檢查仍在。未宣稱 Firebase revocation 可繞過；Firestore session 不存在或 `revokedAt` 的決策不會進該分支。front_desk 不因此取得 manager-only publish 權限。BusinessDelivery 等 cookie-only guard 不接受此路徑。 | SOL-02 |
| NEW-03 | CONFIRMED／Medium（configuration-conditional） | `auth/calendar-pilot-session.ts:45-63` 的 role resolver 對重疊 allowlists 優先 manager；合成 service create 也得到該 role，未拒絕重疊設定。 | 不代表 live allowlist 已重疊、也不是未認證提權。須決定 disjoint configuration 是否為 invariant；建議設定 readiness／boot fail closed，而非靜默優先較高 role，不能自行把建議當核准。 | SOL-02 |
| NEW-04 | CONFIRMED／Low | `auth/calendar-pilot-session.ts:29-37` cookie decode 可拋 URIError；實際 authenticator probe＋`platform/errors/api-error.ts:246-271` 映射為 500。 | 預期 malformed authentication material 應為認證失敗，而非 500。不能把本機錯誤映射當 deployed HTTP 驗收；既有合法 cookie／CSRF 行為不可改。 | LUNA-B01 |
| NEW-05 | CONFIRMED／Low；長度子假說 NEEDS_RUNTIME_PROOF | `patients/patient-directory.ts:399-406` 在 opaque ID validation 前建立 Firestore reference；本機真實 SDK reference validation＋mock read 證實部分 path 結構會在 auth 邊界映射 500。 | 已涵蓋 path、過長、非 opaque 字元、encoded-value 類型；不是每種 malformed 值都造成 500。過長值在 reference 建構可通過，mock miss為 auth failure，未呼叫 provider，不能宣稱伺服器接受長 ID；header 不應擅自 URL-decode。未證明任意 Firestore 讀取或資料洩漏。 | LUNA-B01 |
| NEW-06 | CONFIRMED／Medium（行為確認、政策風險待決） | `firestore/business-delivery-export.repository.ts:290-317` 在同交易讀取／hash 核對後扣額度、append log；`business-delivery/business-export.controller.ts:58-75` 的 GET 在此後送出 reply。實際 repository／controller 的本機合成 response-failure＋retry probe確認狀態先提交。 | 主要是 quota／audit 與 retry、double-click、prefetch 語意，不是 REST 形式本身。Strict cookie 降低一般跨站觸發；GET guard 不做 CSRF，`no-store` 不提供冪等性。未做 browser prefetch／真實斷線或跨站測試，不能宣稱 CSRF exploit。ADR-0009 已接受 GET，直接改 POST 是契約／政策變更，須先決策。 | SOL-09 |
| NEW-07 | CONFIRMED／Medium（容量影響待量測） | `auth/calendar-pilot-session.ts:340-377` 每次 protected authentication 都在同 session transaction update `lastSeenAt`；本機相同 timestamp並發呼叫的 counter probe確認每次更新。 | dashboard 同一 session 有 write amplification／contention 的機制；真實 hotspot、retry、費用尚未量測。現行 Canon 為絕對 12 小時、**不因閒置登出**，不得把 throttled touch 改成滑動效期或恢復舊 idle timeout。logout／disabled／revocation 仍須每個請求即時檢查，不能用 role-cache代替。 | SOL-02 |
| NEW-08 | CONFIRMED／Medium（application boundary） | `auth/calendar-pilot-session.controller.ts:61-79` create 直接呼叫 service；`app.module.ts`、`main.ts`、`calendar/calendar-pilot.module.ts`／`internal-test-booking.module.ts` 未提供該 endpoint 的 per-IP／account limiter。實際 controller/service重複合法合成 create可持續建立 session。 | Firebase token verification／MFA 是上游控制，不等於本系統 session creation 配額；失敗在 token validation 前後的成本也需納入。上游配額、入口限制及 live Cloud Armor未查，不能宣稱互聯網無限資源或已發生 abuse。IP只能依 SOL-05已決定trust boundary；不得讓 Luna重設identity buckets。 | SOL-02 |

### 驗證場地與保管契約

本輪本機 probes 使用 Node `v24.20.0`、esbuild 編譯**上述 exact baseline source**，
Firestore SDK `@google-cloud/firestore@8.6.0`；Firebase verifier 與 transaction store使用合成 stub，無真實 token、患者或網路呼叫。
患者預約 probe 使用真實 controller／authenticator／application／RBAC／booking repository；SDK path probe只建 reference，不呼叫 SDK `.get()`。
Export probe 使用真實 repository／GET controller，但 service bridge與 reply故障為合成，並非完整 Nest guard／HTTP transport測試。
依賴取自本機既有已安裝 workspace；`package.json`、`pnpm-lock.yaml`、contracts／domain source與baseline無差異，未改安裝設定。

computational evidence：7 個 auth／identity／session probe groups PASS，加 1 個 export probe PASS。
首次 probe 因 harness constructor與actual interface不符失敗，不作finding證據；修正**scratch harness**後執行上述probe，沒有修改 production code。
完整 command、mock設定、fixture、輸出與 source binding保存在業主受控證據，**不進 repo、PR、聊天或公開 artifact**。
public evidence只保留安全結果、source位置、mock限制及baseline；不得附payload、私有設定、認證材料、重放方式或攻擊量測。
既有 unit／emulator／E2E本輪 NOT_RUN；新planning PR的CI不能冒充這些finding的修復驗證。

## 4. 新一輪 blind review：新增候選、反證與覆蓋

| entry | 狀態／severity | source與判斷 | 後續 proof／責任 |
| --- | --- | --- | --- |
| NEW-09 | NEEDS_RUNTIME_PROOF／Medium provisional | `apps/worker/src/calendar-sync/google-sync-client.ts:90-149`、`sync-engine.ts:286-311,475-487`、`firestore-calendar-sync.repository.ts:240-260,331-395` 把 provider page累積為單次 sync commit，未見明確byte／transaction-time budget。僅提出大頁資源 envelope／checkpoint可恢復性疑問；未證明當前合法最大頁會失敗。 | Sol先計算真實序列化request與reads／duration，再用local emulator合成大頁、重跑、source-version衝突及中途失敗測試；無需改production source。若合法provider envelope仍在安全限額，應FALSE_POSITIVE或記known-capacity，不為此加batch。若需batch，checkpoint／token advancement／原子性與lease由SOL-07親自設計及實作，不能交Luna猜。 |
| NEW-10 | HIGH_CONFIDENCE_CANDIDATE／Medium provisional | `infra/terraform/cal-pilot/main.tf:83-87` 宣告 builder project-level storage object viewer；`c1-foundation/main.tf:83-98` 的 CI role也含project-levelstorage授權。source scope可見，但額外 bucket、effective IAM與核准用途未查。既有B-01／B-02 IAM收斂可能已涵蓋，需原摘要去重。 | SOL-06比較source bucket需求與角色有效範圍；owner另行授權唯讀bucket／IAM inventory才驗證liveblast radius。IAM／WIF不得變成Luna一般施工包；不apply。 |
| BLIND-X01（不列入10項） | FALSE_POSITIVE | 「單次sync超過500 writes必失敗」不能成立為目前quota事實。parent複核installed SDK及[Firestore官方限制](https://firebase.google.com/docs/firestore/quotas)：500指單一文件field transforms，不是任意transaction的總write數。NEW-09只保留真正byte／time與恢復性疑問。 | 不把repo舊註解當provider限制，不以本假說增設修復包。 |
| BLIND-X02（既有） | ALREADY_FIXED（source） | #238已在main修HTTP Bearer scheme ASCIIcase識別及return／staff context混用；本輪讀目前authenticator確認，不再重複立案。 | AUD-01原acceptance與具名交接由SOL-13讀回，不以靜態閱讀宣布AUD關帳。 |
| BLIND-X03（既有） | NOT_APPLICABLE（作為新政策違反） | 專用Calendar的approved title projection與retention後保留`audit_events`／`bd_*`符合現行ADR修訂；不能把舊「全部PII不得投影」當新finding。 | privacy告知仍由SOL-12／Q2處理；真實資料與production仍未授權。 |

trust-chain覆蓋是定向唯讀複核，不是全repo完整稽核或runtime安全證書：

| 邊界 | owning source／檢查 | 結果／限制 |
| --- | --- | --- |
| Authentication→Staff Session→RBAC | authenticator、`calendar-pilot-session.ts`、guard、`platform/authorization/rbac-appointment-policy.ts` | NEW-02～04／07～08；role／CSRF保留條件如§3；未測真實IdP。 |
| Patient Identity→Return Session→Booking | patient directory、appointment service／controller、booking repository | NEW-01／05；return session讀患者存在／非封存；K1／K2／D-08與本案去重。 |
| Schedule→Firestore | schedule repository、booking transaction、domain schedule | 已知A02／D-07／D-42歸SOL-08；本輪未見獨立新鎖定缺口，未跑emulator race。 |
| Outbox→Worker | outbox repository、consumer、worker calendar port／projection | 有batch／retry／lease generation fencing；不能據此證明全部concurrency正確。D-01～03／05／12歸SOL-07，現有test不足以視為runtime已驗收。 |
| Worker→Google Calendar | Google sync reader、sync engine／repository、pilot runtime | NEW-09；Calendar仍是projection；409／410／lease／truth recovery沿既有backlog。未連真實Calendar。 |
| Export→Retention | export repository／controller／guard、retention repository、ADR0009～10 | NEW-06；A09大交易、A05／K4等TTL已有包，不重复立案。TTL實際部署／刪除及備份重套刪除未驗證。 |
| IAM→WIF | `c1-foundation`、`cal-pilot`、`c1-internal-test-run`及build scripts | NEW-10；B-01／02／03／09／41已有scope；僅source，未查liveIAM。 |
| Frontend session→API truth | `calendar-pilot-entry.js`、api-client／transport、staff／patient頁及existing tests | cachedCSRF／failure-as-empty等已有C04／X-C項；#238清除上下文已在source。不得以瀏覽器local state替代serverRBAC。 |
| Deployment→Rollback→Monitoring | PowerShellrelease／rollback、workflow、health與WP-B4source | nativeexitcode假成功、health／alert假綠已有E1項／A12／D-25／B06～07／54；本輪不執行release、rollback或cloudquery。 |

## 5. 分類規則與 architecture queue

四個分類可有blocking標記交集；**primary packet唯一**，不是讓同finding被四個worker各修一次。

1. **Sol-only複雜包：** auth／binding／staff session／RBAC、HMAC與migration、rate-limitidentity、trustproxy、IAM／WIF、transaction／cross-collection atomicity、Calendartruth／lease、publiccontract、privacy／data-model。Sol決策＋實作，不把高風險code改寫直接交Luna。
2. **Luna-ready小包：**架構已存在、規格封閉、機械化acceptance的小包；`READY_SPEC`只表示可在**下一輪授權與freshbase／packet claim後**施工，不表示本轮已啟動。
3. **需要業主決策：**缺safe摘要／政策／授權；`OWNER_BLOCKED`不得放行。依賴Solarchitecture的Luna候選是`ARCH_BLOCKED`，不是Luna-ready。
4. **外部／Cloud blocker：**liveprovider／IAM／部署／migration／runtime權限；文件或source PR合併都不能將其標PASS。

所有future packets共用forbidden scope F：無另行freshexact approval不得deploy／apply／secret／IAM mutation／migration／真实資料／historyrewrite／protectedmerge；不得自行改role、政策、breakingcontract、gate或threshold。
Sol包也受F限制；model ownership不產生高權限。

### 5.1 Sol primary queue（每行為同一根因／安全邊界的原子責任包）

`High/Medium/Low`是本輪NEW提案；舊finding severity逐ID沿原安全manifest，不由Wave猜測。
`R` runtime needed與`D` decision needed在此與§8列明；CI／tests／DoD見§6，按packetID合成完整execution matrix。

| Packet | Finding IDs／severity | Why Sol；likely files | Depends on／Blocks | R／D；parallel group；merge order |
| --- | --- | --- | --- | --- |
| SOL-00 | W4 176 IDs＋E4-01／12範圍釐清；severity UNKNOWN逐ID | 不是大施工包：registrytriage，從安全摘要判定risk／duplicate／sibling與小包；`docs/plans`、決策登記的後續提案，原報告不入庫。 | owner安全摘要→細分W4；擋所有W4施工及最終淨新增數。 | R=no／D=G0；G-meta；M0。 |
| SOL-01 | K2、NEW-01／NEWHigh | patientbinding、intake不是verification、patient＋slot atomicity、orphan防護；authenticator、patient directory、appointment service、booking repository、contracts/domain tests。 | G1/Q6＋SOL-03／04共同identity設計；擋LUNA-B08與identityclosure。不得循環互等：先共同design，再按M1實作。 | R=emulator＋日後授權syntheticruntime／D=yes；G-auth；M1。 |
| SOL-02 | NEW-02／03／07／08；High/Medium | staff credential/session模型、configuration privilege、lastSeen touch與abuseidentity；auth session／authenticator／guard／controller、config、limiter、role tests。 | G2/G3/G6＋SOL-05trustinputs設計；擋B03／B04／B08，与SOL-01／B01共核心檔必須串行。 | R=本機HTTP／emulator＋日後IdP／capacity／D=yes；G-auth；M2。 |
| SOL-03 | K1、K4、B-52；原severity待manifest | lookup扣桶順序、HMACidentity、固定長ID；domainlookupidentity、WP-B2 limiter、appointment lookup／tests。 | Q7＋G6；提供SOL-01／04design，不可在查無後才限流。 | R=localmulti-instance／futureprovider／D=yes；G-auth；M3。 |
| SOL-04 | D-08、A05、B-04；原severity | crypto版本相容、returnTTL、index／worker／retention資料模型；patient-directory、identitynodehelper、workerrepository、indexes／TTLsource。 | SOL-03 design→compatibilitysource；任何data migration須另freshapproval。 | R=emulatorcompatibility＋futureTTL／D=Q7；G-schema；M4。 |
| SOL-05 | B-03、K6；原severity | proxytrust與IPv6key不能猜；`platform/runtime/client-ip.ts`、config／tests、入口契約。 | Q5／C1 XFF proof；先定identity獨立於IP，才讓SOL-02／03實作bucket。 | R=yes external／D=Q5；G-edge；M1設計，M5source。 |
| SOL-06 | B-01／02／41／09、E1-12、NEW-10；NEWMedium candidate | IAM／WIF、runtime SA、bucket scope／no-key；foundation／pilot／internal-runTerraform、release scripts及tftest。 | Q8／Q9＋G7；B-41唯一owner；擋external effectiveIAMclosure。 | R=yes；D=yes；G-iam；M6，與B09共享workflow／tf時串行。 |
| SOL-07 | D-01～03、D-05／12、NEW-09；NEWMedium未證實 | Calendar恢復、mappingtruth、leasefencing、pagecommitresource／checkpoint；workerGoogleclient／projection／runtime／sync repository及tests。 | ADR0002、NEW09先proof；擋Calendarclosure，不能交Luna做batch設計。 | R=emulator／fakeCalendar，futureprovider；D=G8如需改projectioncontract；G-calendar；M7。 |
| SOL-08 | A02、D-07／42；原severity | schedule transaction範圍、arrived/open、過去slot／querycaps；schedule／booking repository、domain schedule、vendoreddomain。 | SOL-00釐清D42、現行Canon；擋schedule／capacityclosure。 | R=emulatorrace＋futureTTL；D=新狀態語義若Canon未定；G-booking；M8。 |
| SOL-09 | A09、NEW-06；NEWMedium | exportsnapshot跨collection一致性與downloadquota／auditretry；export repository／application／controller、ADR0009後續decision。 | G4；先定完整快照與何謂download，再設計是否保留GET或POST-issuedticket；不能先分頁／改POST。 | R=emulator＋localHTTP/browser；D=yes；G-export；M9。 |
| SOL-10 | K7、C07、E4-24；原severity | truncated提示涉及publiccontract與caller；contracts、appointment service、admin UI／tests。 | G5compatibility；与SOL-01／03的service寫入串行。 | R=localAPI/UI；D=breaking時必須；G-api-contract；M10。 |
| SOL-11 | A12、D-25、B-06／07／54；原severity | operationalhealth、metricfilter與alarmpredicate不能假綠；health／observability／ApiExceptionFilter、WP-B4Terraform与fixture。 | 現行StageEcanonicalschema＋G9threshold；擋監控runtimeclosure。 | R=syntheticfault本機＋futurealerts／backup；D=若改SLO／threshold；G-observability；M11。 |
| SOL-12 | E3-03；原severity | privacyarchitecture／告知原句與approvedCalendar投影一致；privacy頁、legal／securitydocs、ADR／decision lineage。 | Q2＋專業審閱；擋A02政策部分。 | R=告知render／legalnotautomatable；D=yes；G-privacy；M0決策後M12。 |
| SOL-13 | E4-03＋全包整合（不是其他ID第二個修復owner） | source整合與追加式closeout，#238 exact evidence與K2區分；唯一sharedplan／tracking／index writer。 | packets exactmain驗證＋剩餘blocker；擋sourcefreeze／finalclaims。 | R=按未關項；D=具名reviewer、每PRmergefreshapproval；G-integration；最後M13。 |

### 5.2 Luna execution graph（19 個有界候選包；只放行 READY_SPEC）

每個Luna一正常context完成；原W2/W4不是自動放行條件。所有code包severity沿primaryID／§3；UNKNOWN severity不擅自降級。
以下future小包只實作已定規格，不做Sol包安全架構；明確`OWNER_BLOCKED`／`ARCH_BLOCKED`不是ready。

| Packet | IDs；status／Why Luna | likely files／封閉scope | Depends on／Blocks；R／D；group／merge order |
| --- | --- | --- | --- |
| LUNA-A01 | B-21、E3-01、E4-10；OWNER_BLOCKED；當前聯絡資訊改role | #239 W1-01指定文件／firebase配置中的displaycontact；只替代當前值，不動history／credentials。 | Q3=A／Q4角色信箱；R=no／D=yes；G-doc-contact；D1。 |
| LUNA-A02 | E3-02；OWNER_BLOCKED；已核定privacy文句同步 | privacy-policy-draft及其checklist，不決定資料政策／法律。 | SOL-12／Q2與原句核准；R=render／D=yes；G-privacy；D2。 |
| LUNA-A03 | B-12、C05；READY_SPEC；README敘述對齊可見source | rootREADME／package command描述，不改program behavior／授權狀態。 | freshsource核對；R=no／D=no；G-doc-readme；D1。 |
| LUNA-A04 | E3-07；READY_SPEC；runbook不存在步驟更正 | owningrunbook的維護模式描述，不新增可執行cloud命令。 | source核對；R=no／D=no；G-doc-runbook；D1。 |
| LUNA-A05 | D-38、E3-04／06／19；READY_SPEC；canonicalfields／sessiondoc漂移 | #239 W1-06列出的security／legal／runbook docs；依STAFF-SESSION-12H與approvedminimization，不改Canon。 | source／Canon目前一致；R=no／D=no；G-doc-session；D1，與A02同檔則串行。 |
| LUNA-A06 | E1-01／02／11；READY_SPEC；nativecommand失敗不得假成功 | `scripts/cal-pilot-*.ps1`中既有流程的exitcode檢查與mockcommandtests；不改targets、roles、rollback策略。 | 無cloudexecution；R=localmock命令正負案例／D=no；G-ps；D1。 |
| LUNA-A07 | B-13／31／55；READY_SPEC；敏感keypath忽略規格 | `.gitignore`與ignore契約測試；不得讀key、撤銷或刪除已存在key。 | 輸出pathpattern不含值；R=no／D=no；G-ignore；D1。 |
| LUNA-A08 | B-48、E1-08到期子範圍（auxiliary）；OWNER_BLOCKED | 只依具名Q1核准精確更動exceptionmetadata與generatedstate；不得自行延期或weakengate。 | Q1；與SOL-00對E1-08鎖scope；R=no／D=yes；G-supply；期限lane。 |
| LUNA-A09 | E4-08；ARCH_BLOCKED；有已核准compatiblepatch時dependency施工 | manifest／lock／audit-exception必要release條件與tests；先核對installedresolution，不盲升#239版本門檻，不猜advisoryresolved。 | Sol確認upstreampatch／兼容版／exception處置；R=install＋emulator／D=若無patch需owner；G-supply；期限lane，与A08串行。 |
| LUNA-A10 | E4-01／12文件子範圍（auxiliary）；ARCH_BLOCKED | 安全的追加更正／currenthandoff，原datedreview不可rewrite；不關codefinding。 | SOL-00分界與canonicalstatus；R=no／D=具名evidenceowner；G-doc-evidence；D3。 |
| LUNA-B01 | A01、A11、NEW-04／05；READY_SPEC；既有invalid-input／auth-error契約機械落實 | pathID／cookie／returnID邊界驗證與tests，使用現有opaque規格；不normalizecredentials或改認證架構／接受規則。 | 與SOL-01／02的authenticator／directory不得平行；可先做有界error containment，由Solclaim安排；R=localHTTP＋SDKpurevalidation／D=no；G-auth；C1。 |
| LUNA-B02 | K5；READY_SPEC；既有errorfilter作用域修正 | 根module的existingglobalfilter註冊及root-route測試；不改taxonomy／safe message／logging PII或新增permission。 | B01 mapping保持既有契約；與SOL-11改filter時串行；R=localHTTP／D=no；G-error-filter；C2。 |
| LUNA-B03 | C04、X-C01／02；ARCH_BLOCKED；API失敗不能顯示成空資料 | api-client／staff或patientremote-mode錯誤狀態與UItests；不改session資格／identitybinding。 | SOL-01／02完成相應sessioncontract；R=browserfakeAPI／D=no new；G-web-core；C3，擋B04。 |
| LUNA-B04 | C01／02；ARCH_BLOCKED；staffserver-mode字樣與identityhydration | index／staff入口與現有servercontextconsumption；不造email／role、無新增privilege／responsecontract。 | B03＋SOL-02；R=UI＋rolecontextdeniedtests／D=no new；G-web-core；C4。 |
| LUNA-B05 | X-C04；READY_SPEC；失敗／finally恢復button狀態 | #239 W2-14指定動作按鈕與UIunit；不吞authenticationerror。 | 與B03／04同core檔則串行；R=browsermockfailure／D=no；G-web-core；C5。 |
| LUNA-B06 | X-C05；READY_SPEC；weekanchor顯示bug | owningweekview／datehelper的既有UTC／Taipei語意及tests；不得重寫domain時區規則。 | 與B05／04共享入口時串行；R=UIboundarydate／D=no；G-web-core；C6。 |
| LUNA-B07 | X-C06；ARCH_BLOCKED；previewhost判斷對齊已核准契約 | 既有hostpredicate及synthetic-hosttests；不改hosting、channel、路由授權或新增runtimeallowlist。 | Sol核對sourcehostcontract；R=URLmatrix／D=未核准host不能猜；G-web-core；C7。 |
| LUNA-B08 | X-C07；ARCH_BLOCKED；移除已定義stalecontext | browserstorage／logout/restart清除tests；不得重新設計patient／staffsession或破壞合法return。 | SOL-01／02＋B03；R=same-tabflowE2E／D=no new；G-web-core；C8。 |
| LUNA-B09 | B-05；READY_SPEC；既有Terraformtests納入CI | `.github/workflows/verify.yml`及workflowregressionfixtures；不改permissions、requiredaggregate或Action版本。B-41授權assertion由SOL-06唯一擁有。 | 合法既有tfmoduletest契約；與SOL-06／11同workflow則串行；R=CIpositive／negativefixture／D=no；G-ci；C9。 |

EXT-01 primary B-08：外部／Cloud blocker，不是Luna包。owner另行exactdeploymentauthority後核對有效設定；
source／docs gate都不能代替部署讀回。requiredtests為該ID的controlledruntimecase，requiredCI仍E，DoD為exactartifact／target／output／reviewer，parallelgroupG-cloud，mergeorder不適用（不是cloud操作PR）。

## 6. 每包 tests／CI／Definition of Done

完整executionmatrix＝§5每行＋以下同ID驗收＋§7context／parallel／§8decision。
**每包forbidden scope都是F**；Luna額外禁止改Sol的architecture／schema、sharedplan／tracking／index、別包ID、未知policy。

Gate codes（依repo scripts實際名稱，不是inventedgate）：

- **D**：`check:docs`、`check:governance`、`check:structure`、`check:format`、`git diff --check`、tracked-secret scan；publicsafe diff。
- **C**：D＋`check:types`、lint、targetedtests、`test:unit`、`check:architecture`；contract/domain變動依Canon同步build／vendoreddomain並跑`sync:domain`／`check:domain-sync`。
- **FST**：local disposableFireStoreemulator／`test:rules`，嚴格localtargetguard；不使用ADC或remoteproject。
- **WEB**：相關E2E／`check:ui`／`check:perf`，不得提高budget。
- **TF**：owningmodule `terraform fmt -check`／`validate`／`test`；永不apply，不使用realsecretvalues。
- **E**：每個PR都讀回 `.github/workflows/verify.yml` 的exacthead所有requiredjobs＋`Verification evidence`；不因docs-only改workflowskip。

| Packet | required tests（正／負） | required gates | DoD／runtime proof邊界 |
| --- | --- | --- | --- |
| SOL-00 | 展開244ID、uniqueprimary、NEW去重、severity來源、scopeclaim互斥 | D、E | 安全摘要完整、每ID有owner／case／severity／decision；unknown不得標ready。 |
| SOL-01 | bound／unbound／disabled／archived、intakeconsent、合法accountless／return／staff、duplicate／retry、patient＋slot失敗原子性 | C、FST、WEB、E | 規則經Canon核准；否認在reserve前／同transaction，無orphan；samekeyretry與合法患者保持。runtime未跑獨立列開。 |
| SOL-02 | cookie／Bearer scheme與mixedcontext、Firestore revoked／expiry／disabled、MFA／CSRF、roleoverlap、serverclaim、createquota／multiinstance／lastSeenconcurrent | C、FST、WEB、E | 各authscheme單一lifecycle、deny-before-sideeffect、12habsolute保留；容量與upstreamproof沒跑不可稱解決。 |
| SOL-03 | lookup前扣桶、正確／錯誤輸入、HMACkeyabsence／version／multiinstance、桶ID穩定且不泄漏lookup值 | C、FST、E | 無fail-open、無未核准quota／identity更動；secretbinding另案。 |
| SOL-04 | v2／v3compat、missingkey、archived／retained／returnexpiry、TTLtimestamp、rollbackcompat、migrationdryruncount／checksum | C、FST、TF、E | codecompat完成不等於migration／TTLdeployed；破壞性刪舊index永不由worker自動執行。 |
| SOL-05 | realapprovedproxyshapefixture、spoofed／directrequests、IPv4／IPv6、missingconfig、no-IPfallback | C、TF如有source改、E | IP不是identityauthorizer；externalXFFproof缺則只code-ready。 |
| SOL-06 | WIFpositive／negativeclaims、roleallowlist、runtimeSAimpersonation、bucketpermissions、ingress／allUsersnegativeassertions | TF、D、E | sourceleastprivilege與approvalevidence；effectiveIAM／keyretirement需另exactauthority。 |
| SOL-07 | 409／404／410、crashbefore／afterexternalcommit、sameleasegeneration／stalelease、largepagebytes／time、tokencheckpoint／replay／sourceversion | C、FST、E | Calendar不得成SoT；NEW09先證／反證，恢復不loss／duplicate、不跳token；providerproof缺保留開。 |
| SOL-08 | arrived／confirmed／pastopen、publishedversionrace、reserve／reschedule／archiveconcurrency、querybounds／TTL、samepatientguard | C、FST、WEB、E | domain唯一rule、nonatomic讀写禁止、grid與existingreservations一致；TTL部署另案。 |
| SOL-09 | snapshotconcurrency、hash／missingchunk、exhausted／revoked／expiry、replyfailure／retry／double-click、browserprefetch實測與guarddenials | C、FST、WEB、E | policy決定downloadattempt語意；log不可虛稱clientreceived；snapshot完整且bounded，GET／ticket契約先核准。 |
| SOL-10 | truncation／empty／failure差異、舊／新callercompat、limitboundary、PIIprojectiondeny | C、WEB、E | contractversion／optionalcompat明確；UI不得silentpartial或以empty掩錯。 |
| SOL-11 | injectfailure使metric／health由green轉degraded、normalizedlog命中、錯filter不命中、backupage／thresholdfixture | C、TF、E | false-greennegativeoracle成立；sourcepredicate≠deployedalert命中，runtime列external。 |
| SOL-12 | 告知與fieldinventory／ADR一致、render、隱私審閱record | D、WEB、E | 原句具名批准；不把testpass當法律背書／productionpermission。 |
| SOL-13 | 原ID→PR→exactheadCI→mainancestor→acceptance→unresolved清單；no-dualclaim | D、C／FST／WEB按整合變動、E | 每namedID獨立status；requiredexactmainCI；runtime／migration仍開不可fakeDONE。 |
| LUNA-A01 | diff無personalvalue，角色contact來源明確，history未動 | D、E | Q3／Q4fulfilled、currentfiles更正；不宣稱history已清。 |
| LUNA-A02 | approved句與draft／checklist一致、未新創policy | D、WEB如page、E | SOL-12canon已錄；draft不是publishedconsent。 |
| LUNA-A03 | 文件列出的命令／URL／feature與source對照 | D、E | sourcefacts正確、無假授權／runtimePASS。 |
| LUNA-A04 | runbook命令存在、missingfeature不可假成功 | D、E | 移除／更正虛構步驟，沒有執行cloudcommand。 |
| LUNA-A05 | approvedfieldnames與12h／noidle契約一致 | D、E | 新舊對照不改datedevidence；Canon無漂移。 |
| LUNA-A06 | stubnativeexit≠0立即failure、0續行、後續動作未發生；mockrollbackreadbackoracle | D、scriptunit、E | release／rollback真nativeexit被保存，不只是PowerShell未throw；不執行真release。 |
| LUNA-A07 | sensitivepath樣例ignored、sourcefixtures不誤忽略、trackedfiles仍由scanner檢查 | D、ignorefixturetests、E | 不讀／刪credential，不以ignore避secretgate。 |
| LUNA-A08 | approvalid／expiry／scope與registry一致、expirynegative、generatedstatefresh | D、audit-exceptiontests／supplychainchecks、E | exactownerapproval，不因CI紅自己延期。 |
| LUNA-A09 | compatibleinstall、production＋fullaudit、exceptionreleaseoracle、CLI／emulatorregression | C、supplychainchecks、FST、E | 真upstreamfix／dependencypath證據；無patch或需policy立即escalate。 |
| LUNA-A10 | oldstatus與newappendix可辨、來源SHA／scope無矛盾 | D、E | 文件部分不關程式finding；Sol唯一ledger更新。 |
| LUNA-B01 | validcookie／opaqueID、malformedauthmaterial、returnmiss／expiry、genericinvalidpath、noSDKcallbeforevalidation、safeerror | C、localHTTPtests、E | auth失敗不是500、既有非authinputcontract保留；不改acceptedscheme／staffrole。 |
| LUNA-B02 | 根health及bookingrouteunexpectederror安全映射、duplicatefilter不重複記錄 | C、localHTTPtests、E | globalregistration有效、既有safeerrorbody保持，無PIIlog。 |
| LUNA-B03 | 401clear／403deny／503error、empty200正常、networkfailure可見、sessionrehydration遵canon | C、WEB、E | failure≠empty、不把clientstate當roletruth；沒有backendcontract自作。 |
| LUNA-B04 | server／localmode、verifiedactorcontext／deniedsession、角色可見範圍 | C、WEB、E | 不造staff identity／role、不改server授權。 |
| LUNA-B05 | success／reject／throwfinally恢复enabled，pending防重複 | C、WEB、E | failure保持可見，不用catch吞error。 |
| LUNA-B06 | 月／年邊界、Taipei周起訖、UTC轉換及currentweek | C、WEB、E | 用canonicaldatehelper；不改預約domain規則。 |
| LUNA-B07 | approvedhostpositive、production／unknownhostnegative、URLport與subdomain | C、WEB、E | predicate與exacthostCanon一致，不開新入口。 |
| LUNA-B08 | logout／restart／same-tabstaff-return、late-response不復活staleidentity | C、WEB、E | context清除矩陣已由Sol定；合法return與匿名initial不受破壞。 |
| LUNA-B09 | workflow包含所有existingTFtesttarget、fixturefailure影響aggregate、permissions／pins不變 | D、workflowunit、TF、E | 不是只加一行CI；實際requiredaggregate紅／綠證據，無skip／weakening。 |

## 7. Context efficiency、dependencies與平行化

共通required context：本輪授權／packet capsule、AGENTS SafetyFloor、GOVERNANCE scope、INDEX**owningroute**、scoped rules、targetdefinition＋callers＋tests。
不要求每Luna讀完整新計畫或#239；由Sol提供包含packetID／IDs／exactbase／requiredcontext／forbidden／acceptance／lease的短capsule。

| Packet／family | Required context（除共通） | Optional context | Do-not-read-by-default |
| --- | --- | --- | --- |
| SOL-00／13、LUNA-A10 | primaryindex／safe摘要、exactPR／CIrecord、docs-and-evidence／handoffrule | 需要追lineage的單一datedreview | 全部歷史reviews、原始私有報告／logs。 |
| SOL-01／03／04、LUNA-B01／08 | ADR0007、decision對應項、patient／lookup／bookingsource與tests | 相關approvedintake／ratecontract | 全部marketing／deliveryhistory、真patient／secretpayload。 |
| SOL-02、LUNA-B03／04 | STAFF-SESSION-12H、staffguard／authsource／tests、rolecanonicalsource、frontendsessioncontract | D006／D010僅衝突lineage | 全repolegalreview、authsettingvalues、其他packetdesign。 |
| SOL-05／06 | proxy／WIF／IAMowningconfig＋tftest、authority邊界 | publicproviderdocs＋authorizedsanitizedruntimeproof | livecloud／IAM／bucket內容、credentials、未授權projects。 |
| SOL-07 | ADR0002、eventid／outboxcontract、lease／sync／projectionsource＋tests | 必要singleCalendarlineage | 真Calendar／全review歷史、無關UI。 |
| SOL-08／10 | domainrules／APIexecutablecontracts、repo／query／UItests | 当前publishing／statecanonicaldoc | 全architecture總史、無關worker。 |
| SOL-09／12、LUNA-A02 | ADR0009／0010或approvedprivacy句、targetsource／tests | 對應decisionlineage／legalreview | 真export檔、病患內容、全法律文獻dump。 |
| SOL-11、LUNA-B02／09 | StageEobservability／filter或existingworkflowcontract、owningtests | 相關alert／CIcanonicaldoc | 所有deploylogs、cloudquery與無關workflow。 |
| LUNA-A01／03／04／05 | #239**對應小節**、affectedcurrentdocs＋sourcefact、docsrules | 發現矛盾才讀datedlineage | #239全文／本新計畫全文／所有reviews。 |
| LUNA-A06／07 | owningscript／ignoredefinition＋tests、nativecommandfixture或secret-scancontract | 單一runbook | 執行真deployscript、讀keydir／secret／全infra。 |
| LUNA-A08／09 | approvedexception／packagepath、lock／supplychainrules、existingtests | version-boundupstreamsource／advisory | 歷史secret／allreview、未批准gate／dependencyredesign。 |
| LUNA-B05／06／07 | owningUIhelper＋callers＋tests、UIrule／domaincanonicaltime或approvedhostcontract | owningbrowserfixture | 新auth設計、其他UI重構、全doccatalog。 |

平行條件必須**三項全滿足**：corefiles不重疊、無直接dependency、無sharedschema／migration。
Sol在freshbase列出具體write-set才發放claim，僅不同packetname或資料夾不算獨立。

- **P-doc**：A03、A04、A07候選可並行；A05與A02／A01若同檔則拆lane或串行。所有README／INDEX／sharedtracking由SOL-13最後統一，不讓worker順手修改。
- **P-local-tools**：A06可與上述docs／ignore包並行，mockcmd不能呼叫cloud。
- **P-supply**：A08、A09同manifest／exception／generatedstate，**不平行**。
- **P-auth**：SOL-01／02／03／04與B01／B08共享authenticator／directory／service，**串行**；SOL-05只在無核心檔重疊且design已定時可平行。
- **P-worker**：SOL-07是单一writer；不得分派另一Luna同時處理409重建、lease或pagebatch。
- **P-booking**：SOL-08／10与identitypacket共享repository／service／contract時串行。SOL-09若write-set只有export且無schemadependency，可與worker或独立infrasourceanalysis並行。
- **P-infra-ci**：SOL-06／11與B09共享workflow／tftest時串行；Luna不改IAMassertion規則來配合CI。
- **P-web**：B03→B04→B05→B06→B07→B08只是預設seriallane；sameindex／api-client／entryfile禁止平行。

圖（design先行，無環依賴；arrow指放行／合併dependency，不是部署）：

```text
owner safe summaries / Q1-Q9 / G1-G9
  -> SOL-00 registry + Sol architecture decisions
  -> SOL-05 trust-input design ----> SOL-01/02/03/04 common identity design
  -> approved low-risk docs/tools lanes A03/A04/A05/A06/A07
  -> B01 containment -> B02 error scope
  -> SOL-01 -> SOL-02 -> SOL-03 -> SOL-04 (shared auth write-set serial)
  -> SOL-06 IAM source / SOL-07 Calendar / SOL-08 Schedule / SOL-09 Export
     (only independent confirmed write-sets may run parallel)
  -> SOL-10 contract -> SOL-11 observability -> SOL-12 approved privacy
  -> B03 -> B04 -> B05 -> B06 -> B07 -> B08
  -> B09 CI wiring (after shared workflow writers)
  -> SOL-13 exact-main integration audit -> owner merge / source freeze decision
  -> separately authorized runtime/deploy/migration evidence (never implicit)
```

合併order由§5的M／D／C lane与上述depends决定；同lane一次一个owner-approvedPR。
deadlinelane不讓A08跳過Q1，也不讓A09用override／skip碰弱gate。
不是全體無條件總排序：無依賴docs可先合併；Solintegration負責每次合併後freshbase重驗下一包。
禁止兩worker同claimfinding；auxiliaryscope必須先串行釋放，不用重複finding數充進度。

機械 dependency graph 明確區分 `DESIGN-ID` 與實作 packet：前者是 SOL-01／02／03／04／05 的共同 identity／trust 決策 capsule，不是等待彼此已合併才開始設計，避免假性循環。
每個 Luna 的架構 prerequisite 仍須 close；`READY_SPEC` 不會繞過 shared-file lease 或前序合併。

| Node | Direct dependencies（未列 runtime／owner blocker 仍按 §8） |
| --- | --- |
| DESIGN-ID | SOL-00 的可用安全摘要／scope、G1／G2／G3／G6、Q5／Q6／Q7 |
| SOL-01 | DESIGN-ID |
| SOL-02 | DESIGN-ID、SOL-01（shared auth writer） |
| SOL-03 | DESIGN-ID、SOL-02（shared service writer） |
| SOL-04 | DESIGN-ID、SOL-03 |
| SOL-05 | DESIGN-ID（source implementation；trust design 已在 DESIGN-ID） |
| SOL-06 | Q8／Q9／G7；無其他 code packet prerequisite |
| SOL-07 | G8（如需）與 NEW-09 proof；無其他 code packet prerequisite |
| SOL-08 | SOL-00 的 D-42 scope；與 SOL-01 同 repository 時先等 SOL-01 |
| SOL-09 | G4；無其他 code packet prerequisite |
| SOL-10 | SOL-01、SOL-03（shared service／contract）、G5 |
| SOL-11 | 現行 Stage E contract／G9；filter 若與 B02 同 write-set，先等 B02 |
| SOL-12 | Q2／原句核准；無其他 code packet prerequisite |
| LUNA-A01 | Q3／Q4；無 code dependency |
| LUNA-A02 | SOL-12 |
| LUNA-A03／A04／A05／A06／A07 | 無 code dependency；具體同檔 doc／script lease 必須互斥 |
| LUNA-A08 | Q1、SOL-00 釋放 E1-08 到期子 scope |
| LUNA-A09 | Sol upstream／version／exception decision；與 A08 同 supply-chain lane 串行 |
| LUNA-A10 | SOL-00 的 E4-01／12 安全分界與證據 |
| LUNA-B01 | 無 architecture dependency（既有 error contract）；與 SOL-01／02／04 的寫入 lease 互斥 |
| LUNA-B02 | LUNA-B01 |
| LUNA-B03 | SOL-01、SOL-02 |
| LUNA-B04 | LUNA-B03、SOL-02 |
| LUNA-B05 | LUNA-B04（保守 shared-file lane；scope獨立時可由 Sol 重新證明放行） |
| LUNA-B06 | LUNA-B05（同上） |
| LUNA-B07 | LUNA-B06、Sol approved host contract |
| LUNA-B08 | LUNA-B07、LUNA-B03、SOL-01、SOL-02 |
| LUNA-B09 | SOL-06、SOL-11（若同 workflow writer，先合併）；不負責 IAM design |
| SOL-13 | 所有被授權且實際執行 packets 的 exact-main evidence；unexecuted／blocked IDs 保留 OPEN |

上述 DAG 不把 owner／external 等待捏造成 code dependency；機械查核使用 design、code 與 integration 三種節點，無循環。

## 8. 業主決策與外部blockers

#239 Q1～Q9仍是**建議**，不是本輪核准；只能以liveDecisionRegister的具名決定讀回。
本輪不為Qn直接改DecisionRegister，planningPR不能暗中批准policy。

| Decision | 需要回答／建議，不預設採納 | Blocks |
| --- | --- | --- |
| G0 | 提供244逐ID安全manifest；釐清W4severity與E4-01／12、D-42範圍；指定受控證據與review責任人，不提交原報告 | SOL-00、正式net-new統計、W4放行。 |
| G1＋Q6 | Firebasepatientbinding合法來源、missing／archived／unbound的拒絕行為、accountlessinitial与return分離、consent及atomicity；不得以UID字串就認定合法患者 | SOL-01。 |
| G2 | StaffBearer是否保留；若保留，如何與server-session existence／revocation／absoluteexpiry一致。建議單一staffsessionboundary，不把Bearer移除當無須contractapproval的小修 | SOL-02、B03／04／08。 |
| G3 | allowlist必須disjoint？建議boot／readinessfailclosed並有清楚configdiagnostic；避免靜默升較高role | SOL-02。 |
| G4 | download額度代表serveracceptedattempt或explicituserintent；傳輸失敗、prefetch、retry／double-click如何算；保留GET＋明示attempt，或CSRF-protectedPOST issuance＋shortlivedticket，均需ADR／compat評估 | SOL-09，不直接選POST。 |
| G5 | listtruncation／pagination wirecompat、既有client失敗狀態，是否需contractversion | SOL-10；若breaking須freshapproval。 |
| G6 | sessioncreation per-account／coarse-IP／failure成本與limits；touch觀測精度；保持12habsolute/noidle，不把IP當patient/staffidentity | SOL-02／03／05。 |
| G7＋Q8／Q9 | sourcebucket必要範圍、runtimeSA最低角色、WIFbinding策略及無金鑰／舊keyretirement授權 | SOL-06；liveIAM／apply不在sourceauthority。 |
| G8 | 若NEW09proof成立且需非原子pagechunk，checkpoint／token／lease／rollback設計；Calendar仍projection不可共同SoT | SOL-07；沒有proof不先改程式。 |
| G9 | 若monitoringthreshold／SLO／healthcontract需改，由營運owner批准；先保留已定taxonomy | SOL-11。 |
| Q1～Q4 | exception處置、Calendar告知原句、currentPIIvs歷史處理、rolesupportcontact；按#239§2逐題，不沿用「Wave1无需决定」標籤 | A01／02／08、SOL-12。 |
| Q5～Q9 | 入口trust、匿名identityconflict、HMACsecret／migration、IAM／WIF、keyretirement；原建議不取代G1／2新模型問題 | 對應Sol高風險包。 |

external register：

| Blocker | 需要的額外authority／proof | 不得拿什麼替代 |
| --- | --- | --- |
| EXT-01 B-08 | exactsource／project／targets／expiry與業主deploymentapproval後讀回 | mainCI、tfvalidate、planningPR。 |
| EXT-IDP | 合成IdP／token／session lifecycle runtimecase；由業主登入，secret不入chat／PR | mocked verifier。 |
| EXT-IP／IAM | 授權的XFF形狀、bucketinventory／effectiveIAM唯讀證據；不讀bucket內容 | sourceIAM grant、proxyguess。 |
| EXT-HMAC／MIGRATION | exactsecret版本綁定、savedmigrationplan、rollback與ownerfreshapproval；真實／敏感資料永不由本scope處理 | codecompat／dryrun／Q7建議。 |
| EXT-TTL／ALERT | deployedTTL／indexes、expiry讀回、合成fault命中／backupage來源 | Timestampfixture、filtermatchunit、healthHTTP200。 |
| EXT-CALENDAR／COST | separatelyapprovedsyntheticCalendar、largepage／retry／capacityproof與單日coststop；不自動擴大C1時窗／費用 | fakeCalendar／counterprobe／previouspermission。 |
| EXT-LEGAL／MERGE | 具名policy原句／法律審閱、每PRfreshmergeapproval | Luna／Sol設計、testpass、planningPRreview本身。 |

## 9. Luna高自主施工契約（下一輪才適用）

Luna是executionworker，不是researchagent。Sol先closearchitecture／policy、發放packet與freshbase／claim後，
一般完成路徑不得停在分析、code或單一test：

```text
sync correct origin/main + verify required dependency ancestry
-> confirm packet / Canon / exact IDs / scope lease
-> isolated worktree / topic branch
-> edit only permitted write-set
-> regression test (before failure / after pass)
-> targeted tests -> all relevant gates
-> inspect complete diff / PII & secrets / scope
-> fix own test / lint / CI failures
-> commit -> push topic branch -> open PR
-> read back exact head / diff / body
-> inspect CI -> repair own CI -> re-check exact head
-> final evidence (counts / exit codes / NOT_RUN / blockers)
```

- correctbase不是planningbaseline永遠固定：開始每包fetch最新main，確認依賴mergecommit為ancestor，對source變動重核scope；不cherry-pick未知worker的branch。
- 若finding已不存在：用freshsource／test證明ALREADY_FIXED，交Sol更新ledger，釋放claim後轉下一無依賴packet；不捏造修復PR。
- test／CIfail、找不到檔、需少量研究、修改略多、同根小型siblingbug不是停止理由。先trace到definition／callers／tests、修自己失敗，scope內同根sibling納入regression。
- source或policy與packet有實質衝突、找出跨架構bug、需新增permission／schema／contract：**不是「小型sibling」**；先escalation，不自己設計或借機refactor。
- 真blocker限owner／Solarchitecturedecision、secret、cloudpermission、deploymentauthorization、destructivemigrationapproval或canonicalauthorityconflict；記錄safeevidence、最小缺項、責任人、已完成工作，不把partial寫DONE。
- 非自身CIfailure：在乾淨exactbase用同producercommand／environment證明同失敗，保留兩份結果，回報Sol。釋放該packet、不合併紅PR，改接另一已授權、無依賴且未claimpacket；不可自行skip／降低threshold／延長exception。
- worker沒有merge權限；push只限自己topicbranch，publicsafePR由Sol審閱、owner逐PR批准。發布PR前freshscope／secretgate與publicdiff檢查不得省略。
- sharedplan／tracking／README／INDEX一律Solintegration或最後dedicateddocspacket更新；若repo要求新doc登記，worker回報索引需求，由integration同PR協作一次，不平行搶寫。

## 10. 本輪證據、後續closeout與停止點

本輪只新增本planningdoc及`docs/README.md`必要registration；原#239、production／tests／scripts／infra／workflow與decisionregister都不改。

本輪驗證：

| Gate／claim | 結果與限制 |
| --- | --- |
| latestmain／#239merged／#238ancestor | PASS，exactbaseline如§1。 |
| NEW-01～08 boundaryverification | PASS，本機合成sourceprobes；8項不是cloud或修復PASS。 |
| blindtrust-chainreview／candidatecounterexample | PASS（read-onlyscope）；NEW09／10仍candidate，W4去重metadata缺失保留。 |
| primaryrouting／appendix244unique | 必須用機械展開核對PASS後才送PR；176 W4不冒稱Luna-ready。 |
| docs／structure／governance／trackedsecrets／diffscope | 本機 PASS：`node scripts/check-docs-links.mjs`、`check-structure.mjs`、`check-governance.mjs`、`check-tracked-secrets.mjs` 與 `git diff --check`；producer 使用 Node 24.20.0。後續文件 edit 必須重跑 covered gates；staged 新文件也須納入 secret scan。 |
| formatting | repo-wide Prettier 規則必須 PASS；`.prettierignore` 明確排除 `*.md`，因此 changed-Markdown 的 Prettier check 為 policy-excluded，不可當正文已排版／lint 證據。另以機械檢查 Markdown table columns、links、244-ID route／graph。 |
| existingunit／Firestoreemulator／browser／providerforfindings | NOT_RUN；非必要證明採scratchprobe，未用productioncode修改來證假說。 |
| planningPRexact-headCI | 開PR後讀回；未完成前寫pending，不宣稱requiredaggregate已綠。 |
| deploy／apply／secret／migration／realcloud／Lun施工／merge | NOT_RUN，明確不在本輪scope。 |

futurecloseout：每finding綁primarypacket→regressioncase→PRexacthead→mainmergeancestor→exactmainCI→必要runtimeproof。
各ID只可`FIXED`／`PARTIAL`／`ALREADY_FIXED`／`OPEN`，附證據級別；modelreview、sourceCI、deploy與runtime分欄。
SOL-13收斂未關ID、ownerdecisions、externalblockers、negativecases與尚未做的runtime／migration；owner再核准mainexactsourcefreeze。
freeze不授權deployment；C1 exactplans／targets／runtime／成本／關閉另走freshapproval。

**本輪停止：**完成新doc／index、適用docschecks、planningPR／remote讀回，回報PRURL後停止；
不開始任何repair，不啟動Luna施工，不合併PR。待ownerreview本planningPR並另行授權後，
才進入Solimplementation→architecturecloseout→releasedLunaparallelpackets→Solintegrationaudit。

## 附錄 A：244 個既有 ID 的唯一 primary 路由

這是新 orchestration 的 ID 索引，不複製 #239 修法正文。SOL-00 的 178 項包含 176 W4 待安全摘要與 E4-01／12 分界；不把未知 severity 說成已重新驗證。
NEW-01～10 另外映射於 §3／4／5，不併入 244。E1-08 到期與 E4-01／12 文件子範圍是串行 auxiliary，不是第二 primary。

| Primary packet | 既有 finding IDs | Count |
| --- | --- | --- |
| EXT-01 | B-08 | 1 |
| LUNA-A01 | B-21, E3-01, E4-10 | 3 |
| LUNA-A02 | E3-02 | 1 |
| LUNA-A03 | B-12, C05 | 2 |
| LUNA-A04 | E3-07 | 1 |
| LUNA-A05 | D-38, E3-04, E3-06, E3-19 | 4 |
| LUNA-A06 | E1-01, E1-02, E1-11 | 3 |
| LUNA-A07 | B-13, B-31, B-55 | 3 |
| LUNA-A08 | B-48 | 1 |
| LUNA-A09 | E4-08 | 1 |
| LUNA-B01 | A01, A11 | 2 |
| LUNA-B02 | K5 | 1 |
| LUNA-B03 | C04, X-C01, X-C02 | 3 |
| LUNA-B04 | C01, C02 | 2 |
| LUNA-B05 | X-C04 | 1 |
| LUNA-B06 | X-C05 | 1 |
| LUNA-B07 | X-C06 | 1 |
| LUNA-B08 | X-C07 | 1 |
| LUNA-B09 | B-05 | 1 |
| SOL-00 | A03, A04, A06, A07, A08, A10, B-10, B-11, B-14, B-15, B-16, B-17, B-18, B-19, B-20, B-22, B-23, B-24, B-25, B-26, B-27, B-28, B-29, B-30, B-32, B-33, B-34, B-35, B-36, B-37, B-38, B-39, B-42, B-43, B-44, B-45, B-46, B-49, B-50, B-51, C03, C06, C09, D-09, D-10, D-11, D-14, D-15, D-16, D-17, D-21, D-22, D-23, D-24, D-27, D-28, D-29, D-30, D-31, D-32, D-33, D-34, D-35, D-36, D-37, D-39, D-40, D-41, D-43, E1-03, E1-04, E1-05, E1-06, E1-07, E1-08, E1-09, E1-10, E1-13, E1-14, E1-15, E1-16, E1-17, E1-18, E1-19, E1-20, E1-21, E1-22, E1-23, E1-24, E1-25, E1-26, E1-27, E1-28, E1-29, E1-30, E1-31, E1-32, E1-33, E1-34, E1-35, E2-01, E2-02, E2-03, E2-04, E2-05, E2-06, E2-07, E2-08, E2-09, E2-10, E2-11, E2-12, E3-05, E3-08, E3-09, E3-10, E3-11, E3-12, E3-13, E3-14, E3-15, E3-16, E3-17, E3-18, E3-20, E3-21, E3-22, E3-23, E3-24, E3-25, E3-26, E3-27, E3-28, E3-29, E3-30, E3-31, E3-32, E3-33, E3-34, E3-35, E3-36, E3-37, E4-01, E4-02, E4-04, E4-05, E4-06, E4-07, E4-09, E4-11, E4-12, E4-13, E4-14, E4-15, E4-16, E4-17, E4-18, E4-19, E4-20, E4-21, E4-22, E4-23, E4-25, E4-26, E5-01, E5-02, E5-03, E5-04, E5-05, E5-06, E5-07, E5-08, E5-09, E5-10, K3, K8, K9, X-C03 | 178 |
| SOL-01 | K2 | 1 |
| SOL-03 | B-52, K1, K4 | 3 |
| SOL-04 | A05, B-04, D-08 | 3 |
| SOL-05 | B-03, K6 | 2 |
| SOL-06 | B-01, B-02, B-09, B-41, E1-12 | 5 |
| SOL-07 | D-01, D-02, D-03, D-05, D-12 | 5 |
| SOL-08 | A02, D-07, D-42 | 3 |
| SOL-09 | A09 | 1 |
| SOL-10 | C07, E4-24, K7 | 3 |
| SOL-11 | A12, B-06, B-07, B-54, D-25 | 5 |
| SOL-12 | E3-03 | 1 |
| SOL-13 | E4-03 | 1 |

機械驗收：244 IDs exactly once；packet／finding／scope lease互斥；每NEW有唯一primary；graph無環、runtime／decision缺項不被當成ready。
