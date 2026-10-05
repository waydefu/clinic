# 2026-10-05 外部稽核後續逐步計畫（Luna 可執行）

**類型：** plan-only 逐步執行計畫。不核准部署、`terraform apply`、`firebase deploy`、建立或刪除雲端
secret／金鑰、改寫 git 歷史、真實資料或 production。
**對象：** GPT-6 Luna（業主筆電）或任何接手代理。流程依 `OWNER-BATCH-2026-09-29B` 第 8 項：
執行者開 PR → Claude 審查 → 業主合併。
**來源：** 2026-10-05 外部稽核完整報告（**保存在業主本機、不入庫**；基準 commit `1e26d3b`；
244 項＝高 12／中 80／低 152）。本計畫撰寫時已確認 `1e26d3b` → `origin/main` `2b3dd25` 只改了
skills、`docs/INDEX.md`、C1 部署 packet 與其測試，**報告列的程式行號仍然有效**。
依 [SECURITY.md](../../SECURITY.md)，本文件只寫「問題在哪、怎麼修、怎麼測」，不寫利用步驟或量測數字。
**同時在進行：** PR #238（AUD-01 身分上下文隔離，未合併）會改到
`appointment.application-service.ts`、`internal-test-booking.authenticator.ts`、`api-client.js`、
`internal-test-booking-transport.js`、`patient-app.js`、`tests/e2e/internal-test-booking.spec.ts`。
碰到這些檔的包標為「**等 #238**」。

## 0. 每個工作包都要照做的規則

沿用 [2026-09-30 Luna 計畫](2026-09-30-luna-execution-plan.md) §0 第 1～11 條（環境、安裝、一包一 PR、
合成資料、角色字串、新權限、送 PR 前檢查、emulator 清資料、commit／PR 格式、停止條件），**另加 12～20 條**；
衝突時以本節為準。

12. **先對碼再動手。** 每包第一步都是「先確認」：用包內寫的 `git grep`／`sed -n` 確認問題還在。
    行號以 `2b3dd25` 為準，對不上就用符號名稱搜尋。**問題已不在 → 不改，回報「已不存在」並停止**；
    問題長得跟計畫不一樣 → 停止回報。
13. **分支：** `cursor/luna-aud-<包代號小寫>`（例：`cursor/luna-aud-w2-01`），一律從 `origin/main` 開，不疊分支。
14. **公開 repo 寫法：** PR、commit、測試名稱只寫「依 2026-10-05 稽核 `<ID>` 修正 ___」與修法；
    **不寫**攻擊步驟、猜測次數、可直接重放的請求或量測到的繞過數字。外部稽核報告**不得**加入 repo 或整段貼進 PR。
15. **個人資料：** 真實 email、電話、姓名不得出現在 diff、PR、commit、測試。刪個資的包（W1-01）
    PR 只寫「移除 `<檔名>:<行號>` 的個人聯絡資訊，改為角色」，**不得**寫出被刪的值。
16. **等 #238：** 開工前 `gh pr view 238 --json state -q .state` 必須是 `MERGED`。
    若 #238 被關閉未合併 → 停止回報，不要自己搬 #238 的修法。
17. **需決定 Qn：** 先在[決策登記](../product/phase-1-decision-register.md)搜尋 §2 該題的建議決定 ID。
    **找不到 → 不開工**，回報「缺 Qn 決定」。
18. **動到下列檔案要多跑：**
    - `security/audit-exceptions.json`、`pnpm-workspace.yaml`、`package.json` 依賴 →
      `node scripts/generate-governance-state.mjs`，提交 `docs/state/current.*` 的變動；
    - `packages/domain/**` → `corepack pnpm run sync:domain`，提交 `apps/web/public/vendor/domain/*`；
    - `infra/terraform/<目錄>/**` → 該目錄 `terraform fmt -check`、`terraform validate`、`terraform test`
      （沒有 terraform 執行檔寫 `UNAVAILABLE`＋原因，由 CI 補）；
    - 新增 `docs/**` 檔 → 登記 `docs/README.md`，跑 `node scripts/check-docs-links.mjs`；
    - `apps/web/**` → `corepack pnpm run check:perf`；**預算一律不得調高**，超過就停止回報。
19. **任何包都不做：** 部署、`terraform apply`、`firebase deploy`、建立／刪除 secret 或金鑰、改寫 git 歷史、
    下法律結論、改 Safety Floor 或 ADR 的政策內容。需要時停止，把要業主執行的事寫在 PR「留給業主」段落。
20. **PR 說明最後附一表：** 本包處理的稽核 ID、結果（`FIXED`／`PARTIAL`／`ALREADY_FIXED`）、驗收測試名稱。
    收尾包 Z-01 用這些表彙整。

## 1. 現況與期限（2026-10-05）

| 日期（台北） | 會發生什麼 | 對應包 |
| --- | --- | --- |
| **2026-10-09** | SCM-R04 重審日（firebase-tools 帶進的 csv-parse／stream-json 告警） | W0-02 |
| **2026-10-17** | braces 例外 `SUPPLY-CHAIN-BRACES-2026-10-03` 到期；checker 用 UTC，**10-18 08:00 起所有 PR 的 CI 變紅**；braces 目前**沒有**修補版 | W0-01（需 Q1） |
| 2026-10-20 | Node 24 進入 Maintenance（repo engines `>=24.20.0 <25`），只需記錄，不必升 | — |
| 2026-11-28 | cal-pilot 多處寫死的期限（E1-07，低） | W4 backlog |

已知已在處理：**AUD-01／E4-03** 的原始細節已由 #238 作者核對並修復，#238 合併後由 W3-09 更新公開狀態。
本次另派三路唯讀複核（API／domain、worker／web、infra／CI／docs）找漏網問題，
結果以追加 commit 寫進本文件 §5；**§5 尚未填入前，以 §3 的包為準**。

## 2. 需要業主先決定的事（每題附建議）

決定後記入決策登記，用括號內的建議 ID。沒有決定的題目，對應的包不得開工（規則 17）。

| 題 | 問題 | 建議選項 | 擋住的包 |
| --- | --- | --- | --- |
| Q1 | braces 例外 10-17 到期怎麼處理（`AUDIT-BRACES-2026-10-05`） | **A（建議）延長到 2026-11-30**，並把理由改成「上游沒有修補版；出現任一修補版或 firebase-tools 不再依賴 chokidar 3 即移除」；B 用 override 把 firebase-tools 的 chokidar 換成 4（可能弄壞 emulator）；C 移除 firebase-tools 開發依賴改用 `pnpm dlx`（改動大） | W0-01 |
| Q2 | 隱私頁要如實寫出「專用預約日曆標題含姓名、電話、生日月日、備註」（`AUDIT-CAL-NOTICE-2026-10-05`） | **A（建議）照 `CALENDAR-TITLE-FORMAT-2026-09-29` 維持標題格式，核准 W3-06 草擬的告知句**；B 改回不含個資的最小標題（要改程式與 ADR） | W3-06、W1-03 第 3 步 |
| Q3 | 業主個資已在公開 repo 歷史裡 | **A（建議）先只改現行檔案（W1-01）**，歷史不動；B 另行改寫歷史＋force-push（破壞性，業主親自執行） | W1-01 只做 A |
| Q4 | `firebase.json` 的 OAuth 支援信箱 | **A（建議）業主提供一個角色信箱（非個人）**再換；B 維持現狀並在文件註記理由 | W1-01 第 4 步 |
| Q5 | API 對外入口與「客戶端 IP」的信任方式（B-03） | **A（建議，測試期）保留 Firebase Hosting，安全控制不依賴 IP**（回診限流改綁電話；IP 只當第一層）；B 加外部負載平衡器＋Cloud Armor（有費用、改基礎設施） | W3-04 |
| Q6 | 匿名預約遇到身分衝突怎麼回（K2） | **A（建議）匿名一律不拿已驗證病患身分；回診必須先過回診查詢；衝突不回 409，改建「待櫃台確認」並回與成功同形的結果；建檔與佔位放同一交易**；B 只做「同一交易」與「回診必須有查詢憑證」，衝突仍回 409 | W3-03 |
| Q7 | 回診查詢與限流改用伺服器金鑰（HMAC），需在 C1 新增一個 secret 並遷移索引（D-08／K1） | **A（建議）核准原始碼先做**；secret 建立與索引遷移併入下次 C1 部署清單，由業主執行 | W3-01、W3-02 |
| Q8 | CI 服務帳號權限與 GitHub 身分聯盟（B-01／B-02） | **A（建議）目前沒有 workflow 使用 → 綁定先關（count=0），拿掉無條件 `projectIamAdmin`**；apply 併入下次部署 | W3-05 |
| Q9 | cal-pilot 長期服務帳號金鑰（B-09） | **A（建議）改無金鑰身分後，由業主刪除舊金鑰**；B 暫留但限縮角色 | W3-08 |

## 3. 執行順序

- **Wave 0（期限驅動，先做）：** W0-01、W0-02。
- **Wave 1（只改文件／腳本，不需決定，Luna 最適合）：** W1-01～W1-08，可任意順序，一次一包。
- **Wave 2（程式修正，規格已定，不需決定）：** W2-01～W2-14。標「等 #238」的排在 #238 合併後。
- **Wave 3（需決定或難度高；建議 Claude 做，Luna 只在業主指定時做）：** W3-01～W3-09。
- **Wave 4（低嚴重度 backlog）：** 附錄 A 的「W4」列，等前三波完成再拆包。
- **收尾：** Z-01。

| 包 | 內容 | 稽核 ID | 執行者 | 前置 |
| --- | --- | --- | --- | --- |
| W0-01 | braces 例外處理 | B-48、E1-08（到期部分） | Luna | Q1；**10-16 前合併** |
| W0-02 | firebase-tools 升到 ≥15.31.0 | E4-08（SCM-R04） | Luna | 10-09 前 |
| W1-01 | 公開文件個資改成角色 | E3-01、E4-10、B-21 | Luna | Q3=A；第 4 步需 Q4 |
| W1-02 | P1-09 誤判 PASS 加更正 | E4-01（文件）、E4-12 | Luna | — |
| W1-03 | 隱私草稿與現況對齊 | E3-02 | Luna | 第 3 步需 Q2 |
| W1-04 | README 與實作對齊 | C05、B-12 | Luna | — |
| W1-05 | runbook 移除不存在的維護模式步驟 | E3-07 | Luna | — |
| W1-06 | 已移除欄位／舊 session 時效的文件漂移 | E3-04、E3-06、D-38、E3-19 | Luna | — |
| W1-07 | PowerShell 腳本外部指令失敗要停 | E1-01、E1-02、E1-11 | Luna | — |
| W1-08 | 金鑰目錄忽略清單 | B-55、B-31、B-13 | Luna | — |
| W2-01 | 班表發布狀態清單補 `arrived` | D-07（核心）、D-42 | Luna | — |
| W2-02 | 非法路徑 ID 改回 400 | A01、A11 | Luna | — |
| W2-03 | 全域錯誤過濾器搬到根模組 | K5 | Luna | — |
| W2-04 | 日曆 409 後補 `status`、已清除事件重建 | D-01、D-02、D-03 | Luna | — |
| W2-05 | 營運健康檢查不再假綠 | A12、D-25 | Luna | — |
| W2-06 | 告警過濾器對準真實日誌 | B-06、B-07、B-54 | Luna | — |
| W2-07 | TTL 欄位改 Timestamp、限流文件 ID 固定長度 | A05、K4、B-04、B-52 | Luna | — |
| W2-08 | 清單截斷要提示 | K7、C07 | Luna | 等 #238 |
| W2-09 | 前端 API 失敗不再當成沒資料 | C04、X-C01、X-C02 | Luna | 等 #238 |
| W2-10 | 伺服器模式工作臺文案與登入者 | C01、C02 | Luna | W2-09 |
| W2-11 | 日曆試行租約與批次 | D-05、D-12 | Luna | — |
| W2-12 | 商務匯出改交易外分頁 | A09 | Luna | — |
| W2-13 | CI 加跑 Terraform 測試 | B-05、B-41 | Luna | — |
| W2-14 | 前端小修（按鈕恢復、週曆錨、預覽主機、殘留鍵） | X-C04～X-C07 | Luna | 等 #238 |
| W3-01 | 回診限流改「只綁電話」的金鑰桶 | K1 | Claude（建議） | Q7 |
| W3-02 | 回診索引改 HMAC 並遷移 | D-08 | Claude | Q7、W3-01 |
| W3-03 | 匿名 intake 不給已驗證身分 | K2 | Claude | Q6、等 #238 |
| W3-04 | 客戶端 IP 信任與 IPv6 聚合 | B-03（程式）、K6 | Claude | Q5、需 C1 實測 |
| W3-05 | CI 服務帳號與身分聯盟（只改原始碼） | B-01、B-02、B-41 | Luna | Q8 |
| W3-06 | 隱私頁與 11 份文件的日曆告知 | E3-03 | Luna | Q2 |
| W3-07 | 時段查詢與發布交易加上限、過去未結預約 | A02、D-07（過去預約部分） | Claude | W2-01 |
| W3-08 | cal-pilot 改無金鑰身分 | B-09、E1-12 | Claude | Q9 |
| W3-09 | AUD-01 公開狀態與負責人登記 | E4-03 | Luna | #238 合併 |
| Z-01 | 收尾交接紀錄 | 全部 | Luna | 前面各包 |

---

## 4. 工作包

> 每包格式：**先確認 → 要改的檔案 → 步驟 → 測試／驗收 → 停止條件**。回退一律是 revert 該包 PR（都沒有資料遷移，W3-02 除外）。

### W0-01 braces 例外（B-48）— 需 Q1，10-16 前合併

- **先確認：** `sed -n 1,40p security/audit-exceptions.json` 看到 braces（GHSA-vfj7-8cjw-p6xm）`expiresOn: 2026-10-17`；
  `grep -n "braces@3" pnpm-lock.yaml` 仍是 3.0.3。若已有 braces 修補版 → 改走「override 到修補版並刪例外」，PR 寫明。
- **要改：** `security/audit-exceptions.json`、`docs/state/current.*`（產生）、決策登記（Q1 決定條目，若業主尚未寫入）。
- **步驟（Q1=A）：** `expiresOn` 改 `2026-11-30`；`reason` 刪掉「first patched 3.0.4」的說法，改為上游無修補版；
  `releaseCondition` 改為「任一修補版發布，或 firebase-tools 不再依賴 chokidar 3」。跑規則 18 的治理產生器。
- **測試：** `corepack pnpm run check:supply-chain` PASS；用 checker 的假時間環境變數（看
  `scripts/check-audit-exceptions.mjs` 頂端說明）確認 `2026-10-18T00:01Z` 時 PASS、`2026-12-01T00:01Z` 時 FAIL。
- **停止：** Q1 不是 A；checker 沒有假時間機制（回報，不要自己加）。

### W0-02 firebase-tools 升級（E4-08／SCM-R04）— 10-09 前

- **先確認：** `grep -n '"firebase-tools"' package.json`（目前 `^15.25.0`）；讀
  `docs/reviews/2026-09-10-scm-r04-upgrade.md` 的關閉條件。
- **要改：** `package.json`、`pnpm-lock.yaml`、`docs/state/current.*`、新 `docs/reviews/2026-10-0X-scm-r04-firebase-tools.md`（登記 README）。
- **步驟：** `corepack pnpm up -D firebase-tools@^15.31.0`；`corepack pnpm audit --audit-level high`；記錄剩下的告警（braces 會留著，屬 W0-01）。
- **測試：** `test:rules`（emulator）、`check:supply-chain`、`corepack pnpm exec firebase --version`。
- **停止：** emulator 測試因升級失敗；lockfile 連帶升了其他直接依賴的 major。

### W1-01 公開文件裡的業主個資改成角色（E3-01／E4-10／B-21）— Q3=A

- **先確認：** `sed -n 185,200p docs/security/technical-security-decision-draft-2026-08-23.md`；
  `sed -n 1070,1078p docs/product/phase-1-decision-register.md`。
  再用 `git grep -nE '[A-Za-z0-9._%+-]+@gmail\.com|09[0-9]{8}' -- docs README.md firebase.json`
  列出所有候選，**排除** `0900000xxx` 合成號碼與明確標示的範例。
- **要改：** 只有上面搜尋到、確實是真人聯絡方式的文件行。
- **步驟：** 1) 每一處改成角色（「業主指定告警收件人」「技術負責人」「診所負責人」）；
  2) 該決策草稿 `:196-197` 的提醒保留；3) 新增 `scripts/check-docs-links.mjs` 的規則或獨立小檢查，
  拒絕 `docs/` 出現 gmail／個人手機樣式（測試假資料以 `0900000` 開頭放行），並加對應 `.test.mjs`；
  4) `firebase.json` 的 `supportEmail`：**只在 Q4 已決定且業主提供角色信箱時才改**，否則不動並在 PR 寫明。
- **測試：** 新檢查注入一筆假 gmail 會紅、移除後綠；`node scripts/check-docs-links.mjs`。
- **停止：** 找到的個資出現在 `docs/` 以外的程式或測試；需要改寫歷史（Q3=B 由業主另行處理）。

### W1-02 P1-09 文件更正（E4-01 文件部分、E4-12）

- **先確認：** `sed -n 80,105p docs/reviews/2026-09-26-p1-09-handoff.md`；`sed -n 10,20p docs/reviews/2026-09-28-p1-09-closeout.md`。
- **要改：** 上述兩檔（只在檔頭加「2026-10-05 更正」段落；**不改寫**原有表格內容，日期紀錄要保留原貌）。
- **步驟：** 更正段寫明：`security_rate_limit`、`security_anti_enumeration`、P09-11 改判 **PARTIAL**——
  既有測試只驗「同一組電話＋生日重複失敗會鎖」，未驗「固定電話、換生日」；修正在本計畫 W3-01；
  handoff `:102`「已以查詢身分限流緩解」一句同樣不成立。
- **測試：** `node scripts/check-docs-links.mjs`；`npx prettier --check` 兩檔。
- **停止：** 無。

### W1-03 隱私權政策草稿與現況對齊（E3-02）

- **先確認：** `sed -n 10,40p docs/legal/privacy-policy-draft.md` 對照 `sed -n 100,160p apps/web/public/privacy.html`。
- **要改：** `docs/legal/privacy-policy-draft.md`。
- **步驟：** 1) `:13` 蒐集欄位改成與 `privacy.html` 相同（生日只收月日、不收證件／健保卡意向／來源／介紹人），
  依 `BOOKING-MINIMIZATION-2026-09-22`；2) `:38` 改成描述 C1 內部測試已部署的 Google 登入＋TOTP＋伺服器 session
  與角色控制，並寫明「production 尚未核准」；3) `:24`（日曆）**等 Q2**：Q2 未決定就不動並在 PR 寫明；
  4) 檔頭加「最後與實作對齊日期 2026-10-0X、對應決策 ID」。不寫法律結論。
- **測試：** 文件 gate；PR 附兩份文件「蒐集類別」的對照表。
- **停止：** 需要新增 `privacy.html` 沒有的對外承諾。

### W1-04 README 對齊（C05、B-12）

- **先確認：** `sed -n 1,20p apps/web/README.md`；`grep -n "年份選填\|身分證\|護照\|不呼叫任何網路" README.md apps/web/README.md`。
- **要改：** `apps/web/README.md`、根目錄 `README.md`。
- **步驟：** 欄位清單改成最小化後的欄位；新增「兩種模式」段（本機原型 localStorage／伺服器模式經 `internal-test-booking-transport.js` 呼叫 `/v1/*`，由內部測試閘門與 `?internalTestBooking=1` 控制）。
- **測試：** 文件 gate；搜尋上述三個字串為 0。
- **停止：** 無。

### W1-05 runbook 的維護模式步驟（E3-07）

- **先確認：** `git grep -n "維護模式\|maintenance" docs/runbooks/backup-and-restore.md docs/runbooks/incident-response.md docs/runbooks/stage-e-operational.md`；
  `git grep -n "StaticMaintenanceGate" apps/api/src | grep -v test`（預期只有定義、沒有路由使用）。
- **要改：** 上述三份 runbook。
- **步驟：** 把「開啟維護模式」改成「目前程式沒有維護模式；止血改用部署 packet 的『切到預約關閉版本』步驟」，並連到
  [C1 部署 packet](2026-10-01-c1-batch-deployment-packet.md)；`stage-e-operational.md` 補一句「operational 健康端點只作輔助，以告警為準」。
- **停止：** 發現維護模式其實已接路由（回報）。

### W1-06 文件漂移批次（E3-04、E3-06、D-38、E3-19）

- **先確認：** `git grep -n "nationalId\|passportNumber\|hasNhiCard\|sourceTags\|referrerName" docs | grep -v "已移除\|historical"`；
  `git grep -nE "30 ?分鐘閒置|8 ?小時|8h" docs`。
- **要改：** 搜尋到、且屬「現行」說明的文件（日期化 review 紀錄不改，只在 README 索引不需動）。
- **步驟：** 已移除欄位改寫或加「歷史（2026-09-22 起停收）」標註；session 改為「絕對 12 小時、無閒置登出、敏感操作 10 分鐘再驗證」（`STAFF-SESSION-12H-2026-10-03`）；限流文件補「單一身分 10 次／15 分」那個桶（E3-19）。
- **測試：** 文件 gate；`node scripts/check-web-ui.mjs` 仍綠。
- **停止：** 需要改 `docs/reviews/` 底下的日期紀錄本文。

### W1-07 PowerShell 外部指令失敗要停（E1-01、E1-02、E1-11）

- **先確認：** `sed -n 1,30p scripts/cal-pilot-rollback.ps1`；`git grep -ln "gcloud\|firebase \|node " -- 'scripts/*.ps1'`。
- **要改：** 列出的每支 `.ps1`、新測試 `scripts/powershell-native-errors.test.mjs`。
- **步驟：** 1) 每支檔第一行加 `#Requires -Version 7.4`；2) `$ErrorActionPreference = 'Stop'` 後加
  `$PSNativeCommandUseErrorActionPreference = $true`；3) rollback 腳本加 `Invoke-Native` 小函式（每步後檢查
  `$LASTEXITCODE`，非 0 就 `throw "<步驟> failed (exit N)"`），第 18、20、21、22、24 行包起來；4) 最後的完成訊息改成逐步列結果，任何一步失敗就印「回滾未完成，已完成：…，請手動完成：…」並以非 0 結束。
- **測試：** 新 `.test.mjs` 靜態檢查：`scripts/*.ps1` 只要呼叫 gcloud／node／firebase／terraform，就必須同時含 `#Requires -Version 7.4` 與 `PSNativeCommandUseErrorActionPreference`；把它加進既有 `check:governance` 或 test glob（看 `package.json` 的 `test:unit` 範圍）。有 `pwsh` 的話另跑一次：PATH 前面放回傳 1 的假 `gcloud`，rollback 結束碼非 0、輸出不含 `Rollback complete`。
- **停止：** 某支腳本依賴「外部指令失敗也繼續」（回報那一行）。

### W1-08 金鑰目錄忽略清單（B-55、B-31、B-13）

- **要改：** `.gitignore`（加 `cal-pilot-keys/`）、`.gcloudignore`（加 `*.pem`、`*.key`、`**/*service-account*.json`、`.env*`）、`.claude/settings.json` 的 `permissions.deny`（加 `Read(cal-pilot-keys/**)`、`Read(.env.*)`）。
- **測試：** `git check-ignore -v cal-pilot-keys/x.json` 命中；`node scripts/check-tracked-secrets.mjs` PASS。
- **停止：** `.claude/settings.json` 有守衛測試釘住內容（照測試一起改，改不動就停）。

### W2-01 班表發布狀態清單補 `arrived`（D-07 核心、D-42）

- **先確認：** `git grep -n "OPEN_APPOINTMENT_STATUSES" packages apps`（預期 `packages/domain/src/schedule.ts:155,473`、
  `apps/api/src/firestore/schedule.repository.ts:28,78`、`apps/web/public/vendor/domain/schedule.js:64,281`）；
  權威定義 `packages/domain/src/appointment-rules.ts:28` 的 `OPEN_STATUSES` 含 `arrived`。
- **要改：** `packages/domain/src/schedule.ts`、`packages/domain/src/schedule.test.ts`、
  `apps/api/src/firestore/schedule.repository.ts`、`apps/web/public/vendor/domain/*`（sync 產生）、
  `tests/firestore/` 下既有的排班發布 emulator 測試（用 `git grep -ln "SCHEDULE_ORPHANS_APPOINTMENTS" tests/firestore` 找）。
- **步驟：** 1) `schedule.ts` 刪私有常數，`import { OPEN_STATUSES } from './appointment-rules.js'`，`scheduleImpact` 改用它；
  2) API repository 刪複製常數，從 `@beauessence/domain` 匯入 `OPEN_STATUSES`，`.where('status','in', [...OPEN_STATUSES])`；
  3) `sync:domain`。**不處理**「過去未結預約擋發布」（屬 W3-07）。
- **測試：** domain：`arrived` 預約的時段被移除 → `SCHEDULE_ORPHANS_APPOINTMENTS`；emulator：API 發布交易讀到 `arrived` 並拒絕；
  `git grep -n "OPEN_APPOINTMENT_STATUSES" packages apps` 為 0；`node scripts/sync-domain-vendor.mjs --check` PASS。
- **停止：** 既有測試依賴「arrived 不算佔用」（回報測試名）。

### W2-02 非法路徑 ID 改回 400（A01、A11）

- **先確認：** `sed -n 50,62p apps/api/src/appointments/appointment.controller.ts`；`sed -n 30,40p apps/api/src/calendar/calendar-pilot.controller.ts`；
  `git grep -n "throw new Error(" apps/api/src --include=*.controller.ts`。
- **要改：** 兩個 controller、新共用 `apps/api/src/platform/http/opaque-identifier.ts`（＋`.test.ts`）、兩個 controller 的測試。
- **步驟：** 共用函式驗證 `^[A-Za-z0-9_-]{1,128}$`，不合格 `throw new DomainError('INVALID_VALUE', 'Invalid opaque identifier.')`（對外映射為 400 `VALIDATION_FAILED`，見 `apps/api/src/platform/errors/api-error.ts`）；兩個 controller 的 `identifier()` 改呼叫它。
- **測試：** 每個呼叫點一個參數化案例：非法 ID → 400 `VALIDATION_FAILED`；`InMemoryApiMetrics` 的 5xx 計數不增加。
- **停止：** 搜尋到其他 controller 也有同樣寫法 → 一起改並在 PR 列出（同一類，不算越界）。

### W2-03 全域錯誤過濾器搬到根模組（K5）

- **先確認：** `sed -n 110,120p apps/api/src/calendar/calendar-pilot.module.ts`；`sed -n 15,26p apps/api/src/app.module.ts`。
- **要改：** 上述兩檔、`apps/api/src/app.module.test.ts`（沒有就新增）。
- **步驟：** `{ provide: APP_FILTER, useClass: ApiExceptionFilter }` 從 CalendarPilotModule 移到 AppModule 的 providers；確認全專案只剩一處註冊。
- **測試：** 只 import 內部測試預約模組（不含 CalendarPilotModule）時，壞 body → 400 `VALIDATION_FAILED`。
- **停止：** 移動後既有 e2e／unit 出現重複過濾或順序差異。

### W2-04 日曆 409 後補 `status`、已清除事件重建（D-01、D-02、D-03）

- **先確認：** `sed -n 575,620p apps/worker/src/google-calendar.ts`；`sed -n 20,36p packages/domain/src/calendar-projection.ts`；
  `sed -n 205,225p apps/worker/src/calendar-sync/google-sync-client.ts`；`git grep -n "smoke-test" apps/worker/src/calendar-smoke.ts`。
- **要改：** 上述 4 檔與各自測試；`apps/web/public/vendor/domain/*`（若改了 domain）。
- **步驟：** 1) 允許欄位清單加 `status`，upsert 輸出 `status: 'confirmed'`；2) 抽共用函式 `reconcileExistingEvent()`：insert 回 409 → 先 GET；
  cancelled → PATCH 帶 `status:'confirmed'`；404／410 → 用新事件 ID insert 並回傳新 ID 給呼叫端更新對應；3) 寫入後讀回 status 不是 confirmed → 丟錯讓 outbox 重試；
  4) 正式 outbox 與試行還原都用這個函式；5) smoke 改每次 `randomUUID()` 並 GET 驗證。
- **測試：** 409＋cancelled、409＋410、更新後仍 cancelled 應失敗；兩條路徑都呼叫共用函式。
- **停止：** 「用新 ID 重建」需要改 Firestore 對應欄位但找不到寫入點（回報）。

### W2-05 營運健康檢查不再假綠（A12、D-25）

- **先確認：** `sed -n 10,40p apps/api/src/platform/runtime/operational-health.ts`；`sed -n 250,330p packages/domain/src/observability.ts`；`sed -n 40,56p apps/api/src/health/health.controller.ts`（路徑以 `git grep -n "operational" apps/api/src --include=*.controller.ts` 為準）。
- **要改：** 上述檔與測試。
- **步驟：** 1) 沒有真實探針的欄位改為 `not_probed`（型別加這個值）；2) `evaluateOperationalHealth` 遇 `not_probed` 回 `degraded`，不得回 `healthy`；3) 未認證回應**拿掉** `bookingGateEnabled`；4) 不接新探針（另包）。
- **測試：** 預設探針 → 狀態不是 healthy；未認證回應沒有閘門欄位；有真實值時行為不變。
- **停止：** runbook 或監控以「healthy」為唯一判斷（同 PR 只改文件一句，見 W1-05）。

### W2-06 告警過濾器對準真實日誌（B-06、B-07、B-54）— 只改原始碼，不 apply

- **先確認：** `sed -n 40,85p infra/terraform/wp-b4-alerting/main.tf`；`grep -n "CreateBackup" infra/monitoring/wp-b4-alert-policies.json`；
  `grep -n "SLOT_UNAVAILABLE" apps/api/src/platform/errors/api-error.ts`；找 `ApiExceptionFilter` 寫 `operation` 的地方。
- **要改：** `ApiExceptionFilter`（日誌**另加** `httpMethod`，不改 `operation`）、`wp-b4-alerting/main.tf`、`infra/monitoring/wp-b4-alert-policies.json`、
  booking repository 的 catch（Firestore `ABORTED`／`DEADLINE_EXCEEDED` 另記 `operation:"booking_transaction"`、`firestoreCode`）、
  新 `infra/terraform/wp-b4-alerting/filters.tftest.hcl` 或 node 測試、`wp-b4-alerting/README.md`。
- **步驟：** 預約寫入告警改 `operation="v1_bookings" AND httpMethod="POST" AND result="error" AND errorCode!="SERVICE_UNAVAILABLE"`；交易告警改看 `booking_transaction`；刪掉 `=~ CreateBackup` 那條；備份告警改「最新備份超過 26 小時」的自訂指標（本包只在 TF 宣告指標名稱與註解「待 ListBackups 探針」，探針另包）；JSON 改由 TF 為準，加一支比對腳本或測試讓兩者不一致時 CI 紅。
- **測試：** 每條 filter 對一份**合成**日誌樣本（放 `infra/terraform/wp-b4-alerting/fixtures/`）做命中／不命中斷言。
- **停止：** 需要真的 apply 才能驗證（寫 NOT_RUN，留給部署）。

### W2-07 TTL 改 Timestamp、限流文件 ID 固定長度（A05、K4、B-04、B-52）

- **先確認：** `sed -n 360,380p apps/api/src/patients/patient-directory.ts`；`sed -n 1,60p apps/api/src/firestore/rate-limit.repository.ts`；
  `sed -n 40,60p infra/terraform/c5-firestore/main.tf`；`grep -n fieldOverrides firestore.indexes.json`。
- **要改：** 上述檔與測試、`tests/firestore/` 對應測試。
- **步驟：** 1) `returnSessions` 加寫 `expireAt: Timestamp.fromMillis(...)`（保留原字串欄位讀取相容）；2) 限流文件 ID 改 `sha256(key)` 64 字元 hex，並寫 `expireAt`；爭用回 503 時帶 `Retry-After`；3) `c5-firestore` 為 `returnSessions.expireAt`、`rate_limit_state.expireAt` 加 `google_firestore_field`＋`ttl_config`；4) `firestore.indexes.json` 的 `fieldOverrides` 同步宣告這兩個加既有 `bd_export_chunks.purgeAt`；5) 加比對測試：TF 的 TTL 欄位集合＝`fieldOverrides` 的 TTL 欄位集合。
- **測試：** emulator `expireAt instanceof Timestamp`；兩個前 128 字元相同的長 key 得到不同文件 ID；比對測試注入不一致會紅。
- **停止：** 現有限流文件在 C1 需要遷移（新 ID 不讀舊文件是可接受的，寫進 PR；不要寫遷移腳本）。

### W2-08 清單截斷要提示（K7、C07）— 等 #238

- **要改：** `apps/api/src/appointments/appointment.application-service.ts`（約 `:432,:444` 的 50 筆上限）、contracts 回應 schema 加選用 `truncated: boolean`、`apps/web/public/modules/admin-bootstrap.js`（約 `:618`「共 N 筆」）、對應測試。
- **步驟：** API 多讀 1 筆判斷是否超過 50，回 `truncated: true`；工作臺在截斷時顯示「只顯示前 50 筆，請縮小日期範圍」。不做 cursor 分頁（W4）。
- **測試：** API 51 筆 → `truncated:true`；e2e stub 截斷回應 → 出現提示。`check:perf` 不得超預算。
- **停止：** 工作臺預算不夠（回報差多少 bytes）。

### W2-09 前端 API 失敗不再當成沒資料（C04、X-C01、X-C02）— 等 #238

- **先確認（#238 合併後）：** `grep -n "catch" apps/web/public/modules/internal-test-booking-transport.js`；`sed -n 1405,1435p apps/web/public/patient-app.js`；
  `sed -n 1,8p apps/web/public/calendar-pilot-entry.js`；`sed -n 1,30p apps/web/public/modules/hydrate-staff.js`。
- **要改：** transport、`patient-app.js`、`calendar-pilot-entry.js`（public 與 src 兩處，以實際存在為準）、`hydrate-staff.js`、
  `apps/web/src/internal-test-booking-transport.test.ts`、`tests/e2e/internal-test-booking.spec.ts`。
- **步驟：** 1) `/v1/bookings` 失敗不再回空陣列；`/v1/schedule` 只有 404 當「尚未發布」；外層 catch 改丟分類過的錯誤（沿用 `api-client.js` 的狀態碼分類）；
  2) 病患頁區分「真的沒時段」與「載入失敗」（後者文案：「暫時無法載入時段，請稍後再試或來電」），失敗時不顯示綠色「已載入」；
  3) 有快取 CSRF 時先打輕量 session 檢查，成功才進工作臺；任何 `/v1` 回 401 → 呼叫 `clearCalendarPilotClientAuthState(sessionStorage)` 並回登入畫面顯示「登入已過期，請重新登入」；
  4) 改 e2e：`closed` 情境 stub `/v1/slots` 回 `{ slots: [] }`，另加 503 情境。
- **測試：** transport 單元：503 → reject；e2e：503 時 `#status` 為錯誤樣式且不含「已載入診所發布的門診時段」；401 → 回登入且 `calPilotCsrf` 被清。
- **停止：** 預算超過；#238 已改了同一段而寫法衝突（回報，不要硬合）。

### W2-10 伺服器模式工作臺文案與登入者（C01、C02）— W2-09 之後

- **要改：** `apps/web/public/admin-bootstrap.js`（約 `:2276`）、`apps/web/public/index.html`（約 `:261-265` 安全清單）、`hydrate-staff.js`、測試。
- **步驟：** 伺服器模式（有 `calPilotCsrf`）改顯示「資料會寫入診所測試資料庫並同步日曆」，抽成常數 `STAFF_API_STORAGE_NOTICE`；清單改由 JS 依模式填；伺服器模式的顯示身分改用伺服器回傳的登入者（現有 session 回應），不再拿本機合成帳號。
- **測試：** e2e：伺服器模式不含「只保存在這台裝置」；`hydrate-staff` 單元：有 CSRF 時 `session.account.id` 不等於任何本機帳號 id。
- **停止：** 現有 session 回應沒有登入者名稱（需要新 API → 回報）。

### W2-11 日曆試行租約與批次（D-05、D-12）

- **要改：** `apps/worker/src/calendar-sync/calendar-pilot-runtime.ts`（`run(now)` 約 `:761-830`；來源切換約 `:666-690`）與測試。
- **步驟：** 每次寫入前重取時間；每處理一筆前用交易確認租約仍屬自己並續租；來源切換的未來預約查詢加 `limit(JOB_BATCH_SIZE)`＋游標，分批處理、每批檢查租約。
- **測試：** 注入假時鐘讓一輪超過租約長度：完成時間接近真實現在、租約被別人取走後原擁有者結算失敗；大量未來預約分批完成不重複寫、不漏刪。
- **停止：** 需要改 outbox 的 generation／lease 協定（回報）。

### W2-12 商務匯出改交易外分頁（A09）

- **要改：** `apps/api/src/firestore/business-delivery-export.repository.ts`（約 `:153,:161,:175`）與 emulator 測試。
- **步驟：** 交易只讀寫 job 文件（冪等）；預約與病患改交易外分頁讀（每頁 500，`startAfter`）；超過上限回 400 `VALIDATION_FAILED`。
- **測試：** emulator 灌合成 1,000 筆（不要 5,000，本機太慢）匯出成功；超限 → 400。
- **停止：** 匯出內容需要「同一時間點快照」的一致性保證（ADR-0009 有寫的話照它，沒寫就回報）。

### W2-13 CI 加跑 Terraform 測試（B-05、B-41）

- **要改：** `.github/workflows/verify.yml`（新 job 或既有 job 加步驟：每個 `infra/terraform/*` 跑 `fmt -check`、`init -backend=false`、`validate`、`test`），`Verification evidence` 的必要 job 清單要同步（看 workflow 內 evidence job 的 needs）。
- **步驟：** Terraform 版本照 repo 既有 `.terraform-version` 或 `versions.tf`；Action 要 SHA pin（照現有寫法）。B-41：在 `c1-internal-test-run` 的 tftest 加斷言（ingress 值、`allUsers` invoker 存在與否要被明確斷言）。
- **測試：** PR 的 CI 跑出新 job 且 PASS。
- **停止：** 某目錄的 test 需要雲端憑證才能跑（只跑 validate，回報）。

### W2-14 前端小修（X-C04～X-C07）— 等 #238

- **要改：** `apps/web/src/calendar-pilot-entry.js`（按鈕失敗後 `finally` 恢復，約 `:503-518,:759-775,:826-844`）、`admin-bootstrap.js:258-265`（週曆預設錨改 `taipeiTodayDate()`）、`api-client.js:288-311`（預覽主機判斷改前綴比對）、`itrs` 這個 sessionStorage 鍵在完成預約／重新開始／401 時移除。
- **測試：** 各一個單元或 e2e 案例。
- **停止：** 預算超過。

### W3-01 回診限流改「只綁電話」的金鑰桶（K1）— 需 Q7，建議 Claude

- **規則（寫死）：** 新增伺服器專用 `lookupPhoneKey(phone, key)` = `'rlp3_' + HMAC-SHA256(key, 'return-v3:' + 電話數字)` 前 32 hex，放 `packages/domain/src/patient-lookup-identity.node.ts`；金鑰從環境變數 `RETURN_LOOKUP_HMAC_KEY` 讀，**沒有或少於 32 bytes → 啟動失敗**。`WpB2RateLimiter` 新增 `assertLookupAllowed(phoneKey, ip)`：在 `lookupReturn` **查資料之前**扣電話桶與 IP 桶；查無資料再 `assertLookupFailure(phoneKey, ip)`。所有桶鍵**不得**含生日。門檻沿用 `packages/domain/src/rate-limit-parameters.ts` 現值。
- **要改：** 上述 domain 檔＋測試、`wp-b2-rate-limiter.ts`＋測試、`appointment.application-service.ts`（約 `:463-475`）、`appointment.patient-flow.test.ts`（約 `:353-372`）、API 設定讀取處、`apps/api` 的 config contract。
- **測試：** 固定電話、每次換生日：在門檻次數內回 429；鎖定期間送正確生日也 429；換來源 IP 結果相同；無金鑰啟動失敗；同電話不同生日得到同一 key。
- **留給業主：** C1 secret 建立與 Cloud Run 綁定固定版本（不用 `:latest`），併入下次部署清單。

### W3-02 回診索引改 HMAC 並遷移（D-08）— Claude

`opaqueLookupIdentityV3(phone, birthDate, key)` 前綴 `rlk3_`；讀取 v3 優先、v2 相容；一次性遷移腳本從病患明文欄位重算 v3；worker 的日曆建議（`firestore-calendar-sync.repository.ts`）與保存期限 repository 同步改；遷移完成後才刪 v2。遷移在 C1 執行需業主核准。

### W3-03 匿名 intake 不給已驗證身分（K2）— 需 Q6、等 #238，Claude

依 Q6：匿名 intake 不回 `verifiedPatientId`；`follow_up` 必須有回診查詢憑證；建立病患與佔位同一交易（失敗不留病患）；衝突改建待確認並同形回應；匿名 intake 加電話金鑰日配額（用 W3-01 的 `lookupPhoneKey`）。

### W3-04 客戶端 IP 信任與 IPv6 聚合（B-03 程式、K6）— 需 Q5、需 C1 實測，Claude

`client-ip.ts` 的 `fastifyTrustProxy` 與 `deriveClientIp` 兩個都要改（只升 Fastify 不夠）；`TRUSTED_PROXY_HOPS` 不再接受「信任 N 跳」語意；解析位置以 C1 實測的 XFF 形狀為準並寫契約測試；IPv6 主桶聚合到 /64。**不採用**「Hosting 加請求標頭密鑰」或「停用 run.app」（前者做不到、後者會讓 Hosting 壞掉）。

### W3-05 CI 服務帳號與身分聯盟（B-01、B-02）— 需 Q8，只改原始碼

- **要改：** `infra/terraform/c1-foundation/main.tf`（約 `:65-97`）、`c1-foundation/README.md`、`infra/terraform/c1-internal-test-run/main.tf`（約 `:222-231`）、對應 tftest。
- **步驟（Q8=A）：** WIF 綁定 `count = 0`；`attribute_mapping` 加 `repository_id`、`repository_owner_id`、`workflow_ref`，條件改用數字 ID（以 `gh api repos/waydefu/clinic -q '.id, .owner.id'` 讀回填入）＋`refs/heads/main`；從清單拿掉無條件 `projectIamAdmin`；專案層級 `serviceAccountUser` 改成對每個 runtime SA 個別綁定。
- **測試：** tftest 斷言角色清單不含 `projectIamAdmin`／`owner`／`editor`，條件含兩個數字 ID 與 `refs/heads/main`。
- **留給業主：** apply。

### W3-06 隱私頁與文件的日曆告知（E3-03）— 需 Q2

- **要改（Q2=A）：** `apps/web/public/privacy.html`（約 `:149-155`）、`docs/legal/privacy-policy-draft.md:24`、`docs/runbooks/calendar-go-live.md:111`（改成「只含已核准欄位」的正向檢查）、`docs/security/privacy-policy-checklist.md`（補日曆標題檢項），以及這些仍寫「日曆不得含個資」的文件：`docs/legal/phase-1-privacy-approval-packet.md`、`docs/security/taiwan-privacy-legal-baseline.md`、`docs/security/data-classification-and-field-inventory-2026-07-29.md`、`docs/security/technical-security-decision-draft-2026-08-23.md`、`docs/architecture/calendar-bidirectional-sync-plan.md`、`docs/architecture/calendar-and-database-integration-plan.md`、`docs/enterprise-appointment-project-plan.md`、`docs/plans/2026-09-22-current-project-execution-packets.md`（日期化文件只加更正註記）。
- **步驟：** 告知句草稿（**業主在 PR 核准原句後才可合併**）：「診所專用的預約行事曆上，事件標題會包含您的姓名、電話、生日月日與您填寫的備註，只有獲授權的診所人員可以看到。」
- **測試：** 新增檢查：`privacy.html` 的日曆描述不得同時出現「不含您的姓名」；`check:ui`、文件 gate。
- **停止：** Q2=B（改走程式修改，交 Claude）。

### W3-07 時段查詢與發布交易加上限（A02、D-07 過去預約部分）— Claude

`listOccupiedSlots(windowStart, windowEnd)` 以 `startsAt` 範圍查詢；發布交易只讀變動日期區間；過去 slot 加 `expireAt` TTL；匿名 `GET /v1/slots` 加 30～60 秒伺服器快取；過去未結預約不擋發布，改另列清單給櫃台結案。與 W2-01 同檔，W2-01 合併後做。

### W3-08 cal-pilot 改無金鑰身分（B-09、E1-12）— 需 Q9，Claude

`infra/terraform/cal-pilot/main.tf` 改執行身分／impersonation，`roles/firebaseauth.admin` 改最小自訂角色；`scripts/cal-pilot-release.ps1` 移除 `-ReaderKeyPath`／`-WriterKeyPath`。刪除舊金鑰由業主執行。

### W3-09 AUD-01 公開狀態（E4-03）— #238 合併後

更新 `docs/reviews/2026-10-04-audit-closeout-handoff.md` 的後續狀態方式比照該檔：**不改原表**，在本計畫 Z-01 紀錄中寫 AUD-01 的新狀態、修正 PR、具名負責人（業主指定）與受控證據位置（只寫「業主保管」，不寫路徑）；註明與 K2 的關係（W3-03 另案）。

### Z-01 收尾交接紀錄

新增 `docs/reviews/2026-10-XX-audit-2026-10-05-followup-closeout.md`（用 `/handoff-record` 格式），彙整各包 PR 表、仍開放的 ID、NOT_RUN 的 runtime 驗收；登記 `docs/README.md` §7。

---

## 5. 漏網問題（本次三路複核）

> **待補：** 三路唯讀複核（API／domain、worker／web、infra／CI／docs）於 2026-10-05 進行中，
> 結果以追加 commit 寫入本節。填入前請勿把本節空白解讀為「沒有漏網問題」。

## 6. 只能業主做的事

- 決定 §2 的 Q1～Q9 並記入決策登記。
- C1 部署：HMAC secret 建立與綁定、索引遷移執行、Terraform apply（W2-06、W2-07、W3-05、W3-08）。
- 刪除 cal-pilot 舊金鑰（Q9）；改寫 git 歷史（Q3=B）。
- 隱私告知原句核准與法律審閱（Q2、W1-03、W3-06）。

## 附錄 A：稽核 ID 對照

| 稽核 ID | 包 |
| --- | --- |
| K1 | W3-01 |
| K2 | W3-03 |
| K3、K8、K9、A03、A04、A06、A07、A08、A10 | W4 |
| K4、A05、B-04、B-52 | W2-07 |
| K5 | W2-03 |
| K6 | W3-04 |
| K7、C07、E4-24 | W2-08 |
| A01、A11 | W2-02 |
| A02 | W3-07 |
| A09 | W2-12 |
| A12、D-25 | W2-05 |
| B-01、B-02 | W3-05 |
| B-03 | W3-04（程式）、Q5（入口） |
| B-05、B-41 | W2-13 |
| B-06、B-07、B-54 | W2-06 |
| B-08 | 部署後確認（留給業主） |
| B-09、E1-12 | W3-08 |
| B-10、B-11、B-14～B-20、B-22～B-30、B-32～B-39、B-42～B-46、B-49～B-51 | W4 |
| B-12 | W1-04 |
| B-13、B-31、B-55 | W1-08 |
| B-21、E3-01、E4-10 | W1-01 |
| B-48 | W0-01 |
| C01、C02 | W2-10 |
| C04、X-C01、X-C02 | W2-09 |
| C05 | W1-04 |
| C03、C06、C09、X-C03 | W4 |
| X-C04～X-C07 | W2-14 |
| D-01、D-02、D-03 | W2-04 |
| D-05、D-12 | W2-11 |
| D-07、D-42 | W2-01（核心）、W3-07（過去預約） |
| D-08 | W3-02 |
| D-09～D-11、D-14～D-17、D-21～D-24、D-27～D-37、D-39～D-41、D-43 | W4 |
| D-38、E3-04、E3-06、E3-19 | W1-06 |
| E1-01、E1-02、E1-11 | W1-07 |
| E1-03～E1-10、E1-13～E1-35、E2-01～E2-12 | W4（E1-08 的到期部分歸 W0-01） |
| E3-02 | W1-03 |
| E3-03 | W3-06 |
| E3-05、E3-08～E3-18、E3-20～E3-37 | W4 |
| E3-07 | W1-05 |
| E4-01、E4-12 | W1-02（文件）＋W3-01（程式） |
| E4-02、E4-04～E4-07、E4-09、E4-11、E4-13～E4-23、E4-25、E4-26 | W4 |
| E4-03 | W3-09 |
| E4-08 | W0-02 |
| E5-01～E5-10 | W4 |
