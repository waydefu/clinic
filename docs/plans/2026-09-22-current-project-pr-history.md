# PR 全歷史與目前有效性（2026-09-22）

讀取基線：fresh GitHub PR metadata #1～#161；merged 152、closed-unmerged 9、open 0。
main = e387f2522ea010848f41a4f34778ffc50d83fef3（#161）。
CI：[verify 35622277537](https://github.com/waydefu/clinic/actions/runs/35622277537)。
這份計畫PR不計入當時161筆；後續操作者需fresh查，不能把open 0當永遠狀態。

本附表供追溯，不是要求每包重讀全部歷史。全歷史已核對state/title/merge SHA；
#112～161另核對GitHub changed-files inventory（#123有127檔，已含第二頁），
只對currentcriticalpath開必要main source與runtime證據。
不宣稱每個舊diff/每份過期artifact都重新執行驗證。

**修正：#122 是 MERGED，不是closed-unmerged。** 真正未合併只有
#19、#22、#46、#47、#90、#91、#116、#131、#133。
closed/merged狀態來自GitHub欄位，不從title或close日期猜測。

## Disposition 與證據讀法

- CURRENT AUTHORITY：現行scope/治理依據，仍不等於雲端操作核准。
- CURRENT BUT INCOMPLETE：source或設計仍有效，但current acceptance所需證據/接線未齊。
- SOURCE COMPLETE / RUNTIME MISSING：source已合併，指定線上版本尚未部署/驗收。
- CONTRACT ONLY：純domain與test，API/UI/cloud/human未隨之完成。
- SUPERSEDED：被指定後續決定/PR覆蓋，不作新工作入口。
- HISTORICAL ONLY：該PR作dated演進證據；**不代表其中仍在main的code被廢棄**。
- NOT RELEVANT TO CURRENT ACCEPTANCE：只用於確認與當前scope無關的future工作；不能拿來排除失敗需求。

若下表沒有逐PRruntime/cloud/human證明，答案就是「未建立該PR專属完成證據」，
不是推定沒有做，也不是推定已完成。主線CI只證source，不替代任何現場門檻。

## 歷史時期及今日使用方式

| 時期 | 目的／實際保留能力 | 明確排除 | 目前source檢查入口 | runtime/cloud/human與後續依賴 |
| --- | --- | --- | --- | --- |
| #1～26 基礎與原預約 | workspace、domain-only寫路徑、syntheticBooking與治理 | 原始syntheticpreview不是C1真API/production | packages/domain、packages/contracts、docs/adr、decision register | 用當前CP-02/08重驗；舊欄位由CP-01新需求覆蓋 |
| #27～40 CAL-PILOT | Calendar投影、lease/worker、合成試行隔離 | pilotgrant不是C1/productiongrant | apps/worker/src/calendar-sync、projection/outbox | P1-08有datedsettlement；CP-00補獨立Calendar與candidate |
| #41～111 安全/UI/domain | Auth/RBAC/audit、日期/預約/互動與supplychain修補 | UI存在不等於cloud；freeze不解鎖Case/Payroll | apps/api/src/auth、appointments、apps/web/public、tests | CP-01變更依赖與CP-08全回歸，不重做已合併程式 |
| #112～127 C1/IP-001/WP-B | isolatedfoundation、真APIwrite/read/cancel/horizon；signedscope | #124inspect不是StageF；publicproduction禁止 | infra/terraform、internal-test-booking、decision register | 各source/human證據見下表；新gate需要freshSHA |
| #128～146 StageC/D/E/F/Auth | limiter、candidate、projection、monitoring、AuthIAM、P1-01/02/03 | cloudreadback與source分列；closedpacket不算核准 | calendar-pilot、runtime、c1-internal-test-run、scripts inspectors | #148/#155～161收斂；CP-00/08補runtime |
| #147～154 BD | 需求索引＋六個domaincontracts/tests | 不提供BDAPI/UI/正式policy、真backup/AWS | business-delivery*.ts | CP-POLICY、CP-03～07；舊localDOCX不是當前Driveauthority |
| #155～161 最近收斂 | MFA/draft、deniedaudit、returnflow、alertrecovery、proxy、C1syncstaging | #159～161未在4f31線上版；非P1-09closure | 本計畫主表及operatorpacket | CP-00優先；sourceCI與datedruntime不得混SHA |

## 完整 inventory

| PR | GitHub title（原文） | State | Merge SHA | Current disposition |
| --- | --- | --- | --- | --- |
| [#1](https://github.com/waydefu/clinic/pull/1) | finish local hardening and handoff readiness | MERGED | f653535e81adfd0e9363c8d6821677eb6d13a9c6 | HISTORICAL ONLY |
| [#2](https://github.com/waydefu/clinic/pull/2) | Add stage handoff records and release the brace-expansion exception | MERGED | 18c4ce5862bdc26fd8e4098a26d460fc7e7e2f2d | HISTORICAL ONLY |
| [#3](https://github.com/waydefu/clinic/pull/3) | Close Stage 0 with tested release gates and publication evidence | MERGED | 7c3086c6031967ed239e67149ad5cd6830757cdc | HISTORICAL ONLY |
| [#4](https://github.com/waydefu/clinic/pull/4) | Plan every remaining piece of work, not just the next stage | MERGED | 27710d4c2e76bb3f13ed9ef34fe497149a783ede | HISTORICAL ONLY |
| [#5](https://github.com/waydefu/clinic/pull/5) | Cover the last untested gates and stop serialising the unit suite | MERGED | bf0a808f9248d7c4a9272dc39927c96ba78124b8 | HISTORICAL ONLY |
| [#6](https://github.com/waydefu/clinic/pull/6) | 官網動效擴充與素材壓縮：2.2 MB → 129 KiB，並修好看不見那 1.7 MB 的效能預算 | MERGED | 00f0fce3bee10285a2a8836b4f38d28e3e41c714 | HISTORICAL ONLY |
| [#7](https://github.com/waydefu/clinic/pull/7) | 重新編碼 Open Graph 分享圖，並把它排除在頁面預算之外 | MERGED | 72aba66b5578459518b4b15122954aadb8c99196 | HISTORICAL ONLY |
| [#8](https://github.com/waydefu/clinic/pull/8) | Split the E2E job into six named groups | MERGED | 3acf80c808ae5b440b1bd4e1550820af9adf2c18 | HISTORICAL ONLY |
| [#9](https://github.com/waydefu/clinic/pull/9) | Add the P0–P7 product roadmap and its supporting architecture documents | MERGED | 166eff10299e1a1a6e0fc9dad29adeda0e7e8777 | HISTORICAL ONLY |
| [#10](https://github.com/waydefu/clinic/pull/10) | Patch four high advisories that turned the supply-chain gate red | MERGED | 9e573d56ee78b491c5392b0f2a92cbd5afba7112 | HISTORICAL ONLY |
| [#11](https://github.com/waydefu/clinic/pull/11) | Close the post-merge evidence gap in the 2026-08-04 delivery record | MERGED | d545cce0f40d104e28a2e10ff0e1d3cf3348b7be | HISTORICAL ONLY |
| [#12](https://github.com/waydefu/clinic/pull/12) | Repin CI actions onto the Node 24 runtime | MERGED | 5454f8d9d56b310121ae4bf8e4d75e1bddcdc75a | HISTORICAL ONLY |
| [#13](https://github.com/waydefu/clinic/pull/13) | Bring the clinic site under the design-system gates | MERGED | 27645a346ba7754f55f05e816c03a435739e2954 | HISTORICAL ONLY |
| [#14](https://github.com/waydefu/clinic/pull/14) | Restructure clinic homepage and SEO | MERGED | 22d0f4d024af337bf26c86de3a771fda40631cdc | HISTORICAL ONLY |
| [#15](https://github.com/waydefu/clinic/pull/15) | Reconcile the 2026-08-16 owner answers with current-authority documentation | MERGED | b05da66bb02174b0887a8c541d9890f7ac4ed536 | HISTORICAL ONLY |
| [#16](https://github.com/waydefu/clinic/pull/16) | SCM-R05: lift the locked nanoid to 3.3.18 and turn the audit gate green | MERGED | cf3b87b3f1fd2aa605128a7a4e775236760031ff | HISTORICAL ONLY |
| [#17](https://github.com/waydefu/clinic/pull/17) | Post-SCM-R05 current-state reconciliation | MERGED | 75e2247a8f77dc799d90c64c0ea0acbb98076c5f | HISTORICAL ONLY |
| [#18](https://github.com/waydefu/clinic/pull/18) | SCM-R01: make the same-commit Semgrep result part of the required merge evidence | MERGED | ea3316e027ab675dde564419412f979aa0e57f68 | HISTORICAL ONLY |
| [#19](https://github.com/waydefu/clinic/pull/19) | DO NOT MERGE — SCM-R01 故意失敗驗收：紅的 SAST 必須擋下合併 | CLOSED | — | HISTORICAL ONLY |
| [#20](https://github.com/waydefu/clinic/pull/20) | feat(booking-mvp): BOOK-MVP-001 scope lock and BOOK-MVP-002 clinic freeze guard | MERGED | 1a253a8b56bc8d4f55bf228b0e96e4f73842edc3 | HISTORICAL ONLY |
| [#21](https://github.com/waydefu/clinic/pull/21) | docs(governance): BOOK-MVP-003-A frozen capability reachability inventory | MERGED | 3a3b7859e0a46c0549d3d1d4c7f32293c1cd9282 | HISTORICAL ONLY |
| [#22](https://github.com/waydefu/clinic/pull/22) | feat(scope): BOOK-MVP-003-B isolate frozen case and payroll capabilities | CLOSED | — | HISTORICAL ONLY |
| [#23](https://github.com/waydefu/clinic/pull/23) | feat(booking): owner acceptance refinements and verified preview handoff | MERGED | 5df89f0ef75ebe8cf63277d982b9c7330b0e5104 | HISTORICAL ONLY |
| [#24](https://github.com/waydefu/clinic/pull/24) | feat(booking): finalize vendor handoff and C6 owner acceptance | MERGED | dab4da70a8d183dd0ed15b9a2f0ff1963c93768d | HISTORICAL ONLY |
| [#25](https://github.com/waydefu/clinic/pull/25) | fix(booking): remove clinic sidebar from step one | MERGED | 68f7626bfc956b6f0af64e36dbf948b0edeb2d08 | HISTORICAL ONLY |
| [#26](https://github.com/waydefu/clinic/pull/26) | docs(governance): security draft, decision corrections and Calendar readiness fixes | MERGED | 8418cc74ca30aea4eaf0cc717d1018a157f4875e | HISTORICAL ONLY |
| [#27](https://github.com/waydefu/clinic/pull/27) | fix(worker): narrow the Calendar OAuth scope and pin it with a test | MERGED | bb18084b47d71f61c4722e8b11af48b32b7f16eb | HISTORICAL ONLY |
| [#28](https://github.com/waydefu/clinic/pull/28) | feat(worker): add the owner-run Calendar import tool | MERGED | 5536d43923b1e5079185f2feb758dc412c5d6b39 | HISTORICAL ONLY |
| [#29](https://github.com/waydefu/clinic/pull/29) | fix(worker): take service-account key files, not expiring access tokens | MERGED | 795cf79ab28dab857c6e36cef1ea2c128e624846 | HISTORICAL ONLY |
| [#30](https://github.com/waydefu/clinic/pull/30) | feat(worker): generate a synthetic source calendar for the pilot dry run | MERGED | 452138dc9eeaf108d1b1514c94e949e758df35f8 | HISTORICAL ONLY |
| [#31](https://github.com/waydefu/clinic/pull/31) | feat(calendar): add governed 30-day bidirectional pilot | MERGED | 28d3fa26a449f102601f56bf0b6ee14eb74d4645 | HISTORICAL ONLY |
| [#32](https://github.com/waydefu/clinic/pull/32) | govern(calendar): extend frozen synthetic pilot through 2026-11-28 | MERGED | f1b5650f6b27bff611dd108b43db689f63ac20b7 | HISTORICAL ONLY |
| [#33](https://github.com/waydefu/clinic/pull/33) | feat(calendar): controlled candidate correction | MERGED | a25292380231206e2e784106d09f0c9870a38cc5 | HISTORICAL ONLY |
| [#34](https://github.com/waydefu/clinic/pull/34) | fix(cal-pilot): integrate controlled correction and lease recovery | MERGED | 77255e1e1503d5cb062b53f46a86039f0150088f | HISTORICAL ONLY |
| [#35](https://github.com/waydefu/clinic/pull/35) | fix(cal-pilot): resume a safe-stopped update | MERGED | d4a8cc7c16b1e88a3996c1a580a2a0178684e6f8 | HISTORICAL ONLY |
| [#36](https://github.com/waydefu/clinic/pull/36) | fix(cal-pilot): harden authenticated update smoke | MERGED | 6e3f351b8eeaa17d995b09573df77cac9099095a | HISTORICAL ONLY |
| [#37](https://github.com/waydefu/clinic/pull/37) | fix(cal-pilot): finalize verified staged update | MERGED | dedec4929a958c33f757b7197dde536c6890bfcd | HISTORICAL ONLY |
| [#38](https://github.com/waydefu/clinic/pull/38) | fix(cal-pilot): normalize finalizer timestamps | MERGED | 22b8998e1a399127140c3164a7cf28f3dc8180eb | HISTORICAL ONLY |
| [#39](https://github.com/waydefu/clinic/pull/39) | fix(cal-pilot): preserve finalizer invoker array | MERGED | bc8dadc3dad10cd0fd62f4aade61f72bb56ad6eb | HISTORICAL ONLY |
| [#40](https://github.com/waydefu/clinic/pull/40) | docs(cal-pilot): record final staged deployment evidence | MERGED | df97fd47b55169f24f66037da6e61172fb2cc41c | HISTORICAL ONLY |
| [#41](https://github.com/waydefu/clinic/pull/41) | docs(governance): introduce Governance v2 boot kernel and drift checks | MERGED | c68dc7f7609536bc3ba5084ccdd53d341aae9acb | HISTORICAL ONLY |
| [#42](https://github.com/waydefu/clinic/pull/42) | docs(governance): record resource-aware verification venue rule | MERGED | 178eb27679211bbbbd4ffd96544533b6e9f19767 | HISTORICAL ONLY |
| [#43](https://github.com/waydefu/clinic/pull/43) | docs(security): add SECURITY.md responsible reporting intake | MERGED | 564fd5d6ccc67a87ba3f97a6dfcd5382419cc23f | HISTORICAL ONLY |
| [#44](https://github.com/waydefu/clinic/pull/44) | ci(supply-chain): attest CycloneDX SBOM digest with GitHub provenance | MERGED | 0963e703c08ea7f35d02e5709f5b8f25bf9cab79 | HISTORICAL ONLY |
| [#45](https://github.com/waydefu/clinic/pull/45) | chore(env): add Cloud Agent development environment config | MERGED | 65d77eeb8dc1639584aa057756c208e59bccbbdf | HISTORICAL ONLY |
| [#46](https://github.com/waydefu/clinic/pull/46) | docs(security): PVR closeout — enablement blocked without Administration write | CLOSED | — | HISTORICAL ONLY |
| [#47](https://github.com/waydefu/clinic/pull/47) | docs(product): Product Excellence Audit v1 (61/100, audit only) | CLOSED | — | HISTORICAL ONLY |
| [#48](https://github.com/waydefu/clinic/pull/48) | docs(review): Product Excellence Audit v1 — reconciled (#47 + #48) | MERGED | c2a50139ef220a21f0cfc768846c54373729df57 | HISTORICAL ONLY |
| [#49](https://github.com/waydefu/clinic/pull/49) | docs(security): direct reporters to GitHub Private Vulnerability Reporting | MERGED | b1800820917299874351d007ca19558eb47062d1 | HISTORICAL ONLY |
| [#50](https://github.com/waydefu/clinic/pull/50) | docs(review): Day 1 scope lock, auth incident, and acceptance matrix | MERGED | e1f665d550a1d88839229c224d4ffc49b7c9d5bf | HISTORICAL ONLY |
| [#51](https://github.com/waydefu/clinic/pull/51) | fix(supply-chain): fast-uri 3.1.7/4.1.4 and fastify 5.12.1 | MERGED | 1a4b24bc74ffe92fcafad57cf2f05fb6ff989f9b | HISTORICAL ONLY |
| [#52](https://github.com/waydefu/clinic/pull/52) | fix(web): hide synthetic login until CAL-PILOT boot resolves | MERGED | ff400f8534c56a62cb55ac719e43b943dd4afcba | HISTORICAL ONLY |
| [#53](https://github.com/waydefu/clinic/pull/53) | fix(web): send 404 home recovery to /clinic | MERGED | da6b0e99599429403cf49b459347c5f1e1e71a1d | HISTORICAL ONLY |
| [#54](https://github.com/waydefu/clinic/pull/54) | docs(governance): same-bar fallback and tiered routing | MERGED | ae1975e1fc1088290f8e1d5f1b097a3d6c4a61d0 | HISTORICAL ONLY |
| [#55](https://github.com/waydefu/clinic/pull/55) | fix(web): allow same-origin Auth iframe in CSP frame-src | MERGED | fbc92ced3fceeb48306d13e88bbb7bce3629a3a7 | HISTORICAL ONLY |
| [#56](https://github.com/waydefu/clinic/pull/56) | fix(api): use Hosting-forwardable __session cookie for CAL-PILOT | MERGED | 9e1be1a34a67161fdb9d820211138a2647d3d8cd | HISTORICAL ONLY |
| [#57](https://github.com/waydefu/clinic/pull/57) | docs(review): record Charter v2.0 Q1–Q22 reconciliation (T0-REG-01) | MERGED | 9462d8c5f7bee096174625a34c06b535ae431adf | HISTORICAL ONLY |
| [#58](https://github.com/waydefu/clinic/pull/58) | docs(plan): record VERIFIED STAGING execution plan v1.3 FROZEN | MERGED | 9e5405d85fe453633af66b7df7e2235b05c99756 | HISTORICAL ONLY |
| [#59](https://github.com/waydefu/clinic/pull/59) | fix(domain): released slots bookable again, legacy null reads as free (T1-DATA-01) | MERGED | 6c14ac463951faee015f2e3e55d7416dc2af36e4 | HISTORICAL ONLY |
| [#60](https://github.com/waydefu/clinic/pull/60) | fix(domain): scope audit/outbox occurrence identity by idempotency recordId (T1-DATA-02) | MERGED | ed2148c62635a255df3e53e1db9af13666514bbd | HISTORICAL ONLY |
| [#61](https://github.com/waydefu/clinic/pull/61) | test(api): CAL-PILOT session lifecycle through real authenticate path (T1-API-02) | MERGED | fea7eb115a99d5e5bef9d01238f8f6e86a09e4bb | HISTORICAL ONLY |
| [#62](https://github.com/waydefu/clinic/pull/62) | test(pilot): prove overlapping-create exclusivity under concurrency (T1-PILOT-01) | MERGED | 1e8f4e03ac71adfc77fab9114995404ef4de0ef2 | HISTORICAL ONLY |
| [#63](https://github.com/waydefu/clinic/pull/63) | feat(booking): one-month horizon in domain, drop medical-aesthetics catalogue (T1-BOOK-02) | MERGED | 5c2161c894540c493aa1931bfb8590ab6923f8da | HISTORICAL ONLY |
| [#64](https://github.com/waydefu/clinic/pull/64) | fix(web): wait for auth-state restore before login decision (T1-AUTH-01) | MERGED | 9fac72394610eecd2f58c68cb2b1496831dd2502 | HISTORICAL ONLY |
| [#65](https://github.com/waydefu/clinic/pull/65) | feat(api): Cache-Control private, no-store on all API responses (T1-AUTH-02) | MERGED | 0699d4210adaf24beff00c3798fecaeec333b348 | HISTORICAL ONLY |
| [#66](https://github.com/waydefu/clinic/pull/66) | feat(booking): patient self-cancel cutoff becomes appointment-day 10:00 (T1-BOOK-01) | MERGED | b7e45b548bccfc7c653f767cf033877a63d649cf | HISTORICAL ONLY |
| [#67](https://github.com/waydefu/clinic/pull/67) | fix(worker): fence outbox settlement with lease owner and generation (T1-ARC-01) | MERGED | cbd604b6cff44d95d7636ea2f98081722e53ee69 | HISTORICAL ONLY |
| [#68](https://github.com/waydefu/clinic/pull/68) | feat(web): split public and staff front doors on /staff (T1-FD-01) | MERGED | 6399f83b27f1280c9af320ed6b056c7f707e0233 | HISTORICAL ONLY |
| [#69](https://github.com/waydefu/clinic/pull/69) | feat(workbench): hide internal appointment IDs, scope overview cards to today (T2-WB-02) | MERGED | 2d1ae55f7b200a9270b8baeb946c56f75e8ce24f | HISTORICAL ONLY |
| [#70](https://github.com/waydefu/clinic/pull/70) | feat(booking): allow two concurrent unfinished appointments per patient (T1-BOOK-03) | MERGED | 106652f439e60172fd869963c4621ba0e03ad06d | HISTORICAL ONLY |
| [#71](https://github.com/waydefu/clinic/pull/71) | feat(scripts): add exact-SHA runtime-only CAL-PILOT update primitive (T0-DEP-01) | MERGED | e86e7131790ba19ec31ed3cde2858abe6eac0e0c | HISTORICAL ONLY |
| [#72](https://github.com/waydefu/clinic/pull/72) | feat(booking): occupy the new slot before releasing the old one on reschedule (T1-BOOK-04) | MERGED | 8d03669f1fabda8e04dc1a986a943c0923b41811 | HISTORICAL ONLY |
| [#73](https://github.com/waydefu/clinic/pull/73) | feat(api): prove unrouted appointment RBAC without mounting /v1/bookings (T1-API-01) | MERGED | 76a7f47ec111bfca94a113bf9122e3298d595448 | HISTORICAL ONLY |
| [#74](https://github.com/waydefu/clinic/pull/74) | docs(roadmap): stop attributing DATA-R01/02 and ARC-R01 to PR #23 (T1-DOC-01) | MERGED | 4357b157a8a821017cc8faacfb98e75f9d281206 | HISTORICAL ONLY |
| [#75](https://github.com/waydefu/clinic/pull/75) | test(workbench): prove /staff hash panels survive refresh and history (T2-WB-03) | MERGED | df51b5ae32e74cbd0236f1367545c75205320adf | HISTORICAL ONLY |
| [#76](https://github.com/waydefu/clinic/pull/76) | docs(product): propose a synthetic-only BOOK-PILOT without routing bookings (T2-GOV-01) | MERGED | d0e71ef069000968d843842639f0a8fd717b7957 | HISTORICAL ONLY |
| [#77](https://github.com/waydefu/clinic/pull/77) | docs: record DATA-R01/02 and ARC-R01 as closed in current-status sources | MERGED | c1678862d2c56a1491b6b47388af7066f1bc7006 | HISTORICAL ONLY |
| [#78](https://github.com/waydefu/clinic/pull/78) | test(e2e): scan /staff and patient reschedule for axe and 360/390 overflow (T3-Q-01) | MERGED | 5ca4e74e8ceb9548dac639ee4b0319853a81d724 | HISTORICAL ONLY |
| [#79](https://github.com/waydefu/clinic/pull/79) | test(workbench): pin empty, pending, success, and denied feedback states (T2-WB-01) | MERGED | 05dffe37bac95534fdfef7d7779b10f1ba2382c6 | HISTORICAL ONLY |
| [#80](https://github.com/waydefu/clinic/pull/80) | ci: pin Node 24.20.0 and reject the unpatched 24.14.0 floor (SCM-R02) | MERGED | bcff619b4c7c14b99ac84a595f97870dfa4f2c3a | HISTORICAL ONLY |
| [#81](https://github.com/waydefu/clinic/pull/81) | feat(web): fail closed on per-page index approval (WEB-P0-01) | MERGED | 867fb8cdc4387f08434df45cd3b8a23166a3f02f | HISTORICAL ONLY |
| [#82](https://github.com/waydefu/clinic/pull/82) | UI/UX 重設計：官網、患者預約與員工工作臺 | MERGED | 73febfa0184b0d9ffc83b1f3dc6187e262517afb | HISTORICAL ONLY |
| [#83](https://github.com/waydefu/clinic/pull/83) | test(web): complete performance and axe evidence gates (WEB-P0-02/03) | MERGED | 49efeda4ea2a598ba5e1e0d3d53bafe4b917b8ec | HISTORICAL ONLY |
| [#84](https://github.com/waydefu/clinic/pull/84) | docs(ui): record synthetic preview deployment | MERGED | 29d409246fd9b2b19a4c23d614955b6185b90ac5 | HISTORICAL ONLY |
| [#85](https://github.com/waydefu/clinic/pull/85) | docs(ui): record live preview acceptance | MERGED | e7d4e632c70a02b40e3a4f2fa171dfa639c1637c | HISTORICAL ONLY |
| [#86](https://github.com/waydefu/clinic/pull/86) | docs: close WEB-P0/SCM-R02 status drift and record D-013 live conflict | MERGED | 69b56e997765e4b1737955a5ae1adca35fe963e8 | HISTORICAL ONLY |
| [#87](https://github.com/waydefu/clinic/pull/87) | docs: non-UI authorized-closure handoff after PR #86 | MERGED | 16f62f9110664b48daedfe9b471b78f8534ea0c1 | HISTORICAL ONLY |
| [#88](https://github.com/waydefu/clinic/pull/88) | docs(gov): bind administrators to D-013 required checks | MERGED | 9a7748e7718891ca029c8f0dbe92194ff6efd320 | HISTORICAL ONLY |
| [#89](https://github.com/waydefu/clinic/pull/89) | ci(scm-r03): fold Gitleaks into Verification evidence | MERGED | 6e91bdacfbeb6a13c3a3b587ab95f54f848d8d17 | HISTORICAL ONLY |
| [#90](https://github.com/waydefu/clinic/pull/90) | DO NOT MERGE — SCM-R03 故意失敗驗收：紅的 Gitleaks 必須擋下合併 | CLOSED | — | HISTORICAL ONLY |
| [#91](https://github.com/waydefu/clinic/pull/91) | DO NOT MERGE — SCM-R03 故意失敗驗收：紅的 Gitleaks 必須擋下合併 | CLOSED | — | HISTORICAL ONLY |
| [#92](https://github.com/waydefu/clinic/pull/92) | docs(scm-r03): record Gitleaks aggregate and negative control | MERGED | e2e52a9788687c9ab9fc30f7c35488a4a8b78703 | HISTORICAL ONLY |
| [#93](https://github.com/waydefu/clinic/pull/93) | fix(web): make all Staff workspaces reachable on mobile | MERGED | 2c731e4d8c442362728aff29e9f50d803b5ec809 | HISTORICAL ONLY |
| [#94](https://github.com/waydefu/clinic/pull/94) | fix(scm-r04): patch same-major advisories and triage the rest | MERGED | ad58a61052eb806be7c4c2c49c5d765eb4323f83 | HISTORICAL ONLY |
| [#95](https://github.com/waydefu/clinic/pull/95) | fix(data-r03): refuse Calendar cancel on unknown appointment status | MERGED | dbbeed72463cf646cfa1c1a9782ebb5819aa584d | HISTORICAL ONLY |
| [#96](https://github.com/waydefu/clinic/pull/96) | feat(book-pilot): isolated unrouted BookPilotModule | MERGED | 9b38bb182d28974001c7b1841ba4b65d42511bb0 | HISTORICAL ONLY |
| [#97](https://github.com/waydefu/clinic/pull/97) | docs(staging): Q-STAGING read-only inventory | MERGED | 62376537807d575e518bf42a0fbf7d050c71cdf8 | HISTORICAL ONLY |
| [#98](https://github.com/waydefu/clinic/pull/98) | feat(data-r03): dual-read slot and appointment snapshots | MERGED | 21a3ee9eebf12ca870275abc1d9f5b3e945e0e22 | HISTORICAL ONLY |
| [#99](https://github.com/waydefu/clinic/pull/99) | fix(data-r03): align stored idempotency resourceType with domain | MERGED | 3f726d8cd9e5532d68e554a65de1e386849a1f53 | HISTORICAL ONLY |
| [#100](https://github.com/waydefu/clinic/pull/100) | docs(data-r03): record landed slices without closing the ID | MERGED | e484b52bf95cfddcea4c26aa60e5866f1c6bf70c | HISTORICAL ONLY |
| [#101](https://github.com/waydefu/clinic/pull/101) | feat(data-r03): dual-read outbox snapshots fail-closed | MERGED | 90c9c3e9064af5b1de91bd1e9deb80d57d219ca8 | HISTORICAL ONLY |
| [#102](https://github.com/waydefu/clinic/pull/102) | feat(data-r03): parse CAL-PILOT idempotency replay envelopes | MERGED | 0dae4ee2426c8f698d0a8a6ca7dc02f44b09fa96 | HISTORICAL ONLY |
| [#103](https://github.com/waydefu/clinic/pull/103) | docs(data-r03): record #101 and #102 slices; ID stays open | MERGED | 496da6e80733f1421e08c99f30559709116d04e0 | HISTORICAL ONLY |
| [#104](https://github.com/waydefu/clinic/pull/104) | docs(staging): live-read Cloud Run, secret versions, compact IAM | MERGED | a9d3ba8b3ffd3692c31d9fdb259f413326945957 | HISTORICAL ONLY |
| [#105](https://github.com/waydefu/clinic/pull/105) | docs: non-UI max-authorized handoff after owner five answers | MERGED | 3cac3679c77068a1956f8058169ab7a460ef1d76 | HISTORICAL ONLY |
| [#106](https://github.com/waydefu/clinic/pull/106) | docs: distinguish unrouted booking from the CAL-PILOT exception | MERGED | 712de2c565e4fc0930090a8c1b4507b54305db52 | HISTORICAL ONLY |
| [#107](https://github.com/waydefu/clinic/pull/107) | fix(web): keep 1280 workbench from overflowing on two-digit dates | MERGED | f31bccc41fcf2ac4e846a6f088947b000fb11bbb | HISTORICAL ONLY |
| [#108](https://github.com/waydefu/clinic/pull/108) | fix(runtime): pin api/worker and Cursor recipes to Node 24.20.0 | MERGED | db30c1d4d7679491d7152b3946b1033151705419 | HISTORICAL ONLY |
| [#109](https://github.com/waydefu/clinic/pull/109) | docs: record GC-001 public canonical repo and retire Rule 1 | MERGED | 8a98ffa183d7c5131b84564cbbce80b31b9c3902 | HISTORICAL ONLY |
| [#110](https://github.com/waydefu/clinic/pull/110) | fix(scm-r04): patch vitest 4.1.11 and remaining same-major floors | MERGED | 5257d85ddf797dd11672a969320042e5ca1353b7 | HISTORICAL ONLY |
| [#111](https://github.com/waydefu/clinic/pull/111) | fix(web): reclaim booking chrome on 320px and flatten nested cards | MERGED | e7aff02dc7b158ca4a3ff70a15fad476c2cc6a6b | HISTORICAL ONLY |
| [#112](https://github.com/waydefu/clinic/pull/112) | feat(gates): C1–C6 synthetic PASS on isolated project; booking UNROUTED | MERGED | 48f773b4287460ce29ae4b970543a60514a8a105 | CURRENT BUT INCOMPLETE |
| [#113](https://github.com/waydefu/clinic/pull/113) | plan: Grok keeps engineering; Luna last-mile account handoff only | MERGED | e472eb936cf6b9e4409bb16dc9dc2dedecc3f675 | SUPERSEDED |
| [#114](https://github.com/waydefu/clinic/pull/114) | plan: Grok rests; Luna sole remaining executor | MERGED | 5b51d40659ca02414200688c1997a236bcea83bd | SUPERSEDED |
| [#115](https://github.com/waydefu/clinic/pull/115) | docs(luna): enhance playbook & master plan with executable details | MERGED | 36f81011fcc2f9c82a51f83b79a285b5fa2cc794 | HISTORICAL ONLY |
| [#116](https://github.com/waydefu/clinic/pull/116) | fix: safely verify Firebase login in Phase 0 snapshot | CLOSED | — | HISTORICAL ONLY |
| [#117](https://github.com/waydefu/clinic/pull/117) | fix(auth): harden delegated authorization storage | MERGED | 96fc9aaa4dc23b5ec553a8236dd77798f130c5b9 | CURRENT BUT INCOMPLETE |
| [#118](https://github.com/waydefu/clinic/pull/118) | fix(auth): atomic delegated lockout, denied-event audit, blocker harvest | MERGED | 02b949feee3d58c67e4b5f3b7790e1e9e54b3c20 | CURRENT BUT INCOMPLETE |
| [#119](https://github.com/waydefu/clinic/pull/119) | fix(web): migrate stored workbench role admin to manager | MERGED | 201969d3357adfd7b54c9fca5f8f1887745159da | CURRENT BUT INCOMPLETE |
| [#120](https://github.com/waydefu/clinic/pull/120) | fix: rebase Phase 0 Firebase snapshot onto D-006 / B-013 stack | MERGED | fd7e4a0c0932549c95039202a93b327c6871dab3 | CURRENT BUT INCOMPLETE |
| [#121](https://github.com/waydefu/clinic/pull/121) | feat(api): mount fail-closed IP-001 internal-test booking | MERGED | d6559f052229d23203c1da0b18f10951d64937da | CURRENT BUT INCOMPLETE |
| [#122](https://github.com/waydefu/clinic/pull/122) | feat(api): mount fail-closed IP-001 booking query and cancel | MERGED | 524cb60571ec6fc24520f19007e4674a1c9d9a7e | CURRENT BUT INCOMPLETE |
| [#123](https://github.com/waydefu/clinic/pull/123) | feat(api): IP-001 horizon, staff on-behalf create, and reschedule cutoff | MERGED | a9a445a4e9bae83f779a9914bc7203961813f916 | CURRENT BUT INCOMPLETE |
| [#124](https://github.com/waydefu/clinic/pull/124) | docs: record INTERNAL_PREPRODUCTION_COMPLETE inspect for a9a445a | MERGED | 967fdcec77e64bdbf7100d9d93961c966f1ba82c | HISTORICAL ONLY |
| [#125](https://github.com/waydefu/clinic/pull/125) | docs(plan): INTERNAL_PREPRODUCTION 補強施工計畫與 agent 工具導入評估（2026-09-14 稽核） | MERGED | 91fab3ad6132faa0cc9af9c73c29a155e39b6912 | SUPERSEDED |
| [#126](https://github.com/waydefu/clinic/pull/126) | docs: draft WP-B1 C1 API authority packet (waiting) | MERGED | 2a336e9feb7bc3c5e4defda719a562cd1b4482a3 | HISTORICAL ONLY |
| [#127](https://github.com/waydefu/clinic/pull/127) | docs: Stage A+B signed WP-B1–B11 Canon and F-01–F-14 closure | MERGED | f5b9fe27b9e19db6c8e83e612832354ef14d2703 | CURRENT AUTHORITY |
| [#128](https://github.com/waydefu/clinic/pull/128) | Stage C: routing, fail-closed gate, limiter, audit, and patient flow | MERGED | 06ea0259fdabd91aa9b9e77bba9600e20b64393e | CURRENT BUT INCOMPLETE |
| [#129](https://github.com/waydefu/clinic/pull/129) | Stage D: Calendar sync, candidate review, and same-event projection | MERGED | 8df6e265eb2edd325edb96bcb7260a0ffbcde25a | CURRENT BUT INCOMPLETE |
| [#130](https://github.com/waydefu/clinic/pull/130) | Stage E: monitoring, CSP, WP-B4 alerts, and operational readiness | MERGED | 186f1f9ca7afe2fe03ca55dfaf1326149bfa9919 | CURRENT BUT INCOMPLETE |
| [#131](https://github.com/waydefu/clinic/pull/131) | Stage F0: exact-SHA cloud authority packet (unsigned) | CLOSED | — | HISTORICAL ONLY |
| [#132](https://github.com/waydefu/clinic/pull/132) | Stage F: close E1–E7 source gaps (no cloud apply) | MERGED | 7a37545070db166c0b76723db09cf32f7f68de71 | CURRENT BUT INCOMPLETE |
| [#133](https://github.com/waydefu/clinic/pull/133) | fix(infra): Cloud Run v2 PORT and WP-B4 outbox DISTRIBUTION metric | CLOSED | — | HISTORICAL ONLY |
| [#134](https://github.com/waydefu/clinic/pull/134) | Stage F source remediation: Cloud ADC, accountless booking, inspect-only schedule | MERGED | 950d346d00c4d5dcaac985b1df4e931cd6eb3cd6 | CURRENT BUT INCOMPLETE |
| [#135](https://github.com/waydefu/clinic/pull/135) | fix(c1): parameterize Firebase authDomain for isolated preview | MERGED | 5ea2fa2c6b81164fc75b46adf7b35398b7f5f95d | CURRENT BUT INCOMPLETE |
| [#136](https://github.com/waydefu/clinic/pull/136) | fix(auth): require fresh TOTP sign-in after enrollment | MERGED | 6b899460decb6e9e89cf7cc54834a378c78618e8 | CURRENT BUT INCOMPLETE |
| [#137](https://github.com/waydefu/clinic/pull/137) | chore(auth): add PII-safe calendar session gate telemetry | MERGED | a4ebf64d33fb24b825dd652e6ec2b2dff92896f9 | CURRENT BUT INCOMPLETE |
| [#138](https://github.com/waydefu/clinic/pull/138) | chore(auth): classify Firebase ID token verification failures | MERGED | 7dbe50a575b5d8e101da2e76b797eebf7a443cc6 | CURRENT BUT INCOMPLETE |
| [#139](https://github.com/waydefu/clinic/pull/139) | chore(auth): converge unknown Firebase verify-token failures | MERGED | 24f43542ef7f4271f6d67ba8686838410d8eae51 | CURRENT BUT INCOMPLETE |
| [#140](https://github.com/waydefu/clinic/pull/140) | fix(iam): allow C1 API to read Firebase Auth users | MERGED | e71775e4bf686d9db061c5e21eaf85c0da535aaf | CURRENT BUT INCOMPLETE |
| [#141](https://github.com/waydefu/clinic/pull/141) | fix(iam): allow C1 API to create Firebase Auth sessions | MERGED | ca2c35e8e01dd382247ef3891286225df575e14e | CURRENT BUT INCOMPLETE |
| [#142](https://github.com/waydefu/clinic/pull/142) | docs: hand off Stage F CAL-PILOT state | MERGED | 66e4c4e44f1aa60e6eb9df8b47b5f1df2aa84d50 | HISTORICAL ONLY |
| [#143](https://github.com/waydefu/clinic/pull/143) | docs: plan Phase 1 completion with executable Luna packets | MERGED | 54ff5fb2d6e0f4b027ecc9d29e15c565101f7b1f | CURRENT BUT INCOMPLETE |
| [#144](https://github.com/waydefu/clinic/pull/144) | fix(web): two-layer Workbench logout teardown (P1-01) | MERGED | 6a2b7c7ce49ecd611dfc321de0e2a38c62dddf75 | CURRENT BUT INCOMPLETE |
| [#145](https://github.com/waydefu/clinic/pull/145) | fix(infra): split C1 secret version pins per service (P1-03) | MERGED | 904dc96adeaf573c3a1491630deaf31011c0ea82 | CURRENT BUT INCOMPLETE |
| [#146](https://github.com/waydefu/clinic/pull/146) | fix(api): await durable denied-authorization audit lifecycle (P1-02) | MERGED | 8b8ca86a101333cabe20c5b4155b4ff67994f3a7 | CURRENT BUT INCOMPLETE |
| [#147](https://github.com/waydefu/clinic/pull/147) | docs: 補齊正式交付與商務需求的後續程式規劃 | MERGED | 6a582529869f08aa3562236fc1227d1513366b13 | CURRENT BUT INCOMPLETE |
| [#148](https://github.com/waydefu/clinic/pull/148) | fix(auth): repair C1 session revoke path | MERGED | c58ac7299c7456a5aba25458f7796459c5722aab | CURRENT BUT INCOMPLETE |
| [#149](https://github.com/waydefu/clinic/pull/149) | feat(domain): add business delivery milestone contract | MERGED | ab1f15a626377e154fe2290738676ebfdd4a5104 | CONTRACT ONLY |
| [#150](https://github.com/waydefu/clinic/pull/150) | feat(domain): add safe business export contract | MERGED | 512af6aa163f1b120067181f542375c4e06131e8 | CONTRACT ONLY |
| [#151](https://github.com/waydefu/clinic/pull/151) | feat(domain): add retention lifecycle contract | MERGED | 34b799546f0f79692fd4cd69200008a9e932d231 | CONTRACT ONLY |
| [#152](https://github.com/waydefu/clinic/pull/152) | feat(domain): add monthly business usage report contract | MERGED | 4a8fca7836a2da776035e96b264270a6d8075076 | CONTRACT ONLY |
| [#153](https://github.com/waydefu/clinic/pull/153) | feat(domain): add termination return checklist contract | MERGED | ae9a7ba2b9ad32f258bbfc811dd67238296e7c8c | CONTRACT ONLY |
| [#154](https://github.com/waydefu/clinic/pull/154) | feat(domain): add backup evidence assessment contract | MERGED | ce90e9117353993e6eb366e735566ce2d33bc34e | CONTRACT ONLY |
| [#155](https://github.com/waydefu/clinic/pull/155) | fix(web): restore MFA gate and local draft identity handoff | MERGED | bc8b767aeb3a0a2f84a91111f5387803d1955c2a | CURRENT BUT INCOMPLETE |
| [#156](https://github.com/waydefu/clinic/pull/156) | test(phase1): close denial audit and M11 operator gaps | MERGED | 85b346b50533e5deafa6a98f264bbe67ffe32928 | CURRENT BUT INCOMPLETE |
| [#157](https://github.com/waydefu/clinic/pull/157) | fix(phase1): verify deployed API and return booking flow | MERGED | 974c75da75e2de93f27d0f435a60f57c8db8a407 | CURRENT BUT INCOMPLETE |
| [#158](https://github.com/waydefu/clinic/pull/158) | fix: close recovered WP-B4 incidents | MERGED | 4f31b00f378c96b213c64f33100b5e0d35583d3e | CURRENT BUT INCOMPLETE |
| [#159](https://github.com/waydefu/clinic/pull/159) | fix: stabilize C1 rate-limit client identity | MERGED | d59008b320aa043e25773454d785c5a70f13340b | SOURCE COMPLETE / RUNTIME MISSING |
| [#160](https://github.com/waydefu/clinic/pull/160) | feat: prepare isolated C1 calendar candidate verification | MERGED | da8883c40453449b33f4b687d6616a62fcbef90b | SOURCE COMPLETE / RUNTIME MISSING |
| [#161](https://github.com/waydefu/clinic/pull/161) | fix: stage C1 calendar sync prerequisites before runtime | MERGED | e387f2522ea010848f41a4f34778ffc50d83fef3 | SOURCE COMPLETE / RUNTIME MISSING |

## #112～161 逐筆 current-path 判讀

下列purpose沿GitHub title，actual scope以changed-files核對；列出的source入口是實際PR變更檔案的最小子集，
不是所有changedfiles。精確diff請走PR連結。runtime/cloud/human僅列可建立的證據關係，不由合併日期推論。

### #112 — feat(gates): C1–C6 synthetic PASS on isolated project; booking UNROUTED

| 審計欄位 | 判讀 |
| --- | --- |
| State / merge | MERGED；48f773b4287460ce29ae4b970543a60514a8a105 |
| Purpose / actual scope | feat(gates): C1–C6 synthetic PASS on isolated project; booking UNROUTED；變更 93 檔；實際入口：`apps/worker/src/calendar-sync/google-sync-client.ts`、`apps/worker/src/calendar-sync/watch-channel-store.ts`、`apps/worker/src/calendar-sync/watch-channel.ts`、`apps/api/src/calendar/calendar-watch.controller.test.ts` |
| Explicit exclusions | 不授權production/真資料；source或draftapproval不等於cloudexecution |
| Source / CI | 已合併；current tree以e387f252 CI為基線，runtime需獨立 |
| Runtime evidence | 未建立此PR專屬現場完成證據；由CP-00/08現行矩陣覆核 |
| Cloud evidence | currentC1snapshot另見主計畫；不把PR文件/source當apply/readback |
| Human evidence | 沒有本PR專屬humanacceptance證據；CI/HTTP200不替人證 |
| Superseding / current authority | 未識別單一替代PR；以currentmain+最新owner scope為準；CURRENT BUT INCOMPLETE |
| Remaining dependency / acceptance | CP-00/08現行證據及CP-01/02新字段相依回歸 |

### #113 — plan: Grok keeps engineering; Luna last-mile account handoff only

| 審計欄位 | 判讀 |
| --- | --- |
| State / merge | MERGED；e472eb936cf6b9e4409bb16dc9dc2dedecc3f675 |
| Purpose / actual scope | plan: Grok keeps engineering; Luna last-mile account handoff only；變更 15 檔；實際入口：`docs/INDEX.md`、`docs/architecture/c0-engineering-recommendations.md`、`docs/product/current-execution-and-approval-plan.md`、`docs/product/luna-local-project-completion-master-plan.md` |
| Explicit exclusions | 不授權production/真資料；source或draftapproval不等於cloudexecution |
| Source / CI | 已合併；current tree以e387f252 CI為基線，runtime需獨立 |
| Runtime evidence | 未建立此PR專屬現場完成證據；由CP-00/08現行矩陣覆核 |
| Cloud evidence | currentC1snapshot另見主計畫；不把PR文件/source當apply/readback |
| Human evidence | 沒有本PR專屬humanacceptance證據；CI/HTTP200不替人證 |
| Superseding / current authority | #114、後續 owner executor 指示；SUPERSEDED |
| Remaining dependency / acceptance | CP-00/08現行證據及CP-01/02新字段相依回歸 |

### #114 — plan: Grok rests; Luna sole remaining executor

| 審計欄位 | 判讀 |
| --- | --- |
| State / merge | MERGED；5b51d40659ca02414200688c1997a236bcea83bd |
| Purpose / actual scope | plan: Grok rests; Luna sole remaining executor；變更 10 檔；實際入口：`docs/INDEX.md`、`docs/architecture/c0-engineering-recommendations.md`、`docs/product/current-execution-and-approval-plan.md`、`docs/product/luna-local-authorized-playbook.md` |
| Explicit exclusions | 不授權production/真資料；source或draftapproval不等於cloudexecution |
| Source / CI | 已合併；current tree以e387f252 CI為基線，runtime需獨立 |
| Runtime evidence | 未建立此PR專屬現場完成證據；由CP-00/08現行矩陣覆核 |
| Cloud evidence | currentC1snapshot另見主計畫；不把PR文件/source當apply/readback |
| Human evidence | 沒有本PR專屬humanacceptance證據；CI/HTTP200不替人證 |
| Superseding / current authority | 後續 owner Grok/Luna 指示；本計畫 Luna xhigh；SUPERSEDED |
| Remaining dependency / acceptance | CP-00/08現行證據及CP-01/02新字段相依回歸 |

### #115 — docs(luna): enhance playbook & master plan with executable details

| 審計欄位 | 判讀 |
| --- | --- |
| State / merge | MERGED；36f81011fcc2f9c82a51f83b79a285b5fa2cc794 |
| Purpose / actual scope | docs(luna): enhance playbook & master plan with executable details；變更 8 檔；實際入口：`docs/product/luna-local-authorized-playbook.md`、`docs/product/luna-local-project-completion-master-plan.md`、`docs/templates/d-series-approval-packet-template.md`、`docs/templates/human-blocker-template.md` |
| Explicit exclusions | 不授權production/真資料；source或draftapproval不等於cloudexecution |
| Source / CI | 已合併；current tree以e387f252 CI為基線，runtime需獨立 |
| Runtime evidence | 未建立此PR專屬現場完成證據；由CP-00/08現行矩陣覆核 |
| Cloud evidence | currentC1snapshot另見主計畫；不把PR文件/source當apply/readback |
| Human evidence | 沒有本PR專屬humanacceptance證據；CI/HTTP200不替人證 |
| Superseding / current authority | 本計畫逐包入口（保留identity安全章）；HISTORICAL ONLY |
| Remaining dependency / acceptance | CP-00/08現行證據及CP-01/02新字段相依回歸 |

### #116 — fix: safely verify Firebase login in Phase 0 snapshot

| 審計欄位 | 判讀 |
| --- | --- |
| State / merge | CLOSED；NOT_MERGED |
| Purpose / actual scope | fix: safely verify Firebase login in Phase 0 snapshot；變更 13 檔；實際入口：`docs/architecture/production-target-architecture-2026-07-23.md`、`docs/enterprise-appointment-project-plan.md`、`docs/product/phase-1-appointment-operations-approval-packet.md`、`docs/product/production-readiness-delivery-plan-2026-07-23.md` |
| Explicit exclusions | 不授權production/真資料；source或draftapproval不等於cloudexecution |
| Source / CI | 未合併；無current-main source完成宣稱 |
| Runtime evidence | 未合併，不作部署依據 |
| Cloud evidence | currentC1snapshot另見主計畫；不把PR文件/source當apply/readback |
| Human evidence | 沒有本PR專屬humanacceptance證據；CI/HTTP200不替人證 |
| Superseding / current authority | #120；HISTORICAL ONLY |
| Remaining dependency / acceptance | 不用此未合併branch施工；核對superseding currentmain |

### #117 — fix(auth): harden delegated authorization storage

| 審計欄位 | 判讀 |
| --- | --- |
| State / merge | MERGED；96fc9aaa4dc23b5ec553a8236dd77798f130c5b9 |
| Purpose / actual scope | fix(auth): harden delegated authorization storage；變更 26 檔；實際入口：`apps/api/src/platform/authorization/delegated-authorization-crypto.test.ts`、`apps/api/src/platform/authorization/delegated-authorization-crypto.ts`、`docs/architecture/rbac-matrix.md`、`docs/design/test-only-operations-ui.md` |
| Explicit exclusions | 不授權production/真資料；source或draftapproval不等於cloudexecution |
| Source / CI | 已合併；current tree以e387f252 CI為基線，runtime需獨立 |
| Runtime evidence | 未建立此PR專屬現場完成證據；由CP-00/08現行矩陣覆核 |
| Cloud evidence | currentC1snapshot另見主計畫；不把PR文件/source當apply/readback |
| Human evidence | 沒有本PR專屬humanacceptance證據；CI/HTTP200不替人證 |
| Superseding / current authority | 未識別單一替代PR；以currentmain+最新owner scope為準；CURRENT BUT INCOMPLETE |
| Remaining dependency / acceptance | CP-00/08現行證據及CP-01/02新字段相依回歸 |

### #118 — fix(auth): atomic delegated lockout, denied-event audit, blocker harvest

| 審計欄位 | 判讀 |
| --- | --- |
| State / merge | MERGED；02b949feee3d58c67e4b5f3b7790e1e9e54b3c20 |
| Purpose / actual scope | fix(auth): atomic delegated lockout, denied-event audit, blocker harvest；變更 47 檔；實際入口：`apps/api/src/platform/authorization/denied-authorization-audit-sink.ts`、`apps/web/public/vendor/domain/denied-delegation-audit.js`、`packages/domain/src/denied-delegation-audit.ts`、`apps/api/src/platform/authorization/delegated-authorization-attempt-store.test.ts` |
| Explicit exclusions | 不授權production/真資料；source或draftapproval不等於cloudexecution |
| Source / CI | 已合併；current tree以e387f252 CI為基線，runtime需獨立 |
| Runtime evidence | 未建立此PR專屬現場完成證據；由CP-00/08現行矩陣覆核 |
| Cloud evidence | currentC1snapshot另見主計畫；不把PR文件/source當apply/readback |
| Human evidence | 沒有本PR專屬humanacceptance證據；CI/HTTP200不替人證 |
| Superseding / current authority | 未識別單一替代PR；以currentmain+最新owner scope為準；CURRENT BUT INCOMPLETE |
| Remaining dependency / acceptance | CP-00/08現行證據及CP-01/02新字段相依回歸 |

### #119 — fix(web): migrate stored workbench role admin to manager

| 審計欄位 | 判讀 |
| --- | --- |
| State / merge | MERGED；201969d3357adfd7b54c9fca5f8f1887745159da |
| Purpose / actual scope | fix(web): migrate stored workbench role admin to manager；變更 12 檔；實際入口：`apps/web/src/test-only-auth.test.ts`、`apps/web/src/test-only-permissions.test.ts`、`docs/architecture/rbac-matrix.md`、`docs/reviews/2026-09-13-d006-atomic-audit-and-blocker-harvest.md` |
| Explicit exclusions | 不授權production/真資料；source或draftapproval不等於cloudexecution |
| Source / CI | 已合併；current tree以e387f252 CI為基線，runtime需獨立 |
| Runtime evidence | 未建立此PR專屬現場完成證據；由CP-00/08現行矩陣覆核 |
| Cloud evidence | currentC1snapshot另見主計畫；不把PR文件/source當apply/readback |
| Human evidence | 沒有本PR專屬humanacceptance證據；CI/HTTP200不替人證 |
| Superseding / current authority | 未識別單一替代PR；以currentmain+最新owner scope為準；CURRENT BUT INCOMPLETE |
| Remaining dependency / acceptance | CP-00/08現行證據及CP-01/02新字段相依回歸 |

### #120 — fix: rebase Phase 0 Firebase snapshot onto D-006 / B-013 stack

| 審計欄位 | 判讀 |
| --- | --- |
| State / merge | MERGED；fd7e4a0c0932549c95039202a93b327c6871dab3 |
| Purpose / actual scope | fix: rebase Phase 0 Firebase snapshot onto D-006 / B-013 stack；變更 13 檔；實際入口：`docs/architecture/production-target-architecture-2026-07-23.md`、`docs/enterprise-appointment-project-plan.md`、`docs/product/phase-1-appointment-operations-approval-packet.md`、`docs/product/production-readiness-delivery-plan-2026-07-23.md` |
| Explicit exclusions | 不授權production/真資料；source或draftapproval不等於cloudexecution |
| Source / CI | 已合併；current tree以e387f252 CI為基線，runtime需獨立 |
| Runtime evidence | 未建立此PR專屬現場完成證據；由CP-00/08現行矩陣覆核 |
| Cloud evidence | currentC1snapshot另見主計畫；不把PR文件/source當apply/readback |
| Human evidence | 沒有本PR專屬humanacceptance證據；CI/HTTP200不替人證 |
| Superseding / current authority | 未識別單一替代PR；以currentmain+最新owner scope為準；CURRENT BUT INCOMPLETE |
| Remaining dependency / acceptance | CP-00/08現行證據及CP-01/02新字段相依回歸 |

### #121 — feat(api): mount fail-closed IP-001 internal-test booking

| 審計欄位 | 判讀 |
| --- | --- |
| State / merge | MERGED；d6559f052229d23203c1da0b18f10951d64937da |
| Purpose / actual scope | feat(api): mount fail-closed IP-001 internal-test booking；變更 41 檔；實際入口：`apps/api/src/internal-test-booking/internal-test-booking.authenticator.ts`、`apps/api/src/internal-test-booking/internal-test-booking.gate.ts`、`apps/api/src/internal-test-booking/internal-test-booking.module.ts`、`apps/api/src/internal-test-booking/internal-test-booking.tokens.ts` |
| Explicit exclusions | 不授權production/真資料；source或draftapproval不等於cloudexecution |
| Source / CI | 已合併；current tree以e387f252 CI為基線，runtime需獨立 |
| Runtime evidence | 未建立此PR專屬現場完成證據；由CP-00/08現行矩陣覆核 |
| Cloud evidence | currentC1snapshot另見主計畫；不把PR文件/source當apply/readback |
| Human evidence | 沒有本PR專屬humanacceptance證據；CI/HTTP200不替人證 |
| Superseding / current authority | 未識別單一替代PR；以currentmain+最新owner scope為準；CURRENT BUT INCOMPLETE |
| Remaining dependency / acceptance | CP-00/08現行證據及CP-01/02新字段相依回歸 |

### #122 — feat(api): mount fail-closed IP-001 booking query and cancel

| 審計欄位 | 判讀 |
| --- | --- |
| State / merge | MERGED；524cb60571ec6fc24520f19007e4674a1c9d9a7e |
| Purpose / actual scope | feat(api): mount fail-closed IP-001 booking query and cancel；變更 29 檔；實際入口：`apps/api/src/appointments/appointment.application-service.test.ts`、`apps/api/src/appointments/appointment.application-service.ts`、`apps/api/src/appointments/appointment.controller.test.ts`、`apps/api/src/appointments/appointment.controller.ts` |
| Explicit exclusions | 不授權production/真資料；source或draftapproval不等於cloudexecution |
| Source / CI | 已合併；current tree以e387f252 CI為基線，runtime需獨立 |
| Runtime evidence | 未建立此PR專屬現場完成證據；由CP-00/08現行矩陣覆核 |
| Cloud evidence | currentC1snapshot另見主計畫；不把PR文件/source當apply/readback |
| Human evidence | 沒有本PR專屬humanacceptance證據；CI/HTTP200不替人證 |
| Superseding / current authority | 未識別單一替代PR；以currentmain+最新owner scope為準；CURRENT BUT INCOMPLETE |
| Remaining dependency / acceptance | CP-00/08現行證據及CP-01/02新字段相依回歸 |

### #123 — feat(api): IP-001 horizon, staff on-behalf create, and reschedule cutoff

| 審計欄位 | 判讀 |
| --- | --- |
| State / merge | MERGED；a9a445a4e9bae83f779a9914bc7203961813f916 |
| Purpose / actual scope | feat(api): IP-001 horizon, staff on-behalf create, and reschedule cutoff；變更 127 檔；實際入口：`apps/api/src/auth/calendar-pilot-session.ts`、`apps/api/src/internal-test-booking/internal-test-booking.module.ts`、`apps/web/public/modules/internal-test-booking-transport.js`、`apps/worker/src/calendar-sync/calendar-pilot-health.ts` |
| Explicit exclusions | 不授權production/真資料；source或draftapproval不等於cloudexecution |
| Source / CI | 已合併；current tree以e387f252 CI為基線，runtime需獨立 |
| Runtime evidence | 未建立此PR專屬現場完成證據；由CP-00/08現行矩陣覆核 |
| Cloud evidence | currentC1snapshot另見主計畫；不把PR文件/source當apply/readback |
| Human evidence | 沒有本PR專屬humanacceptance證據；CI/HTTP200不替人證 |
| Superseding / current authority | 未識別單一替代PR；以currentmain+最新owner scope為準；CURRENT BUT INCOMPLETE |
| Remaining dependency / acceptance | CP-00/08現行證據及CP-01/02新字段相依回歸 |

### #124 — docs: record INTERNAL_PREPRODUCTION_COMPLETE inspect for a9a445a

| 審計欄位 | 判讀 |
| --- | --- |
| State / merge | MERGED；967fdcec77e64bdbf7100d9d93961c966f1ba82c |
| Purpose / actual scope | docs: record INTERNAL_PREPRODUCTION_COMPLETE inspect for a9a445a；變更 4 檔；實際入口：`docs/product/phase-1-decision-register.md`、`docs/reviews/2026-09-13-internal-preproduction-human-blocker-queue.md`、`docs/reviews/2026-09-14-internal-preproduction-complete.md` |
| Explicit exclusions | 不授權production/真資料；source或draftapproval不等於cloudexecution |
| Source / CI | 已合併；current tree以e387f252 CI為基線，runtime需獨立 |
| Runtime evidence | 未建立此PR專屬現場完成證據；由CP-00/08現行矩陣覆核 |
| Cloud evidence | currentC1snapshot另見主計畫；不把PR文件/source當apply/readback |
| Human evidence | 沒有本PR專屬humanacceptance證據；CI/HTTP200不替人證 |
| Superseding / current authority | #127～161 及本次 fresh baseline；HISTORICAL ONLY |
| Remaining dependency / acceptance | CP-00/08現行證據及CP-01/02新字段相依回歸 |

### #125 — docs(plan): INTERNAL_PREPRODUCTION 補強施工計畫與 agent 工具導入評估（2026-09-14 稽核）

| 審計欄位 | 判讀 |
| --- | --- |
| State / merge | MERGED；91fab3ad6132faa0cc9af9c73c29a155e39b6912 |
| Purpose / actual scope | docs(plan): INTERNAL_PREPRODUCTION 補強施工計畫與 agent 工具導入評估（2026-09-14 稽核）；變更 3 檔；實際入口：`docs/plans/2026-09-14-agent-tooling-adoption.md`、`docs/plans/2026-09-14-internal-preproduction-remediation-plan.md` |
| Explicit exclusions | 不授權production/真資料；source或draftapproval不等於cloudexecution |
| Source / CI | 已合併；current tree以e387f252 CI為基線，runtime需獨立 |
| Runtime evidence | 未建立此PR專屬現場完成證據；由CP-00/08現行矩陣覆核 |
| Cloud evidence | currentC1snapshot另見主計畫；不把PR文件/source當apply/readback |
| Human evidence | 沒有本PR專屬humanacceptance證據；CI/HTTP200不替人證 |
| Superseding / current authority | #127～161、本計畫；SUPERSEDED |
| Remaining dependency / acceptance | CP-00/08現行證據及CP-01/02新字段相依回歸 |

### #126 — docs: draft WP-B1 C1 API authority packet (waiting)

| 審計欄位 | 判讀 |
| --- | --- |
| State / merge | MERGED；2a336e9feb7bc3c5e4defda719a562cd1b4482a3 |
| Purpose / actual scope | docs: draft WP-B1 C1 API authority packet (waiting)；變更 4 檔；實際入口：`docs/product/phase-1-decision-register.md`、`docs/reviews/2026-09-14-wp-b1-c1-api-authority-packet.md`、`docs/reviews/2026-09-14-wp-b1-through-b6-owner-review.md` |
| Explicit exclusions | 不授權production/真資料；source或draftapproval不等於cloudexecution |
| Source / CI | 已合併；current tree以e387f252 CI為基線，runtime需獨立 |
| Runtime evidence | 未建立此PR專屬現場完成證據；由CP-00/08現行矩陣覆核 |
| Cloud evidence | currentC1snapshot另見主計畫；不把PR文件/source當apply/readback |
| Human evidence | 沒有本PR專屬humanacceptance證據；CI/HTTP200不替人證 |
| Superseding / current authority | 後續 exact-SHA packets，不能沿用 waiting草稿；HISTORICAL ONLY |
| Remaining dependency / acceptance | CP-00/08現行證據及CP-01/02新字段相依回歸 |

### #127 — docs: Stage A+B signed WP-B1–B11 Canon and F-01–F-14 closure

| 審計欄位 | 判讀 |
| --- | --- |
| State / merge | MERGED；f5b9fe27b9e19db6c8e83e612832354ef14d2703 |
| Purpose / actual scope | docs: Stage A+B signed WP-B1–B11 Canon and F-01–F-14 closure；變更 13 檔；實際入口：`docs/INDEX.md`、`docs/phase-1-execution-plan.md`、`docs/plans/2026-09-14-internal-preproduction-remediation-plan.md`、`docs/product/current-execution-and-approval-plan.md` |
| Explicit exclusions | 不授權production/真資料；source或draftapproval不等於cloudexecution |
| Source / CI | 已合併；current tree以e387f252 CI為基線，runtime需獨立 |
| Runtime evidence | 未建立此PR專屬現場完成證據；由CP-00/08現行矩陣覆核 |
| Cloud evidence | currentC1snapshot另見主計畫；不把PR文件/source當apply/readback |
| Human evidence | WP-B1～11 signed dated2026-09-15有決策登錄；不是deploymentgrant |
| Superseding / current authority | 未識別單一替代PR；以currentmain+最新owner scope為準；CURRENT AUTHORITY |
| Remaining dependency / acceptance | CP-00/08現行證據及CP-01/02新字段相依回歸 |

### #128 — Stage C: routing, fail-closed gate, limiter, audit, and patient flow

| 審計欄位 | 判讀 |
| --- | --- |
| State / merge | MERGED；06ea0259fdabd91aa9b9e77bba9600e20b64393e |
| Purpose / actual scope | Stage C: routing, fail-closed gate, limiter, audit, and patient flow；變更 93 檔；實際入口：`apps/api/src/auth/calendar-pilot-session.ts`、`apps/api/src/firestore/denied-access-audit.repository.ts`、`apps/api/src/internal-test-booking/internal-test-booking.authenticator.ts`、`apps/api/src/internal-test-booking/internal-test-booking.module.ts` |
| Explicit exclusions | 不授權production/真資料；source或draftapproval不等於cloudexecution |
| Source / CI | 已合併；current tree以e387f252 CI為基線，runtime需獨立 |
| Runtime evidence | 未建立此PR專屬現場完成證據；由CP-00/08現行矩陣覆核 |
| Cloud evidence | currentC1snapshot另見主計畫；不把PR文件/source當apply/readback |
| Human evidence | 沒有本PR專屬humanacceptance證據；CI/HTTP200不替人證 |
| Superseding / current authority | 未識別單一替代PR；以currentmain+最新owner scope為準；CURRENT BUT INCOMPLETE |
| Remaining dependency / acceptance | CP-00/08現行證據及CP-01/02新字段相依回歸 |

### #129 — Stage D: Calendar sync, candidate review, and same-event projection

| 審計欄位 | 判讀 |
| --- | --- |
| State / merge | MERGED；8df6e265eb2edd325edb96bcb7260a0ffbcde25a |
| Purpose / actual scope | Stage D: Calendar sync, candidate review, and same-event projection；變更 35 檔；實際入口：`apps/worker/src/calendar-sync/firestore-calendar-sync.repository.ts`、`apps/worker/src/calendar-sync/sync-engine.ts`、`apps/worker/src/calendar-sync/watch-channel-lifecycle.ts`、`apps/worker/src/calendar-sync/watch-channel.ts` |
| Explicit exclusions | 不授權production/真資料；source或draftapproval不等於cloudexecution |
| Source / CI | 已合併；current tree以e387f252 CI為基線，runtime需獨立 |
| Runtime evidence | 未建立此PR專屬現場完成證據；由CP-00/08現行矩陣覆核 |
| Cloud evidence | currentC1snapshot另見主計畫；不把PR文件/source當apply/readback |
| Human evidence | 沒有本PR專屬humanacceptance證據；CI/HTTP200不替人證 |
| Superseding / current authority | 未識別單一替代PR；以currentmain+最新owner scope為準；CURRENT BUT INCOMPLETE |
| Remaining dependency / acceptance | CP-00/08現行證據及CP-01/02新字段相依回歸 |

### #130 — Stage E: monitoring, CSP, WP-B4 alerts, and operational readiness

| 審計欄位 | 判讀 |
| --- | --- |
| State / merge | MERGED；186f1f9ca7afe2fe03ca55dfaf1326149bfa9919 |
| Purpose / actual scope | Stage E: monitoring, CSP, WP-B4 alerts, and operational readiness；變更 72 檔；實際入口：`apps/worker/src/calendar-sync/calendar-pilot-main.ts`、`docs/architecture/stage-f-deployed-acceptance-matrix.md`、`docs/runbooks/calendar-sync-failure.md`、`infra/monitoring/wp-b4-alert-policies.json` |
| Explicit exclusions | 不授權production/真資料；source或draftapproval不等於cloudexecution |
| Source / CI | 已合併；current tree以e387f252 CI為基線，runtime需獨立 |
| Runtime evidence | 未建立此PR專屬現場完成證據；由CP-00/08現行矩陣覆核 |
| Cloud evidence | currentC1snapshot另見主計畫；不把PR文件/source當apply/readback |
| Human evidence | 沒有本PR專屬humanacceptance證據；CI/HTTP200不替人證 |
| Superseding / current authority | 未識別單一替代PR；以currentmain+最新owner scope為準；CURRENT BUT INCOMPLETE |
| Remaining dependency / acceptance | CP-00/08現行證據及CP-01/02新字段相依回歸 |

### #131 — Stage F0: exact-SHA cloud authority packet (unsigned)

| 審計欄位 | 判讀 |
| --- | --- |
| State / merge | CLOSED；NOT_MERGED |
| Purpose / actual scope | Stage F0: exact-SHA cloud authority packet (unsigned)；變更 4 檔；實際入口：`docs/architecture/stage-f-deployed-acceptance-matrix.md`、`docs/reviews/2026-09-15-stage-f0-exact-sha-authority-packet.md`、`docs/INDEX.md` |
| Explicit exclusions | 不授權production/真資料；source或draftapproval不等於cloudexecution |
| Source / CI | 未合併；無current-main source完成宣稱 |
| Runtime evidence | 未合併，不作部署依據 |
| Cloud evidence | currentC1snapshot另見主計畫；不把PR文件/source當apply/readback |
| Human evidence | 沒有本PR專屬humanacceptance證據；CI/HTTP200不替人證 |
| Superseding / current authority | 後續逐SHA核准，不視本closed草稿為authority；HISTORICAL ONLY |
| Remaining dependency / acceptance | 不用此未合併branch施工；核對superseding currentmain |

### #132 — Stage F: close E1–E7 source gaps (no cloud apply)

| 審計欄位 | 判讀 |
| --- | --- |
| State / merge | MERGED；7a37545070db166c0b76723db09cf32f7f68de71 |
| Purpose / actual scope | Stage F: close E1–E7 source gaps (no cloud apply)；變更 54 檔；實際入口：`apps/api/src/patients/patient-directory.ts`、`docs/architecture/stage-f-deployed-acceptance-matrix.md`、`docs/architecture/stage-f-source-readiness.md`、`docs/reviews/2026-09-15-stage-f-e1-e7-source-closeout.md` |
| Explicit exclusions | 不授權production/真資料；source或draftapproval不等於cloudexecution |
| Source / CI | 已合併；current tree以e387f252 CI為基線，runtime需獨立 |
| Runtime evidence | 未建立此PR專屬現場完成證據；由CP-00/08現行矩陣覆核 |
| Cloud evidence | currentC1snapshot另見主計畫；不把PR文件/source當apply/readback |
| Human evidence | 沒有本PR專屬humanacceptance證據；CI/HTTP200不替人證 |
| Superseding / current authority | 未識別單一替代PR；以currentmain+最新owner scope為準；CURRENT BUT INCOMPLETE |
| Remaining dependency / acceptance | CP-00/08現行證據及CP-01/02新字段相依回歸 |

### #133 — fix(infra): Cloud Run v2 PORT and WP-B4 outbox DISTRIBUTION metric

| 審計欄位 | 判讀 |
| --- | --- |
| State / merge | CLOSED；NOT_MERGED |
| Purpose / actual scope | fix(infra): Cloud Run v2 PORT and WP-B4 outbox DISTRIBUTION metric；變更 2 檔；實際入口：`infra/terraform/c1-internal-test-run/main.tf`、`infra/terraform/wp-b4-alerting/main.tf` |
| Explicit exclusions | 不授權production/真資料；source或draftapproval不等於cloudexecution |
| Source / CI | 未合併；無current-main source完成宣稱 |
| Runtime evidence | 未合併，不作部署依據 |
| Cloud evidence | currentC1snapshot另見主計畫；不把PR文件/source當apply/readback |
| Human evidence | 沒有本PR專屬humanacceptance證據；CI/HTTP200不替人證 |
| Superseding / current authority | #134 source收斂；本PR未合併；HISTORICAL ONLY |
| Remaining dependency / acceptance | 不用此未合併branch施工；核對superseding currentmain |

### #134 — Stage F source remediation: Cloud ADC, accountless booking, inspect-only schedule

| 審計欄位 | 判讀 |
| --- | --- |
| State / merge | MERGED；950d346d00c4d5dcaac985b1df4e931cd6eb3cd6 |
| Purpose / actual scope | Stage F source remediation: Cloud ADC, accountless booking, inspect-only schedule；變更 40 檔；實際入口：`apps/web/public/modules/internal-test-booking-transport.js`、`docs/architecture/stage-f-source-readiness.md`、`docs/reviews/2026-09-15-stage-f-source-remediation.md`、`infra/terraform/c1-internal-test-run/README.md` |
| Explicit exclusions | 不授權production/真資料；source或draftapproval不等於cloudexecution |
| Source / CI | 已合併；current tree以e387f252 CI為基線，runtime需獨立 |
| Runtime evidence | 未建立此PR專屬現場完成證據；由CP-00/08現行矩陣覆核 |
| Cloud evidence | currentC1snapshot另見主計畫；不把PR文件/source當apply/readback |
| Human evidence | 沒有本PR專屬humanacceptance證據；CI/HTTP200不替人證 |
| Superseding / current authority | #135等auth corrections；原安全邊界保留；CURRENT BUT INCOMPLETE |
| Remaining dependency / acceptance | CP-00/08現行證據及CP-01/02新字段相依回歸 |

### #135 — fix(c1): parameterize Firebase authDomain for isolated preview

| 審計欄位 | 判讀 |
| --- | --- |
| State / merge | MERGED；5ea2fa2c6b81164fc75b46adf7b35398b7f5f95d |
| Purpose / actual scope | fix(c1): parameterize Firebase authDomain for isolated preview；變更 27 檔；實際入口：`apps/api/src/auth/calendar-pilot-session.controller.ts`、`docs/architecture/stage-f-source-readiness.md`、`infra/terraform/c1-internal-test-run/README.md`、`infra/terraform/c1-internal-test-run/main.tf` |
| Explicit exclusions | 不授權production/真資料；source或draftapproval不等於cloudexecution |
| Source / CI | 已合併；current tree以e387f252 CI為基線，runtime需獨立 |
| Runtime evidence | 未建立此PR專屬現場完成證據；由CP-00/08現行矩陣覆核 |
| Cloud evidence | currentC1snapshot另見主計畫；不把PR文件/source當apply/readback |
| Human evidence | 沒有本PR專屬humanacceptance證據；CI/HTTP200不替人證 |
| Superseding / current authority | 尚無替代；後續部署須freshread；CURRENT BUT INCOMPLETE |
| Remaining dependency / acceptance | CP-00/08現行證據及CP-01/02新字段相依回歸 |

### #136 — fix(auth): require fresh TOTP sign-in after enrollment

| 審計欄位 | 判讀 |
| --- | --- |
| State / merge | MERGED；6b899460decb6e9e89cf7cc54834a378c78618e8 |
| Purpose / actual scope | fix(auth): require fresh TOTP sign-in after enrollment；變更 9 檔；實際入口：`docs/architecture/stage-f-source-readiness.md`、`apps/web/src/calendar-pilot-google-totp-session.test.ts`、`apps/web/src/staff-booking-surfaces.test.ts`、`docs/INDEX.md` |
| Explicit exclusions | 不授權production/真資料；source或draftapproval不等於cloudexecution |
| Source / CI | 已合併；current tree以e387f252 CI為基線，runtime需獨立 |
| Runtime evidence | 未建立此PR專屬現場完成證據；由CP-00/08現行矩陣覆核 |
| Cloud evidence | currentC1snapshot另見主計畫；不把PR文件/source當apply/readback |
| Human evidence | 沒有本PR專屬humanacceptance證據；CI/HTTP200不替人證 |
| Superseding / current authority | #155登入恢復收斂；CURRENT BUT INCOMPLETE |
| Remaining dependency / acceptance | CP-00/08現行證據及CP-01/02新字段相依回歸 |

### #137 — chore(auth): add PII-safe calendar session gate telemetry

| 審計欄位 | 判讀 |
| --- | --- |
| State / merge | MERGED；a4ebf64d33fb24b825dd652e6ec2b2dff92896f9 |
| Purpose / actual scope | chore(auth): add PII-safe calendar session gate telemetry；變更 5 檔；實際入口：`apps/api/src/auth/calendar-pilot-session-gate-telemetry.ts`、`apps/api/src/auth/calendar-pilot-session.ts`、`apps/api/src/auth/calendar-pilot-session-gate-telemetry.test.ts`、`apps/api/src/auth/calendar-pilot-session.test.ts` |
| Explicit exclusions | 不授權production/真資料；source或draftapproval不等於cloudexecution |
| Source / CI | 已合併；current tree以e387f252 CI為基線，runtime需獨立 |
| Runtime evidence | 未建立此PR專屬現場完成證據；由CP-00/08現行矩陣覆核 |
| Cloud evidence | currentC1snapshot另見主計畫；不把PR文件/source當apply/readback |
| Human evidence | 沒有本PR專屬humanacceptance證據；CI/HTTP200不替人證 |
| Superseding / current authority | #138/#139增加分類；#148追加revoke；CURRENT BUT INCOMPLETE |
| Remaining dependency / acceptance | CP-00/08現行證據及CP-01/02新字段相依回歸 |

### #138 — chore(auth): classify Firebase ID token verification failures

| 審計欄位 | 判讀 |
| --- | --- |
| State / merge | MERGED；7dbe50a575b5d8e101da2e76b797eebf7a443cc6 |
| Purpose / actual scope | chore(auth): classify Firebase ID token verification failures；變更 3 檔；實際入口：`apps/api/src/auth/calendar-pilot-session-gate-telemetry.ts`、`apps/api/src/auth/calendar-pilot-session.ts`、`apps/api/src/auth/calendar-pilot-session-gate-telemetry.test.ts` |
| Explicit exclusions | 不授權production/真資料；source或draftapproval不等於cloudexecution |
| Source / CI | 已合併；current tree以e387f252 CI為基線，runtime需獨立 |
| Runtime evidence | 未建立此PR專屬現場完成證據；由CP-00/08現行矩陣覆核 |
| Cloud evidence | currentC1snapshot另見主計畫；不把PR文件/source當apply/readback |
| Human evidence | 沒有本PR專屬humanacceptance證據；CI/HTTP200不替人證 |
| Superseding / current authority | #139unknown分類收斂；CURRENT BUT INCOMPLETE |
| Remaining dependency / acceptance | CP-00/08現行證據及CP-01/02新字段相依回歸 |

### #139 — chore(auth): converge unknown Firebase verify-token failures

| 審計欄位 | 判讀 |
| --- | --- |
| State / merge | MERGED；24f43542ef7f4271f6d67ba8686838410d8eae51 |
| Purpose / actual scope | chore(auth): converge unknown Firebase verify-token failures；變更 2 檔；實際入口：`apps/api/src/auth/calendar-pilot-session-gate-telemetry.ts`、`apps/api/src/auth/calendar-pilot-session-gate-telemetry.test.ts` |
| Explicit exclusions | 不授權production/真資料；source或draftapproval不等於cloudexecution |
| Source / CI | 已合併；current tree以e387f252 CI為基線，runtime需獨立 |
| Runtime evidence | 未建立此PR專屬現場完成證據；由CP-00/08現行矩陣覆核 |
| Cloud evidence | currentC1snapshot另見主計畫；不把PR文件/source當apply/readback |
| Human evidence | 沒有本PR專屬humanacceptance證據；CI/HTTP200不替人證 |
| Superseding / current authority | 現行分類保留；#148追加revoke操作；CURRENT BUT INCOMPLETE |
| Remaining dependency / acceptance | CP-00/08現行證據及CP-01/02新字段相依回歸 |

### #140 — fix(iam): allow C1 API to read Firebase Auth users

| 審計欄位 | 判讀 |
| --- | --- |
| State / merge | MERGED；e71775e4bf686d9db061c5e21eaf85c0da535aaf |
| Purpose / actual scope | fix(iam): allow C1 API to read Firebase Auth users；變更 3 檔；實際入口：`infra/terraform/c1-internal-test-run/main.tf`、`infra/terraform/c1-internal-test-run/noop.tftest.hcl`、`scripts/c1-internal-test-run.test.mjs` |
| Explicit exclusions | 不授權production/真資料；source或draftapproval不等於cloudexecution |
| Source / CI | 已合併；current tree以e387f252 CI為基線，runtime需獨立 |
| Runtime evidence | 未建立此PR專屬現場完成證據；由CP-00/08現行矩陣覆核 |
| Cloud evidence | currentC1snapshot另見主計畫；不把PR文件/source當apply/readback |
| Human evidence | 沒有本PR專屬humanacceptance證據；CI/HTTP200不替人證 |
| Superseding / current authority | #141/#148擴成三項最小集合；CURRENT BUT INCOMPLETE |
| Remaining dependency / acceptance | CP-00/08現行證據及CP-01/02新字段相依回歸 |

### #141 — fix(iam): allow C1 API to create Firebase Auth sessions

| 審計欄位 | 判讀 |
| --- | --- |
| State / merge | MERGED；ca2c35e8e01dd382247ef3891286225df575e14e |
| Purpose / actual scope | fix(iam): allow C1 API to create Firebase Auth sessions；變更 3 檔；實際入口：`infra/terraform/c1-internal-test-run/main.tf`、`infra/terraform/c1-internal-test-run/noop.tftest.hcl`、`scripts/c1-internal-test-run.test.mjs` |
| Explicit exclusions | 不授權production/真資料；source或draftapproval不等於cloudexecution |
| Source / CI | 已合併；current tree以e387f252 CI為基線，runtime需獨立 |
| Runtime evidence | 未建立此PR專屬現場完成證據；由CP-00/08現行矩陣覆核 |
| Cloud evidence | currentC1snapshot另見主計畫；不把PR文件/source當apply/readback |
| Human evidence | 沒有本PR專屬humanacceptance證據；CI/HTTP200不替人證 |
| Superseding / current authority | #148補update；CURRENT BUT INCOMPLETE |
| Remaining dependency / acceptance | CP-00/08現行證據及CP-01/02新字段相依回歸 |

### #142 — docs: hand off Stage F CAL-PILOT state

| 審計欄位 | 判讀 |
| --- | --- |
| State / merge | MERGED；66e4c4e44f1aa60e6eb9df8b47b5f1df2aa84d50 |
| Purpose / actual scope | docs: hand off Stage F CAL-PILOT state；變更 2 檔；實際入口：`docs/reviews/2026-09-17-stage-f-cal-pilot-handoff.md` |
| Explicit exclusions | 不授權production/真資料；source或draftapproval不等於cloudexecution |
| Source / CI | 已合併；current tree以e387f252 CI為基線，runtime需獨立 |
| Runtime evidence | 未建立此PR專屬現場完成證據；由CP-00/08現行矩陣覆核 |
| Cloud evidence | currentC1snapshot另見主計畫；不把PR文件/source當apply/readback |
| Human evidence | 沒有本PR專屬humanacceptance證據；CI/HTTP200不替人證 |
| Superseding / current authority | #143及後續P1-05R/06/07/08 runtime、本計畫；HISTORICAL ONLY |
| Remaining dependency / acceptance | CP-00/08現行證據及CP-01/02新字段相依回歸 |

### #143 — docs: plan Phase 1 completion with executable Luna packets

| 審計欄位 | 判讀 |
| --- | --- |
| State / merge | MERGED；54ff5fb2d6e0f4b027ecc9d29e15c565101f7b1f |
| Purpose / actual scope | docs: plan Phase 1 completion with executable Luna packets；變更 2 檔；實際入口：`docs/plans/2026-09-17-phase1-completion-packets.md` |
| Explicit exclusions | 不授權production/真資料；source或draftapproval不等於cloudexecution |
| Source / CI | 已合併；current tree以e387f252 CI為基線，runtime需獨立 |
| Runtime evidence | 未建立此PR專屬現場完成證據；由CP-00/08現行矩陣覆核 |
| Cloud evidence | currentC1snapshot另見主計畫；不把PR文件/source當apply/readback |
| Human evidence | 沒有本PR專屬humanacceptance證據；CI/HTTP200不替人證 |
| Superseding / current authority | 本計畫補currentproject高層；原P1ID不改；CURRENT BUT INCOMPLETE |
| Remaining dependency / acceptance | CP-00/08現行證據及CP-01/02新字段相依回歸 |

### #144 — fix(web): two-layer Workbench logout teardown (P1-01)

| 審計欄位 | 判讀 |
| --- | --- |
| State / merge | MERGED；6a2b7c7ce49ecd611dfc321de0e2a38c62dddf75 |
| Purpose / actual scope | fix(web): two-layer Workbench logout teardown (P1-01)；變更 5 檔；實際入口：`apps/web/src/calendar-pilot-google-totp-session.test.ts`、`apps/web/src/staff-booking-surfaces.test.ts` |
| Explicit exclusions | 不授權production/真資料；source或draftapproval不等於cloudexecution |
| Source / CI | 已合併；current tree以e387f252 CI為基線，runtime需獨立 |
| Runtime evidence | 可連結4f31b00的datedP1-05R/06/07/08包；本PR不是獨立新runtime驗收 |
| Cloud evidence | currentC1snapshot另見主計畫；不把PR文件/source當apply/readback |
| Human evidence | 沒有本PR專屬humanacceptance證據；CI/HTTP200不替人證 |
| Superseding / current authority | #148serverrevoke；不取代clientteardown；CURRENT BUT INCOMPLETE |
| Remaining dependency / acceptance | CP-00/08現行證據及CP-01/02新字段相依回歸 |

### #145 — fix(infra): split C1 secret version pins per service (P1-03)

| 審計欄位 | 判讀 |
| --- | --- |
| State / merge | MERGED；904dc96adeaf573c3a1491630deaf31011c0ea82 |
| Purpose / actual scope | fix(infra): split C1 secret version pins per service (P1-03)；變更 6 檔；實際入口：`infra/terraform/c1-internal-test-run/README.md`、`infra/terraform/c1-internal-test-run/main.tf`、`infra/terraform/c1-internal-test-run/noop.tftest.hcl`、`infra/terraform/c1-internal-test-run/terraform.tfvars.example` |
| Explicit exclusions | 不授權production/真資料；source或draftapproval不等於cloudexecution |
| Source / CI | 已合併；current tree以e387f252 CI為基線，runtime需獨立 |
| Runtime evidence | 未建立此PR專屬現場完成證據；由CP-00/08現行矩陣覆核 |
| Cloud evidence | currentC1snapshot另見主計畫；不把PR文件/source當apply/readback |
| Human evidence | 沒有本PR專屬humanacceptance證據；CI/HTTP200不替人證 |
| Superseding / current authority | 後续#160/#161syncsecret單獨pin；CURRENT BUT INCOMPLETE |
| Remaining dependency / acceptance | CP-00/08現行證據及CP-01/02新字段相依回歸 |

### #146 — fix(api): await durable denied-authorization audit lifecycle (P1-02)

| 審計欄位 | 判讀 |
| --- | --- |
| State / merge | MERGED；8b8ca86a101333cabe20c5b4155b4ff67994f3a7 |
| Purpose / actual scope | fix(api): await durable denied-authorization audit lifecycle (P1-02)；變更 11 檔；實際入口：`apps/api/src/firestore/denied-access-audit.repository.ts`、`apps/api/src/platform/authorization/denied-access-audit.port.ts`、`apps/api/src/appointments/appointment.rate-limit-and-denial.test.ts`、`apps/api/src/auth/calendar-pilot-session-gate-telemetry.test.ts` |
| Explicit exclusions | 不授權production/真資料；source或draftapproval不等於cloudexecution |
| Source / CI | 已合併；current tree以e387f252 CI為基線，runtime需獨立 |
| Runtime evidence | 未建立此PR專屬現場完成證據；由CP-00/08現行矩陣覆核 |
| Cloud evidence | currentC1snapshot另見主計畫；不把PR文件/source當apply/readback |
| Human evidence | 沒有本PR專屬humanacceptance證據；CI/HTTP200不替人證 |
| Superseding / current authority | #156deniedemulator/M11接線；CURRENT BUT INCOMPLETE |
| Remaining dependency / acceptance | CP-00/08現行證據及CP-01/02新字段相依回歸 |

### #147 — docs: 補齊正式交付與商務需求的後續程式規劃

| 審計欄位 | 判讀 |
| --- | --- |
| State / merge | MERGED；6a582529869f08aa3562236fc1227d1513366b13 |
| Purpose / actual scope | docs: 補齊正式交付與商務需求的後續程式規劃；變更 2 檔；實際入口：`docs/plans/2026-09-18-business-delivery-follow-up.md` |
| Explicit exclusions | 原始DOCX不入庫；不能拿舊副本金額或AWS排序當currentauthority |
| Source / CI | 已合併；current tree以e387f252 CI為基線，runtime需獨立 |
| Runtime evidence | 未建立此PR專屬現場完成證據；由CP-00/08現行矩陣覆核 |
| Cloud evidence | currentC1snapshot另見主計畫；不把PR文件/source當apply/readback |
| Human evidence | 文件需求被索引≠具名政策/合約驗收；遠端Drive最新為準 |
| Superseding / current authority | 本計畫Driveauthority/金額/排序；#149～154已有契約；CURRENT BUT INCOMPLETE |
| Remaining dependency / acceptance | CP-POLICY/03～10 currentproject收尾 |

### #148 — fix(auth): repair C1 session revoke path

| 審計欄位 | 判讀 |
| --- | --- |
| State / merge | MERGED；c58ac7299c7456a5aba25458f7796459c5722aab |
| Purpose / actual scope | fix(auth): repair C1 session revoke path；變更 6 檔；實際入口：`apps/api/src/auth/calendar-pilot-session-gate-telemetry.ts`、`apps/api/src/auth/calendar-pilot-session.ts`、`infra/terraform/c1-internal-test-run/main.tf`、`infra/terraform/c1-internal-test-run/noop.tftest.hcl` |
| Explicit exclusions | 不授權production/真資料；source或draftapproval不等於cloudexecution |
| Source / CI | 已合併；current tree以e387f252 CI為基線，runtime需獨立 |
| Runtime evidence | 可連結4f31b00的datedP1-05R/06/07/08包；本PR不是獨立新runtime驗收 |
| Cloud evidence | currentC1snapshot另見主計畫；不把PR文件/source當apply/readback |
| Human evidence | 沒有本PR專屬humanacceptance證據；CI/HTTP200不替人證 |
| Superseding / current authority | 現行；歷史500仍推論；CURRENT BUT INCOMPLETE |
| Remaining dependency / acceptance | CP-00/08現行證據及CP-01/02新字段相依回歸 |

### #149 — feat(domain): add business delivery milestone contract

| 審計欄位 | 判讀 |
| --- | --- |
| State / merge | MERGED；ab1f15a626377e154fe2290738676ebfdd4a5104 |
| Purpose / actual scope | feat(domain): add business delivery milestone contract；變更 3 檔；實際入口：`packages/domain/src/business-delivery.ts`、`packages/domain/src/business-delivery.test.ts`、`packages/domain/src/index.ts` |
| Explicit exclusions | 不含API/UI/policy注入/cloud/實際商務操作 |
| Source / CI | 已合併；current tree以e387f252 CI為基線，runtime需獨立 |
| Runtime evidence | 無BD runtime接線；只有domaincontract |
| Cloud evidence | NONE：此PR純domaincontract，不是cloudresource或restore |
| Human evidence | 沒有本PR專屬humanacceptance證據；CI/HTTP200不替人證 |
| Superseding / current authority | CP-03runtime接線待做；CONTRACT ONLY |
| Remaining dependency / acceptance | CP-03 milestone接線 |

### #150 — feat(domain): add safe business export contract

| 審計欄位 | 判讀 |
| --- | --- |
| State / merge | MERGED；512af6aa163f1b120067181f542375c4e06131e8 |
| Purpose / actual scope | feat(domain): add safe business export contract；變更 3 檔；實際入口：`packages/domain/src/business-delivery-export.ts`、`packages/domain/src/business-delivery-export.test.ts`、`packages/domain/src/index.ts` |
| Explicit exclusions | 不含API/UI/policy注入/cloud/實際商務操作 |
| Source / CI | 已合併；current tree以e387f252 CI為基線，runtime需獨立 |
| Runtime evidence | 無BD runtime接線；只有domaincontract |
| Cloud evidence | NONE：此PR純domaincontract，不是cloudresource或restore |
| Human evidence | 沒有本PR專屬humanacceptance證據；CI/HTTP200不替人證 |
| Superseding / current authority | CP-04runtime接線待做；CONTRACT ONLY |
| Remaining dependency / acceptance | CP-04 export |

### #151 — feat(domain): add retention lifecycle contract

| 審計欄位 | 判讀 |
| --- | --- |
| State / merge | MERGED；34b799546f0f79692fd4cd69200008a9e932d231 |
| Purpose / actual scope | feat(domain): add retention lifecycle contract；變更 3 檔；實際入口：`packages/domain/src/business-delivery-retention.ts`、`packages/domain/src/business-delivery-retention.test.ts`、`packages/domain/src/index.ts` |
| Explicit exclusions | 不含API/UI/policy注入/cloud/實際商務操作 |
| Source / CI | 已合併；current tree以e387f252 CI為基線，runtime需獨立 |
| Runtime evidence | 無BD runtime接線；只有domaincontract |
| Cloud evidence | NONE：此PR純domaincontract，不是cloudresource或restore |
| Human evidence | 沒有本PR專屬humanacceptance證據；CI/HTTP200不替人證 |
| Superseding / current authority | CP-05runtime接線待做；CONTRACT ONLY |
| Remaining dependency / acceptance | CP-05 retention |

### #152 — feat(domain): add monthly business usage report contract

| 審計欄位 | 判讀 |
| --- | --- |
| State / merge | MERGED；4a8fca7836a2da776035e96b264270a6d8075076 |
| Purpose / actual scope | feat(domain): add monthly business usage report contract；變更 3 檔；實際入口：`packages/domain/src/business-delivery-reporting.ts`、`packages/domain/src/business-delivery-reporting.test.ts`、`packages/domain/src/index.ts` |
| Explicit exclusions | 不含API/UI/policy注入/cloud/實際商務操作 |
| Source / CI | 已合併；current tree以e387f252 CI為基線，runtime需獨立 |
| Runtime evidence | 無BD runtime接線；只有domaincontract |
| Cloud evidence | NONE：此PR純domaincontract，不是cloudresource或restore |
| Human evidence | 沒有本PR專屬humanacceptance證據；CI/HTTP200不替人證 |
| Superseding / current authority | CP-03runtime接線待做；CONTRACT ONLY |
| Remaining dependency / acceptance | CP-03 reporting |

### #153 — feat(domain): add termination return checklist contract

| 審計欄位 | 判讀 |
| --- | --- |
| State / merge | MERGED；ae9a7ba2b9ad32f258bbfc811dd67238296e7c8c |
| Purpose / actual scope | feat(domain): add termination return checklist contract；變更 3 檔；實際入口：`packages/domain/src/business-delivery-termination.ts`、`packages/domain/src/business-delivery-termination.test.ts`、`packages/domain/src/index.ts` |
| Explicit exclusions | 不含API/UI/policy注入/cloud/實際商務操作 |
| Source / CI | 已合併；current tree以e387f252 CI為基線，runtime需獨立 |
| Runtime evidence | 無BD runtime接線；只有domaincontract |
| Cloud evidence | NONE：此PR純domaincontract，不是cloudresource或restore |
| Human evidence | 沒有本PR專屬humanacceptance證據；CI/HTTP200不替人證 |
| Superseding / current authority | CP-07runtime接線待做；CONTRACT ONLY |
| Remaining dependency / acceptance | CP-07 termination |

### #154 — feat(domain): add backup evidence assessment contract

| 審計欄位 | 判讀 |
| --- | --- |
| State / merge | MERGED；ce90e9117353993e6eb366e735566ce2d33bc34e |
| Purpose / actual scope | feat(domain): add backup evidence assessment contract；變更 3 檔；實際入口：`packages/domain/src/business-delivery-backup.ts`、`packages/domain/src/business-delivery-backup.test.ts`、`packages/domain/src/index.ts` |
| Explicit exclusions | 不含API/UI/policy注入/cloud/實際商務操作 |
| Source / CI | 已合併；current tree以e387f252 CI為基線，runtime需獨立 |
| Runtime evidence | 無BD runtime接線；只有domaincontract |
| Cloud evidence | NONE：此PR純domaincontract，不是cloudresource或restore |
| Human evidence | 沒有本PR專屬humanacceptance證據；CI/HTTP200不替人證 |
| Superseding / current authority | CP-06Google-onlyprofile/restore待做；CONTRACT ONLY |
| Remaining dependency / acceptance | CP-06 Google restore |

### #155 — fix(web): restore MFA gate and local draft identity handoff

| 審計欄位 | 判讀 |
| --- | --- |
| State / merge | MERGED；bc8b767aeb3a0a2f84a91111f5387803d1955c2a |
| Purpose / actual scope | fix(web): restore MFA gate and local draft identity handoff；變更 4 檔；實際入口：`apps/web/src/pilot-handoff-regression.test.ts` |
| Explicit exclusions | 不授權production/真資料；source或draftapproval不等於cloudexecution |
| Source / CI | 已合併；current tree以e387f252 CI為基線，runtime需獨立 |
| Runtime evidence | 可連結4f31b00的datedP1-05R/06/07/08包；本PR不是獨立新runtime驗收 |
| Cloud evidence | currentC1snapshot另見主計畫；不把PR文件/source當apply/readback |
| Human evidence | 沒有本PR專屬humanacceptance證據；CI/HTTP200不替人證 |
| Superseding / current authority | 現行；新booking需回歸draft；CURRENT BUT INCOMPLETE |
| Remaining dependency / acceptance | CP-00/08現行證據及CP-01/02新字段相依回歸 |

### #156 — test(phase1): close denial audit and M11 operator gaps

| 審計欄位 | 判讀 |
| --- | --- |
| State / merge | MERGED；85b346b50533e5deafa6a98f264bbe67ffe32928 |
| Purpose / actual scope | test(phase1): close denial audit and M11 operator gaps；變更 4 檔；實際入口：`apps/web/public/modules/internal-test-booking-transport.js`、`apps/api/src/firestore/denied-access-audit.repository.emulator.test.ts`、`apps/web/src/internal-test-booking-transport.test.ts`、`scripts/stage-f-source-remediation.test.mjs` |
| Explicit exclusions | 不授權production/真資料；source或draftapproval不等於cloudexecution |
| Source / CI | 已合併；current tree以e387f252 CI為基線，runtime需獨立 |
| Runtime evidence | 未建立此PR專屬現場完成證據；由CP-00/08現行矩陣覆核 |
| Cloud evidence | currentC1snapshot另見主計畫；不把PR文件/source當apply/readback |
| Human evidence | 沒有本PR專屬humanacceptance證據；CI/HTTP200不替人證 |
| Superseding / current authority | 現行；CP-00/08人證/deniedreadback；CURRENT BUT INCOMPLETE |
| Remaining dependency / acceptance | CP-00/08現行證據及CP-01/02新字段相依回歸 |

### #157 — fix(phase1): verify deployed API and return booking flow

| 審計欄位 | 判讀 |
| --- | --- |
| State / merge | MERGED；974c75da75e2de93f27d0f435a60f57c8db8a407 |
| Purpose / actual scope | fix(phase1): verify deployed API and return booking flow；變更 4 檔；實際入口：`scripts/internal-test-booking-smoke.mjs`、`scripts/internal-test-booking-smoke.test.mjs`、`tests/e2e/internal-test-booking.spec.ts` |
| Explicit exclusions | 不授權production/真資料；source或draftapproval不等於cloudexecution |
| Source / CI | 已合併；current tree以e387f252 CI為基線，runtime需獨立 |
| Runtime evidence | 可連結4f31b00的datedP1-05R/06/07/08包；本PR不是獨立新runtime驗收 |
| Cloud evidence | currentC1snapshot另見主計畫；不把PR文件/source當apply/readback |
| Human evidence | 沒有本PR專屬humanacceptance證據；CI/HTTP200不替人證 |
| Superseding / current authority | CP-01/02將改月日lookup；當前fullDOB限定；CURRENT BUT INCOMPLETE |
| Remaining dependency / acceptance | CP-00/08現行證據及CP-01/02新字段相依回歸 |

### #158 — fix: close recovered WP-B4 incidents

| 審計欄位 | 判讀 |
| --- | --- |
| State / merge | MERGED；4f31b00f378c96b213c64f33100b5e0d35583d3e |
| Purpose / actual scope | fix: close recovered WP-B4 incidents；變更 8 檔；實際入口：`infra/monitoring/wp-b4-alert-policies.json`、`infra/terraform/wp-b4-alerting/.terraform.lock.hcl`、`infra/terraform/wp-b4-alerting/README.md`、`infra/terraform/wp-b4-alerting/main.tf` |
| Explicit exclusions | 不授權production/真資料；source或draftapproval不等於cloudexecution |
| Source / CI | 已合併；current tree以e387f252 CI為基線，runtime需獨立 |
| Runtime evidence | 可連結4f31b00的datedP1-05R/06/07/08包；本PR不是獨立新runtime驗收 |
| Cloud evidence | currentC1snapshot另見主計畫；不把PR文件/source當apply/readback |
| Human evidence | incidentrecovery有datedrecord；『已收到』仍需綁incident |
| Superseding / current authority | 現行；CP-00補incident→收件對應；CURRENT BUT INCOMPLETE |
| Remaining dependency / acceptance | CP-00/08現行證據及CP-01/02新字段相依回歸 |

### #159 — fix: stabilize C1 rate-limit client identity

| 審計欄位 | 判讀 |
| --- | --- |
| State / merge | MERGED；d59008b320aa043e25773454d785c5a70f13340b |
| Purpose / actual scope | fix: stabilize C1 rate-limit client identity；變更 4 檔；實際入口：`infra/terraform/c1-internal-test-run/README.md`、`infra/terraform/c1-internal-test-run/main.tf`、`apps/api/src/platform/runtime/client-ip.test.ts`、`scripts/c1-internal-test-run.test.mjs` |
| Explicit exclusions | 不授權production/真資料；source或draftapproval不等於cloudexecution |
| Source / CI | 已合併；current tree以e387f252 CI為基線，runtime需獨立 |
| Runtime evidence | 目前API/worker source仍4f31b00；本PR尚未部署 |
| Cloud evidence | #159需要API proxy2；#160/#161需要syncprereq/runtime/secret/ACL；目前未完成 |
| Human evidence | 沒有本PR專屬humanacceptance證據；CI/HTTP200不替人證 |
| Superseding / current authority | 現行待部署；SOURCE COMPLETE / RUNTIME MISSING |
| Remaining dependency / acceptance | CP-00 newauthority、完整兩階plan/runtime/evidence |

### #160 — feat: prepare isolated C1 calendar candidate verification

| 審計欄位 | 判讀 |
| --- | --- |
| State / merge | MERGED；da8883c40453449b33f4b687d6616a62fcbef90b |
| Purpose / actual scope | feat: prepare isolated C1 calendar candidate verification；變更 14 檔；實際入口：`apps/worker/src/calendar-sync/calendar-pilot-runtime.ts`、`infra/terraform/c1-internal-test-run/README.md`、`infra/terraform/c1-internal-test-run/main.tf`、`infra/terraform/c1-internal-test-run/noop.tftest.hcl` |
| Explicit exclusions | 不授權production/真資料；source或draftapproval不等於cloudexecution |
| Source / CI | 已合併；current tree以e387f252 CI為基線，runtime需獨立 |
| Runtime evidence | 目前API/worker source仍4f31b00；本PR尚未部署 |
| Cloud evidence | #159需要API proxy2；#160/#161需要syncprereq/runtime/secret/ACL；目前未完成 |
| Human evidence | 沒有本PR專屬humanacceptance證據；CI/HTTP200不替人證 |
| Superseding / current authority | #161先prereq後activation；SOURCE COMPLETE / RUNTIME MISSING |
| Remaining dependency / acceptance | CP-00 newauthority、完整兩階plan/runtime/evidence |

### #161 — fix: stage C1 calendar sync prerequisites before runtime

| 審計欄位 | 判讀 |
| --- | --- |
| State / merge | MERGED；e387f2522ea010848f41a4f34778ffc50d83fef3 |
| Purpose / actual scope | fix: stage C1 calendar sync prerequisites before runtime；變更 5 檔；實際入口：`infra/terraform/c1-internal-test-run/README.md`、`infra/terraform/c1-internal-test-run/main.tf`、`infra/terraform/c1-internal-test-run/noop.tftest.hcl`、`infra/terraform/c1-internal-test-run/variables.tf` |
| Explicit exclusions | 不授權production/真資料；source或draftapproval不等於cloudexecution |
| Source / CI | 已合併；current tree以e387f252 CI為基線，runtime需獨立 |
| Runtime evidence | 目前API/worker source仍4f31b00；本PR尚未部署 |
| Cloud evidence | #159需要API proxy2；#160/#161需要syncprereq/runtime/secret/ACL；目前未完成 |
| Human evidence | 沒有本PR專屬humanacceptance證據；CI/HTTP200不替人證 |
| Superseding / current authority | 當前main最後merge，待CP-00部署；SOURCE COMPLETE / RUNTIME MISSING |
| Remaining dependency / acceptance | CP-00 newauthority、完整兩階plan/runtime/evidence |

## 最後判斷

不是「只剩P1-09」。P1-09未閉合；新booking欄位與hash安全相容未實作；
BD-01～06契約可重用但runtime/UI/policy/真restore未齊；完整回歸、Drive同步、正式驗收仍在後面。
先currentproject接受，再AWS，再官網；舊PR的independentcopy要求不覆蓋owner最新排序。
回[主計畫](2026-09-22-current-project-acceptance-master-plan.md)依工作包執行，不從過期PR直接apply。
