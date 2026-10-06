# 2026-10-06 SOL-00 安全 manifest／執行圖 follow-up 計畫

**2026-10-07 狀態：BLOCKED / PARTIAL — 原 planning DoD 未完成。** 本輪只分析、規劃與更新 #241 planning branch；不修 production、不施工、不合併 PR 到 main、不部署。

**Current source baseline：** `01d36c96ae6be6cea91c891c494a6601b2abd4a3`，即重新 fetch 的 `origin/main` 與 #242 merge commit。歷史 source baseline 為 `f7ace1a8ac8626783af342b89b0ad14b1ae400de`（#240）；#239／#238 ancestry 與原成果保留。依使用者明確選擇，只將 main merge 進 #241 branch，保留歷史；不 rebase、不 force-push、不碰 main。branch integration commit 為 `c647315facb57a52f26c2e5feb0d478fc1a1b86a`。本文件不引用包含此次文件更新的 commit；請用 `git log -- docs/plans/2026-10-06-sol00-safe-manifest-closeout-plan.md` 查交付版本。

**原分冊 custody 已確認：** 業主目前可取得的檔案沒有保存 partB、partE 與 E1～E4 原分冊；整併報告只留下當時工作區位置。下列 31 IDs 全部維持 `METADATA_BLOCKED`，不把相似程式碼或後來整併摘要冒充原 claim/source 定位。可繼續 current-main 候選比對與施工規劃；原 claim 驗收和最終全部 dedupe 仍 BLOCKED。E4-11 僅記 custody gap，不提供、讀取或補造 Calendar payload／PII／secret／原始 log metadata。

**Baseline impact：** main 相對歷史 baseline 只增加 #242 的三項 dev-tool patch、回歸與交接；537 舊 source bindings 中只 B-19 的 `pnpm-workspace.yaml` blob 改變。已重讀無上界 `uuid` override，原 source-text assessment 未被這三個 same-major pins 修正。其他 frozen source blobs 保持一致；不重跑或覆寫 40 筆原 Sol 研究。

**引用：** [244-ID 原計畫](2026-10-05-audit-followup-luna-plan.md)、[#240 補充計畫](2026-10-05-audit-gap-sol-luna-execution-plan.md)、[逐 ID 人類索引](2026-10-06-sol00-finding-manifest.md)、[完整 machine manifest](2026-10-06-sol00-safe-manifest.json)、[本輪 handoff](../reviews/2026-10-06-sol00-planning-handoff.md)。

## 1. 權威、範圍與發布邊界

最小 Canon 為 [AGENTS](../../AGENTS.md)、[GOVERNANCE](../../GOVERNANCE.md)、[INDEX](../INDEX.md)、[Decision Register](../product/phase-1-decision-register.md) 與該列 owning source／ADR。Runtime 與 prose 不一致時記差異；舊報告、PASS、綠 CI 不產生核准。

原 private report／分冊／runtime 原始資料只在受控本機分析；不複製到 repository。使用者提供的本機材料是歷史工作區、報告與 runtime receipts 的混合，目前未建立所有原分冊對照；不以「有資料夾」推成「claim 已定位」。不讀真實 Calendar payload／事件／PII，不碰 credentials、實際 tfvars 或私有設定。原始報告 hash、非 portable 本機路径、contact/project 值均不在公開衍生 manifest。

本輪 Luna 限於唯讀 metadata／Canon scouting；Sol 保留安全、架構判定與最後驗收。沒有 Luna 施工授權。後續 Sol 同時最多 **2 個**，含 parent、delegated worker 與獨立 CLI；parent 佔一個 slot，不得再啟兩個 Sol children。scope packet 數量不是同時 model instance 數量，也不要求每個 packet 各啟一個 Sol。

GitHub 即時 visibility 為 PUBLIC，符合 repository 的 GC-001；容器工作區「私有」字樣是過時背景。已先列明「只公開去敏 docs-only branch／單一 follow-up PR、不 merge、不施工、不改 visibility」的範圍，使用者續辦指示僅延續此 publication 範圍；不以舊 PR 權限自動批准 cloud、migration、production 或 construction。實際 PR／CI 仍需 exact-head readback。

## 2. 覆蓋、保留與未完成項

| 指標 | 已建立／核對 | 不代表什麼 |
| --- | --- | --- |
| 原始 IDs | 244／244 exactly once；High 12、Medium 80、Low 152 不改寫 | 不表示 244 defects 均成立或已修 |
| W4 原缺摘要 | 176／176 draft records；145 有可重判 source 身分，31 METADATA_BLOCKED | 不是 176／176 metadata accepted |
| 已中斷 Sol 成果 | 40 筆恢復並與 scope 輸出核對 unchanged | 不將局部成果重跑覆蓋 |
| 晨間 source scout | 38 列候選，其中 7 列 named source 身分已補；compound／泛化 claim 不猜 | source 索引不是 runtime proof |
| Owner flag scout | 65／65 核對；18 列可由既有 Canon／工程核對解除新 policy 問題 | Canon 有答案不是 implementation 固定，也不是操作核准 |
| NEW review entries | 10／10 unique routes；同根項與舊 finding 共用 owner | 不是淨新增 10 個漏洞 |
| Graph | 59 nodes、primary exact coverage、acyclic；27 理論 waves | 未滿足 owner/runtime/metadata prerequisites 的 nodes 不得啟動 |
| Future packet 提案 | 52 Sol-design scopes、4 bounded Luna candidates | 不是 52 個 Sol workers；沒有本輪施工 release |

原 finding model 分布：Sol-only 155；Luna-ready 6；Owner-blocked 44；External／metadata-blocked 31；No-work 8。原列 status 分布在 machine manifest，不能用 packet 數字替代 finding 數字。

解除新 owner flag 的 18 IDs：B-17, B-18, B-34, B-46, B-50, C03, D-14, D-21, D-23, D-32, E1-05, E1-07, E3-08, E3-12, E4-02, K2, E3-07, NEW-08。D-14 以 accepted ADR 的現行語義為準；Decision Register 同章的較早留言不得凌駕後續核准。47 個保留 flags 是保守 review list，不等於 47 個必須重問業主的新問題。

真正尚未由現有 Canon 直接回答的優先問題為 D-35（go-live／試用起算）、D-36（回填／未來日期界限）、E2-08（新 exact-SHA migration authority）、E4-09（個管師／諮詢師角色對應）、K6（IPv6 限流 identity prefix）、K7／C07／E4-24（分頁／截斷契約）。E3-14 的 CP-01／C4 視覺描述衝突仍需先定位 authority lineage，不能任選。

31 個 METADATA_BLOCKED：B-24, E1-19, E1-27, E1-29, E1-33, E1-34, E1-35, E2-11, E3-18, E4-05, E4-06, E4-11, E3-21, E3-22, E3-23, E3-26, E3-27, E3-28, E3-29, E3-30, E3-33, E3-36, E3-37, E4-16, E4-17, E4-18, E4-19, E4-20, E4-22, E4-25, E4-26。每列候選、缺什麼、誰提供與停止條件均在逐 ID 索引／JSON。B-24 已定位退休變數子項，但其他子項不唯一；E1-34 有重複驗證候選，但原 pair 未唯一，因此兩者不以局部證據解除整列 blocker。

## 3. 狀態語義與 NEW 去重

`currentStatus` 與 `assessmentScope` 必須一起讀。Source-reading 是 **INFERRED**；`CONFIRMED / SOURCE_TEXT_FACT_ONLY` 只確認指定文字／結構事實，不能當 TEST-VERIFIED。既有 local synthetic source-boundary 證據也不能當 deployed vulnerability 或修復驗收。`ALREADY_FIXED` 仍需相應 acceptance；`FALSE_POSITIVE`／`NOT_APPLICABLE` 只否定精確假說／現階段 scope，不批次關掉殘餘問題。

NEW-09 與 D-11 同根且同 primary `SOL-CALENDAR-ENVELOPE`；byte/time envelope 尚需 emulator／序列化量測，不能把「500 field transforms／document」錯當任意 transaction 500 total writes。NEW-10 的 CI principal 子項與 B-01 同根，builder bucket用途／effective grants 仍是 candidate；不查 live IAM，不列 confirmed deployed exposure。NEW-06 保留 GET quota/audit/交付失敗語義與既有 mock 限制；不能為 REST 形式擅自改 POST。**淨新增數仍 UNRESOLVED**，metadata／dedupe 語義未完整前不報 final count。

## 4. Primary owners、core leases 與 DAG

完整 node spec 在 JSON `packets`：ID、model、risk、status、findingIDs、dependsOn、blocks、likelyWriteSet、forbiddenScope、requiredContext、optionalContext、doNotReadByDefault、regressionTests、relevantCI、definitionOfDone、parallelGroup、mergeOrder。每個 original／NEW review ID 恰好一個 primary；同根的 NEW 不另開第二個 writer。

先解 owner／metadata／provider prerequisites，再由 Sol 收斂 ingress、contracts、session、identity、lifecycle、Calendar transaction/lease、IAM 等 hot boundaries。圖以共享 write-set 與具體語義 prerequisite 排序；機械 wave 僅驗圖與 lease，不會把 OWNER_BLOCKED／RUNTIME_BLOCKED／ARCH_BLOCKED 自動解成 READY。兩個 Sol slots 包含 parent；Luna 的唯讀 slot 許可不能當未來 construction 許可。

- 同 auth／session／ingress／shared schema／runtime workflow core 不允許兩個尚未 lease-release 的 writers。
- `likelyWriteSet` 是候選範圍，不是寫入權；檔案共用時需要 exact-base lease，不能以 Low 或「只改註解」搶 core。
- Source／Canon 是 read context，不一律是 write-set；證據型 rows 不因讀到 API／worker 就獲准改該 production file。
- 若 Luna candidate 與未完成 Sol core 相交，撤回 READY：C04／X-C01 正因此維持 Sol design／ARCH_BLOCKED，不讓 read-error UI 調整順便猜身分 generation／session 機制。
- 共用 planning ledger、README／INDEX 與 handoff 只有 Sol integration writer；Luna 不編輯共同 tracking 或寫 FIXED/DONE。
- `requiredContext` union 是導航，scout／worker只載本 claim 的 owning source、caller/test 與 exact Canon section；EXT-METADATA 不預載整個候選集合或所有歷史 reviews。

## 5. Bounded Luna candidate handoff（未授權施工）

這四個 packet 僅表示 local constraint 可寫成未來 handoff；真正派發前必須取得新的施工授權、核對 exact-base、確認 source／core lease 仍有效，並跑具名回歸。Sol 修改主線後需重新判定，不持有永久 READY。

### LUNA-E2E-INVENTORY — E3-32

- 最小 context：`AGENTS.md`, `GOVERNANCE.md`, `docs/INDEX.md`, `docs/architecture/test-strategy.md`, `scripts/e2e-groups.mjs`。
- Write-set：`docs/architecture/test-strategy.md`。
- 禁止範圍：不准production修復於本輪；Luna下一輪也不得改auth/RBAC/IAM/sharedschema/migration/共同tracking。實際construction另需fresh授權及scope lease。。
- Regression／負向：node scripts/e2e-groups.mjs PASS；人類表逐組等於 E2E_GROUPS，不改 workflow，不寫成目前測試已過。。
- 驗證：targeted unit/docs、owning area gates、exact-head required CI；保持 API／auth／schema／配置不變。
- DoD：逐 finding 原假說與 negative cases 實跑；diff 僅 lease write-set；同 SHA CI；Sol readback，不自行在共同 ledger 關帳。

### LUNA-FIRESTORE-RUNNER — E2-03

- 最小 context：`AGENTS.md`, `GOVERNANCE.md`, `docs/INDEX.md`, `scripts/run-firestore-rules.mjs`, `scripts/run-firestore-vitest.mjs`。
- Write-set：`scripts/run-firestore-vitest.mjs`, `scripts/run-firestore-vitest.test.mjs`。
- 禁止範圍：不准production修復於本輪；Luna下一輪也不得改auth/RBAC/IAM/sharedschema/migration/共同tracking。實際construction另需fresh授權及scope lease。。
- Regression／負向：mock spawn error、exit 0/非零及 signal close；所有啟動失敗皆輸出可讀錯誤並非零，close exit code 原樣傳遞。。
- 驗證：targeted unit/docs、owning area gates、exact-head required CI；保持 API／auth／schema／配置不變。
- DoD：逐 finding 原假說與 negative cases 實跑；diff 僅 lease write-set；同 SHA CI；Sol readback，不自行在共同 ledger 關帳。

### LUNA-ROBOTS-COMMENTS — B-23, C06

- 最小 context：`AGENTS.md`, `GOVERNANCE.md`, `apps/web/csp-policy.mjs`, `apps/web/public/robots.txt`, `apps/web/src/security-headers.test.ts`, `docs/INDEX.md`。
- Write-set：`apps/web/public/robots.txt`。
- 禁止範圍：不准production修復於本輪；Luna下一輪也不得改auth/RBAC/IAM/sharedschema/migration/共同tracking。實際construction另需fresh授權及scope lease。。
- Regression／負向：靜態比對非註解 directives 修改前後完全相同，確認 /staff 未新增 Disallow；既有 security-headers noindex assertion 在後續驗證通過。；純註解差異；修改前後 directives 完全相同，不新增 Disallow /staff；既有 noindex assertion 保持。。
- 驗證：targeted unit/docs、owning area gates、exact-head required CI；保持 API／auth／schema／配置不變。
- DoD：逐 finding 原假說與 negative cases 實跑；diff 僅 lease write-set；同 SHA CI；Sol readback，不自行在共同 ledger 關帳。

### LUNA-WORKBENCH-START — C01, X-C05

- 最小 context：`AGENTS.md`, `GOVERNANCE.md`, `apps/web/public/admin-bootstrap.js`, `docs/INDEX.md`。
- Write-set：`apps/web/public/admin-bootstrap.js`, `apps/web/src/admin-bootstrap.test.ts`。
- 禁止範圍：不准production修復於本輪；Luna下一輪也不得改auth/RBAC/IAM/sharedschema/migration/共同tracking。實際construction另需fresh授權及scope lease。。
- Regression／負向：server/local模式各顯示符合既有資料流的說明；不替換隱私法律文字或發明新承諾。；舊單/當日/無單與台北跨日合成時鐘一致使用核定預設；保留用戶已選日期。。
- 驗證：targeted unit/docs、owning area gates、exact-head required CI；保持 API／auth／schema／配置不變。
- DoD：逐 finding 原假說與 negative cases 實跑；diff 僅 lease write-set；同 SHA CI；Sol readback，不自行在共同 ledger 關帳。

## 6. 獨立驗收與停止條件

### 2026-10-07 bounded final planning review

最終可用結果由 Sol parent 直接核對；三個 Luna 唯讀工作因無進度被取消，沒有可採用的交付，不能記成成功或安全複核 PASS。`finalPlanningReview` 與 `finalExecutionGraph` 是本次 planning overlay；原研究、owner marker 與 lease-only waves 保留作 provenance，不冒充新 runtime 驗收。

- 10 NEW entries 已按可比對 source boundary 分別判為 distinct／sibling／same-root／partial candidate；NEW-09 同 D-11，NEW-10 的 CI principal 子項併 B-01、builder 子項仍候選。**正式淨新增數為 null／未決**，31 原 claim 不可比對，不能把來源邊界判讀說成全部 original-set final dedupe。
- 47 個 conservative owner markers 現在逐 ID 分型：7 policy 缺口（D-35、D-36、E4-09、K6、K7、C07、E4-24）、1 fresh operation authority（E2-08）、1 Canon authority conflict（E3-14）、38 Sol design／authority review。這是 blocker 的責任分類，不是批准任何 policy 或關掉原 owner marker；runtime proof 另加 typed prerequisite。
- 59 個 primary packets 保持 exactly-once；56 個非 external／no-work packets 的 **27 theoretical waves** 保留每檔單一 writer。最終 graph 補 `SOL-INGRESS → SOL-SESSION` trust-input design edge，不能只靠共檔 lease 表達 abuse identity 的依賴。
- 52 Sol design scopes、4 future bounded Luna packets 不等於 dispatch。wave actor 明列 `SOL_PARENT` ＋最多 1 `OPTIONAL_ONE_SOL_CHILD`，Sol 包含 parent 總量最多 2；Luna 最多 4。Low severity 不釋放 auth／RBAC／IAM／identity／shared schema。
- 每個 packet 明列 fresh implementation scope authority、exact-baseline single-writer lease、Sol design／policy／provider 等前提；全部 `dispatchAuthorized=false`。原 claim custody gate 仍 BLOCKED，不會因 CI green 自動滿足。

機械 verifier 的 9 個負向案例須拒絕缺 ID、duplicate route、錯 blob、cycle、偽 DoD、偽原 claim-source acceptance、缺 trust semantic edge、parent＋2 Sol children、把 CI 當施工權限。它驗規格結構與守門條件，不把 model reasoning 提升為 runtime／policy acceptance。

- [x] 244 original IDs、10 NEW review IDs unique primary routing；original severity 不變。
- [x] 原 176 draft records 已收回；原 40 Sol rows 沒被覆蓋。
- [x] 必要欄位、exact source blob bindings、DAG 無環與同 wave write-set 不相交可機械檢查。
- [ ] 原 176 項全部精確 source／claim anchor accepted：31 METADATA_BLOCKED 尚未滿足，且業主確認原分冊未保存；沒有原 claim/source acceptance 的替代推論。
- [ ] 原／NEW 語義 final dedupe、net-new count 與所有 owner／architecture issue 完整驗收。
- [ ] 所有 construction packets 最終 scope／policy／lease release；本輪禁止施工。
- [ ] 新 public planning PR 核准、推送、讀回 exact head 與 fresh CI。

任何 payload／credential／PII／私有 runtime evidence 被引入，或相對 current main 出現任何 source/TF/workflow/security/gate diff，立即停止。main integration 的既有依賴修補不計成這次 planning 施工。缺原分冊 anchor 的 31 列各自保留 `sourceIdentityGap`、候選與提供者；未來若原稽核維護者重建去識別 claim/source，必須標示為重建證據，而不是復原了未保存的原檔。CI green 不關掉這 31 blockers，不批准 construction。
