# 第一階段 RC 細部包（2026-11-08）

**狀態：** PLAN-ONLY／CURRENT（2026-11-08 起算）。這份是計畫，不是核准、不是證據；所有「下一步」都尚未執行，不得引用本檔當作任何環境、IAM、部署或實測已完成的依據。
**上層：** [總計畫](2026-11-08-phase1-rc-delivery-plan.md)（目標、時程、決策、台帳）。
**機器權威：** `2026-10-06-sol00-safe-manifest.json`（`activeCloseout.executionGraph.packets`）與 [finding 清單](2026-10-06-sol00-finding-manifest.md)。本檔的骨架由腳本從這兩份產生；人工補「現況、下一步、波次、執行者、核准」。衝突時以 manifest 為準。

## 範圍與用法

- 共 **70 包**：manifest 59 包（已終態 25 包只列一行；未完成 34 包各一節）＋ RC-01～RC-11（11 包）。finding 共 254 個，全部出現在下列節次。
- 台帳口徑（#268 舊本文）把 25 個終態包記成「16 個 Phase0＋台帳已結束 9 個」；兩者在 manifest 內沒有可區分的欄位，本檔不硬分。
- 通用作法（各包「下一步」只寫該包特有的部分）：讀該包 manifest 的 requiredContext；從 origin/main 開新分支與 worktree；只改 `likelyWriteSet`；先寫 regressionTests 的正例與負例，再改程式；開 Draft PR 等 exact-head CI；Claude 驗收後合併。外部證據類：在 `beauessence-clinic-stg-c1a01` 唯讀讀回，結果存 `docs/reviews/<日期>-<主題>.md`，不含 token 或個資；寫完才可改狀態，不得提前宣稱。
- 歸屬裁定：#419 K1 屬 NO-WORK；E1-26 屬 SOL-RUNTIME-EVIDENCE；E1-05 屬 SOL-RELEASE（#308 誤列）。
- 執行者「長跑（gpt-6.1-terra）」即長跑主刀；波次定義見總計畫第三節。

## 一、已終態的包（25）

| 包 | 終態 | 證據 PR／來源 | findings |
| --- | --- | --- | --- |
| SOL-CUSTODY | NO-WORK（規劃終態） | manifest PLANNING_TERMINAL_NO_IMPLEMENTATION；歷史 claim 未標驗證 | B-24、E1-19、E1-27、E1-29、E1-33、E1-34、E1-35、E2-11、E3-18、E4-05、E4-06、E4-11、E3-21、E3-22、E3-23、E3-26、E3-27、E3-28、E3-29、E3-30、E3-33、E3-36、E3-37、E4-16、E4-17、E4-18、E4-19、E4-20、E4-22、E4-25、E4-26 |
| LUNA-E2E-INVENTORY | DONE-MERGED | #269 | E3-32 |
| LUNA-FIRESTORE-RUNNER | DONE-MERGED | #273 | E2-03 |
| SOL-READ-FAILURE | DONE-MERGED | 沿用 #268 對帳留言 6562505748 | C04、X-C01 |
| LUNA-ROBOTS-COMMENTS | DONE-MERGED | #270 | B-23、C06 |
| LUNA-WORKBENCH-START | DONE-MERGED | #271 | C01 |
| NO-WORK | NO-WORK（規劃終態） | manifest PLANNING_TERMINAL_NO_IMPLEMENTATION | B-39、B-43、A07、A10、E3-16、E3-34、E4-23、K1、B-52、X-C07 |
| SOL-ARCH-GATE | DONE-MERGED | #253、#263 | E1-09、E1-20 |
| SOL-ASSET-BUILD | DONE-MERGED | #256 | E1-32 |
| SOL-BUILD | DONE-MERGED | #260 | E1-10、E1-28 |
| SOL-BUSINESS | DONE-MERGED | 沿用 #268 對帳留言 6562505748 | D-24、D-35、E3-25 |
| SOL-CALENDAR-WATCH | DONE-MERGED | 沿用 #268 對帳留言 6562505748 | D-28、D-29 |
| SOL-CI-SECURITY | DONE-MERGED | #272 | B-27 |
| SOL-CONTAINERS | ALREADY_FIXED | #255 | B-26 |
| SOL-CONTRACTS | DONE-MERGED | 沿用 #268 對帳留言 6562505748 | B-15、B-17、B-16、B-33、B-36、B-37、D-21、D-43、E4-15 |
| SOL-DESIGN-GATE | DONE-MERGED | 沿用 #268 對帳留言 6562505748 | E1-22、E3-14 |
| SOL-DOC-GATE | DONE-MERGED | #259、#248 | E1-23 |
| SOL-HTTP | DONE-MERGED | #245 | K5、A01、A11、NEW-04 |
| SOL-LIFECYCLE | DONE-MERGED | #383 | A06、D-09、D-23、E3-15 |
| SOL-OUTBOX | DONE-MERGED | #258 | E4-21 |
| SOL-RETENTION | ALREADY_FIXED | 沿用 #268 對帳留言 6562505748 | A03、D-36 |
| SOL-SAST | ALREADY_FIXED | 沿用 #268 對帳留言 6562505748 | B-14、B-30、B-28 |
| SOL-SESSION-UI | DONE-MERGED | #245 | C03、C09、X-C04、X-C05 |
| SOL-STRUCTURE-GATE | DONE-MERGED | #254 | E1-30 |
| SOL-VISUAL-EVIDENCE | DONE-MERGED | 沿用 #268 對帳留言 6562505748 | E5-01、E5-02、E5-03、E5-04、E5-05、E5-06、E5-07、E5-08、E5-09、E5-10 |

## 二、未完成的 manifest 包（34）

依 manifest 順序。

### SOL-NOTIFICATION

1. **目的**：處理 1 個 finding（B-08）的來源回歸與必要外部證據；manifest 狀態 `PLANNED_CURRENT_EVIDENCE_SCOPE`，風險 HIGH。
2. **findings**：
   - B-08｜Medium｜Pub/Sub 通知身分與 delivery IAM 的正確性尚待 provider 確認。
3. **現況**：已合併 #384、#404、#407；還缺：真實 publisher／IAM 配對、ADR 核准、DLQ 外證。
4. **下一步**：
   1) 負責人審 `docs/plans/2026-10-30-sol-notification-design.md` 並核准或退回 ADR。
   2) 核准後在 C1 讀回 publisher 身分與 topic 綁定、DLQ 設定；依 #407 外部驗收 runsheet 執行。
   3) IAM 變更併入 SOL-IAM 的核准批次。
5. **完成標準**（manifest regressionTests；細節以 manifest 為準）：
   - `B-08` 正：Credential-free plan assertions bind the confirmed publisher identity …；負：No unrelated topic or principal receives publish access; a channel con…
6. **依賴／阻擋**：dependsOn：—；blocks：—。
7. **波次**：W2
8. **執行者**：負責人（ADR 核准）、Haiku（讀回）
9. **需負責人核准**：ADR 核准；告警通知 IAM
10. **禁止範圍**：不准production修復於本輪；Luna下一輪也不得改auth/RBAC/IAM/sharedschema/migration/共同tracking。實際construction另需fresh授權及scope lease。

### SOL-CALENDAR-CANDIDATE

1. **目的**：處理 1 個 finding（D-33）的來源回歸與必要外部證據；manifest 狀態 `PLANNED_CURRENT_EVIDENCE_SCOPE`，風險 HIGH。
2. **findings**：
   - D-33｜Low｜Calendar candidate reject 的版本守衛、SoT 恢復與審計動作需由同一決策矩陣明確驗證。
3. **現況**：已合併 #363（D-33 決策矩陣）；還缺：依賴 SOL-SCHEDULE，間接依賴 IAM、SESSION 外證。
4. **下一步**：
   1) SCHEDULE 完成後，補 D-33 候選比對的負向案例（不同病患不得被視為同一候選）。
   2) 只改 manifest 列出的 write-set。
5. **完成標準**（manifest regressionTests；細節以 manifest 為準）：
   - `D-33` 正：舊 version/已處理 candidate reject 拒絕；合法 reject 的 SoT restore/outbox/audit…；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
6. **依賴／阻擋**：dependsOn：SOL-SCHEDULE；blocks：SOL-INTEGRATION。
7. **波次**：W3
8. **執行者**：長跑（gpt-6.1-terra）
9. **需負責人核准**：無
10. **禁止範圍**：不准production修復於本輪；Luna下一輪也不得改auth/RBAC/IAM/sharedschema/migration/共同tracking。實際construction另需fresh授權及scope lease。

### SOL-CALENDAR-ENVELOPE

1. **目的**：處理 3 個 finding（D-11、D-17、NEW-09）的來源回歸與必要外部證據；manifest 狀態 `PLANNED_CURRENT_EVIDENCE_SCOPE`，風險 MEDIUM。
2. **findings**：
   - D-11｜Medium｜Calendar 單頁同步缺少本機交易容量界限並保留逐事件讀取。
   - D-17｜Low｜Calendar parse failure 計數與交易外 appointment snapshot 時序涉及兩項不同的觀測/一致性議題。
   - NEW-09｜UNKNOWN｜Calendar 單頁交易的byte/time資源envelope尚未量測，與舊D-11同根；不是已證實超限。
3. **現況**：已合併 #408（D-17 競態守護）；還缺：D-11、NEW-09 與 provider 外證；容量與 provider 行為仍 UNKNOWN。
4. **下一步**：
   1) LEASE 的 Gate 2 實測結果出來後，以實測的 provider 回應補 D-11、NEW-09 的來源回歸。
   2) 對照 `likelyWriteSet`，只補 envelope 的容量與逾時處理，不碰 LEASE 本體。
   3) 外證：在合成日曆跑 envelope 邊界（容量滿、同步中建立預約），讀回事件與 Firestore 一致。
5. **完成標準**（manifest regressionTests；細節以 manifest 為準）：
   - `D-11` 正：大頁依界限拆批，中間失敗重播不漏候選不重 audit；僅最後成功推 token，generation 變更拒絕舊批，讀取次數有界。；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `D-17` 正：malformed 合成項目使 dead-letter/統計可見；stale snapshot version/guard 拒絕，重試不重複…；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `NEW-09` 正：以合成合法/拒絕/過期/重試/並發案例測本列邊界，保留既有契約；impact與provider證據分欄。；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
6. **依賴／阻擋**：dependsOn：SOL-CALENDAR-LEASE；blocks：SOL-CALENDAR-RESTORE、SOL-CALENDAR-TESTS、SOL-INTEGRATION、SOL-PRIVACY。
7. **波次**：W2
8. **執行者**：長跑（gpt-6.1-terra）
9. **需負責人核准**：無（來源）；provider 外證需負責人開窗
10. **禁止範圍**：不准production修復於本輪；Luna下一輪也不得改auth/RBAC/IAM/sharedschema/migration/共同tracking。實際construction另需fresh授權及scope lease。

### SOL-CALENDAR-LEASE

1. **目的**：處理 2 個 finding（D-05、D-12）的來源回歸與必要外部證據；manifest 狀態 `PLANNED_CURRENT_EVIDENCE_SCOPE`，風險 MEDIUM。
2. **findings**：
   - D-05｜Medium｜同步整輪使用同一時間快照而未完整涵蓋長輪次 lease 更新。
   - D-12｜Medium｜日曆來源切換缺有界搬移與足夠 lease 容量證明。
3. **現況**：已合併 #434（Gate 2 決策）、#436–#446；還缺：真實日曆實測（Gate 2）未做；日曆設定已於 09-30 過期，續期腳本 #450 已合併但尚未執行。
4. **下一步**：
   1) 由 RC-07 承接：負責人核准後執行 `--renew-expired` 續期專用測試日曆，並讀回新到期日。
   2) 負責人登入員工端取得 session／CSRF，交 Haiku 跑 50 次正常收斂；每次記錄收斂時間與最終日曆事件數。
   3) 故障情境（503、lost-ACK、stuck owner）另列清單，不併入 50 次。
   4) 結果存成 `docs/reviews/<日期>-calendar-gate2-readback.md`（不含 token）；本包只在證據齊備後才改狀態。
5. **完成標準**（manifest regressionTests；細節以 manifest 為準）：
   - `D-05` 正：With fake clock and two emulator workers, advance past the lease durin…；負：A slow or retrying worker cannot extend an already-expired configurati…
   - `D-12` 正：大量合成未來預約切換有上限/續租/中斷恢复；失去持有權時不得跨來源寫入或重複覆蓋。；負：保留既有權限、合成資料限定、錯誤/效能/gate契約；正向通過不得令錯誤身分或未知/runtime未測狀態被當成安全成功。
6. **依賴／阻擋**：dependsOn：—；blocks：SOL-CALENDAR-ENVELOPE、SOL-INTEGRATION。
7. **波次**：W1
8. **執行者**：Haiku（實測）、負責人（登入與核准）
9. **需負責人核准**：續期執行；真實日曆寫入；LEASE 真實 runtime 接入範圍釐清（D 清單 11/12）
10. **禁止範圍**：不准production修復於本輪；Luna下一輪也不得改auth/RBAC/IAM/sharedschema/migration/共同tracking。實際construction另需fresh授權及scope lease。

### SOL-CALENDAR-RESTORE

1. **目的**：處理 5 個 finding（D-31、D-32、D-01、D-02、D-03）的來源回歸與必要外部證據；manifest 狀態 `PLANNED_CURRENT_EVIDENCE_SCOPE`，風險 HIGH。
2. **findings**：
   - D-31｜Low｜CAL-PILOT synthetic writer 把預約結束時間寫死為半小時，且以 409 視為冪等成功。
   - D-32｜Low｜CAL-PILOT 合成 fixture 固定時段及合成顯示欄位，配置需求與測試用途邊界未明。
   - D-01｜Medium｜正式 Calendar 重建遇衝突後未明確還原已取消事件的狀態。
   - D-02｜Medium｜試行 Calendar 還原也缺已取消事件狀態的明確恢復。
   - D-03｜Medium｜固定識別碼的 smoke 測試可能把既存事件衝突當成有效寫入證明。
3. **現況**：已合併 無來源 PR；還缺：整包未開工（D-01、D-02、D-03、D-31、D-32）。
4. **下一步**：
   1) 等 ENVELOPE 後開工；先逐一讀 5 個 finding 的 sourceLocations，確認哪些仍成立（manifest 有 NEEDS_RUNTIME_REPRODUCTION 者先寫重現測試）。
   2) 還原流程只做合成日曆的來源與 Emulator 回歸；不碰正式日曆。
   3) 若 W3 開不了工，整包延後 12 月並寫理由。
5. **完成標準**（manifest regressionTests；細節以 manifest 為準）：
   - `D-31` 正：核定時長後 writer duration 與 synthetic schedule 相符；409 重播成功且不重複事件；主線 adapte…；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `D-32` 正：固定 fixture 可重現；若引入測試配置，缺值 fail closed 且僅限 synthetic runner。；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `D-01` 正：A fake provider with an active matching event remains idempotent; a ca…；負：A provider 409 alone must not be reported as a confirmed active restor…
   - `D-02` 正：Fake writer scenarios cover clean insert, active conflict update, canc…；負：Do not create a second event ID, clear provider status by assumption, …
   - `D-03` 正：A fake provider confirms a unique event was inserted, read back with t…；負：A pre-seeded conflicting event is never patched/deleted as the smoke a…
6. **依賴／阻擋**：dependsOn：SOL-CALENDAR-ENVELOPE；blocks：SOL-INTEGRATION、SOL-PRIVACY。
7. **波次**：W3
8. **執行者**：長跑（gpt-6.1-terra）
9. **需負責人核准**：無（來源）；真實日曆還原演練屬 12 月
10. **禁止範圍**：不准production修復於本輪；Luna下一輪也不得改auth/RBAC/IAM/sharedschema/migration/共同tracking。實際construction另需fresh授權及scope lease。

### SOL-CALENDAR-TESTS

1. **目的**：處理 1 個 finding（D-41）的來源回歸與必要外部證據；manifest 狀態 `PLANNED_CURRENT_EVIDENCE_SCOPE`，風險 MEDIUM。
2. **findings**：
   - D-41｜Medium｜Calendar 非建檔測試以共享患者全集為空作斷言，隔離契約不足。
3. **現況**：已合併 #362（D-41）；還缺：依賴 ENVELOPE。
4. **下一步**：
   1) ENVELOPE 完成後，補 D-41 在 exact head 的測試證據（目前只找到原 head 的 CI）。
   2) 在 RC 凍結 commit 上重跑相關測試並記錄 run 連結。
5. **完成標準**（manifest regressionTests；細節以 manifest 為準）：
   - `D-41` 正：預放 unrelated 合成患者，測試前後患者集合相同；独跑/整套/反序結果一致且不得自動建檔。；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
6. **依賴／阻擋**：dependsOn：SOL-CALENDAR-ENVELOPE；blocks：SOL-INTEGRATION。
7. **波次**：W3
8. **執行者**：長跑（gpt-6.1-terra）
9. **需負責人核准**：無
10. **禁止範圍**：不准production修復於本輪；Luna下一輪也不得改auth/RBAC/IAM/sharedschema/migration/共同tracking。實際construction另需fresh授權及scope lease。

### SOL-CI-IAC

1. **目的**：處理 1 個 finding（B-05）的來源回歸與必要外部證據；manifest 狀態 `PLANNED_CURRENT_EVIDENCE_SCOPE`，風險 MEDIUM。
2. **findings**：
   - B-05｜Medium｜Terraform mock tests 未納入 required CI，IaC 斷言只能靠人工執行。
3. **現況**：無來源 PR（#378 只是 B-05 決定紀錄，非實作）；還缺：B-05 實作未開工；依賴 IAC-LIFECYCLE、IAM、SUPPLY。
4. **下一步**：
   1) 等 IAM、IAC-LIFECYCLE 後，依 #378 的決定紀錄把 CI 的 IaC 檢查補成可驗證的負向測試。
   2) 不改 workflow 的 timeout 或 gate。
5. **完成標準**（manifest regressionTests；細節以 manifest 為準）：
   - `B-05` 正：The required workflow executes the current noop/mock test suite and re…；負：A failing mock assertion fails the required aggregate; the CI command …
6. **依賴／阻擋**：dependsOn：SOL-CI-SECURITY、SOL-IAC-LIFECYCLE、SOL-IAM、SOL-SUPPLY；blocks：SOL-INTEGRATION。
7. **波次**：W3
8. **執行者**：長跑（gpt-6.1-terra）
9. **需負責人核准**：無（B-05 的受保護部分不動）
10. **禁止範圍**：不准production修復於本輪；Luna下一輪也不得改auth/RBAC/IAM/sharedschema/migration/共同tracking。實際construction另需fresh授權及scope lease。

### SOL-CLI

1. **目的**：處理 3 個 finding（E2-04、E2-05、E2-07）的來源回歸與必要外部證據；manifest 狀態 `PLANNED_CURRENT_EVIDENCE_SCOPE`，風險 MEDIUM。
2. **findings**：
   - E2-04｜Low｜CLI 探測以 POSIX PATH 分隔符和檔名存在檢查，Windows PATH/PATHEXT 可能未被正確辨識。
   - E2-05｜Low｜部分 CLI 模組以字面 file URL 比較推斷直接執行，對 Windows 路徑形式較脆弱。
   - E2-07｜Low｜舊 snapshot runner 將命令字串拆分後交 shell，參數含空白或 quoting 時容易改變執行語意。
3. **現況**：已合併 #372（E2-07，11/02 前）；還缺：依賴 CONFIG、OBSERVABILITY。
4. **下一步**：
   1) CONFIG、OBSERVABILITY 完成後，補其餘兩個 finding 的 CLI 錯誤輸出與參數驗證回歸。
5. **完成標準**（manifest regressionTests；細節以 manifest 為準）：
   - `E2-04` 正：合成 POSIX/Windows PATH delimiter、.exe/.cmd extension；報告 hasCli 正確，工具缺少與…；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `E2-05` 正：import module 不觸發 main；Windows native 路徑、相對路徑與 URL-encoded path direct…；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `E2-07` 正：以 harmless fake executable 測空格/引號/空參數及非零 exit；exec file 參數精確保留，含 shell…；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
6. **依賴／阻擋**：dependsOn：SOL-CONFIG、SOL-OBSERVABILITY；blocks：SOL-INTEGRATION。
7. **波次**：W3
8. **執行者**：長跑（gpt-6.1-terra）
9. **需負責人核准**：無
10. **禁止範圍**：不准production修復於本輪；Luna下一輪也不得改auth/RBAC/IAM/sharedschema/migration/共同tracking。實際construction另需fresh授權及scope lease。

### SOL-CONFIG

1. **目的**：處理 3 個 finding（B-45、E1-15、E2-09）的來源回歸與必要外部證據；manifest 狀態 `PLANNED_CURRENT_EVIDENCE_SCOPE`，風險 HIGH。
2. **findings**：
   - B-45｜Low｜C1 config contract 必須與 runtime env/secret consumers 做雙向覆蓋檢查。
   - E1-15｜Low｜日誌遮蔽依賴名稱正則而非契約秘密分類，存在漏接。
   - E2-09｜Low｜多個檢查/工具內固定隔離環境識別值，容易與不同範圍的 project identity 混用。
3. **現況**：已合併 #366（B-45、E1-15、E2-09）；還缺：依賴 IAC-LIFECYCLE。
4. **下一步**：
   1) IAC-LIFECYCLE 完成後，檢查環境變數清單測試是否涵蓋新增的 IaC 變數，補缺。
   2) E1-26 已裁定屬 RUNTIME-EVIDENCE，不在本包。
5. **完成標準**（manifest regressionTests；細節以 manifest 為準）：
   - `B-45` 正：靜態枚舉 env consumers 對應 requiredness/service/secret class；mandatory 缺值 f…；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `E1-15` 正：遍歷契約全部 SECRET_REFERENCE/禁止保存類別，以固定假值驗證輸出不含值；測大小寫、未知欄位及明列 non-secret。；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `E2-09` 正：合成允許/禁止/placeholder/格式錯誤值在每個入口皆有對應拒絕或接受；不得以 process env 任意改變 forbidden…；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
6. **依賴／阻擋**：dependsOn：SOL-IAC-LIFECYCLE；blocks：SOL-CLI、SOL-INTEGRATION。
7. **波次**：W3
8. **執行者**：長跑（gpt-6.1-terra）
9. **需負責人核准**：無
10. **禁止範圍**：不准production修復於本輪；Luna下一輪也不得改auth/RBAC/IAM/sharedschema/migration/共同tracking。實際construction另需fresh授權及scope lease。

### SOL-DOCS

1. **目的**：處理 7 個 finding（B-46、D-39、E3-13、E3-31、B-12、C05、E3-04）的來源回歸與必要外部證據；manifest 狀態 `PLANNED_CURRENT_EVIDENCE_SCOPE`，風險 MEDIUM。
2. **findings**：
   - B-46｜Low｜C6 README 所稱 controller unrouted 須區分 source module mount 與 C6 resource…
   - D-39｜Low｜decision register 與多份產品文件保留較早的 session/Calendar 敘述，需辨識為歷史或與現行決策矛盾。
   - E3-13｜Medium｜架構計畫仍把早期無後端前提描述為現況而未限定歷史範圍。
   - E3-31｜Low｜整合計畫現況數值與權限文字未標早期快照邊界。
   - B-12｜Medium｜README 描述的儲存/欄位範圍未對齊現行 server 模式與最小 intake。
   - C05｜Medium｜專案 README 仍把已有 API 的模式描述成不連線。
   - E3-04｜Medium｜現行治理材料及對應 gate 的欄位敘述未完整跟隨已核定 intake 最小化。
3. **現況**：已合併 #415、#424–#426（文件標註）；還缺：依賴 GOVERNANCE、PRIVACY、SESSION；文件類外部證據是否適用待負責人確認。
4. **下一步**：
   1) 上游完成後，逐一核對 7 個 finding 的文件敘述與現況，改成 `UNVERIFIED`／日期化敘述。
   2) 跑 `check:docs`（CI 會跑）確認索引與連結。
5. **完成標準**（manifest regressionTests；細節以 manifest 為準）：
   - `B-46` 正：清楚分 compile-time route mount、runtime gate、C6 infra scope；保留 no-op defa…；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `D-39` 正：逐具體段落分類 current Canon vs dated evidence；current instructions 對齊 regist…；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `E3-13` 正：舊 Emulator/browser-local 敘述標 as-of；目前狀態與 execution-plan 一致，remote 未讀回標…；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `E3-31` 正：數值帶日期來源且不冒充 current pass；舊無後端句標歷史，isolated scope 指 Canon。；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `B-12` 正：A docs test asserts each mode's documented storage and intake statemen…；負：No doc or preview describes the local-only guarantee as covering the s…
   - `C05` 正：A docs check asserts the three mode descriptions against the existing …；負：No doc says the default local mode is server-backed or that the opt-in…
   - `E3-04` 正：文件與現行ADR對齊；不得弱化gate、復活移除欄位或覆寫dated證據。；負：保留既有權限、合成資料限定、錯誤/效能/gate契約；正向通過不得令錯誤身分或未知/runtime未測狀態被當成安全成功。
6. **依賴／阻擋**：dependsOn：SOL-GOVERNANCE、SOL-HTTP、SOL-PRIVACY、SOL-SESSION；blocks：SOL-INTEGRATION。
7. **波次**：W3
8. **執行者**：Sonnet（文件）
9. **需負責人核准**：文件類外證適用性（隨本計畫第二節決策一併問）
10. **禁止範圍**：不准production修復於本輪；Luna下一輪也不得改auth/RBAC/IAM/sharedschema/migration/共同tracking。實際construction另需fresh授權及scope lease。

### SOL-EXPORT

1. **目的**：處理 4 個 finding（B-38、D-37、A09、NEW-06）的來源回歸與必要外部證據；manifest 狀態 `PLANNED_CURRENT_EVIDENCE_SCOPE`，風險 HIGH。
2. **findings**：
   - B-38｜Low｜Business export 日期區間 schema 各自驗日期，API/domain 另負責順序與長度。
   - D-37｜Low｜原列把匯出電話呈現、CSV escaping、backup failure 重複告警與 denylist 等不同邊界合併，需按子題逐項確認。
   - A09｜Medium｜匯出單一交易讀取全部區間資料，缺可證明的資源界限。
   - NEW-06｜UNKNOWN｜export GET在組檔成功後、HTTP交付前消耗下載額度並記錄downloaded。
3. **現況**：已合併 #328（schemaVersion 准入）、#422（閏年範圍）；還缺：依賴 RBAC（間接 SESSION）。
4. **下一步**：
   1) RBAC 完成後補剩餘 2 個 finding 的匯出權限與範圍回歸。
   2) CSV 匯出需在 RC-06 的 C1 員工端流程再實測一次。
5. **完成標準**（manifest regressionTests；細節以 manifest 為準）：
   - `B-38` 正：所有 create path reject reversed/overlimit，accept approved boundary；新增 s…；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `D-37` 正：按明細：合成缺電話不生成值；CSV quote/newline roundtrip；backup failure 重複/恢復 event 符…；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `A09` 正：A synthetic export below the current 20-chunk ceiling retains stable r…；負：Never return a partial CSV, lose the existing date/role/re-auth checks…
   - `NEW-06` 正：以合成合法/拒絕/過期/重試/並發案例測本列邊界，保留既有契約；impact與provider證據分欄。；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
6. **依賴／阻擋**：dependsOn：SOL-CONTRACTS、SOL-RBAC；blocks：SOL-INTEGRATION、SOL-QUERY-INDEX。
7. **波次**：W3
8. **執行者**：長跑（gpt-6.1-terra）
9. **需負責人核准**：無
10. **禁止範圍**：不准production修復於本輪；Luna下一輪也不得改auth/RBAC/IAM/sharedschema/migration/共同tracking。實際construction另需fresh授權及scope lease。

### SOL-GOVERNANCE

1. **目的**：處理 5 個 finding（B-18、E1-21、E1-25、E3-11、E3-20）的來源回歸與必要外部證據；manifest 狀態 `PLANNED_CURRENT_EVIDENCE_SCOPE`，風險 HIGH。
2. **findings**：
   - B-18｜Medium｜branch protection、公開狀態及 gcloud guard 的 current-facing 說明有互相衝突風險。
   - E1-21｜Low｜分支保護檢查的網路請求未設定明確逾時與可控失敗分類。
   - E1-25｜Low｜治理 waiver 欄位與有效性檢查未完整覆蓋登錄契約所需條件。
   - E3-11｜Medium｜品質文件現況文字與例外治理及來源證明規則衝突。
   - E3-20｜Low｜資安草稿未決 C0 與未有實作敘事未對帳後續權威。
3. **現況**：已合併 #412（E1-21）；還缺：依賴 PRIVACY；分支保護說明與現況需對齊。
4. **下一步**：
   1) RC-04 的分支保護讀回腳本完成後，讓 B-18 等治理說明引用讀回結果，不再手寫現況。
   2) B-18 受保護部分不動。
5. **完成標準**（manifest regressionTests；細節以 manifest 為準）：
   - `B-18` 正：assert diagnostics 不與 GC-001/D-013 衝突；gcloud deny parser 有正負 fixtures …；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `E1-21` 正：注入 timeout、DNS/network reject、401/403/404/5xx；一律非零 NOT_CHECKED 且不顯示 OK…；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `E1-25` 正：逐必填欄位缺失/型別/日期次序/unknown rule/scope/expired cases；每項無效 waiver 不得解除對應 ce…；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `E3-11` 正：現況引用 canonical exception registry／attestation workflow；歷史掃描有日期；綠 gate …；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `E3-20` 正：草稿標 as-of 或逐 T 項引用 Canon；pending／UNVERIFIED 不混用，不改草稿成 deployment autho…；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
6. **依賴／阻擋**：dependsOn：SOL-PRIVACY；blocks：SOL-DOCS、SOL-INTEGRATION。
7. **波次**：W3
8. **執行者**：Sonnet
9. **需負責人核准**：無
10. **禁止範圍**：不准production修復於本輪；Luna下一輪也不得改auth/RBAC/IAM/sharedschema/migration/共同tracking。實際construction另需fresh授權及scope lease。

### SOL-HTML

1. **目的**：處理 2 個 finding（B-22、X-C03）的來源回歸與必要外部證據；manifest 狀態 `PLANNED_CURRENT_EVIDENCE_SCOPE`，風險 HIGH。
2. **findings**：
   - B-22｜Low｜CSP 路徑規則由共用 catalog 產生；重複與 frame-src 是否死設定須依現況重判。
   - X-C03｜Low｜trusted-html sanitizer 對 HTML navigation 語法的處理範圍需與 CSP 行為一併核對。
3. **現況**：已合併 無來源 PR；還缺：整包未開工（B-22、X-C03）。
4. **下一步**：
   1) 等 PRIVACY、RUNTIME-EVIDENCE。先重判 B-22 的 CSP 規則是否仍重複，再寫 X-C03 重現測試。
   2) HTML 預算是 gate，不調高。
5. **完成標準**（manifest regressionTests；細節以 manifest 為準）：
   - `B-22` 正：逐 path catalog parity；frame-src 保留 reauth caller regression；只移除可證明無用的重…；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `X-C03` 正：benign synthetic markup 的允許/拒絕 cases 與核准 refresh policy一致；safe content…；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
6. **依賴／阻擋**：dependsOn：SOL-PRIVACY、SOL-RUNTIME-EVIDENCE；blocks：SOL-INTEGRATION。
7. **波次**：W3
8. **執行者**：長跑（gpt-6.1-terra）
9. **需負責人核准**：無
10. **禁止範圍**：不准production修復於本輪；Luna下一輪也不得改auth/RBAC/IAM/sharedschema/migration/共同tracking。實際construction另需fresh授權及scope lease。

### SOL-IAC-LIFECYCLE

1. **目的**：處理 4 個 finding（B-10、B-11、B-50、E2-08）的來源回歸與必要外部證據；manifest 狀態 `PLANNED_CURRENT_EVIDENCE_SCOPE`，風險 HIGH。
2. **findings**：
   - B-10｜Medium｜排程啟用狀態與可接受的初始占位目標未形成一致的安全組態契約。
   - B-11｜Medium｜授權開關同時決定受管理資源是否存在，未明確區分禁止新操作與保留既有資源。
   - B-50｜Low｜CAL-PILOT budget expiry/labels 須按已核准期限確認，不可自行延長。
   - E2-08｜Low｜合成資料遷移工具的核准期限為原始固定常數，後續執行資格需與現行 authority 核對。
3. **現況**：已合併 無來源 PR；還缺：整包未開工（B-10、B-11、B-50、E2-08）；依賴 IAM、INGRESS。
4. **下一步**：
   1) IAM 外證後開工；B-10、B-11 寫 credential-free 的 plan 斷言（授權開關關閉時不新增操作、保留既有資源）。
   2) RC-05 的 Terraform 流量調整會動到同一目錄，兩者排序：RC-05 先。
5. **完成標準**（manifest regressionTests；細節以 manifest 為準）：
   - `B-10` 正：以無憑證靜態／mock 測試拒絕啟用排程＋占位 URL；合法既有 URL 維持無排程 mutation 的 extension invari…；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `B-11` 正：無憑證 state fixture 分別測空 state＋not_granted、已存在 state＋撤銷 SHA、已存在 state＋新 …；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `B-50` 正：核對 approved labels；period 不晚於現有期限；新期限必先有 owner approval，再改 source/test…；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `E2-08` 正：假時鐘測核准有效、過期拒絕；apply confirmation 不可覆蓋日期拒絕；靜態驗證不得連線或遷移。；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
6. **依賴／阻擋**：dependsOn：SOL-IAM、SOL-INGRESS；blocks：SOL-CI-IAC、SOL-CONFIG、SOL-INTEGRATION、SOL-OBSERVABILITY、SOL-RELEASE、SOL-TTL。
7. **波次**：W2
8. **執行者**：長跑（gpt-6.1-terra）
9. **需負責人核准**：Terraform apply 需負責人核准（來源 PR 不需）
10. **禁止範圍**：不准production修復於本輪；Luna下一輪也不得改auth/RBAC/IAM/sharedschema/migration/共同tracking。實際construction另需fresh授權及scope lease。

### SOL-IAM

1. **目的**：處理 12 個 finding（B-49、E1-06、E1-24、E2-01、E3-08、E3-09、B-01、B-02、B-09、B-41、E1-12、NEW-10）的來源回歸與必要外部證據；manifest 狀態 `PLANNED_CURRENT_EVIDENCE_SCOPE`，風險 HIGH。
2. **findings**：
   - B-49｜Low｜C2 Terraform 只宣告 Identity API enablement，Identity Platform 設定由 gated c…
   - E1-06｜Medium｜環境變數的秘密參照使用可漂移標籤，削弱同候選版本的重現性。
   - E1-24｜Low｜Identity configurator 的 fetch request 未明確配置有限逾時。
   - E2-01｜Low｜多個外部 fetch 未設應用層期限，可能令 CLI 等待遠端回應超出所需時間。
   - E3-08｜Medium｜未標停用的匯入手冊仍把受禁的真實資料讀取與長期金鑰準備描述成操作流程。
   - E3-09｜Medium｜日曆指引未區分本機相容憑證模式與現行雲端無金鑰身分模式。
   - B-01｜High｜部署 CI principal 的專案 IAM 管理權超出建置部署所需邊界。
   - B-02｜Medium｜WIF 信任條件未完整釘住不可變的 repository/owner 身分及允許 ref。
   - B-09｜Medium｜試行部署依賴長期服務帳號金鑰及偏大的 Auth 管理權。
   - B-41｜Low｜IaC mock tests 缺 ingress、公眾principal及危險角色的安全負向斷言。
   - E1-12｜Low｜release 的長期金鑰與清理流程缺可證明的全路徑退出契約。
   - NEW-10｜UNKNOWN｜project-wide Storage grants需分離已覆蓋的CI principal與builder bucket範圍候選。
3. **現況**：已合併 #388、#392；還缺：實際 operation→role／bucket 對應與 IAM 外證。
4. **下一步**：
   1) 在 C1 專案 beauessence-clinic-stg-c1a01 唯讀列出現有 service account 與 IAM binding，對照 #392 的 operation 對應表，列出差異。
   2) 差異表交負責人核准；核准後才由負責人或授權流程調整 IAM（不猜權限）。
   3) 讀回調整後 binding，存成 `docs/reviews/<日期>-iam-readback.md`（不含 token）。
   4) 12 個 finding 逐一補來源回歸（見完成標準）。
5. **完成標準**（manifest regressionTests；細節以 manifest 為準）：
   - `B-49` 正：若維持 split，記錄受控後續步驟並測 exact project/gate/dry-run plan；任何 request 需獨立授權。；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `E1-06` 正：假部署參數只能使用核准數字版本；版本漂移、缺失或未核准版本於 mutation 前拒絕；env/volume 契約分開驗證。；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `E1-24` 正：mock fetch 永不 resolve 時於有界期限拒絕；成功與 HTTP error 路徑維持；timeout 不自動重試 mutat…；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `E2-01` 正：mock fetch hanging 有界拒絕；timeout 後不重試 Identity mutation；preview 每個請求各自有…；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `E3-08` 正：靜態文件檢查拒絕把真實來源切換、金鑰下載或真實資料讀取列為現行步驟；停用歷史工具與 synthetic runbook 索引分界清楚。；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `E3-09` 正：文件區分 Cloud ADC 與本機模式；CLOUD_ADC 拒 JSON／credential-file 負案例維持；不新增金鑰 auth…；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `B-01` 正：Mock-plan assertions bind each approved C1 operation to the exact exis…；負：Unapproved project-wide/admin grants and any change that bypasses the …
   - `B-02` 正：Mock claim cases for the authorized repository/ref are accepted, and t…；負：Forks, other repositories, and unapproved refs are denied; absence of …
   - `B-09` 正：Synthetic source tests prove the runtime path does not require a long-…；負：No service-account key is generated, committed, logged, or silently su…
   - `B-41` 正：A mock plan permits the explicitly approved synthetic resource set and…；負：Unexpected public principals, ingress exposure, and roles outside the …
   - `E1-12` 正：離線fakeCLI涵蓋每個throw/exit cleanup；不得新建/讀取實際key、降低安全掃描或更改live權限。；負：保留既有權限、合成資料限定、錯誤/效能/gate契約；正向通過不得令錯誤身分或未知/runtime未測狀態被當成安全成功。
   - `NEW-10` 正：以合成合法/拒絕/過期/重試/並發案例測本列邊界，保留既有契約；impact與provider證據分欄。；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
6. **依賴／阻擋**：dependsOn：SOL-INGRESS；blocks：SOL-CI-IAC、SOL-IAC-LIFECYCLE、SOL-INTEGRATION、SOL-OBSERVABILITY、SOL-RELEASE、SOL-RUNTIME-EVIDENCE。
7. **波次**：W2
8. **執行者**：負責人（IAM 核准）、Haiku（唯讀讀回）、長跑（gpt-6.1-terra）
9. **需負責人核准**：IAM 變更與讀回窗口（逐批）
10. **禁止範圍**：不准production修復於本輪；Luna下一輪也不得改auth/RBAC/IAM/sharedschema/migration/共同tracking。實際construction另需fresh授權及scope lease。

### SOL-IDENTITY

1. **目的**：處理 4 個 finding（B-34、D-10、K2、NEW-01）的來源回歸與必要外部證據；manifest 狀態 `PLANNED_CURRENT_EVIDENCE_SCOPE`，風險 HIGH。
2. **findings**：
   - B-34｜Low｜MonthDay、姓名及電話 wire schemas 的形狀限制比 domain identity 規則寬。
   - D-10｜Medium｜電話驗證與舊證件短值遮罩未完整保障有效識別和最小揭露。
   - K2｜Medium｜未核實的 intake 解析可賦予 patient 身分，且失敗預約可能留下無關 patient 記錄。
   - NEW-01｜UNKNOWN｜合法非staff Firebase token 的UID未經patient record/binding核實即具patient身分。
3. **現況**：已合併 #389（K2）、#417（B-34）；還缺：依賴 SESSION。
4. **下一步**：
   1) SESSION 外證後，補另外兩個 finding 的 intake 邊界與退回拒絕回歸。
5. **完成標準**（manifest regressionTests；細節以 manifest 為準）：
   - `B-34` 正：按核准 identity policy 測有效/無效 MonthDay 與現有 name/phone；不擴張蒐集欄位，write path …；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `D-10` 正：合成零數字/不足數字/國際格式、正規化同鍵衝突；長度一至九舊值不得完整重現，合法值符合核准遮罩。；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `K2` 正：One same-name candidate on initial intake still reuses the existing pa…；負：Do not add OTP/login to initial Booking (WP-B3), do not disable ADR-00…
   - `NEW-01` 正：以合成合法/拒絕/過期/重試/並發案例測本列邊界，保留既有契約；impact與provider證據分欄。；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
6. **依賴／阻擋**：dependsOn：SOL-CONTRACTS、SOL-SESSION；blocks：SOL-INTEGRATION、SOL-LIST、SOL-PRIVACY、SOL-RETURN、SOL-SCHEDULE、SOL-TTL。
7. **波次**：W3
8. **執行者**：長跑（gpt-6.1-terra）
9. **需負責人核准**：無
10. **禁止範圍**：不准production修復於本輪；Luna下一輪也不得改auth/RBAC/IAM/sharedschema/migration/共同tracking。實際construction另需fresh授權及scope lease。

### SOL-INGRESS

1. **目的**：處理 6 個 finding（K9、E1-04、E1-14、K6、B-03、X-C06）的來源回歸與必要外部證據；manifest 狀態 `PLANNED_CURRENT_EVIDENCE_SCOPE`，風險 HIGH。
2. **findings**：
   - K9｜Low｜隔離測試 gate 以任意非空 emulator 設定替代環境約束，配置邊界仍需明確化。
   - E1-04｜Medium｜部署前登入網域檢查使用供應商後綴而非該次授權的精確主機集合。
   - E1-14｜Low｜登入網域來源檢查以子字串存在推斷驗證邏輯，未證明語意。
   - K6｜Medium｜來源 IP 限流未明確定義 IPv6 前綴的等價邊界。
   - B-03｜High｜公開 ingress 與 proxy header 信任邊界未有足夠部署證明。
   - X-C06｜Low｜預覽主機判定僅排除特定主站，未定義所有主域與核准預覽的安全邊界。
3. **現況**：已合併 #385、#390、#391、#416、#437；還缺：外部安全計數與入口驗收。
4. **下一步**：
   1) 在 C1 專案 beauessence-clinic-stg-c1a01 依 #385 方案 A runsheet 讀回入口設定（固定主機、loopback 封鎖）。
   2) 外部安全計數：依 `docs/plans/2026-10-25-external-acceptance-runsheet.md` 的 INGRESS 段跑，結果存 `docs/reviews/`。
   3) 結果決定 IAM、SESSION 能否開工；延誤超過 2 天要在總計畫記錄。
5. **完成標準**（manifest regressionTests；細節以 manifest 為準）：
   - `K9` 正：關閉/逾期/forbidden 始終拒絕；loopback emulator 可允許，非 local/未知測試標記拒絕；不能經可改 allo…；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `E1-04` 正：離線測核准主機、其他供應商主機、scheme/path、空值及 default；未核准值在任何 mutation 前拒絕。；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `E1-14` 正：合成 source 僅註解/無作用字串含 host 不得滿足 semantic assertion；精確值的正向與 scheme/path/…；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `K6` 正：等價 IPv6 表示得到同一 host-level key；合法 IPv4-mapped IPv6 沿既有規則一致；trusted prox…；負：同一 /64 內不同 host 仍是不同 bucket（不引進未核准的 /64）；不接受格式錯誤/多地址值，也不信任 client-supp…
   - `B-03` 正：A synthetic request through the approved Hosting path preserves the se…；負：Do not lock callers to a spoofable leftmost X-Forwarded-For token or b…
   - `X-C06` 正：The approved C1 project and supported preview channel enable the API t…；負：An arbitrary .web.app, the main staging alias (including firebaseapp.c…
6. **依賴／阻擋**：dependsOn：—；blocks：SOL-IAC-LIFECYCLE、SOL-IAM、SOL-INTEGRATION、SOL-RELEASE、SOL-RETURN、SOL-SESSION。
7. **波次**：W1
8. **執行者**：Haiku（唯讀讀回）、負責人（開窗）
9. **需負責人核准**：入口驗收窗口
10. **禁止範圍**：不准production修復於本輪；Luna下一輪也不得改auth/RBAC/IAM/sharedschema/migration/共同tracking。實際construction另需fresh授權及scope lease。

### SOL-INTEGRATION

1. **目的**：處理 8 個 finding（D-40、E3-12、E4-02、E4-04、E4-13、E4-01、E4-03、E4-12）的來源回歸與必要外部證據；manifest 狀態 `PLANNED_CURRENT_EVIDENCE_SCOPE`，風險 HIGH。
2. **findings**：
   - D-40｜Low｜BOOKING execution log 最新記錄停於 2026-08-23，後續動態狀態不能由此文件確認。
   - E3-12｜Medium｜自稱現行的 gate 敘事仍使用被新 Canon 分層取代的未實作與未授權概括。
   - E4-02｜Medium｜明列現行 gate 的 dashboard 仍停留早期盤點。
   - E4-04｜Medium｜F-07 判 RUNTIME_PROVEN 但本機 store／吞錯仍在
   - E4-13｜Low｜委派 lockout 仍 InMemory 未接線
   - E4-01｜High｜限流/防枚舉證據曾將局部通過視為完整安全邊界成立。
   - E4-03｜High｜AUD-01 身分一致性來源/修復證據需要保留可核對的關帳鏈。
   - E4-12｜Low｜歷史 PASS 的 scope/版本限制缺必要更正，可能被當成現行綠燈。
3. **現況**：已合併 無來源 PR；還缺：依賴幾乎全部其他包；來源凍結尚未開始。
4. **下一步**：
   1) 待其餘包終態後，做 D-40、E3-12、E4-01–E4-04、E4-12、E4-13 的整合回歸與來源凍結。
   2) 凍結 commit 即 RC 候選；11/26 為程式凍結日。
   3) 若 11/26 時上游仍有未結包，在總計畫列出並提出縮範圍選項。
5. **完成標準**（manifest regressionTests；細節以 manifest 為準）：
   - `D-40` 正：僅新增醒目日期/歷史狀態標示；C6 原始紀錄與數值逐字保留；不得加入未驗證的 current status。；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `E3-12` 正：逐能力拆 decision／implementation／same-revision evidence／deploy authority；純…；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `E4-02` 正：dashboard 對每個 canonical scope；若移 live exception，同步 lifecycle、索引、其 gate…；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `E4-04` 正：合成測試：server list 覆蓋不一致 local appointments；API 5xx/timeout 不可靜默偽裝成合法空清單…；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `E4-13` 正：若後續獲准接線，測同 process concurrency、跨 instance/process restart lockout pers…；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `E4-01` 正：K1等primary修復後追加exactsource/negativecase/currentmain證據；舊datedPASS不得當現行控…；負：保留既有權限、合成資料限定、錯誤/效能/gate契約；正向通過不得令錯誤身分或未知/runtime未測狀態被當成安全成功。
   - `E4-03` 正：核對私有original manifest而不公開payload；#238 ancestry、相關negativecase與exactmai…；負：保留既有權限、合成資料限定、錯誤/效能/gate契約；正向通過不得令錯誤身分或未知/runtime未測狀態被當成安全成功。
   - `E4-12` 正：dated驗證與currentmain判定分欄；僅由Sol integration追加correction，Luna不改共同ledger。；負：保留既有權限、合成資料限定、錯誤/效能/gate契約；正向通過不得令錯誤身分或未知/runtime未測狀態被當成安全成功。
6. **依賴／阻擋**：dependsOn：SOL-ARCH-GATE、SOL-ASSET-BUILD、SOL-BUILD、SOL-BUSINESS、SOL-CALENDAR-CANDIDATE、SOL-CALENDAR-ENVELOPE、SOL-CALENDAR-LEASE、SOL-CALENDAR-RESTORE、SOL-CALENDAR-TESTS、SOL-CALENDAR-WATCH、SOL-CI-IAC、SOL-CI-SECURITY、SOL-CLI、SOL-CONFIG、SOL-CONTAINERS、SOL-CONTRACTS、SOL-DESIGN-GATE、SOL-DOC-GATE、SOL-DOCS、SOL-EXPORT、SOL-GOVERNANCE、SOL-HTML、SOL-HTTP、SOL-IAC-LIFECYCLE、SOL-IAM、SOL-IDENTITY、SOL-INGRESS、SOL-LIFECYCLE、SOL-LIST、SOL-MAINTENANCE、SOL-OBSERVABILITY、SOL-OUTBOX、SOL-PRIVACY、SOL-QUERY-INDEX、SOL-RBAC、SOL-RELEASE、SOL-RETENTION、SOL-RETURN、SOL-ROUTE-INVENTORY、SOL-RUNTIME-EVIDENCE、SOL-SAST、SOL-SCHEDULE、SOL-SECRETS、SOL-SESSION、SOL-SESSION-DOCS、SOL-SESSION-UI、SOL-STRUCTURE-GATE、SOL-SUPPLY、SOL-TTL、SOL-VISUAL-EVIDENCE；blocks：—。
7. **波次**：W3（最後；上游未結則延後 12 月）
8. **執行者**：長跑（gpt-6.1-terra）
9. **需負責人核准**：無（凍結前由 Claude 驗收）
10. **禁止範圍**：不准production修復於本輪；Luna下一輪也不得改auth/RBAC/IAM/sharedschema/migration/共同tracking。實際construction另需fresh授權及scope lease。

### SOL-LIST

1. **目的**：處理 3 個 finding（K7、C07、E4-24）的來源回歸與必要外部證據；manifest 狀態 `PLANNED_CURRENT_EVIDENCE_SCOPE`，風險 MEDIUM。
2. **findings**：
   - K7｜Medium｜內部預約列表使用固定上限且缺可辨識的截斷與續讀語義。
   - C07｜Medium｜UI 將受上限限制的清單數量顯示為完整總數。
   - E4-24｜Low｜文件以分頁稱呼固定上限清單，超出現行 API/UI 契約。
3. **現況**：已合併 #437（決定）、#448（K7 續讀 cursor）；還缺：依賴 IDENTITY、RETURN（間接 SESSION）。
4. **下一步**：
   1) 上游完成後補其餘 2 個 finding 的列表上限與續讀語意回歸。
5. **完成標準**（manifest regressionTests；細節以 manifest 為準）：
   - `K7` 正：Synthetic 51+ rows, including equal startsAt values and archived rows,…；負：缺少或錯誤 cursor 不可繞過 scope/window 或讀取其他 patient；舊 client 不因新增欄位而破 schema。
   - `C07` 正：With 51+ synthetic server appointments, page navigation/filters/search…；負：Never assert a global total of 50 when more pages exist; preserve corr…
   - `E4-24` 正：文件準確描述現行限制；核定新的續讀後與API/UI及總數三方同步，不先承諾不存在分頁。；負：保留既有權限、合成資料限定、錯誤/效能/gate契約；正向通過不得令錯誤身分或未知/runtime未測狀態被當成安全成功。
6. **依賴／阻擋**：dependsOn：SOL-CONTRACTS、SOL-IDENTITY、SOL-RETURN；blocks：SOL-INTEGRATION、SOL-ROUTE-INVENTORY。
7. **波次**：W3
8. **執行者**：長跑（gpt-6.1-terra）
9. **需負責人核准**：無
10. **禁止範圍**：不准production修復於本輪；Luna下一輪也不得改auth/RBAC/IAM/sharedschema/migration/共同tracking。實際construction另需fresh授權及scope lease。

### SOL-MAINTENANCE

1. **目的**：處理 1 個 finding（E3-07）的來源回歸與必要外部證據；manifest 狀態 `PLANNED_CURRENT_EVIDENCE_SCOPE`，風險 MEDIUM。
2. **findings**：
   - E3-07｜Medium｜runbook 要求先開維護模式，但維護 gate 尚非 routed control。
3. **現況**：已合併 #386、#405、#447；還缺：跨程序寫入者與排空外證（C1 已實測閘門開關生效）。
4. **下一步**：
   1) 在 C1 專案 beauessence-clinic-stg-c1a01 開啟維護開關，同時觸發 API 與 worker 寫入，確認皆被拒絕；關閉後恢復。
   2) 記錄排空時間（在途 callback 計數歸零），存 `docs/reviews/`。
   3) 計數不等於全域零寫入，報告不得如此宣稱。
5. **完成標準**（manifest regressionTests；細節以 manifest 為準）：
   - `E3-07` 正：合成routed請求的維護允許/拒絕矩陣實際執行；未接線前runbook不聲稱此步可停止所有寫入。；負：保留既有權限、合成資料限定、錯誤/效能/gate契約；正向通過不得令錯誤身分或未知/runtime未測狀態被當成安全成功。
6. **依賴／阻擋**：dependsOn：—；blocks：SOL-INTEGRATION。
7. **波次**：W1
8. **執行者**：Haiku（實測）、負責人（開窗）
9. **需負責人核准**：C1 維護開關實測窗口
10. **禁止範圍**：不准production修復於本輪；Luna下一輪也不得改auth/RBAC/IAM/sharedschema/migration/共同tracking。實際construction另需fresh授權及scope lease。

### SOL-OBSERVABILITY

1. **目的**：處理 10 個 finding（B-25、B-51、D-15、D-27、D-34、A12、B-06、B-07、B-54、D-25）的來源回歸與必要外部證據；manifest 狀態 `PLANNED_CURRENT_EVIDENCE_SCOPE`，風險 HIGH。
2. **findings**：
   - B-25｜Low｜日誌 bucket 是否需 sink 或 retention destination，須依核准觀測用途與保留責任決定。
   - B-51｜Low｜告警 signal/window/threshold 有刻意異質設定，需驗 source mapping 並防止 missing-data …
   - D-15｜Medium｜空批次告警使用全部 pending 而非已到期工作，可能把合法退避視為停滯。
   - D-27｜Low｜Calendar pilot health 對每個 outbox 狀態 query 取完整 snapshots 再計 size。
   - D-34｜Low｜routeFamilyFromPath 先用包含式 /calendar 分類，使 /calendar-session 也歸入 calenda…
   - A12｜Medium｜operational readiness 預設來源未量測真實相依健康，回應另暴露內部 gate 狀態。
   - B-06｜Medium｜告警 operation 標籤與應用實際輸出的值不一致。
   - B-07｜Medium｜交易與備份告警的碼/方法來源不一致，可能漏報或把排程事件當失敗。
   - B-54｜Medium｜告警規格在多份配置各自維護，缺同一日誌 fixture 的語義驗證。
   - D-25｜Medium｜未探測的 operational 相依狀態仍可能被評成健康。
3. **現況**：已合併 #409（B-54）；還缺：依賴 IAC-LIFECYCLE、IAM；10 個 finding 多數未處理。
4. **下一步**：
   1) IAM 完成後逐一處理 10 個 finding；B-25 需依核准的觀測用途決定 sink，缺決定時列為待問。
5. **完成標準**（manifest regressionTests；細節以 manifest 為準）：
   - `B-25` 正：盤點核准 log consumers/retention；若需 sink，先界定 destination/IAM/retention 再另取…；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `B-51` 正：每項驗 emitter/filter/resource type/threshold/window/missing-data/notific…；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `D-15` 正：只有未到期退避三批不得告警；已到期未 claim 三批需告警；失敗退避、失效 lease 與總 backlog 個別測。；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `D-27` 正：三狀態 count parity；query/aggregation 失敗不得回 healthy；filter 與 fail-closed …；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `D-34` 正：/calendar-session 分 staff；/calendar 分 calendar；重疊及未知 path mapping 維持明確…；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `A12` 正：A default-probe test proves unmeasured dependencies cannot yield healt…；負：No zero-valued placeholder or missing provider becomes a healthy opera…
   - `B-06` 正：An application-level synthetic booking error emits the exact safe stru…；負：Gate-closed SERVICE_UNAVAILABLE, unrelated session-gate events, and PI…
   - `B-07` 正：Synthetic failed transaction and failed-backup fixtures match their in…；負：A successful CreateBackup event, ordinary slot conflict, unrelated API…
   - `B-54` 正：The same sanitized synthetic success/failure fixtures produce the same…；負：Successful audit events, unrelated operations, and malformed/PII-beari…
   - `D-25` 正：未量測/過期/明確失敗分別映unknown/notready而非healthy；liveness與runtimeavailability分開…；負：保留既有權限、合成資料限定、錯誤/效能/gate契約；正向通過不得令錯誤身分或未知/runtime未測狀態被當成安全成功。
6. **依賴／阻擋**：dependsOn：SOL-IAC-LIFECYCLE、SOL-IAM；blocks：SOL-CLI、SOL-INTEGRATION、SOL-SUPPLY。
7. **波次**：W3
8. **執行者**：長跑（gpt-6.1-terra）
9. **需負責人核准**：無（日誌 sink 目的需負責人決定時再問）
10. **禁止範圍**：不准production修復於本輪；Luna下一輪也不得改auth/RBAC/IAM/sharedschema/migration/共同tracking。實際construction另需fresh授權及scope lease。

### SOL-PRIVACY

1. **目的**：處理 9 個 finding（D-14、D-16、D-30、E3-05、B-21、E3-01、E3-02、E3-03、E4-10）的來源回歸與必要外部證據；manifest 狀態 `PLANNED_CURRENT_EVIDENCE_SCOPE`，風險 HIGH。
2. **findings**：
   - D-14｜Low｜Worker README 對 Calendar PII 的無範圍禁令未反映後續專用日曆標題核准。
   - D-16｜Low｜Calendar 候選比對只需 enabled patient IDs，query 卻讀取完整患者文件。
   - D-30｜Low｜合成候選標籤由有限字母與兩位數組合，多筆資料可能碰撞。
   - E3-05｜Medium｜現行用途資料清冊仍使用舊集合與欄位前提描述已演進的隔離測試資料邊界。
   - B-21｜Low｜追蹤設定/文件含不必要的環境或個人識別值，公開匯出需去識別。
   - E3-01｜High｜治理材料包含非必要個人聯絡識別，公開材料去識別需明確權威。
   - E3-02｜High｜隱私草稿描述的 intake 欄位與現行頁面/核定最小化範圍不一致。
   - E3-03｜High｜隱私揭露與 Calendar 投影實際使用的資料欄位不一致。
   - E4-10｜Medium｜個人聯絡識別的公開材料問題需以去識別證據關帳，而非重貼原值。
3. **現況**：已合併 #364、#365；還缺：依賴 ENVELOPE、RESTORE、IDENTITY；正式隱私政策與法律審查屬正式上線前。
4. **下一步**：
   1) 上游完成後補 9 個 finding 的來源回歸（去識別、欄位最小化、保存期限）。
   2) 告知文字：等負責人審閱草稿；supportEmail 由 RC-03 處理。
   3) 查全國法規資料庫（law.moj.gov.tw）的條次放在 D-003 決策紀錄，不在本包重複。
5. **完成標準**（manifest regressionTests；細節以 manifest 為準）：
   - `D-14` 正：文字限定 dedicated appointment calendar 與允許欄位；其他日曆及禁止欄位不變，歷史提案標日期。；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `D-16` 正：保留所有 enabled IDs、排除 disabled、candidate 結果完全相同；測試 query 只取必要欄位，cursor/g…；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `D-30` 正：重複 label 的不同 pilotId 仍可分辨/決策；穩定性與來源 ID 不可逆保持。；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `E3-05` 正：逐項枚舉 patient-directory 與商務 repository 集合／欄位，與清冊分類、用途、scope、保存、Canon li…；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `B-21` 正：A privacy-safe publication check flags prohibited personal identifiers…；負：No real contact value, secret, project identifier, or private setting …
   - `E3-01` 正：以合成去識別fixture驗公開匯出不含個人聯絡；保留核准lineage而不自創聯絡地址。；負：保留既有權限、合成資料限定、錯誤/效能/gate契約；正向通過不得令錯誤身分或未知/runtime未測狀態被當成安全成功。
   - `E3-02` 正：法律owner核定欄位與版本；public頁/草稿/ADR一致且不以draft當已核准policy。；負：保留既有權限、合成資料限定、錯誤/效能/gate契約；正向通過不得令錯誤身分或未知/runtime未測狀態被當成安全成功。
   - `E3-03` 正：合成title/description只含核准欄位；投影、隱私頁及既有事件處置有同一核定界限。；負：保留既有權限、合成資料限定、錯誤/效能/gate契約；正向通過不得令錯誤身分或未知/runtime未測狀態被當成安全成功。
   - `E4-10` 正：只列範圍/字串類別/hash或去識別fixture；同根B21/E301只一primary修復包。；負：保留既有權限、合成資料限定、錯誤/效能/gate契約；正向通過不得令錯誤身分或未知/runtime未測狀態被當成安全成功。
6. **依賴／阻擋**：dependsOn：SOL-CALENDAR-ENVELOPE、SOL-CALENDAR-RESTORE、SOL-IDENTITY；blocks：SOL-DOCS、SOL-GOVERNANCE、SOL-HTML、SOL-INTEGRATION、SOL-RUNTIME-EVIDENCE。
7. **波次**：W3（正式發布 12 月）
8. **執行者**：長跑（gpt-6.1-terra）、負責人（文字審閱）
9. **需負責人核准**：D-001～D-003；告知文字審閱（11/19）
10. **禁止範圍**：不准production修復於本輪；Luna下一輪也不得改auth/RBAC/IAM/sharedschema/migration/共同tracking。實際construction另需fresh授權及scope lease。

### SOL-QUERY-INDEX

1. **目的**：處理 1 個 finding（B-44）的來源回歸與必要外部證據；manifest 狀態 `PLANNED_CURRENT_EVIDENCE_SCOPE`，風險 MEDIUM。
2. **findings**：
   - B-44｜Low｜index matrix checker 驗證已列 query 的索引，不能單獨證明 query inventory 完整。
3. **現況**：已合併 #414、#427–#432（B-44）；還缺：依賴 EXPORT、TTL（間接 IAM、SESSION）。
4. **下一步**：
   1) 上游完成後確認 B-44 的索引宣告與查詢一致；索引實際部署另開 request。
5. **完成標準**（manifest regressionTests；細節以 manifest 為準）：
   - `B-44` 正：枚舉全部 query shape 與 matrix 雙向比較；未列 composite query 使 offline checker fa…；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
6. **依賴／阻擋**：dependsOn：SOL-CONTRACTS、SOL-EXPORT、SOL-TTL；blocks：SOL-INTEGRATION。
7. **波次**：W3
8. **執行者**：長跑（gpt-6.1-terra）
9. **需負責人核准**：索引部署需負責人核准（Firestore 索引屬雲端狀態）
10. **禁止範圍**：不准production修復於本輪；Luna下一輪也不得改auth/RBAC/IAM/sharedschema/migration/共同tracking。實際construction另需fresh授權及scope lease。

### SOL-RBAC

1. **目的**：處理 4 個 finding（A04、D-22、E3-17、E4-09）的來源回歸與必要外部證據；manifest 狀態 `OWNER_POLICY_PREREQUISITE`，風險 HIGH。
2. **findings**：
   - A04｜Low｜讀公開可預約網格沿用建立預約權限，完整班表與 slot view 的授權目的未分離。
   - D-22｜Medium｜角色投影 helper 對未知新增欄位沒有預設拒絕機制。
   - E3-17｜Medium｜RBAC 文件把已用於受控組裝的 evaluator 仍描述為完全未 routed。
   - E4-09｜Medium｜角色別名仍依尚未獲明文解答的職務等同假設映射。
3. **現況**：已合併 #241、#251（文件）；還缺：整包未實作（A04、D-22、E3-17、E4-09）；E4-09 已有登記簿答案（個管師＝諮詢師）。
4. **下一步**：
   1) W1：RC-02 把 E4-09 的 OWNER_POLICY_PREREQUISITE 依 DR:1003 同步。
   2) W3：SESSION 外證後實作 A04、D-22、E3-17 的伺服端授權回歸。
5. **完成標準**（manifest regressionTests；細節以 manifest 為準）：
   - `A04` 正：patient/accountless 只獲核定網格欄位；physician/未知角色不得增權；publish 僅既定角色，讀不帶任何患者資…；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `D-22` 正：逐角色已核定欄位；未知及嵌套欄位拒絕，未知角色空物件，clinical/money/physician 不增權。；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `E3-17` 正：矩陣分 proposed／wired／executed／production；patient-own／other-deny、physicia…；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `E4-09` 正：owner 定案後 normaliseRole legacy alias 正負、未知 role 拒絕、physician 權限仍空；更名不推…；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
6. **依賴／阻擋**：dependsOn：SOL-CONTRACTS、SOL-SESSION；blocks：SOL-EXPORT、SOL-INTEGRATION、SOL-SCHEDULE、SOL-SESSION-DOCS。
7. **波次**：W1（manifest 同步，RC-02）／W3（實作）
8. **執行者**：Sonnet（同步）、長跑（gpt-6.1-terra）（實作）
9. **需負責人核准**：無（E4-09 已決）
10. **禁止範圍**：不准production修復於本輪；Luna下一輪也不得改auth/RBAC/IAM/sharedschema/migration/共同tracking。實際construction另需fresh授權及scope lease。

### SOL-RELEASE

1. **目的**：處理 7 個 finding（E1-03、E1-05、E1-07、E1-13、E1-01、E1-02、E1-11）的來源回歸與必要外部證據；manifest 狀態 `PLANNED_CURRENT_EVIDENCE_SCOPE`，風險 HIGH。
2. **findings**：
   - E1-03｜Medium｜候選提交不存在時的補取分支可能被原生命令錯誤政策提前中止。
   - E1-05｜Medium｜舊發布入口仍將可能混合訊息的部署輸出直接當作 JSON 解析。
   - E1-07｜Low｜期限的多份常數與未用變數增加維護成本，但核准期限本身不是錯誤。
   - E1-13｜Low｜續期腳本區域變數名稱與 PowerShell 自動變數相同，易混淆比對狀態。
   - E1-01｜High｜回滾腳本未明確阻斷每一原生命令失敗，可能輸出不實完成訊息。
   - E1-02｜Medium｜原生命令錯誤語義依賴 PowerShell 版本，但入口未明確阻斷不相容版本。
   - E1-11｜Low｜建置腳本未保證原生命令失敗時中止後續步驟。
3. **現況**：已合併 無來源 PR；還缺：整包未開工（E1-01、E1-02、E1-03、E1-05、E1-07、E1-11、E1-13）；E1-05 歸本包（#308 誤列）。
4. **下一步**：
   1) IAM、IAC-LIFECYCLE、INGRESS 完成後開工；E1-05 先讀 #308 內文確認範圍。
   2) 本包的 release 流程回歸在 RC tag 前完成，因為 tag 流程會用到。
5. **完成標準**（manifest regressionTests；細節以 manifest 為準）：
   - `E1-03` 正：離線假 git 回傳提交存在、首次不存在後取得成功及取得失敗；斷言補取次數與退出碼，禁止真 fetch。；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `E1-05` 正：fake Firebase 混合部署訊息不得直接解析；獨立 channel readback 唯一且匹配預期，缺失或不一致終止。；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `E1-07` 正：核准期限不變；固定時鐘測 expired/final-seven-day/min(now+30days,kill-switch)；刪 unu…；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `E1-13` 正：fake channel 清單零/一/多筆分别拒絕/選取/拒絕；改名後不使用自動 Matches 保存結果，預設仍不 PATCH。；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `E1-01` 正：用離線fakeCLI逐步失敗、正常及部分成功；任一失敗非零且不得輸出完成或進行後續mutation。；負：保留既有權限、合成資料限定、錯誤/效能/gate契約；正向通過不得令錯誤身分或未知/runtime未測狀態被當成安全成功。
   - `E1-02` 正：離線模擬不支援版本先拒絕；支援版本每個nativeexit非零正確傳播；不修改deployauthority。；負：保留既有權限、合成資料限定、錯誤/效能/gate契約；正向通過不得令錯誤身分或未知/runtime未測狀態被當成安全成功。
   - `E1-11` 正：离线fake git/gcloud逐步失敗不能進行下一步或輸出完成；成功維持原標籤契約。；負：保留既有權限、合成資料限定、錯誤/效能/gate契約；正向通過不得令錯誤身分或未知/runtime未測狀態被當成安全成功。
6. **依賴／阻擋**：dependsOn：SOL-IAC-LIFECYCLE、SOL-IAM、SOL-INGRESS；blocks：SOL-INTEGRATION。
7. **波次**：W3
8. **執行者**：長跑（gpt-6.1-terra）
9. **需負責人核准**：部署相關變更需負責人核准
10. **禁止範圍**：不准production修復於本輪；Luna下一輪也不得改auth/RBAC/IAM/sharedschema/migration/共同tracking。實際construction另需fresh授權及scope lease。

### SOL-RETURN

1. **目的**：處理 3 個 finding（K4、D-08、E3-19）的來源回歸與必要外部證據；manifest 狀態 `PLANNED_CURRENT_EVIDENCE_SCOPE`，風險 HIGH。
2. **findings**：
   - K4｜Medium｜限流文件鍵截斷可能碰撞，另缺期限清除及爭用回應契約。
   - D-08｜High｜回診 lookup 識別鍵缺具金鑰的隱私保護，並牽涉既有鍵的相容性。
   - E3-19｜Low｜限流文件缺同一身分的完整速率參數。
3. **現況**：已合併 #419（自述 K1，已裁定為額外回歸測試）；還缺：K4、D-08、E3-19 逐項核對；依賴 IDENTITY、INGRESS。
4. **下一步**：
   1) K1 為 NO-WORK，#419 不改包狀態；逐項核對 K4、D-08、E3-19 是否已有覆蓋，沒有就補測試。
5. **完成標準**（manifest regressionTests；細節以 manifest 為準）：
   - `K4` 正：兩個長合成鍵不共享 limiter 文件；過期語義、並發爭用及狀態碼有負向回歸。；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `D-08` 正：離線合成鍵具核定HMAC域分隔；雙讀/停用舊键的遷移只提出設計，未經owner不执行或建secret。；負：保留既有權限、合成資料限定、錯誤/效能/gate契約；正向通過不得令錯誤身分或未知/runtime未測狀態被當成安全成功。
   - `E3-19` 正：文件取自核定參數且含來源/身分兩邊界；不能用文件修訂替代K1的server約束。；負：保留既有權限、合成資料限定、錯誤/效能/gate契約；正向通過不得令錯誤身分或未知/runtime未測狀態被當成安全成功。
6. **依賴／阻擋**：dependsOn：SOL-CONTRACTS、SOL-IDENTITY、SOL-INGRESS；blocks：SOL-INTEGRATION、SOL-LIST、SOL-ROUTE-INVENTORY、SOL-SCHEDULE、SOL-TTL。
7. **波次**：W3
8. **執行者**：長跑（gpt-6.1-terra）
9. **需負責人核准**：無（return_sessions 24 小時已決）
10. **禁止範圍**：不准production修復於本輪；Luna下一輪也不得改auth/RBAC/IAM/sharedschema/migration/共同tracking。實際construction另需fresh授權及scope lease。

### SOL-ROUTE-INVENTORY

1. **目的**：處理 3 個 finding（E1-16、E1-17、E3-10）的來源回歸與必要外部證據；manifest 狀態 `PLANNED_CURRENT_EVIDENCE_SCOPE`，風險 HIGH。
2. **findings**：
   - E1-16｜Low｜路由真值模組匯出控制器集合，分類卻另外列舉名稱。
   - E1-17｜Low｜C6 證據組裝只表達部分路由條件，與完整路由 blocker 範圍不同。
   - E3-10｜Medium｜API 現行人類路由表未涵蓋已註冊的完整受控介面。
3. **現況**：已合併 #415、#420（E1-16、E1-17）；還缺：依賴 LIST、RETURN。
4. **下一步**：
   1) 上游完成後補剩餘 finding 的路由盤點回歸。
5. **完成標準**（manifest regressionTests；細節以 manifest 為準）：
   - `E1-16` 正：逐 controller 測 transitive/direct mount 與 module registration；移除 export…；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `E1-17` 正：同 in-memory Nest 圖的 direct Appointment、direct Schedule、BookPilot、Watch…；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `E3-10` 正：controller→module→契約表列出每個現行 route，逐列標 auth、gate、request/response、produ…；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
6. **依賴／阻擋**：dependsOn：SOL-LIST、SOL-RETURN；blocks：SOL-INTEGRATION。
7. **波次**：W3
8. **執行者**：長跑（gpt-6.1-terra）
9. **需負責人核准**：無
10. **禁止範圍**：不准production修復於本輪；Luna下一輪也不得改auth/RBAC/IAM/sharedschema/migration/共同tracking。實際construction另需fresh授權及scope lease。

### SOL-RUNTIME-EVIDENCE

1. **目的**：處理 6 個 finding（E1-18、E1-26、E2-02、E2-06、E2-10、E4-07）的來源回歸與必要外部證據；manifest 狀態 `PLANNED_CURRENT_EVIDENCE_SCOPE`，風險 MEDIUM。
2. **findings**：
   - E1-18｜Low｜預算證據以清單第一筆代替授權目標身份選取。
   - E1-26｜Low｜合成 C1 smoke evaluator 將預算金額固定於程式字面值，未完全追隨其建議來源。
   - E2-02｜Low｜證據輸出目錄可由環境變數指定，寫入前未限制在預期工作區。
   - E2-06｜Low｜Playwright 證據合併依賴輸入路徑語意，原報指出未先正規化。
   - E2-10｜Low｜Stage E 證據 --out 直接接受任意輸出路徑，未經 repository/workspace containment policy…
   - E4-07｜Medium｜仍查 `/`，實際 302→`/clinic`
3. **現況**：已合併 #421、#423（E1-26，分支名的 config 為命名沿用）；還缺：依賴 IAM、PRIVACY；runtime 證據腳本待實測。
4. **下一步**：
   1) IAM 與 PRIVACY 後，對 6 個 finding 補 C1 smoke 證據腳本的回歸，並在 C1 實跑。
5. **完成標準**（manifest regressionTests；細節以 manifest 為準）：
   - `E1-18` 正：清單重排結果不變；非目標排首、零/多匹配、缺 currency/amount/threshold fail-closed；僅合成 snaps…；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `E1-26` 正：合成 recs 改金額後 evaluator 必須同步依 recs 判斷；舊字面值被接受而與 source 不同時拒絕；threshold …；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `E2-02` 正：相對/絕對輸出在 repo 外、parent traversal、repo 內有效路徑；依核定 policy 拒絕或接受且不建立檔案，測試使…；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `E2-06` 正：METADATA_BLOCKED until exact input-resolution source is read; then rel…；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `E2-10` 正：mock writeFile 測 repo 內相對、parent traversal、絕對外部及空路徑；外部路徑在任何寫入前拒絕；預設不寫檔…；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `E4-07` 正：Mock 302 `/`→`/clinic`，驗證 redirect path/host 與 clinic markers；另測跨 host…；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
6. **依賴／阻擋**：dependsOn：SOL-IAM、SOL-PRIVACY；blocks：SOL-HTML、SOL-INTEGRATION。
7. **波次**：W3
8. **執行者**：長跑（gpt-6.1-terra）、Haiku
9. **需負責人核准**：無
10. **禁止範圍**：不准production修復於本輪；Luna下一輪也不得改auth/RBAC/IAM/sharedschema/migration/共同tracking。實際construction另需fresh授權及scope lease。

### SOL-SCHEDULE

1. **目的**：處理 6 個 finding（B-35、A08、K8、A02、D-07、D-42）的來源回歸與必要外部證據；manifest 狀態 `PLANNED_CURRENT_EVIDENCE_SCOPE`，風險 HIGH。
2. **findings**：
   - B-35｜Low｜Schedule wire schema 未限集合數量或區間端點順序，domain 另檢 schedule validity。
   - A08｜Low｜休診重疊查詢沒有請求上界，可能讀取超出目標窗口的未來資料。
   - K8｜Low｜患者回診既有預約的結束時間重複寫死時長而未引用唯一時段規則。
   - A02｜High｜公開時段讀取與班表發布缺有界集合處理，成本與交易容量未完整收斂。
   - D-07｜High｜班表引用的開放狀態集合與 domain 佔用狀態不一致。
   - D-42｜Low｜班表發布缺已報到/過去未結及 Calendar 還原的負向整合回歸。
3. **現況**：已合併 #410、#411（D-42）；還缺：依賴 RBAC、RETURN、TTL 等。
4. **下一步**：
   1) 上游完成後補其餘 4 個 finding；排程維持 PAUSED，不啟用。
5. **完成標準**（manifest regressionTests；細節以 manifest 為準）：
   - `B-35` 正：publish 拒絕 end<=start、重疊及經核准上限外 payload；合法相鄰區間通過；容量上限由 owner 決定。；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `A08` 正：末端相接不衝突、跨窗真重疊衝突；大量未來不相交資料不導致無界讀取；交易期間新增重疊不能穿越。；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `K8` 正：兩個 directory 回傳 existing 的 endsAt 皆為 startsAt 加 domain 常數；跨 UTC 日期正確，e…；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `A02` 正：Synthetic slots outside the published horizon are not scanned for publ…；負：When a safe bound cannot be proven, fail before writes; never publish …
   - `D-07` 正：arrived以及其他占用狀態發布後保留slot/guard；domain/web/Firestore同一狀態矩陣。；負：保留既有權限、合成資料限定、錯誤/效能/gate契約；正向通過不得令錯誤身分或未知/runtime未測狀態被當成安全成功。
   - `D-42` 正：合成arrived/過去未結及cancelled還原在發布/重試後不遺失booking/slot/guard/calendar關聯。；負：保留既有權限、合成資料限定、錯誤/效能/gate契約；正向通過不得令錯誤身分或未知/runtime未測狀態被當成安全成功。
6. **依賴／阻擋**：dependsOn：SOL-CONTRACTS、SOL-IDENTITY、SOL-LIFECYCLE、SOL-RBAC、SOL-RETURN、SOL-TTL；blocks：SOL-CALENDAR-CANDIDATE、SOL-INTEGRATION。
7. **波次**：W3
8. **執行者**：長跑（gpt-6.1-terra）
9. **需負責人核准**：排程啟用需負責人核准
10. **禁止範圍**：不准production修復於本輪；Luna下一輪也不得改auth/RBAC/IAM/sharedschema/migration/共同tracking。實際construction另需fresh授權及scope lease。

### SOL-SECRETS

1. **目的**：處理 5 個 finding（B-29、E1-31、B-13、B-31、B-55）的來源回歸與必要外部證據；manifest 狀態 `PLANNED_CURRENT_EVIDENCE_SCOPE`，風險 HIGH。
2. **findings**：
   - B-29｜Low｜行級秘密掃描例外仍有未錨定的子字串模式，可能超出具名合成值的預期範圍。
   - E1-31｜Low｜追蹤檔掃描以 git ls-files 依目前工作目錄取得清單，可能因子目錄啟動造成掃描範圍改變。
   - B-13｜Medium｜工作區與 cloud build 排除規則未完整涵蓋憑證檔類型。
   - B-31｜Low｜agent 的檔案拒絕規則未涵蓋所有 env 與金鑰目錄變體。
   - B-55｜Low｜金鑰目錄的版本控制排除缺口尚未與補償控制形成一致規格。
3. **現況**：已合併 #277、#291、#320、#330（宣告層）；還缺：Claude host canary／登入外證。
4. **下一步**：
   1) 負責人重新登入 Claude CLI 後，由 Haiku 跑 canary（不讀憑證內容）。
   2) 結果寫回 `docs/reviews/`；Hermes 兩次 PASS 的舊證據不重做。
5. **完成標準**（manifest regressionTests；細節以 manifest 為準）：
   - `B-29` 正：每一 allowlist 都有獨立合成正例、混合行與邊界負例；隔離 pinned scanner 只使用非秘密 fixture，验证合法例外…；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `E1-31` 正：從 repo 子目錄呼叫仍以 repository root 執行 ls-files 並掃全 tracked set；deleted fil…；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `B-13` 正：A local upload-list fixture excludes synthetic key, PEM, service-accou…；負：No broad pattern hides required app configuration or the synthetic tes…
   - `B-31` 正：An isolated policy test proves protected path families are denied whil…；負：No workaround, alternate tool, or broad read is used to bypass a denie…
   - `B-55` 正：Synthetic files under cal-pilot-keys are ignored, while current safe s…；負：No real key is created or used as a test; no broad JSON/config ignore …
6. **依賴／阻擋**：dependsOn：—；blocks：SOL-INTEGRATION。
7. **波次**：W1
8. **執行者**：負責人（重新登入）、Haiku（canary）
9. **需負責人核准**：登入與 canary 窗口
10. **禁止範圍**：不准production修復於本輪；Luna下一輪也不得改auth/RBAC/IAM/sharedschema/migration/共同tracking。實際construction另需fresh授權及scope lease。

### SOL-SESSION

> 2026-11-09 負責人選第 1 案：登入維持 Google＋TOTP，session 改為絕對 7 天、
> 無閒置登出；敏感操作維持 10 分鐘內 fresh Google＋TOTP，停權、登出撤銷、CSRF 與角色邊界不變。
> 完成標準涵蓋 7 天到期、停權即拒、敏感操作缺 fresh TOTP 被拒，及登入、再驗證和首次綁定
> 六位數畫面的可鍵盤操作、預設收合繁中教學與四個驗證器商店連結。此決定尚非實作完成。
> E4-14 authority 未決及真實 SDK 外證不因新登入決定解除；不得以來源測試宣稱外證完成。

1. **目的**：處理 8 個 finding（K3、E4-14、C02、X-C02、NEW-02、NEW-03、NEW-07、NEW-08）的來源回歸與必要外部證據；manifest 狀態 `PLANNED_CURRENT_EVIDENCE_SCOPE`，風險 HIGH。
2. **findings**：
   - K3｜Low｜停用帳號驗證失敗與一般驗證失敗共用對外分類，細分分支可能無法由正常 SDK 路徑到達。
   - E4-14｜Low｜accountActive 寫死；limiter Optional
   - C02｜Medium｜工作臺從本機帳戶資料顯示員工身分，而非伺服器確認的 actor。
   - X-C02｜Medium｜本機儲存的 CSRF 被視為已登入，沒有重新核實 server 會話。
   - NEW-02｜UNKNOWN｜staff Bearer與cookie入口使用不同server-session/CSRF生命週期。
   - NEW-03｜UNKNOWN｜角色allowlist重疊時優先選manager，缺fail-closed配置不變量。
   - NEW-07｜UNKNOWN｜staff protected request 每次touch lastSeenAt，缺有界寫入頻率。
   - NEW-08｜UNKNOWN｜session creation入口未設定自身 per-IP/per-account abuse boundary。
3. **現況**：已合併 #387、#394、#397–#403、#406；還缺：真實 SDK 外證；E4-14 authority 決定。
4. **下一步**：
   1) 負責人回答 E4-14（authority 決定）。
   2) 在取得另行授權後，以真實 Identity SDK 驗證登入、7 天絕對到期、停權後拒絕，讀回結果。
   3) 結果解開下游最多包，優先排。
5. **完成標準**（manifest regressionTests；細節以 manifest 為準）：
   - `K3` 正：stub SDK 停用/撤銷/無效 token 與 verify 後停權競態皆拒絕；無 cookie/session 建立、無 PII 錯誤…；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `E4-14` 正：測 disabled/expired session 不得以 accountActive=true 放行；模組組裝測試須證明正式 compo…；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `C02` 正：合成storedrole不得建立verified actor；server確認/撤銷/過期時UIidentity、CSRF與權限一致。；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `X-C02` 正：過期/撤銷/失效CSRF由server拒絕並清UIidentity；合法session續用不繞過服務端生命週期。；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `NEW-02` 正：以合成合法/拒絕/過期/重試/並發案例測本列邊界，保留既有契約；impact與provider證據分欄。；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `NEW-03` 正：以合成合法/拒絕/過期/重試/並發案例測本列邊界，保留既有契約；impact與provider證據分欄。；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `NEW-07` 正：以合成合法/拒絕/過期/重試/並發案例測本列邊界，保留既有契約；impact與provider證據分欄。；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `NEW-08` 正：以合成合法/拒絕/過期/重試/並發案例測本列邊界，保留既有契約；impact與provider證據分欄。；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
6. **依賴／阻擋**：dependsOn：SOL-CONTRACTS、SOL-INGRESS；blocks：SOL-DOCS、SOL-HTTP、SOL-IDENTITY、SOL-INTEGRATION、SOL-RBAC、SOL-SESSION-DOCS、SOL-SESSION-UI、SOL-TTL。
7. **波次**：W2
8. **執行者**：Haiku（實測）、負責人（決定）
9. **需負責人核准**：E4-14 authority；C3 session 窗口
10. **禁止範圍**：不准production修復於本輪；Luna下一輪也不得改auth/RBAC/IAM/sharedschema/migration/共同tracking。實際construction另需fresh授權及scope lease。

### SOL-SESSION-DOCS

1. **目的**：處理 4 個 finding（E3-24、E3-35、D-38、E3-06）的來源回歸與必要外部證據；manifest 狀態 `PLANNED_CURRENT_EVIDENCE_SCOPE`，風險 HIGH。
2. **findings**：
   - E3-24｜Low｜驗收工作表仍以舊標頭限制描述已由 owner 放寬的重新驗證邊界。
   - E3-35｜Low｜CAL-PILOT 手冊停 08-31
   - D-38｜Low｜現行文件中的會話期限與實作不一致，既有重新驗證不可被省略。
   - E3-06｜Medium｜生效文件仍記錄過時的會話時限。
3. **現況**：已合併 #360；還缺：依賴 RBAC、SESSION。
4. **下一步**：
   1) SESSION 外證後把 session 文件改成與實測一致。
5. **完成標準**（manifest regressionTests；細節以 manifest 為準）：
   - `E3-24` 正：assert 文件 approved COOP exact value；更寬值停止；未跑 popup/re-auth runtime pro…；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `E3-35` 正：更新/標歷史後由 docs-links/lifecycle check 確認日期、狀態來源與 expiry 欄位一致；不讀寫 Calenda…；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `D-38` 正：只同步已核定session期限、CSRF與重新驗證要求；歷史snapshot標dated不覆寫。；負：保留既有權限、合成資料限定、錯誤/效能/gate契約；正向通過不得令錯誤身分或未知/runtime未測狀態被當成安全成功。
   - `E3-06` 正：核定時間與source一致；歷史時間保留dated標示，不能改會話實作或略過重新驗證。；負：保留既有權限、合成資料限定、錯誤/效能/gate契約；正向通過不得令錯誤身分或未知/runtime未測狀態被當成安全成功。
6. **依賴／阻擋**：dependsOn：SOL-RBAC、SOL-SESSION；blocks：SOL-INTEGRATION。
7. **波次**：W3
8. **執行者**：Sonnet
9. **需負責人核准**：無
10. **禁止範圍**：不准production修復於本輪；Luna下一輪也不得改auth/RBAC/IAM/sharedschema/migration/共同tracking。實際construction另需fresh授權及scope lease。

### SOL-SUPPLY

1. **目的**：處理 8 個 finding（B-19、B-32、B-20、B-42、E1-08、E2-12、B-48、E4-08）的來源回歸與必要外部證據；manifest 狀態 `PLANNED_CURRENT_EVIDENCE_SCOPE`，風險 HIGH。
2. **findings**：
   - B-19｜Medium｜部分供應鏈 override 只有下界，沒有版本相容性上界。
   - B-32｜Low｜依賴新增設定與現有 manifest 的版本範圍未明示是否採不同策略。
   - B-20｜Medium｜部分依賴工具鏈版本需支援政策評估，但 Terraform constraints/locks 並非普遍落後。
   - B-42｜Low｜Terraform provider lock 使用不同 patch version，但均受相同 7.x constraint 接受。
   - E1-08｜Medium｜供應鏈忽略清單的有限文字解析未明確拒絕不支援的設定格式。
   - E2-12｜Low｜SBOM licence review 對缺少根專案描述或 metadata 的輸入需明確 fail closed。
   - B-48｜Medium｜依賴例外具有期限，但缺可在到期前完成的修復/退出處置。
   - E4-08｜Medium｜供應鏈稽核項目的期限與現行依賴狀態缺完整關帳證據。
3. **現況**：已合併 #280（最小修補）、#281（決定）；還缺：B-19、B-20、B-32、B-42、B-48、E1-08、E2-12、E4-08 未完；braces 例外 11/30 到期（RC-01 處理中）。
4. **下一步**：
   1) RC-01 合併後，braces 例外移除。
   2) 依賴 OBSERVABILITY；完成後處理 8 個 finding，維持 audit 門檻，不新增例外。
5. **完成標準**（manifest regressionTests；細節以 manifest 為準）：
   - `B-19` 正：離線解析所有 overrides 以證明受影響項有明定上界；在授權依賴更新階段執行 API/worker/contracts 相容性測試，f…；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `B-32` 正：政策確定後靜態遍歷 workspace manifests 檢查允許的版本形狀；frozen-lockfile install 與 depe…；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `B-20` 正：每項升級對應 manifest/lock；provider lock 更新後 offline validation，CI Node/JDK …；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `B-42` 正：決策若同 patch，更新各 module lock 後唯讀 init validation；確認 diff 僅預期 locks，禁止 ap…；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `E1-08` 正：合成 block/flow 清單、引號/註解、縮排、重複 key、未知 key 與無 ignore；不支援形狀必須報錯而非回空。；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `E2-12` 正：缺 root component/name/version/purl 的合成 manifest 必須非零且指出欄位；正常根元件及 SPDX …；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
   - `B-48` 正：A synthetic exception with complete, authorized exit evidence passes o…；負：An expired or incomplete exit remains red; a pending status stays expl…
   - `E4-08` 正：逐依賴核對lockfile與scope；到期failclosed，不能以延長例外或gate豁免代替修復。；負：保留既有權限、合成資料限定、錯誤/效能/gate契約；正向通過不得令錯誤身分或未知/runtime未測狀態被當成安全成功。
6. **依賴／阻擋**：dependsOn：SOL-CI-SECURITY、SOL-CONTRACTS、SOL-OBSERVABILITY；blocks：SOL-CI-IAC、SOL-INTEGRATION。
7. **波次**：W1（braces，RC-01）／W3（整包）
8. **執行者**：長跑（gpt-6.1-terra）
9. **需負責人核准**：無（不新增例外）
10. **禁止範圍**：不准production修復於本輪；Luna下一輪也不得改auth/RBAC/IAM/sharedschema/migration/共同tracking。實際construction另需fresh授權及scope lease。

### SOL-TTL

1. **目的**：處理 3 個 finding（A05、B-04、NEW-05）的來源回歸與必要外部證據；manifest 狀態 `OWNER_POLICY_PREREQUISITE`，風險 HIGH。
2. **findings**：
   - A05｜Low｜回診會話期限以字串儲存，與原生 TTL 型別要求不一致。
   - B-04｜Medium｜限流狀態集合缺原生期限清除的單一設定權威。
   - NEW-05｜UNKNOWN｜return-session header缺opaque ID界限，錯誤會傳至資料路徑解析。
3. **現況**：已合併 #371（A05、B-04、B-52、NEW-05）；還缺：manifest 狀態仍為 OWNER_POLICY_PREREQUISITE，但 24 小時保留已決、C5 已套用。
4. **下一步**：
   1) RC-02 依 DR:316、DR:999 同步 manifest 狀態；整包仍依賴 IAC-LIFECYCLE、IDENTITY、RETURN、SESSION。
5. **完成標準**（manifest regressionTests；細節以 manifest 為準）：
   - `A05` 正：New synthetic session remains unusable at/after expiresAt regardless o…；負：Do not accept a missing/malformed expiresAt, alter session duration, d…
   - `B-04` 正：Limiter state and 429 timing stay identical across restarts; newly wri…；負：Never purge an active lock, switch to wall-clock deletion as the enfor…
   - `NEW-05` 正：以合成合法/拒絕/過期/重試/並發案例測本列邊界，保留既有契約；impact與provider證據分欄。；負：限定合成資料；驗證對應錯誤/未知/未授權/重放/失效case不變成功，不改既有契約與gate。
6. **依賴／阻擋**：dependsOn：SOL-IAC-LIFECYCLE、SOL-IDENTITY、SOL-RETURN、SOL-SESSION；blocks：SOL-INTEGRATION、SOL-QUERY-INDEX、SOL-SCHEDULE。
7. **波次**：W1（manifest 同步，RC-02）
8. **執行者**：Sonnet
9. **需負責人核准**：無（已決）
10. **禁止範圍**：不准production修復於本輪；Luna下一輪也不得改auth/RBAC/IAM/sharedschema/migration/共同tracking。實際construction另需fresh授權及scope lease。

## 三、RC 新增包（11）

### RC-01 供應鏈 braces

- **目的**：移除 braces 例外，firebase-tools 升 15.35.0。
- **範圍**：`package.json`、`pnpm-lock.yaml`、`security/audit-exceptions.json`
- **完成標準**：例外已移除，供應鏈檢查在 exact head 全綠；合併即完成。
- **依賴**：無
- **波次**：W1
- **執行者**：Claude（PR #453）
- **需負責人核准**：無（Claude 驗收後合併）

### RC-02 manifest 與台帳同步

- **目的**：把 manifest 狀態與歸屬裁定同步，並讓本檔取代 #268 承載台帳。
- **範圍**：`docs/plans/2026-10-06-sol00-safe-manifest.json`、`...finding-manifest.md`
- **完成標準**：SOL-TTL、SOL-RBAC 的 OWNER_POLICY_PREREQUISITE 依登記簿更新；#419 K1＝NO-WORK、E1-26＝RUNTIME-EVIDENCE、E1-05＝RELEASE 寫回；#268 關閉（負責人同意後）。
- **依賴**：無
- **波次**：W1
- **執行者**：Sonnet
- **需負責人核准**：關閉 #268 需負責人同意；manifest 是機器權威，修改前先向負責人說明

### RC-03 公開 repo 隱私收尾

- **目的**：清掉公開 repo 的個資疑慮。
- **範圍**：`firebase.json`、`staff-*.png`、全 repo 掃描
- **完成標準**：supportEmail 由 PR #451 處理（合併即完成）；醫師照片同意紀錄由負責人補 email（存 repo 外），登記簿只記狀態；staff-*.png 內容檢視完成；手機號全量掃描（不只排除已知假號）無未解釋命中。
- **依賴**：無
- **波次**：W1
- **執行者**：Haiku（掃描）、負責人（補同意）
- **需負責人核准**：負責人補照片同意紀錄

### RC-04 分支保護定期讀回

- **目的**：用腳本定期讀回 main 分支保護，不手寫現況。
- **範圍**：`scripts/`、`.github/workflows/`（新增檢查，不改既有 gate）
- **完成標準**：讀回 enforce_admins、required check、force push、reviews；每週檢查有輸出。審查政策維持「Claude 驗收＋CI 證據」；強制審查需機器人帳號，列為負責人可選項。
- **依賴**：無
- **波次**：W2
- **執行者**：Sonnet
- **需負責人核准**：新增 workflow 屬 CI 變更，先向負責人說明

### RC-05 Terraform 流量跟隨最新 revision

- **目的**：apply 後流量自動到最新 revision。
- **範圍**：Cloud Run 的 Terraform（`ignore_changes=[traffic]`）、C1 packet
- **完成標準**：移除或改寫 ignore_changes；釐清關閉後讀到 `00001-2vv` 的原因；C1 packet 補「GCS 狀態鎖 force-unlock 要用數字世代號（不是 UUID）」。
- **依賴**：無（先於 SOL-IAC-LIFECYCLE）
- **波次**：W1
- **執行者**：Sonnet（寫）
- **需負責人核准**：Terraform apply 需負責人逐批核准

### RC-06 C1 員工端第二窗口

- **目的**：補完 C1 員工端流程的未測項目。
- **範圍**：C1 專案 beauessence-clinic-stg-c1a01；腳本與 runsheet
- **完成標準**：以 `GET /v1/slots?kind=initial` 選合格初診時段重試改期（409 推定為目標選錯）；仍 409 先加「只寫日誌的領域錯誤碼」再測；取消殘留合成預約 `b6f3056a…a076`；測到診、CSV、封存、報表；Business Delivery Stage 2b（負責人提供 observed_since）。
- **依賴**：RC-05（流量）
- **波次**：W1
- **執行者**：Haiku（實測）、負責人（開窗）
- **需負責人核准**：開窗；observed_since

### RC-07 日曆 Gate 2

- **目的**：專用測試日曆續期與真實日曆實測。
- **範圍**：CAL-PILOT 測試日曆；`scripts/` 續期腳本（#450）
- **完成標準**：`--renew-expired` 續期；負責人登入取 session／CSRF；Haiku 跑 50 次正常收斂；故障情境另列。CAL-PILOT 合成子範圍 2026-11-28T04:51:37Z 到期，11/25 前決定是否延期。
- **依賴**：SOL-CALENDAR-LEASE
- **波次**：W1–W2
- **執行者**：Haiku、負責人
- **需負責人核准**：續期；真實日曆寫入；延期決定

### RC-08 程式可維護性量測

- **目的**：建立量測基準，不擋 PR。
- **範圍**：CI 報告（新增步驟）
- **完成標準**：檔案行數、重複率、複雜度基準寫入 CI 報告。RC 只做量測，切分排 12 月：calendar-pilot.repository.ts（1441 行，Gate 2 結束後）、admin-bootstrap.js、patient-app.js、三個大 CSS（P2）；先補回歸再小幅重構。
- **依賴**：SOL-CALENDAR-LEASE（切分）
- **波次**：W3（量測）／12 月（切分）
- **執行者**：Sonnet
- **需負責人核准**：CI 變更先向負責人說明

### RC-09 文件入口整理

- **目的**：讓本計畫成為唯一現行入口。
- **範圍**：`README.md`、`docs/README.md`；本檔的現行／歷史表
- **完成標準**：28 份計畫標現行／歷史（只在本檔列表，不改歷史檔內容）；README 過期段落改指向本檔。
- **依賴**：無
- **波次**：W3
- **執行者**：Sonnet
- **需負責人核准**：無

### RC-10 長跑重啟與分工

- **目的**：11/9 重啟長跑並確立分工。
- **範圍**：Hermes 長跑設定（不在 repo）
- **完成標準**：長跑主刀改用 gpt-6.1-terra（負責人 11/08：6.1-sol 不再使用），照本檔波次取包；Claude 監督與驗收；sol-longrun 技能只在 Hermes。
- **依賴**：無
- **波次**：W1
- **執行者**：Claude、長跑（gpt-6.1-terra）
- **需負責人核准**：無

### RC-11 專案治理

- **目的**：把負責人的合併授權與角色分工落檔，並建立每週治理讀回。
- **範圍**：`docs/product/phase-1-decision-register.md`、`GOVERNANCE.md`、`AGENTS.md`、`docs/` 治理讀回清單
- **完成標準**：(1) 登記簿補負責人合併授權（2026-11-06 原話：「你看沒問題就合，有邏輯變更再通知我」）、以及部署、雲端狀態、IAM、金鑰、業務決定、C1～C6 每批需負責人明確同意且核准不延伸到未列項目；(2) GOVERNANCE.md 與 AGENTS.md 補現行角色（負責人；Claude 監督、驗收、合併；長跑 gpt-6.1-terra 主刀；Sonnet 寫程式；Haiku 唯讀與實測），不改既有權威表結構；(3) 每週治理讀回清單：分支保護、例外到期日（`security/audit-exceptions.json`）、待決事項期限、本檔台帳更新日。本 PR 只寫本包內容，不實際改 GOVERNANCE.md／AGENTS.md。
- **依賴**：RC-04（讀回）
- **波次**：W1
- **執行者**：Sonnet（寫）、負責人（審）
- **需負責人核准**：屬治理規則變更（邏輯變更），合併前必須先給負責人看
