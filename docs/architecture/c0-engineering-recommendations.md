# C0 工程建議（2026-09-11）

**Type:** engineering recommendation, owner-accepted for synthetic staging.
**Recorded input:** `C0-ENG-REC-2026-09-11`
**Acceptance:** `C0-ENG-ACCEPT-2026-09-11`
**Machine file:** [c0-engineering-recommendations.json](c0-engineering-recommendations.json)
**Status:** `OWNER_AUTHORITY_CONFIRMED` /
`ENGINEERING_RECOMMENDATION_COMPLETE` /
`NAMED_REVIEWER_METADATA_PENDING`

本文件關閉「缺工程選案」缺口。Owner 2026-09-11 continuation 已接受這些
值作為 Phase-1 **synthetic staging** 工程 C0。機器狀態是
`stageSlices.C0=completed`（不是無效字 `approved`）。C1
`deploymentAuthorities=granted` 只表示可以開始 C1 packet，**不是** C1
PASS、**不是** apply 證據。C2～C6 仍 `not_granted`。具名
technical／security 人名欄位仍空（`NAMED_REVIEWER_METADATA_PENDING`），
不得捏造。

官方依據（查詢日 2026-09-11）：

- Cloud Billing budgets 本身不會停帳；100% 要另接 Pub/Sub 才能動作。
  自動切斷 billing 會停掉專案內全部服務，含還原路徑。
- Spend cap（2026-09-10）僅涵蓋單一專案的單一合格服務（含 Cloud Run），
  **不含 Firestore**，且設定常需 Project Owner。C1 不建 Cloud Run。
- Firestore IAM 不能下到 collection；Admin SDK 繞過 Security Rules。
- Identity Platform TOTP `adjacentIntervals` 範圍 0–10，**未審查預設為 5**。

## 1. IAM / JIT / Firestore residual risk

| 選項 | 結論 |
| --- | --- |
| 常駐 Owner／Editor | 拒絕 |
| 組織級 Privileged Access Manager | Phase-1 拒絕（人員少、複雜度高） |
| IAM Conditions `request.time` 上限 8 小時 | **選用**（JIT-lite） |
| collection-scoped Firestore IAM | 不可行；不得宣稱已強制 |

建議：人類與自建 SA 不得持有 primitive Owner／Editor；CI 走 WIF、無長期金鑰；
人類不得常駐 `roles/datastore.user`；還原操作者只在演練窗 JIT。
API／worker 若被接管，database-scope 仍是剩餘風險。Synthetic staging 已由
owner 接受該剩餘風險；production 另需獨立接受。

回滾：撤銷 binding／停用 SA；不以刪專案當預設回滾。

## 2. 預算 50%／80%／100%

| 門檻 | 動作 |
| --- | --- |
| 50% | 通知帳務＋技術角色；調查；不改資源 |
| 80% | 通知，並凍結後續 C-slice apply；既有合成 runtime 先保留 |
| 100% | 通知；暫停 Scheduler 與非必要 API；**不**切斷 billing、不 destroy |

拒絕：只有信件沒有動作；100% 自動 detach billing；把 Preview spend cap 當專案總閘。

建議月額 **NT$2,000**（業主 recorded input）。收件人只記**角色**，
email 不進公開 repository。

回滾：回復上一版 budget／alert；保留變更證據。

## 3. DR

| 方案 | 結論 |
| --- | --- |
| A 同區 backup＋PITR | **必要基線**（C5／C6，不是 C1） |
| B 每小時 managed export＋獨立 secondary project | **選用**，secondary 亦在 `asia-east1` |
| C 應用層 replica | 拒絕（複雜度高） |
| D Firestore multi-region | 拒絕（與已核准 `asia-east1` 不相容） |

Primary：`asia-east1`。Secondary：新 DR 專案（不是 C1、不是現有 staging）。
Standby：cold。Failback：技術負責人手動驗證後切回，禁止自動 failback。
台灣整區 GCP 中斷列為 Phase-1 **殘餘風險**；真實資料要進 `asia-east2` 前須
D-001～D-003。演練前不得宣稱 RPO／RTO 已達成。

## 4. MFA／TOTP／授權碼

| 參數 | 值 |
| --- | --- |
| TOTP `adjacentIntervals` | **1**（拒絕預設 5） |
| 手機遺失 | 第二位 `manager` 當面確認後重綁；禁止 email 單因素救回 |
| 授權碼連續失敗 | **5**（NIST 上限 10，本值更嚴） |
| 鎖定 | 15 分鐘起指數退避，上限 4 小時；鎖定期間重試不延長 |
| 解鎖 | 僅 `manager`，須稽核；無自助解鎖 |
| 授權碼 TTL | 24 小時；離職／疑似外洩即撤，不設月曆輪替 |
| Break-glass | `not_provisioned` |

可執行常數：`packages/domain/src/staff-auth-parameters.ts`。尚未接 C2／C4 路由。

## 5. C1 策略

**選用：新隔離 staging 專案。**

拒絕把現有 `beauessence-clinic-staging` 當 C1 完成：該專案已有 Firestore、
Identity、Cloud Run、CAL-PILOT 與 `synthetic-review` 預覽，無法證明 C1「不含
Firestore」。既有專案維持 CAL-PILOT＋過期預覽，直到各自期限；不是 C1。

C1 允許 API 見 JSON `c1.apiAllowlist`。明確排除 Firestore、Identity Platform、
Cloud Run、Scheduler、Artifact Registry、production、Calendar、DR secondary。

回滾：停用新 API／IAM 並 quarantine；預設不刪專案。
