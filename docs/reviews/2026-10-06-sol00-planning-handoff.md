# 2026-10-06 SOL-00 planning handoff（PARTIAL）

**Outcome：BLOCKED，非 SOL-00 DONE。** 受控原始材料不在 repo；本輪 deliverable 是 [follow-up plan](../plans/2026-10-06-sol00-safe-manifest-closeout-plan.md)、[逐 ID 索引](../plans/2026-10-06-sol00-finding-manifest.md) 與 [完整 manifest](../plans/2026-10-06-sol00-safe-manifest.json)。沒有 production 修復、cloud／Calendar／data 操作、migration、merge 或部署。

## Delivered version and evidence binding

Source baseline／origin main：`f7ace1a8ac8626783af342b89b0ad14b1ae400de`；branch `agent/sol00-safe-manifest-closeout-20261005`。PR #240 已 merged；#239／#238 已驗 ancestry。本文件是 docs-only follow-up 的提交前本機 handoff；不引用包含自身的 commit，請用 `git log -- docs/reviews/2026-10-06-sol00-planning-handoff.md` 查 delivered commit。PR、exact-head CI 與最後 readback 另在新 follow-up 的 delivery record 中提供；尚無 merge，不使用 #240 的舊綠 CI 代替。

## Coverage and limits

244／244 原 IDs 及 severity 12 High／80 Medium／152 Low 保留；176／176 formerly missing draft rows 在場，40 Sol rows preserved unchanged。145／176 source 身分可重判，31 source/claim anchors 尚缺。10 NEW review entries 不等於淨新增 10 缺陷；NEW-09/D-11 同 primary，NEW-10/B-01 partial overlap。所有逐 ID 狀態、未解問題與 future owner routes 均有 portable repo copy。

18 個新 owner flag 由 Canon／工程核對解除；剩餘 47 flags 仍是保守待審，不當作 47 個必須新增 policy 的結論。52 Sol-design scopes 與4 future Luna packets 不是 model dispatch；Luna本轮只是唯讀。閱讀屬 inferential，computational structure checks 不驗 deployed safety。

## Actual defects in the research harness

- Packet generator 使用共享 `groupby` iterator 後再排序，造成空 packets／missing routes；在 scratch 修正並加入 exact reference coverage 與 non-empty assertions。修的是研究 harness，不是 production。
- Source aliases／不存在的 controller test 引用已排除；source paths 綁 current Git blobs，不把引用當已跑 unit evidence。
- Candidate write-set 與 read context 分離；comment/UI copy 的 bounded write-set 明列，不因 filtering 誤變為空 READY packet。
- Proposed source-dependent findings 未被擴大成 confirmed runtime exploit。Calendar transaction 500 total-write 假說沒有成為修復理由。

## 本機 gate record（最後提交前重跑；不當 runtime 驗收）

| Gate | Result | What is proven / not proven |
| --- | --- | --- |
| 原 ID／severity／244+10 primary coverage | PASS | 254 rows、244 original severity 不變、逐 ID primary exactly once；不驗 defect 成立 |
| 必要欄位／source blobs／DAG／wave lease／Luna bounds | PASS | 537 git blob bindings、59 nodes、27 理論 waves；5 個負向 mutation 必須拒絕；不釋出 owner/runtime prerequisite |
| 40-row checkpoint preservation | PASS | 40 recovered rows 與四個 scope 輸出 unchanged；不等於全部 accepted |
| De-identification／docs-only diff | PASS | 6 個 allowlisted docs/index files；沒有 raw report、contact/project 值、credential／private path；不代替人工去敏複核 |
| check:docs／check:governance／check:structure | PASS | 282 docs、INDEX 6127 bytes、361 required files／17 reference PNGs；既有 AGENTS／INDEX／CLAUDE advisory warnings 保留 |
| check:secrets | PASS | staging 後 1205 tracked files 掃描；6 個交付文件 included，沒有 credential path／private key/token findings |
| Changed-document format／git diff --check | PASS | Prettier 3.9.5 matched JSON；5 個 Markdown 按 repo *.md exclusion 不自動重排；diff whitespace check PASS |
| 新 exact-head required CI | NOT_RUN | publication 已續辦，待新 follow-up exact commit 的 required aggregate；不引用舊 head 的綠燈 |
| Production unit/emulator/E2E remediation acceptance | NOT_RUN | 不實作 production 修復；本輪 docs/metadata checks 不冒充回歸 |
| Provider／live IAM／Calendar/restore proof | NOT_RUN | 非本輪 authority，不碰 real data 或 cloud mutation |

## Environment traps

PATH 的 Node 是 26.x，不符 repo engine；使用受控 cached Node 24.20.0。Git-bash/MSYS 的 `corepack` shim 路徑轉換會失敗；以 pinned Node 直接執行已安裝 Corepack JS entry，pnpm 11.9.0 已查明。worktree 沒有 node_modules，其他工作區 dependency junction 不作可用假設；只需文件 gate 的 scoped dependencies，不重新安裝／改寫整個產品 toolchain。

第一次增加 INDEX route 超出 6144-byte gate，已把新增 route 與同區導覽文字精簡至 6127 bytes；沒有加 waiver 或放寬門檻。獨立 verifier 另拒絕 A06 的舊 controller line 277，已對 actual current delete handler 校正至 line 235；不改原 scout／40-row frozen cache。

## Unresolved / next first step

1. 原稽核維護者提供 31 列精確去識別 subreport claim/source anchor，按 manifest 的 `sourceIdentityGap` 解題；不得讀真實 Calendar payload 為了證明 E4-11。
2. Sol 只重判這31列與 partial Canon/semantic dedupe；保留四組研究和40筆回收成果，Sol總並發含parent最多2。
3. PUBLIC GitHub repo 與容器背景private敘述不一致；Canon GC-001明文public。使用者在已列清的公開去敏 docs-only follow-up 範圍內指示續辦；沒有 raw evidence／私有設定的 publication 或 visibility 變更權限。
4. 只 push 該 docs-only branch／建立單一 follow-up，讀回 exact PR head及 required aggregate CI，不merge。CI green 仍不關31 blockers或批准construction。

Artifact digests：最後提交前以 final file bytes 計算，在 exact-head delivery record／本機 verifier 結果提供；不對本文件製造自我引用 hash。
