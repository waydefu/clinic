# E2E 分組、產品 Roadmap 與供應鏈修補交付紀錄（2026-08-04）

**類型：** 日期證據。這份文件記錄 2026-08-04 當日做了什麼、驗證到什麼程度，
**不是**現行權威，也不解除任何決策 gate。現況以
[roadmap](../roadmap.md) §一 為準。

**範圍：** 三個 PR——[#10](https://github.com/waydefu/clinic/pull/10) 供應鏈修補、
[#8](https://github.com/waydefu/clinic/pull/8) E2E 分組、
[#9](https://github.com/waydefu/clinic/pull/9) 產品 Roadmap 文件。

---

## 1. 交付內容

### 1.1 E2E 從單一 job 拆成六組（#8）

一個 job 跑完 17 支 spec，紅了只知道「E2E 壞了」。改為 matrix，PR 上呈現六個具名
check。

| 分組 | 測試數 | | 分組 | 測試數 |
| --- | --- | --- | --- | --- |
| `e2e-auth-rbac` | 20 | | `e2e-mobile` | 53 |
| `e2e-appointments` | 32 | | `e2e-accessibility` | 17 |
| `e2e-patient-portal` | 35 | | `e2e-ui` | 34 |

拆分前後都是 **191 個測試**，17 支 spec 全部有歸屬。

實測牆鐘時間：拆分前的單一 job **8m50s**（在 #10 上量到，該分支尚未含拆分），
拆分後最慢的 `e2e-appointments` **3m27s**。

### 1.2 產品能力 Roadmap P0～P7（#9）

新增六份 plan-only 文件並擴充 `roadmap.md`。八個產品階段中**只有 P0 與 P1 現在
能動**，其餘六個卡在尚未核准的決策而非工程排期。

### 1.3 四筆 high advisory 修補（#10）

`check:supply-chain` 在無任何程式碼變更的情況下由綠轉紅，連帶讓
`Verification evidence` 失敗，擋住 #8 與 #9。

| 套件 | Advisory | 面向 |
| --- | --- | --- |
| `fast-uri` <3.1.5 與 <4.1.2 | GHSA-7p8r-x3mc-p8w7 | **出貨面** |
| `undici` ≥8.0.0 <8.9.0 | GHSA-4cwx-7wf7-3272 | dev（Firebase CLI） |
| `ip-address` ≤10.3.0 | GHSA-mwp4-54f8-5fhr | dev（Firebase CLI） |
| `brace-expansion` <5.0.9 | GHSA-rgw5-rvv9-x895 | dev（eslint） |

結果：`audit:prod` 無任何 advisory；`audit:all` 由 3 high／11 moderate 降到
**0 high／5 moderate**，且不需要任何 audit 例外。

---

## 2. 過程中發現的問題

這一節記錄的是「原本沒人在找、但做這件事時撞到」的東西。

### 2.1 角色定義有三套，互不相容（未修，已規劃）

| 來源 | 角色數 |
| --- | --- |
| `apps/web/public/modules/permissions.js` | 2（`admin`、`front_desk`） |
| `apps/api/src/platform/authorization/rbac.ts` | 7 |
| D-006 核准基線（2026-07-28） | 3（含 **physician**） |

**「醫師」與「諮詢師」在兩份程式碼裡都不存在**，儘管 D-006 核准的基線含 physician。
這是本次盤點找到最大的實質落差，已寫成
[角色權限矩陣](../architecture/rbac-matrix.md) 並排為 P0 第一項。它不需要新決策，
D-006 已核准。

### 2.2 `audit:all` 長期被 `audit:prod` 的失敗遮住

`check:supply-chain` 依序執行 `audit:prod` → `audit:all`。出貨面先失敗時
`audit:all` **根本沒機會執行**，因此 §1.3 的後三筆 dev 鏈 high 一直不可見，直到
第一筆被修掉才浮現。

這是 gate 串接順序的固有性質，不是缺陷；但它代表**「audit:prod 紅」時不能推論
「audit:all 的狀態」**。修完第一筆後必須重跑，不能假設只剩那一筆。

### 2.3 `fast-uri` 兩個 major 同時中，且樹上兩個都在

`3.1.4`（`@fastify/ajv-compiler`、`ajv`）與 `4.1.1`（`fast-json-stringify@7`）
分別中了 `>=3.0.0 <3.1.5` 與 `>=4.0.0 <4.1.2`。

只釘 3.x 不足以讓 gate 變綠；而無範圍的 `fast-uri: ^3.1.5` 會把
`fast-json-stringify` 需要的 4.x **降級**成 3.x。必須逐 major 鎖定。

### 2.4 品質把關文件把一筆已移除的例外描述成現行狀態（已修）

`web-quality-gates-2026-07-24.md` 有一整段描述 `brace-expansion` 的
`auditConfig.ignoreGhsas` 例外為現行狀態。但該例外在 2026-08-01 就已移除——
`pnpm-workspace.yaml` 的註解與 `check-audit-exceptions.mjs` 的實際輸出都說目前
沒有任何例外，只有那份文件還留著。已於 #10 一併更正。

### 2.5 拆分 E2E 會引入一種單一 job 沒有的失敗模式（已加守衛）

新增的 spec 若沒被分進任何一組，就不再執行，而 CI 仍然全綠。**漏跑的測試看起來
和通過一模一樣。**

`scripts/e2e-groups.mjs` 因此同時是分組的唯一真實來源與守門員，接在 `pnpm verify`
內驗證三件事：每支 spec 剛好屬於一組、清單裡的檔案都存在、workflow 的 matrix
組名與清單一致。已實測：丟一支沒歸組的 spec 進 `tests/e2e/`，gate 立刻紅並指名
該檔案。

### 2.6 兩個不設就等於白拆的 matrix 組態

- `fail-fast: false`——預設的 `true` 會在第一組失敗時取消其餘五組，於是又回到
  「只知道有東西壞了」。
- artifact 名稱帶組名——upload-artifact v4 不接受同名 artifact，六組共用
  `playwright-report` 會讓後完成的組上傳失敗。

---

## 3. 刻意不做的事

| 項目 | 理由 |
| --- | --- |
| 不建立 `e2e-surgery` 分組 | 手術功能未實作、零 spec。一個永遠綠燈的 job 會讓人以為有測試覆蓋，比沒有更危險 |
| 不建立 `docs/ROADMAP.md` | 與現存 `docs/roadmap.md` 在 Windows／macOS 上是同一個檔名 |
| 不沿用 Phase 0–7 編號 | repo 已有 Phase 0/1、Stage 0–6、C0–C6、Expansion S 四套；改用 P0–P7 前綴並附對照表 |
| 不把產品定位改為「醫美診所」 | `clinic-site.spec.ts` 有一條主動斷言要求導覽不得出現醫美字眼；那是刻意的內容邊界 |
| 不新增 audit 例外 | 四筆都有真正的修補版可用。例外的正確結局是被移除，不是被新增 |
| 不建立 `nurse`／`anesthetist`／`finance` 角色 | 依 D-014／D-015 阻擋。一個存在但無人使用的角色會被當成「已經支援」 |

---

## 4. 驗證證據

| Gate | 結果 | 來源 |
| --- | --- | --- |
| `check:supply-chain` | ✅ secrets、例外、audit:prod、audit:all、SBOM | #10 CI 與本機 |
| `pnpm verify` | ✅ 14 道檢查；#10 上 58 檔 900 測試、#9 上 59 檔 915 測試 | CI 與本機 |
| `pnpm test:rules` | ✅ 6 檔 66 測試 | 本機 |
| `pnpm test:e2e` | ✅ 六組共 191 測試 | #8 CI |
| Semgrep SAST | ✅ | CI |
| `Verification evidence` | ✅（#10） | CI |

`pnpm test:rules` 在這台 Windows 機器上需要 ASCII 工作目錄——Firestore Emulator 的
JVM 無法解析含中文的路徑，以 `subst` 對應磁碟機代號後執行，跑完移除。這是本機
限制，Linux CI 不受影響，**不得當作跳過這道 gate 的理由**。

---

## 5. 限制與未完成

1. **三個 PR 於本文件撰寫時尚未合併。** 合併順序必須是 #10 → #8 → #9；#8 與 #9
   在 #10 合併前都會因 supply-chain 而紅。本文件的驗證證據來自各 PR 分支，不代表
   `main` 的狀態。
2. **CodeQL 已於 2026-08-01 被 Semgrep 取代**，任何提到「修正 CodeQL 問題」的
   規劃都是基於過期資訊。
3. **人工無障礙實測仍從未執行。** runbook 備妥但沒有人跑過；自動 axe 成功不等於
   螢幕閱讀器與人工驗收成功。
4. [角色權限矩陣](../architecture/rbac-matrix.md) §7 有**四個未解問題**需負責人
   回答（個管師與諮詢師是否同一職務、醫師能否看金額、管理者無臨床權是否可接受、
   櫃檯款項權是否含結算）。在回答前，對應的權限列不得實作。
5. 拆成六組後總 CI 分鐘數上升——每組各自 build 並安裝 Chromium 一次。牆鐘時間
   改善（8m50s → 3m27s）是以此為代價換來的。若要收回，下一步是把 build 抽成前置
   job 並以 artifact 傳遞 `dist/`。
6. 本次未執行任何雲端部署、未建立任何雲端資源、未處理任何真實資料。

---

## 6. 相關文件

- [產品能力 Roadmap](../roadmap.md#產品能力-roadmapp0p7)
- [產品定位與長期方向](../product/product-vision.md)
- [角色權限矩陣](../architecture/rbac-matrix.md)
- [測試策略](../architecture/test-strategy.md)
- [前端與供應鏈品質把關](../architecture/web-quality-gates-2026-07-24.md)
- [文件生命週期與證據規則](../document-lifecycle.md)
