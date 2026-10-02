# 六位驗證需求與合併順序紀錄 — 2026-10-03

**類型：業主方向紀錄與日期化 PR 現況。** 本次新增紀錄，沒有修改驗證實作、合併
PR、部署或操作雲端。時間以 Asia/Taipei 為準。

## 業主新增要求

原話：**「只有特殊情況才要6位驗證」**。

方向已記錄為 `STAFF-SIX-DIGIT-EXCEPTIONS-2026-10-03`，見
[Decision Register](../product/phase-1-decision-register.md)。這句話要求六位碼驗證
只在特殊情況觸發；本輪交付是紀錄，實作對應尚未完成。

尚待明確的範圍為 `IMPLEMENTATION_SCOPE_PENDING`：

- 指登入 MFA，或一般工作臺操作時的額外再驗證。
- 哪些既有操作屬於特殊情況，哪些應調整。
- 既有 10 分鐘 fresh reauth 有效期是否改變。

本次已確認需求原文，上述實作範圍尚待業主明確指定。
本 PR 保留原話，不自行新增特殊情況清單；未改登入 MFA、role/session/CSRF、
ADR 或 runtime。後續實作需把明確答案同步到 governing Canon、API/UI 與 denied-path tests。

### 現行控制的對照，非新特殊情況清單

| 現行動作 | 額外操作再驗證 | 既有依據 |
| --- | --- | --- |
| 查月報／里程碑 | 不要求新的六位碼；使用有效員工 MFA session | [ADR-0008](../adr/0008-business-delivery-usage-and-milestones.md) |
| 確認上線／尾款里程碑 | 要求 10 分鐘內 Google＋TOTP | ADR-0008 |
| 建立 CSV 匯出 | 要求 10 分鐘內 Google＋TOTP | [ADR-0009](../adr/0009-business-delivery-export.md) |
| 查匯出／下載／撤銷 | 沒有額外操作再驗證；仍有 session/role、撤銷另有 CSRF | ADR-0009 |
| 封存／永久刪除病患 | 要求 10 分鐘內 Google＋TOTP；永久刪除另有理由及條件 | [ADR-0010](../adr/0010-business-delivery-retention.md) |
| 復原／設定或解除 legal hold | ADR 明確不要求額外操作再驗證 | ADR-0010 |
| 建立終止通知／簽收／送人工結案審查 | 所有寫入要求 10 分鐘內 Google＋TOTP | [ADR-0011](../adr/0011-business-delivery-termination.md) |
| 查終止案件 | 使用有效 session，沒有額外操作再驗證 | ADR-0011 |

D-006 的全員登入 MFA、local-account TOTP、30 分鐘 idle／8 小時 absolute 是
登入規則，與表中的操作再驗證分開。PR #216 的 `runWrite` 預設不要求再驗證；
現有選定寫入及建立匯出會呼叫 fresh Google＋TOTP。Mock E2E 不能證明真實 provider
可用；已記錄的 COOP popup 障礙仍要保留。

## PR 現況與合併順序

截至 2026-10-03 00:08–00:13（2026-10-02 16:08–16:13 UTC 的唯讀 readback），main 為稽核基線
`4ccc752`，#214～#219 均 OPEN。下表為**本次新增紀錄之前**的各 PR head 快照，
本 PR 新增紀錄後的 head 與 CI 應另讀 GitHub。舊 body 的較早綠燈不能替代此表 head。

| PR | Head 短碼 | 內容 | 該 head 的結果 |
| --- | --- | --- | --- |
| [#214](https://github.com/waydefu/clinic/pull/214) | a93d01b | C1 商務設定與 usage capture-gap | 供應鏈與 Verification evidence FAIL |
| [#215](https://github.com/waydefu/clinic/pull/215) | ca949c8 | 手打 Calendar 事件的患者建議 | 供應鏈與 Verification evidence FAIL |
| [#216](https://github.com/waydefu/clinic/pull/216) | 8343fd1 | 商務與驗收 UI／再驗證 | 供應鏈與 Verification evidence FAIL |
| [#217](https://github.com/waydefu/clinic/pull/217) | 589bf88 | 部署 packet／手冊／回歸與驗收 worksheet | 供應鏈與 Verification evidence FAIL |
| [#218](https://github.com/waydefu/clinic/pull/218) | 43864f0 | C1 Scheduler 暫停紀錄 | 供應鏈與 Verification evidence FAIL |
| [#219](https://github.com/waydefu/clinic/pull/219) | d4b4e63 | 全專案稽核紀錄 | 10 PASS、2 FAIL；供應鏈與 Verification evidence FAIL |

六個 head 各為 10 PASS、2 FAIL，都有同一個供應鏈阻擋；#219 的
[確切 run](https://github.com/waydefu/clinic/actions/runs/37028552302) log 確認為
development chain 的 basic-ftp high advisory。main protection 讀回為 strict=true、
enforce_admins=true，唯一 required context 為 Verification evidence。沒有忽略 gate 或
管理員 bypass；目前不是「可以直接按順序合併」。

建議先後順序：

1. **先修供應鏈阻擋（另開 scoped 修正 PR）。** 現有六個 PR 不包含這次 basic-ftp
   修復。取得安全依賴解析、完整 exact-head CI，不能沿用舊綠燈、增加 ignore 或降門檻。
2. **#219：稽核與本次驗證方向紀錄。** 讓待修問題與新要求進入專案可攜紀錄；
   六位驗證仍需明確實作對應。
3. **#218：背景排程暫停紀錄。** 文件獨立，與 #219 可交換；兩者都改 docs/README.md，
   後合者需同步 main、保留兩筆索引。合文件不代表開啟排程。
4. **#214：商務設定及事件計數。** 先完成 UI 所需的 backend/config 支援。
   #214 與 #216 不是 stacked Git branches，也沒有重疊 source 檔；這是功能整合先後。
5. **#215：Calendar 手打事件建議。** 與 #214 無硬性功能先後，只有 generated vendor
   manifest 重疊；#215/#216 共五個檔案重疊（bootstrap、index、Calendar entry、
   performance budget、regression test）。先完成 #215，再由 #216 整合重跑 CI。
6. **#216：商務畫面與再驗證。** Body 明列 #213/#214 API 相依；#213 已在 main。
   合併前對照本次六位驗證方向的明確答案；若觸發範圍需變，先修 UI/API 的對應與回歸。
7. **#217：部署與驗收文件最後同步。** 用實際整合 source、最新六位驗證範圍、
   最終 release SHA/CI 更新 packet、手冊及 worksheet；保留 NOT_RUN/未簽名。
   目前文件仍把已合併 #213 列為未合併，也引用 #214～216 的較早綠燈 head，需更新。

這是建議合併順序，沒有發出合併或部署授權。每個後續 PR 都應同步當時 main、
處理重疊 diff，重新取得自己 exact head 的 required CI；merge 不構成 C1 runtime、
Google provider 或業主驗收。

## 交付與未完成事項

- 本紀錄隨既有 `agent/full-project-audit-20261002` / PR #219 更新，沒有另外開重複 PR。
- 文件自身 commit 無法自我引用；用
  `git log -- docs/reviews/2026-10-03-verification-direction-and-merge-order.md` 查找。
  Merge commit 尚不存在。
- 未完成：六位驗證的明確適用對應、供應鏈修復、15 項來源 findings 修正、各 PR
  最新 head CI、source 整合、部署 packet 與 runtime/產品驗收。
- 技術 owner 應在 #216 實作/合併前確認新方向的對應；具名 owner 尚未指派。
  此紀錄沒有新 Roadmap 核准，也沒有修改 D-series 或既有 P1-09 歷史關帳。

**本輪文件 evidence rung：GATE-VERIFIED，限下列本機文件 gate。**

| Gate | 結果 | 證據或限制 |
| --- | --- | --- |
| check:docs | PASS | 266 Markdown files；links/index/lifecycle |
| check:governance | PASS | 既有 boot size advisory warnings；沒有 state 漂移或新增 waiver |
| tracked-secret | PASS | 1174 tracked files，新增紀錄已先 stage |
| git diff --check／可攜內容檢查 | PASS | 只增改 Markdown；無 whitespace error、本機絕對路徑或 cloud 服務網址 |
| 本機 lint/完整 verify/Emulator/E2E/supply-chain | NOT_RUN | checkout 沒有 node_modules；完整 gate 交由新 PR head 的 required CI |
| 新 head Verification evidence | NOT_RUN | 寫入紀錄時尚未提交；前一個 head 的結果是上表 FAIL，不能沿用為新 head 結果 |
| runtime/合併/部署 | NOT_RUN | 本輪只新增紀錄與建議順序 |

本輪變更全為 Markdown，依既有 .prettierignore 由 reviewer 排版；既有稽核 JSON
未變，沒有重寫格式或 enforcement。紀錄可由 Git 回退，不需要 runtime rollback。
