# 2026-10-03～04 稽核修正收尾交接紀錄

**類型：** 階段交接紀錄（[執行書 §10.4](../product/full-project-execution-book-2026-07-31.md)）。
本文件是日期化證據，不核准任何部署、apply、真實資料或 production 事項。

## 一句話

Luna L1～L7（#208～#217）合併後由 Claude 補審，並把
[2026-10-02 全專案稽核](2026-10-02-full-project-audit.md)可在 repo 內修正的項目修完合併；
另依業主決定放寬 COOP 一格、員工登入改為 12 小時、補隱私頁例外句。全部只到
source／CI 層級，C1 尚未部署這批程式，runtime 驗收全部 `NOT_RUN`。

## 交付的修訂版本

全部經 GitHub PR、由業主合併；每個 PR 在合併前的 exact head 上
`Verification evidence` 與其餘 11 個 check 皆 PASS（12/12）。合併後 main 的 verify run 如下。

| PR | 內容 | Merge commit | main verify run |
| --- | --- | --- | --- |
| #223 | busboy 弱點 override 3.2.2；braces 暫時例外 | `7cd672d` | `37095434779` success |
| #221 | COOP 改 `same-origin-allow-popups`，讓 reauth popup 可回傳 | `fc6a1ac` | `37096028990` success |
| #222 | 封存／復原／永久刪除同步重投影或刪除日曆事件（ADR-0010 第 8 條） | `97d304c` | `37096282950` success |
| #224 | 員工 session 改絕對 12 小時、不因閒置登出 | `9cc2eb2` | `37098878039` success |
| #226 | AUD-03、AUD-09：日曆審核單一交易與同鍵重放 | `d787dfe` | `37143101526` success |
| #225 | AUD-14：Terraform 必要條件改為阻擋型 validation | `4718449` | `37143597933` success |
| #227 | AUD-02、AUD-08：排班發布交易內查詢；回診預約同鍵重放 | `504b116` | `37144026214` success |
| #229 | AUD-07（部分）：建立預約交易內擋已封存病患；員工清單分頁 | `813ff46` | `37175329246` success |
| #228 | AUD-11、12、13、15；隱私頁例外句 | `b17e6fa` | `37175561779` success |
| #230 | AUD-04、05、10；手打日曆事件的病患建議改計有效病患 | `7e8d9d3` | `37179073968` success |
| #231 | #212～#214 補審五項（返還收據範圍、Terraform 文件與防刪、Stage 2a/2b、復原驗證器文件、allowlist 紀錄） | `191683f` | `37183671938` success |
| #232 | 審核狀態過期、自助改期重放、封存病患改期、員工清單時間窗、ADR-0011 收據句 | `e7be855` | `37183899761` success |
| #233 | 自助取消重放、審核第一次偵測事件的開始時間基準 | `e58e1c1` | `37199246153` success |

本文件所在的文件 PR 無法引用自己的 commit；以 `git log -- docs/reviews/2026-10-04-audit-closeout-handoff.md`
取得。

## 稽核項目對照（2026-10-02 稽核，SHA `4ccc752`）

| ID | 狀態 | 修正 PR |
| --- | --- | --- |
| AUD-01 | `OPEN`：細節依 SECURITY.md 不在 repo，未取得，未修 | — |
| AUD-02 | 已修（CONFIRMED） | #227 |
| AUD-03 | 已修（CONFIRMED） | #226 |
| AUD-04 | 已修（CONFIRMED） | #230 |
| AUD-05 | 已修（CONFIRMED） | #230 |
| AUD-06 | 已修 | #220 |
| AUD-07 | **部分**：只修本次可重現的封存競態與已封存病患改期（#229、#232）；其餘細節未取得 | #229、#232 |
| AUD-08 | 已修（CONFIRMED） | #227 |
| AUD-09 | 已修（CONFIRMED） | #226 |
| AUD-10 | 已修（CONFIRMED） | #230 |
| AUD-11 | 已修（CONFIRMED） | #228 |
| AUD-12 | 已修（CONFIRMED） | #228 |
| AUD-13 | 已修（CONFIRMED） | #228 |
| AUD-14 | 已修 | #225 |
| AUD-15 | 已修（含業主核准的隱私頁例外句） | #228 |

稽核記錄本身是日期化 snapshot，未改寫；以本表為後續狀態。

## 驗收證據

| Gate | 狀態 | 數字／依據 |
| --- | --- | --- |
| 各 PR exact-head CI | PASS | 13 個 PR 各 12/12（含 Firestore Emulator、6 個 e2e、Semgrep、Gitleaks、dependency audit、Verification evidence） |
| main verify（合併後） | PASS | 上表 13 個 run 皆 success；最終 `e58e1c1` run `37199246153` |
| 本機 `test:rules` | PASS（各 PR 自報） | 最後一次全套 31 files / 316 tests（#233，Windows） |
| 本機 `test:unit` | FAIL 1 項，非本批造成 | `scripts/basic-ftp-compatibility.test.mjs` 在 Windows 本機 ECONNRESET；Linux CI 通過 |
| C1 雲端 plan／apply／Hosting | `NOT_RUN` | 無本批 exact-SHA 部署授權；見[部署 packet](../plans/2026-10-01-c1-batch-deployment-packet.md) |
| C1 runtime／CP-08／CP-09 截圖／CP-10 簽名 | `NOT_RUN` | 需部署後由業主到場執行 |
| CP-06-E 真實還原 | `NOT_RUN` | 另需授權；最終 CURRENT_PROJECT_ACCEPTANCE 必要 |

## 稽核範圍與未覆蓋面

- 覆蓋：repository source、domain／API／worker／web、Terraform source 與 mock tests、
  Firestore Emulator、CI。
- 未覆蓋：真實 Google 登入與 popup 行為、真實 Google Calendar、C1 雲端狀態、
  任何 production。COOP 修正是否真的讓 popup 回傳，必須部署後實測。
- Claude 補審：#208、#210、#215、#216 由 Claude 審；#212～#214 由唯讀 Sonnet 審查後 Claude 抽查。

## 發現的真缺陷（不在原稽核清單）

| 缺陷 | 處理 |
| --- | --- |
| 永久刪除／封存後，含姓名電話月日的日曆事件仍留在日曆（L1 計畫漏寫） | #222 修正 |
| 全域 COOP `same-origin` 使 reauth popup 無法回傳，所有再驗證操作在 UI 做不了 | #221 修正（待部署實測） |
| 10/02 晚新公布／調升的相依弱點擋住所有 PR | #223（busboy 修補、braces 暫時例外） |
| 病患封存後同鍵新病患無法得到日曆建議 | #230 |
| 員工清單先取筆數再濾封存列、清單可能為空 | #229、#232 |
| 返還收據未記錄範圍；Terraform 文件與 packet 矛盾、Secret 無防刪；Stage 2 起點不可知；復原驗證器無文件；allowlist 無效時無紀錄 | #231 |
| 審核未判定狀態變更為過期；自助改期／取消重送被時間窗擋；首次偵測事件開始時間自比 | #232、#233 |

## 未處理事項

**需業主決定或提供：**

1. AUD-01 與 AUD-07 其餘細節：需稽核者提供，才能修。
2. `SUPPLY-CHAIN-BRACES-2026-10-03` 例外 **2026-10-17 到期**；到期前查 braces 是否有修補版，有則 override 並移除例外，無則由業主決定是否延期。
3. BD-POLICY §6「完整匯出」的判定標準；目前系統只記錄返還匯出的範圍、筆數、大小，不判斷。
4. 永久刪除後若有人持舊病患 ID 預約，目前不擋（因既有 fixture 允許無病患文件）。
5. CP-09 商務條款金額：私有文件與 repo 已核准政策不一致（金額不寫入 repo）。

**已知限制（各 PR 已註明，未修）：**

- 回診決定由「有日期」改為「需回診但未定日期」時，舊提醒不會被刪除。
- 兩個 worker 同時處理同一提醒的新舊工作仍可能競爭（需事件層序列化）。
- 沒有記錄偵測時開始時間／狀態的舊審核候選，維持舊行為（狀態部分只在開放狀態可核准）。
- `liveFrom()` 仍寫死 `version: 1`（無人比較）。
- CAL-PILOT 健康度把退避中工作算在 pending；CAL-PILOT 領取分頁未設頁數上限。
- `docs/roadmap.md` 仍有「資料不會傳到診所」的歷史敘述。

**未跑：** 所有 C1 runtime 驗收、CP-08 84 列、16 張手冊截圖、CP-10 簽名、CP-06-E。
日曆姓名清除的實測需另核 worker processing 與日曆寫入次數；永久刪除與終止返還簽收需等 30 天。

## 本機環境陷阱（Windows）

- `pnpm exec firebase emulators:exec` 會無聲卡住；改用 `corepack pnpm run test:rules`，或
  `node node_modules/firebase-tools/lib/bin/firebase.js emulators:exec ...`（`NO_UPDATE_NOTIFIER=1`）。
- 多個 worktree 共用同一個 Firestore Emulator 埠；並行時要用互斥鎖，中斷的工作會留下殘留程序與鎖。
- 這台機器最多同時跑三個代理／重型工作，再多會讓 git 與 GitHub 連線逾時。
- 新 worktree 要自行安裝相依：`corepack pnpm install --frozen-lockfile --store-dir <同槽 .pnpm-store> --config.confirmModulesPurge=false`（約 4～5 分鐘）。
- `git worktree remove` 常因長路徑刪不掉 `node_modules`；改用 PowerShell `Remove-Item -LiteralPath ... -Recurse -Force`。
- Gitleaks 會把形似 API key 的測試冪等鍵判為洩漏；沿用測試裡既有、已被允許的鍵格式。
- main 為 strict 保護：每合一個 PR，其餘 PR 要先 Update branch 並等 CI。
- 改動 `security/audit-exceptions.json` 或 `pnpm-workspace.yaml` 後要跑
  `node scripts/generate-governance-state.mjs`，否則治理檢查失敗。
- `scripts/basic-ftp-compatibility.test.mjs` 在 Windows 本機固定失敗（Linux CI 通過）。

## 記錄的決策與剩餘風險

| 決定 | 內容 | 剩餘風險 |
| --- | --- | --- |
| `COOP-POPUP-REAUTH-2026-10-03` | COOP 放寬為 `same-origin-allow-popups` | popup 是否成功須部署後實測 |
| `STAFF-SESSION-12H-2026-10-03` | 登入保留 MFA；session 絕對 12 小時、無閒置登出；敏感操作 10 分鐘再驗證不變 | 無人看管的櫃台電腦可被他人操作；靠離座鎖定補償 |
| `SUPPLY-CHAIN-BRACES-2026-10-03` | 開發工具鏈 braces high 弱點暫時例外，2026-10-17 到期 | 不出貨；到期需處理 |
| `PRIVACY-INTERNAL-TEST-NOTICE-2026-10-04` | 隱私頁與草稿加入內部測試路由例外句 | 只描述合成測試路由，不是 production 告知 |
| ADR-0010 第 8 條（#222） | 日曆投影隨保存狀態重投影或刪除 | Google 端垃圾桶保存不由本系統控制 |
| ADR-0011 收據句（#232，業主 2026-10-04 對話核准） | 收據記錄返還匯出的範圍、筆數、大小 | 不定義何謂完整匯出 |

均為業主單人在對話中決定並記入[決策登記](../product/phase-1-decision-register.md)；不是兩組審查。

## 下一位從這裡開始

1. **C1 批次部署**：依[部署 packet](../plans/2026-10-01-c1-batch-deployment-packet.md)
   Stage 1 → 2a → 2b。release SHA 為包含本文件的 main（合併後以 `git rev-parse origin/main` 取得），
   需業主填寫 exact-SHA、UTC 時窗、預約開關到期與各類操作上限後才可執行。
2. 部署後依 packet §4 到場驗收，並優先實測 reauth popup、12 小時 session、匯出、封存／復原。
3. 另核 worker processing 與日曆寫入次數後，驗證封存／刪除後日曆標題清除。
4. 2026-10-17 前處理 braces 例外。
5. 取得 AUD-01／AUD-07 細節後另開修正。

**Stage 位置：** 未改變。仍在 Phase 1 內部測試（C1 合成資料）範圍，無 production 或真實資料授權。
