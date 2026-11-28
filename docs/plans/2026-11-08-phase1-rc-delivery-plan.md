# 第一階段上線候選版（RC）交付計畫（2026-11-08 至 11-30）

**狀態：** PLAN-ONLY／CURRENT_ENTRY（2026-11-08 起為現行唯一計畫入口與進度台帳）。這份是計畫，不是核准，也不是任何證據；下列各項都尚未執行。不得以合成資料、Emulator、預覽站或文件冒充正式環境證據（`MP:43-46`）。
**細部包：** [phase1-rc-packets](2026-11-08-phase1-rc-packets.md)（70 包逐包作法，含 254 個 finding）。
**機器權威：** [safe-manifest](2026-10-06-sol00-safe-manifest.json)、[finding 清單](2026-10-06-sol00-finding-manifest.md)。

## 一、目標與定義

負責人 2026-11-08 決定：11/30 交付的是**第一階段上線候選版（RC）**，不是正式上線。

RC 完成條件（全部要有可查證據）：

1. 59 包的來源工作全部結束：完成合併，或明確延後並寫理由與歸屬（Expansion S／Stage 6／12 月）。
2. C1 內部測試環境的員工端完整流程以合成資料跑過：預約、改期、取消、到診、CSV、封存、報表、Business Delivery Stage 2b。[CP-08 回歸 worksheet](2026-10-01-cp-08-regression-evidence-worksheet.md) 在 RC 精確 commit 上填完；[CP-10 清單](2026-10-01-cp-10-current-project-acceptance-checklist.md)由負責人簽。
3. C2～C6 測試環境切片：逐片提出 request（排除項、成本、operator、approver、plan/apply、rollback），負責人逐片核准後部署並讀回。做不到的片 11/22 前標明並移到 12 月。（11/22 已處理：負責人決定不移 12 月，見第十節 10.4；各片狀態見 [C2～C6 request 總表](2026-11-15-c2-c6-rc-deployment-requests.md)。）
4. Gate 2：專用測試日曆續期、真實日曆實測（至少 50 次正常收斂；故障情境另列）。CAL-PILOT 合成子範圍 2026-11-28T04:51:37Z 到期，11/25 前決定是否延期。
5. 決策：第二節的待決事項在期限前有具名答案、日期、適用範圍、排除項（格式依 [核准紀錄格式](../product/current-execution-and-approval-plan.md)）。需法律／隱私／醫療專業審查者，RC 只要求「答案定案＋審查安排」，審查完成列為正式上線前條件。
6. RC 精確 commit 打 tag（例如 `phase1-rc1`），附 exact-head CI 全綠證據。

**不在 RC**（排到 12 月正式上線計畫，見第八節）：真實病患資料、正式隱私政策發布、公開預約寫入、Stage 6 的備份還原／區域故障／負載／事故演練／人工無障礙、五方（clinic、privacy、security、operations、technical）簽核。

### CP-10 清單逐項歸屬

| 項目 | 內容 | 歸屬 | 備註 |
| --- | --- | --- | --- |
| A-01 | 發佈版本與授權範圍 | RC | exact SHA、digest、C1 project 一致 |
| A-02 | CP-08 全系統回歸 | RC | 人工無障礙（human AT）部分 12 月 |
| A-03 | 新預約及 Workbench 操作 | RC | |
| A-04 | CP-03 月用量與里程碑 | RC | |
| A-05 | CP-04 CSV 匯出 | RC | 併入 RC-06 |
| A-06 | CP-05 封存與資料權限 | RC | 備份尚在保存期不宣稱已徹底刪除 |
| A-07 | Google 真實 restore（CP-06-E） | 12 月 | Stage 6 備份還原 |
| A-08 | 合作終止與返還收據 | RC（拒絕路徑）／12 月（期滿路徑） | 期滿路徑需 30 日，RC 內無法完成 |
| A-09 | 繁中管理手冊盲走與截圖 | RC | 只用合成截圖 |
| A-10 | Drive 文件與規則 crosswalk | RC（待負責人決定） | 商務差異需負責人定案；歸屬待確認 |
| A-11 | AWS 與官網範圍 | RC | 範圍聲明；官網實機接受（PUB-03）可 12 月 |
| 驗收列 1 | Engineering current-project acceptance | RC | CP-06-E 部分 12 月 |
| 驗收列 2 | 試用期／調整期 | 12 月 | 以第一位真實員工登入起算 |
| 驗收列 3 | 真實日曆月付款 | 12 月 | 與工程驗收獨立 |

## 二、負責人待決事項

期限為台北日期。「已知答案」欄是既有輸入，不等於核准；要轉成正式核准紀錄（Approval ID、Answer、Approved by、日期、證據、範圍與排除項）。

### 11/12 前
**2026-11-14 負責人「全照建議」，以下 9 題已決**，核准紀錄見[決定登記](../product/phase-1-decision-register.md)的 APPROVAL-RC-2026-11-14。表格保留作歷史；不再詢問。

| ID | 問題 | 已知答案／建議預設 | 阻擋什麼 |
| --- | --- | --- | --- |
| D-004 | 容量、預約期間、多服務時長 | 容量 1、預約期 1 個月、多服務不加總（08-16 輸入）；建議轉正式核准 | slot 與排程相關包 |
| D-005 | 取消截止、爽約 | 當日 10:00 截止；建議轉正式核准 | 取消流程驗收 |
| D-011 | 正式網址、人工預約備援 | 內部預覽用 `.web.app`；正式 URL 未定 | 公開預約（12 月）；RC 只要答案 |
| OR-22 | 重複預約上限與同一人判定 | 未定，屬 D-004 | 預約防重 |
| OR-48 | 休診日／國定假日管理者 override | 超出營業時間僅管理者可 override 已定；休診日未決 | 排班規則 |
| OR-37 | 止鼾療程時長 | 已改為到診後確認；請確認不再回頭 | 無（關閉題目） |
| D-24 | 試用調整模型是否採用 | DESIGN-PROPOSED／BLOCKED-OWNER | SOL-BUSINESS 延伸工作 |
| LEASE Gate 2 | 真實 runtime 接入範圍 | `2026-10-22-sol-calendar-lease-coordination.md` 檔頭與 :17、:176 不一致，請釐清 | RC-07 |
| CAL-PILOT 延期 | 合成子範圍 2026-11-28T04:51:37Z 到期，落在 CP-10 驗收當中 | 2026-11-16：C1 日曆設定已續到 2026-12-16，12 月中再續到 12/31；`cal-pilot` 預覽頻道已於 10/01 到期，負責人決定不重建（見 reviews/2026-11-16-calendar-gate2-readback.md） 2026-11-24 補充：2026-12-31 是 APPROVAL-RC-2026-11-14 核准的上限；CAL-PILOT 專案（staging）合成子範圍依負責人 2026-11-24 決定不續期，2026-11-28 到期（以 `infra/terraform/cal-pilot/main.tf` 的 `approved_end_date` 為準）；C1 日曆設定照本核准續行，不受影響。 | RC-07、CP-10 |

### 11/19 前
**2026-11-15 進度**：本批 12 題全部已決，見決定登記 APPROVAL-RC-2026-11-15、APPROVAL-RC-2026-11-15B 與 BACKUP-B-2026-11-15。仍待負責人提供：診所登記全名與公用信箱（D-001）、Google 資料處理附約確認（D-002）。

「建議預設」是 Claude 依既有輸入整理的提案，不等於核准；負責人逐列回答後轉成正式核准紀錄。

| ID | 要回答什麼 | 已有輸入 | 建議預設 | 出處 |
| --- | --- | --- | --- | --- |
| D-001 | 控制者名稱、隱私聯絡窗口、權利請求流程 | 暫定診所電話為窗口 | 控制者用診所登記名稱；窗口＝診所電話＋一個角色信箱（不用個人信箱）；請求由負責人受理並留紀錄 | DR:2153–2155、DR:1380 |
| D-002 | 保存、刪除、Google DPA、備份刪除語意、legal hold | 預約保存 2 年；legal hold 只限負責人 | 刪除不追溯備份，備份到期自然汰除，保存期內不宣稱已徹底刪除（與 A-06 一致）；還原後重播刪除紀錄；Google DPA：確認 Google Cloud 已接受資料處理附約，截圖存 repo 外 | DR:291–296、DR:2276–2282 |
| D-003 | 隱私政策全文、版本號、發布流程 | 內測 v1.0 不是發布核准 | RC 只定案草稿 v1.0＋下方審查安排；正式發布 12 月 | DR:1382 |
| D-009 | 正式日曆擁有者、授權、scope | RC 用專用測試日曆，管理者為負責人 | 正式日曆歸診所帳號（非個人帳號）；只給讀寫事件的最小 scope；RC 沿用測試日曆 | DR:2785–2787、DR:1388 |
| D-016 | 回寫匹配、衝突、同步 SLO | 09-11 CAL-SYNC-DIR：push 後增量＋1～5 分鐘補償 | 採 09-11 方案；衝突以系統（真相來源）為準，日曆端改動只告警不回寫 | DR:1395 |
| Q-BACKUP | 備份目的地、地域、存取、保存、成本、刪除傳播 | Sheets 副本不能取代還原備份 | Firestore 排程匯出到同區域儲存桶；只負責人可讀；保存期跟 D-002；成本納入第八節費用上限 | [follow-up](2026-09-18-business-delivery-follow-up.md):71 |
| SOL-PRIVACY Q3 | acknowledgement log 保存年限 | 暫按個資處理 | 與預約同為 2 年 | [privacy 草稿](../legal/privacy-engineering-review-draft-2026-10-29.md):36–47 |
| SOL-PRIVACY Q5 | 去識別 write allowlist | 目前為空，受保護來源不改 | 維持空白（不開放去識別寫入） | 同檔 :77–93 |
| 10-24 第 6～9 題 | 已答 A，但還缺告知原句、角色信箱、保存數值、商務來源、去重方案 | 第 6～9 題均選 A | 原句與信箱併 D-001、保存數值併 D-002 一次給；第 8、9 題等 Sol 的短設計 | DR:810–814、DR:836 |
| #268 [H] | 告知最終版本、版本號、生效安排 | 保存、回診、電話窗口、署名已決 | 版本號 v1.0；生效日＝正式上線日；由診所審定文字 | issue #268 留言 |
| CP-10 A-10 | Drive 00 index 與 repo 規則的價格、分期、試用差異 | 暫保留 repo 原值、不覆寫 | 由 Claude 列差異表，負責人逐條選；歸屬 RC | [CP-10](2026-10-01-cp-10-current-project-acceptance-checklist.md):36、:45 |
| PUB-03 | 官網實機接受 | C1 實機未完成 | 移 12 月（本計畫已允許；2026-11-28 已被取代：第一期不做官網） | 本檔 A-11 |

`DR` = [決定紀錄](../product/phase-1-decision-register.md)。

### 法律審查安排（RC 完成條件第 5 點）

RC 只要求「答案定案＋審查安排」；審查完成是 12 月正式上線前條件。下表的條文依全國法規資料庫 2026-11-10 現行版；個資法 114 年修正的部分條文（含第 12、21 條，原第 27 條改列第 20-1 條）網站標示施行日期未定，審查時以當時施行版本為準。

| 題目 | 相關條文 | 白話結論 | 要審查的事 |
| --- | --- | --- | --- |
| 預約資料是否屬醫療個資 | 個資法第 2 條、第 6 條 | 「醫療」「病歷」是特種個資，原則不得蒐集；例外之一是當事人書面同意，但不得只靠同意、不得逾必要範圍 | 預約表單的療程欄位算不算醫療個資；若算，同意取得方式（電子勾選是否等同書面） |
| 告知內容 | 個資法第 8 條 | 直接向病患蒐集時，要告知機關名稱、目的、類別、利用期間地區對象方式、當事人權利、不提供的影響 | D-003 草稿是否涵蓋全部告知事項 |
| 保存期與刪除 | 醫療法第 67 條、第 70 條 | 病歷至少保存 7 年；預約資料若不構成病歷，依目的必要範圍刪除 | 系統資料是否落入病歷範圍；D-002 的 2 年是否成立 |
| 保密 | 醫療法第 72 條、第 103 條 | 醫療機構不得無故洩漏病人病情或健康資訊，違者罰 5 萬至 25 萬元 | 員工權限（C4）與匯出（CSV）是否足以防止無故洩漏 |
| 外洩處理 | 個資法第 12 條 | 外洩要通知當事人，符合範圍還要通報主管機關並留紀錄 | 事故流程（第八節）是否含通知與通報 |
| 雲端與境外 | 個資法第 21 條 | 主管機關得限制國際傳輸 | Google 雲端資料所在地與 DPA |
| 安全維護 | 個資法第 20-1 條（原第 27 條） | 保有個資者要辦理安全維護 | 現行資安措施是否足以對應 |

審查人與完成日期由負責人在 11/19 一併指定（律師、隱私顧問或診所自行審閱皆可，紀錄具名）。

### 隨時可回答

- 醫師照片書面同意：負責人 11/07 表示沒有書面但官網已使用；建議補 email 同意，存 repo 外（RC-03）。
- staff-*.png 內容檢視（RC-03）。

### 已決，不再問

return_sessions 24 小時（`DR:316`、`DR:999`）；E4-09 個管師＝諮詢師（`DR:1003`）；braces（11/08 依解除條件處理，RC-01）；supportEmail（由 PR #451 處理，RC-03）。
D-007、D-008（月結）、D-014、D-015 已 deferred，不在 RC。

## 三、時程（倒排到 11/30）

| 週 | 日期 | 內容 |
| --- | --- | --- |
| W1 | 11/09–11/15 | 長跑重啟（Codex 週額度 11/9 重置，RC-10）；負責人第一批決策（11/12）；RC-01、RC-02、RC-03、RC-05、RC-11；C1 員工端第二窗口（RC-06）；日曆續期與實測（RC-07）；INGRESS、MAINTENANCE、SECRETS 外證；C2～C6 request 草擬 |
| W2 | 11/16–11/22 | IAM、SESSION 外部證據（解開最多下游）；無來源包依上游解鎖順序開工；第二批決策（11/19）；C2～C6 逐片核准與部署；11/22 決定哪些切片移到 12 月；RC-04 |
| W3 | 11/23–11/29 | 程式凍結 11/26；CAL-PILOT 延期決定 11/25；CP-08 在凍結 commit 上跑；CP-10 負責人驗收 11/28–29；RC-08 量測、RC-09 |
| 交付 | 11/30 | 打 RC tag，交接 12 月正式上線計畫 |

關鍵路徑：INGRESS → IAM／SESSION 外證 → 下游包 → 凍結 → CP-08 → CP-10。任何一項延誤超過 2 天，本檔要記錄並提出縮範圍選項（先砍：C2～C6 中做不到的切片、W3 才開工的無來源包、SOL-INTEGRATION 整合）。

### 雲端窗口排程（2026-11-10 補）

負責人 2026-11-10 同意照下表建議日期排程。排定的是日期；每個窗口動手前仍須負責人對該批明確同意，核准不延伸到未列項目。
2026-11-15 負責人同意：原 11/12～11/14 未開的窗口順延，日曆續期、INGRESS、RC-05、RC-06 改 11/16 開始；MAINTENANCE、SECRETS 併入 11/17。

W1 的外證與實測都要負責人開窗，原表只排到週。下表的日期是建議，負責人確認後改成「已排」；每列仍需該批明確同意，核准不延伸。

| 窗口 | 內容 | 建議日期 | 為何排這天 | 狀態 |
| --- | --- | --- | --- | --- |
| RC-07 日曆續期 | 專用測試日曆續期，開始真實日曆實測 | 11/16（原 11/12） | 實測至少 50 次收斂需要時間；CAL-PILOT 子範圍 11/28 到期 | C1 設定 11/16 已續到 12/16；50 次實測待授權（[讀回](../reviews/2026-11-16-calendar-gate2-readback.md)）；2026-11-20 盤點：50 次收斂執行規劃已寫入[11/21 窗口計畫](2026-11-21-c1-window-plan.md)第 4 節（#537），視 11/21 C6 2.3／2.4 結果於 11/22–11/25 分 2～3 窗實跑或縮範圍 |
| INGRESS 外證 | 唯讀讀回＋必要變更 | 11/16（原 11/12–11/13） | 關鍵路徑第一站 | 已排（日期）；2026-11-20 盤點：11/16 唯讀讀回完成，三個 Cloud Run 服務入口與 Terraform 一致，測試期直連可達接受；跨入口同身分桶實發計數仍為 `NOT_PROVEN`（[讀回](../reviews/2026-11-16-ingress-and-rc06-readback.md)，#521） |
| RC-05 | Terraform 流量跟隨最新 revision（plan → apply → 讀回） | 11/16（原 11/13） | 後續部署都靠它 | 已排（日期）；2026-11-20 盤點：11/16 唯讀讀回整包完成，三服務皆 `latestRevision: true` 100%（[讀回](../reviews/2026-11-16-rc05-traffic-readback.md)，#520） |
| MAINTENANCE、SECRETS 外證 | 唯讀讀回＋必要變更 | 11/17（原 11/13–11/14） | W1 尾巴 | 已排（日期）；2026-11-20 盤點：11/16 提前完成唯讀讀回並經核准停用 3 個舊／未用密鑰版本，API 停寫已實測並更正確認兩 worker 皆接線維護控制；worker 逐 writer 實測排空與本機工具 canary 仍為 `NOT_RUN`（[讀回](../reviews/2026-11-16-maintenance-secrets-c2-c5-readback.md)，#525／#526） |
| RC-06 C1 員工端第二窗口 | 含 7 日登入測試 | 11/16 開；7 日登入測試等 C3 部署後 11/18 開始、11/25 讀回 | 7 日測試要倒推 | 11/16 完成並關窗；C3 七天 session 與 C4 Stage 2b 已隨 main `df63bb85` 部署實測，7 日讀回待 11/23–11/25 窗口（[報告](../reviews/2026-11-16-c1-window-rc06-c3-c4.md)，#523）；2026-11-20 盤點：11/18 補測櫃台角色通過（[11/18 報告](../reviews/2026-11-18-c1-window-c2-c6.md)，#530），CSV UTF-8 BOM 與 vendor 同步已於 #524 修補，主管 7 天 session 將於 `2026-11-23T08:23:00Z` 自然到期 |
| IAM、SESSION 外證 | 負責人核准後的變更與讀回 | 11/17–11/18 | 解開最多下游包 | 11/17 IAM 盤點與差異表完成，閒置 CI 帳號經核准停用；E4-14 判斷完成，停權實測排 11/23–11/25 窗口；B-01、B-02、NEW-10 待 IaC（[讀回](../reviews/2026-11-17-iam-readback.md)，#527）；2026-11-20 盤點：11/18 已提前完成櫃台停權 401 實測（#530）；B-01／B-02／NEW-10 Terraform 原始碼已於 #535 核准合併，待 11/21 窗口（[計畫](2026-11-21-c1-window-plan.md)第 2、6 節）或獨立 IAM 窗口看 plan 核准後 apply |
| C2～C6 切片 | 逐片 request → 核准 → 部署 → 讀回 | 部署 11/17–11/21（C2、C5 讀回 11/17；C3、C4、C5 部署 11/18；C6 11/19–11/21） | 11/22 要決定移 12 月的切片 | 草稿已交：[C2～C6 部署申請](2026-11-15-c2-c6-rc-deployment-requests.md)。9/11 部署無版本證據且之後程式大量變更，故全部重新申請；2026-11-20 盤點：11/16–11/18 已證明 C2 停權、C3 7 天與登出、C4 主管／櫃台分權、C5 稽核筆數與既有備份、C6 投影與補償；唯 C6 `calendar-sync` 回 500 致 2.3／2.4 未證明（[11/18 報告](../reviews/2026-11-18-c1-window-c2-c6.md)），11/19 已合 #532／#533／#534（[長跑紀錄](../reviews/2026-11-19-gemini-long-run-record.md)，#536），並完成[11/21 開窗計畫](2026-11-21-c1-window-plan.md)（#537，待負責人現場核准） |
| 11/21 C1 重測窗口（2026-11-20 新增） | 重建映像驗證 #532～#535、C6 2.3／2.4 重測、可選 #528 每週備份與 `c1-foundation` IAM | 11/21 晚上台北時間（`11:00Z`–`16:00Z`） | 在 11/22 決策前取得 C6 2.3／2.4 實證並決定 Gate 2 去留 | 2026-11-20 盤點：計畫書已合併（[11/21 窗口計畫](2026-11-21-c1-window-plan.md)，#537），狀態 `PLAN-ONLY／待負責人核准`；由負責人在場、Claude 執行雲端步驟 |
| CP-10 負責人驗收 | 簽 CP-10 | 11/28–11/29（週末） | 若週末不便，改 11/27 並把凍結提前到 11/25 | 已排 11/28–11/29；2026-11-20 盤點：維持不變，凍結日 11/26、11/22 決策移 12 月範圍、11/23 08:23Z C3 七天讀回、11/25 CAL-PILOT 延期確認 |

**下游包分兩段做，避免全部擠在 W3：** 表中排 W3 的包，若還有來源工作（補回歸、補程式），W2 就以 source-only 方式平行開工，不等上游外證；W3 只做「上游外證到位後的整包收尾驗收」。IAM、SESSION 的唯讀盤點與差異表在 W1 先做，W2 只剩負責人核准後的變更與讀回。無來源 7 包中，SOL-CALENDAR-RESTORE、SOL-HTML、SOL-RELEASE 在 W2 開始寫來源；SOL-INTEGRATION 維持最後。

## 四、59 包總表

欄位出自 manifest；finding 層的回歸測試要求「依 manifest」，本表不複製。歸屬裁定：#419 K1 屬 NO-WORK；E1-26 屬 SOL-RUNTIME-EVIDENCE；E1-05 屬 SOL-RELEASE（#308 誤列）。SOL-TTL、SOL-RBAC 的既有政策答案已由 RC-02（#454）同步至 manifest；不代表相關來源工作或外證完成。

| 包 | manifest status | risk | dependsOn | findings | write-set（前 3） | 現況 | 已合併 PR | RC 波次 | 執行者 | 需負責人核准 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SOL-CUSTODY | PLANNING_TERMINAL_NO_IMPLEMENTATION | MEDIUM | — | B-24、E1-19、E1-27、E1-29、E1-33、E1-34、E1-35、E2-11、E3-18、E4-05、E4-06、E4-11、E3-21、E3-22、E3-23、E3-26、E3-27、E3-28、E3-29、E3-30、E3-33、E3-36、E3-37、E4-16、E4-17、E4-18、E4-19、E4-20、E4-22、E4-25、E4-26 | — | NO-WORK（已終態） | manifest PLANNING_TERMINAL_NO_IMPLEMENTATION；歷史 claim 未標驗證 | — | — | 無 |
| SOL-NOTIFICATION | PLANNED_CURRENT_EVIDENCE_SCOPE | HIGH | — | B-08 | infra/terraform/wp-b4-alerting/main.tf | 已有來源切片；2026-11-20 盤點：仍待負責人審 ADR（`2026-10-30-sol-notification-design.md`）與 C1 publisher／IAM／DLQ 外證 | #384、#404、#407 | W2 | 負責人（ADR 核准）、Haiku（讀回） | ADR 核准；告警通知 IAM |
| LUNA-E2E-INVENTORY | PLANNED_CURRENT_EVIDENCE_SCOPE | MEDIUM | — | E3-32 | docs/architecture/test-strategy.md | DONE-MERGED（已終態） | #269 | — | — | 無 |
| LUNA-FIRESTORE-RUNNER | PLANNED_CURRENT_EVIDENCE_SCOPE | MEDIUM | — | E2-03 | scripts/run-firestore-vitest.mjs，scripts/run-firestore-vitest.test.mjs | DONE-MERGED（已終態） | #273 | — | — | 無 |
| SOL-READ-FAILURE | PLANNED_CURRENT_EVIDENCE_SCOPE | MEDIUM | SOL-SESSION-UI | C04、X-C01 | apps/web/public/modules/internal-test-booking-transport.js，apps/web/public/patient-app.js，apps/web/src/internal-test-boo… | DONE-MERGED（已終態）；2026-11-20 盤點：另於 #534 改善內測取消逾時收斂與列表刷新，待 11/21 驗證 | 沿用 #268 對帳留言 6562505748；#534（內測逾時收斂補強） | — | — | 無 |
| LUNA-ROBOTS-COMMENTS | PLANNED_CURRENT_EVIDENCE_SCOPE | MEDIUM | — | B-23、C06 | apps/web/public/robots.txt | DONE-MERGED（已終態） | #270 | — | — | 無 |
| LUNA-WORKBENCH-START | SOL_CORE_LEASE_REQUIRED | MEDIUM | — | C01 | apps/web/public/admin-bootstrap.js，apps/web/src/admin-bootstrap.test.ts | DONE-MERGED（已終態） | #271 | — | — | 無 |
| NO-WORK | PLANNING_TERMINAL_NO_IMPLEMENTATION | HIGH | — | B-39、B-43、A07、A10、E3-16、E3-34、E4-23、K1、B-52、X-C07 | — | NO-WORK（已終態） | manifest PLANNING_TERMINAL_NO_IMPLEMENTATION | — | — | 無 |
| SOL-ARCH-GATE | PLANNED_CURRENT_EVIDENCE_SCOPE | HIGH | — | E1-09、E1-20 | scripts/architecture-rules.mjs，scripts/architecture-rules.test.mjs，scripts/check-architecture.mjs | DONE-MERGED（已終態） | #253、#263 | — | — | 無 |
| SOL-ASSET-BUILD | PLANNED_CURRENT_EVIDENCE_SCOPE | MEDIUM | — | E1-32 | scripts/build-brand-assets.mjs，scripts/build-brand-assets.test.mjs，scripts/build-clinic-assets.mjs | DONE-MERGED（已終態） | #256 | — | — | 無 |
| SOL-BUILD | PLANNED_CURRENT_EVIDENCE_SCOPE | MEDIUM | — | E1-10、E1-28 | apps/web/src/build-web.test.ts，scripts/build-web.mjs，scripts/build-web.test.mjs | DONE-MERGED（已終態） | #260 | — | — | 無 |
| SOL-BUSINESS | PLANNED_CURRENT_EVIDENCE_SCOPE | MEDIUM | — | D-24、D-35、E3-25 | apps/api/src/business-delivery/business-delivery.application-service.ts，docs/plans/2026-09-18-business-delivery-follow-u… | DONE-MERGED（已終態） | 沿用 #268 對帳留言 6562505748 | — | — | 無 |
| SOL-CALENDAR-CANDIDATE | PLANNED_CURRENT_EVIDENCE_SCOPE | HIGH | SOL-SCHEDULE | D-33 | apps/api/src/calendar/calendar-pilot.application-service.test.ts，apps/api/src/firestore/calendar-pilot.repository.ts | 已有來源切片；2026-11-20 盤點：#474 已補未授權邊界，仍待不同病患負向矩陣與 SCHEDULE／IAM／SESSION 外證 | #363（D-33 決策矩陣）、#474（未授權邊界）、#514（CAL-PILOT 12/31 期限同步） | W3 | 長跑（gpt-6.1-terra） | 無 |
| SOL-CALENDAR-ENVELOPE | PLANNED_CURRENT_EVIDENCE_SCOPE | MEDIUM | SOL-CALENDAR-LEASE | D-11、D-17、NEW-09 | apps/worker/src/calendar-sync/firestore-calendar-sync.repository.ts，apps/worker/src/calendar-sync/google-sync-client.ts，… | 已有來源切片；2026-11-20 盤點：已合拆批／非字串狀態／#532／#533 修正，仍待 dead-letter／統計與 11/21 同步收斂及 provider 外證 | #408（D-17 競態守護）、#462、#489、#502、#532、#533 | W2 | 長跑（gpt-6.1-terra） | 無（來源）；provider 外證需負責人開窗 |
| SOL-CALENDAR-LEASE | PLANNED_CURRENT_EVIDENCE_SCOPE | MEDIUM | — | D-05、D-12 | apps/worker/src/calendar-sync/calendar-pilot-runtime.ts | 已有來源切片；2026-11-20 盤點：11/16 已續期至 2026-12-16（#520），APPROVAL-RC-2026-11-14 已釐清 Gate 2 範圍；11/18 同步 500 後已合 #532／#533，待 11/21 驗證與 Gate 2 50 次正常收斂外證 | #434（Gate 2 決策）、#436–#446、#450、#457、#461、#514、#520（11/16 續期讀回）、#532、#533 | W1 | Haiku（實測）、負責人（登入與核准） | 續期執行；真實日曆寫入；LEASE 真實 runtime 接入範圍釐清（D 清單 11/12，已決） |
| SOL-CALENDAR-RESTORE | PLANNED_CURRENT_EVIDENCE_SCOPE | HIGH | SOL-CALENDAR-ENVELOPE | D-31、D-32、D-01、D-02、D-03 | apps/worker/src/calendar-smoke.ts，apps/worker/src/calendar-sync/google-sync-client.ts，apps/worker/src/google-calendar.ts | 已有來源切片（原無來源；2026-11-20 盤點：#466／#491 已合衝突重放防護，仍缺 cancelled 還原等剩餘 finding，真實日曆演練屬 12 月） | #466、#491 | W3 | 長跑（gpt-6.1-terra） | 無（來源）；真實日曆還原演練屬 12 月 |
| SOL-CALENDAR-TESTS | PLANNED_CURRENT_EVIDENCE_SCOPE | MEDIUM | SOL-CALENDAR-ENVELOPE | D-41 | tests/firestore/calendar-stage-d-inbound.test.ts | 已有來源切片；2026-11-20 盤點：#467／#490／#503 已補交易與順序回歸，仍待獨跑／反序與最終凍結 SHA 證據 | #362（D-41）、#467、#490、#503、#514 | W3 | 長跑（gpt-6.1-terra） | 無 |
| SOL-CALENDAR-WATCH | PLANNED_CURRENT_EVIDENCE_SCOPE | MEDIUM | — | D-28、D-29 | apps/worker/src/calendar-sync/watch-channel-lifecycle.test.ts，apps/worker/src/calendar-sync/watch-channel-lifecycle.ts，a… | DONE-MERGED（已終態） | 沿用 #268 對帳留言 6562505748 | — | — | 無 |
| SOL-CI-IAC | PLANNED_CURRENT_EVIDENCE_SCOPE | MEDIUM | SOL-CI-SECURITY、SOL-IAC-LIFECYCLE、SOL-IAM、SOL-SUPPLY | B-05 | .github/workflows/verify.yml，infra/terraform/c1-foundation/noop.tftest.hcl | 已有來源切片（原無來源；2026-11-20 盤點：#468 已合 mock init 失敗即停，仍缺 B-05 Terraform plan-only workflow 驗證與上游依賴） | #378（B-05 決定紀錄）、#468 | W3 | 長跑（gpt-6.1-terra） | 無（B-05 的受保護部分不動） |
| SOL-CI-SECURITY | PLANNED_CURRENT_EVIDENCE_SCOPE | HIGH | — | B-27 | .github/workflows/verify.yml | DONE-MERGED（已終態） | #272 | — | — | 無 |
| SOL-CLI | PLANNED_CURRENT_EVIDENCE_SCOPE | MEDIUM | SOL-CONFIG、SOL-OBSERVABILITY | E2-04、E2-05、E2-07 | scripts/historical-artifacts.mjs，scripts/phase0-snapshot.mjs，scripts/phase0-snapshot.test.mjs | 已有來源切片；2026-11-20 盤點：#469／#493 已補 PATHEXT 與目錄防護，仍待其餘 CLI 入口與依賴證據 | #372（E2-07，11/02 前）、#469、#493 | W3 | 長跑（gpt-6.1-terra） | 無 |
| SOL-CONFIG | PLANNED_CURRENT_EVIDENCE_SCOPE | HIGH | SOL-IAC-LIFECYCLE | B-45、E1-15、E2-09 | apps/api/src/business-delivery/business-delivery.config.ts，apps/api/src/platform/runtime/c1-required-config.ts，infra/con… | 已有來源切片；2026-11-20 盤點：#470／#492／#504 已補遮蔽與 AST／解構盤點，仍待動態解構／rest binding 與 IAC-LIFECYCLE 依賴 | #366（B-45、E1-15、E2-09）、#470、#492、#504 | W3 | 長跑（gpt-6.1-terra） | 無 |
| SOL-CONTAINERS | PLANNED_CURRENT_EVIDENCE_SCOPE | MEDIUM | — | B-26 | containers/api.Dockerfile，containers/internal-test-outbox.Dockerfile，containers/worker.Dockerfile | ALREADY_FIXED（已終態） | #255 | — | — | 無 |
| SOL-CONTRACTS | PLANNED_CURRENT_EVIDENCE_SCOPE | HIGH | — | B-15、B-17、B-16、B-33、B-36、B-37、D-21、D-43、E4-15 | apps/api/src/appointments/appointment.application-service.ts，apps/api/src/appointments/appointment.controller.ts，apps/ap… | DONE-MERGED（已終態） | 沿用 #268 對帳留言 6562505748 | — | — | 無 |
| SOL-DESIGN-GATE | PLANNED_CURRENT_EVIDENCE_SCOPE | MEDIUM | — | E1-22、E3-14 | docs/README.md，docs/design/test-only-operations-ui.md，docs/design/ui-ux-rules.md | DONE-MERGED（已終態） | 沿用 #268 對帳留言 6562505748 | — | — | 無 |
| SOL-DOC-GATE | PLANNED_CURRENT_EVIDENCE_SCOPE | MEDIUM | — | E1-23 | scripts/check-docs-links.mjs，scripts/check-docs-links.test.mjs | DONE-MERGED（已終態） | #259、#248 | — | — | 無 |
| SOL-DOCS | PLANNED_CURRENT_EVIDENCE_SCOPE | MEDIUM | SOL-GOVERNANCE、SOL-HTTP、SOL-PRIVACY、SOL-SESSION | B-46、D-39、E3-13、E3-31、B-12、C05、E3-04 | README.md，apps/api/src/app.module.ts，apps/api/src/calendar/calendar-watch.controller.ts | 已有來源切片；2026-11-20 盤點：W3 文件與測試已合 #475／#477／#478／#481／#485，仍待上游實測結案後最終同步 | #415、#424–#426（文件標註）、#475、#477、#478、#481、#485 | W3 | Sonnet（文件） | 文件類外證適用性（隨本計畫第二節決策一併問） |
| SOL-EXPORT | PLANNED_CURRENT_EVIDENCE_SCOPE | HIGH | SOL-CONTRACTS、SOL-RBAC | B-38、D-37、A09、NEW-06 | apps/api/src/business-delivery/business-export.application-service.test.ts，apps/api/src/business-delivery/business-expor… | 已有來源切片；2026-11-20 盤點：11/16 RC-06 CSV 實測通過（#523）且 #524 已修補 UTF-8 BOM 與 vendor 同步；仍待其餘 finding 回歸與凍結版重測 | #328（schemaVersion 准入）、#422（閏年範圍）、#471、#494、#505、#523（11/16 實測）、#524（BOM） | W3 | 長跑（gpt-6.1-terra） | 無 |
| SOL-GOVERNANCE | PLANNED_CURRENT_EVIDENCE_SCOPE | HIGH | SOL-PRIVACY | B-18、E1-21、E1-25、E3-11、E3-20 | .claude/hooks/guard-commands.mjs，.claude/hooks/guard-commands.test.mjs，README.md | 已有來源切片；2026-11-20 盤點：#472 已補 waiver 拒絕測試，仍待 RC-04 分支保護讀回串接與 B-18 對帳 | #412（E1-21）、#472 | W3 | Sonnet | 無 |
| SOL-HTML | PLANNED_CURRENT_EVIDENCE_SCOPE | HIGH | SOL-PRIVACY、SOL-RUNTIME-EVIDENCE | B-22、X-C03 | apps/web/csp-policy.mjs，apps/web/public/modules/trusted-html.js，apps/web/src/security-headers.test.ts | 已有來源切片（原無來源；2026-11-20 盤點：#479／#485 已合導向語法 lexical 防護與 X-C03 協定，仍缺 B-22 重判，完整 HTML parser 淨化列第八節 12 月） | #479、#485 | W3 | 長跑（gpt-6.1-terra） | 無 |
| SOL-HTTP | PLANNED_CURRENT_EVIDENCE_SCOPE | HIGH | SOL-CONTRACTS、SOL-SESSION | K5、A01、A11、NEW-04 | apps/api/src/app.module.ts，apps/api/src/appointments/appointment.controller.ts，apps/api/src/auth/calendar-pilot.guard.ts | DONE-MERGED（已終態） | #245 | — | — | 無 |
| SOL-IAC-LIFECYCLE | PLANNED_CURRENT_EVIDENCE_SCOPE | HIGH | SOL-IAM、SOL-INGRESS | B-10、B-11、B-50、E2-08 | infra/terraform/c1-foundation/main.tf，infra/terraform/c1-foundation/noop.tftest.hcl，infra/terraform/c5-firestore/main.tf | 已有來源切片（原無來源；2026-11-20 盤點：#463／#497 已合 B-10 與遷移到期拒絕，另合 #528／#535 Terraform；仍缺 B-11、B-50、E2-08 與真實 plan／apply 核准） | #463、#497、#528（C5 每週備份）、#535（IAM IaC） | W2 | 長跑（gpt-6.1-terra） | Terraform apply 需負責人核准（來源 PR 不需） |
| SOL-IAM | PLANNED_CURRENT_EVIDENCE_SCOPE | HIGH | SOL-INGRESS | B-49、E1-06、E1-24、E2-01、E3-08、E3-09、B-01、B-02、B-09、B-41、E1-12、NEW-10 | docs/README.md，docs/runbooks/cal-pilot-import.md，docs/runbooks/calendar-go-live.md | 已有來源切片；2026-11-20 盤點：11/17 IAM 唯讀讀回與停用 `c1-terraform-ci` 完成（#527），B-01／B-02／NEW-10 IaC 已於 #535 核准合併待 apply；仍缺 NEW-10 tfstate bucket 雲端項與其餘 9 finding 來源回歸 | #388、#392、#527（11/17 讀回）、#535（B-01／B-02／NEW-10 IaC） | W2 | 負責人（IAM 核准）、Haiku（唯讀讀回）、長跑（gpt-6.1-terra） | IAM 變更與讀回窗口（逐批） |
| SOL-IDENTITY | PLANNED_CURRENT_EVIDENCE_SCOPE | HIGH | SOL-CONTRACTS、SOL-SESSION | B-34、D-10、K2、NEW-01 | apps/api/src/appointments/appointment.application-service.ts，apps/api/src/internal-test-booking/internal-test-booking.au… | 已有來源切片；2026-11-20 盤點：#480 已合畫面遮罩與列印完整，仍待 SESSION 外證與其餘顯示／intake 回歸 | #389（K2）、#417（B-34）、#480 | W3 | 長跑（gpt-6.1-terra） | 無 |
| SOL-INGRESS | PLANNED_CURRENT_EVIDENCE_SCOPE | HIGH | — | K9、E1-04、E1-14、K6、B-03、X-C06 | apps/api/src/internal-test-booking/internal-test-booking.gate.test.ts，apps/api/src/internal-test-booking/internal-test-b… | 已有來源切片；2026-11-20 盤點：11/16 唯讀讀回與 Terraform 一致（#521）；跨入口同身分桶實發計數與 handler／writer 增量仍為 `NOT_PROVEN` | #385、#390、#391、#416、#437、#458、#521（11/16 讀回） | W1 | Haiku（唯讀讀回）、負責人（開窗） | 入口驗收窗口 |
| SOL-INTEGRATION | PLANNED_CURRENT_EVIDENCE_SCOPE | HIGH | SOL-ARCH-GATE、SOL-ASSET-BUILD、SOL-BUILD、SOL-BUSINESS、SOL-CALENDAR-CANDIDATE、SOL-CALENDAR-ENVELOPE、SOL-CALENDAR-LEASE、SOL-CALENDAR-RESTORE、SOL-CALENDAR-TESTS、SOL-CALENDAR-WATCH、SOL-CI-IAC、SOL-CI-SECURITY、SOL-CLI、SOL-CONFIG、SOL-CONTAINERS、SOL-CONTRACTS、SOL-DESIGN-GATE、SOL-DOC-GATE、SOL-DOCS、SOL-EXPORT、SOL-GOVERNANCE、SOL-HTML、SOL-HTTP、SOL-IAC-LIFECYCLE、SOL-IAM、SOL-IDENTITY、SOL-INGRESS、SOL-LIFECYCLE、SOL-LIST、SOL-MAINTENANCE、SOL-OBSERVABILITY、SOL-OUTBOX、SOL-PRIVACY、SOL-QUERY-INDEX、SOL-RBAC、SOL-RELEASE、SOL-RETENTION、SOL-RETURN、SOL-ROUTE-INVENTORY、SOL-RUNTIME-EVIDENCE、SOL-SAST、SOL-SCHEDULE、SOL-SECRETS、SOL-SESSION、SOL-SESSION-DOCS、SOL-SESSION-UI、SOL-STRUCTURE-GATE、SOL-SUPPLY、SOL-TTL、SOL-VISUAL-EVIDENCE | D-40、E3-12、E4-02、E4-04、E4-13、E4-01、E4-03、E4-12 | docs/implementation/phase-1-booking-mvp-execution-log.md，docs/plans/2026-09-14-internal-preproduction-remediation-plan.m… | 無來源；2026-11-20 盤點：59 包中唯一仍完全無來源 PR，上游多包未結，依第三節縮範圍準則建議移 12 月（見第十節） | 無來源 PR | W3（最後；上游未結則延後 12 月） | 長跑（gpt-6.1-terra） | 無（凍結前由 Claude 驗收） |
| SOL-LIFECYCLE | PLANNED_CURRENT_EVIDENCE_SCOPE | HIGH | SOL-CONTRACTS | A06、D-09、D-23、E3-15 | docs/product/front-desk-followup-and-patient-ux-spec-2026-07-23.md，packages/contracts/src/payroll.ts，packages/domain/src… | DONE-MERGED（已終態） | #383 | — | — | 無 |
| SOL-LIST | PLANNED_CURRENT_EVIDENCE_SCOPE | MEDIUM | SOL-CONTRACTS、SOL-IDENTITY、SOL-RETURN | K7、C07、E4-24 | apps/api/src/appointments/appointment.application-service.ts，apps/web/public/modules/admin-view.js，docs/architecture/api… | 已有來源切片；2026-11-20 盤點：#482 已補已載入預約與完整搜尋結果區分，仍待 K7／E4-24 跨包回歸與上游外證 | #437（決定）、#448（K7 續讀 cursor）、#482 | W3 | 長跑（gpt-6.1-terra） | 無 |
| SOL-MAINTENANCE | PLANNED_CURRENT_EVIDENCE_SCOPE | MEDIUM | — | E3-07 | apps/api/src/platform/runtime/maintenance-gate.ts，docs/runbooks/backup-and-restore.md，docs/runbooks/incident-response.md | 已有來源切片；2026-11-20 盤點：11/16 API 停寫實測通過並確認兩 worker 皆接線控制文件（#523／#525）；worker 端逐 writer 實測與 runsheet §5 排空外證仍為 `NOT_RUN` | #386、#405、#447、#456、#523／#525（11/16 讀回與實測） | W1 | Haiku（實測）、負責人（開窗） | C1 維護開關實測窗口 |
| SOL-OBSERVABILITY | PLANNED_CURRENT_EVIDENCE_SCOPE | HIGH | SOL-IAC-LIFECYCLE、SOL-IAM | B-25、B-51、D-15、D-27、D-34、A12、B-06、B-07、B-54、D-25 | apps/api/src/health.controller.ts，apps/api/src/platform/errors/api-error.ts，apps/api/src/platform/runtime/api-metrics.ts | 已有來源切片；2026-11-20 盤點：已合 D-34／log cap／佇列彙總／D-15 與 emulator 測試（#483／#485／#499／#506／#512），仍缺 log sink 目的地決定、provider aggregation parity 與其餘 finding | #409（B-54）、#483、#485、#499、#506、#512 | W3 | 長跑（gpt-6.1-terra） | 無（日誌 sink 目的需負責人決定時再問） |
| SOL-OUTBOX | PLANNED_CURRENT_EVIDENCE_SCOPE | MEDIUM | — | E4-21 | apps/worker/src/outbox-processor.ts | DONE-MERGED（已終態） | #258 | — | — | 無 |
| SOL-PRIVACY | PLANNED_CURRENT_EVIDENCE_SCOPE | HIGH | SOL-CALENDAR-ENVELOPE、SOL-CALENDAR-RESTORE、SOL-IDENTITY | D-14、D-16、D-30、E3-05、B-21、E3-01、E3-02、E3-03、E4-10 | .firebaserc，apps/web/public/privacy.html，apps/worker/README.md | 已有來源切片；2026-11-20 盤點：#515／#517 已合隱私政策 v1.0 RC 草稿與 11/19 核准；仍待負責人補 D-001 登記全名與公用信箱、D-002 Google DPA 確認，及 9 finding 回歸（正式發布與法律審查列 12 月） | #364、#365、#515、#517 | W3（正式發布 12 月） | 長跑（gpt-6.1-terra）、負責人（文字審閱） | D-001～D-003；告知文字審閱（11/19，已決，待補件） |
| SOL-QUERY-INDEX | PLANNED_CURRENT_EVIDENCE_SCOPE | MEDIUM | SOL-CONTRACTS、SOL-EXPORT、SOL-TTL | B-44 | apps/api/src/firestore/business-delivery-export.repository.ts，apps/api/src/firestore/business-delivery.repository.ts，fir… | 已有來源切片；2026-11-20 盤點：#495 已補雙向索引核對，仍待上游結案與雲端索引部署核准 | #414、#427–#432（B-44）、#495 | W3 | 長跑（gpt-6.1-terra） | 索引部署需負責人核准（Firestore 索引屬雲端狀態） |
| SOL-RBAC | PLANNED_CURRENT_EVIDENCE_SCOPE | HIGH | SOL-CONTRACTS、SOL-SESSION | A04、D-22、E3-17、E4-09 | apps/api/src/platform/authorization/rbac-appointment-policy.ts，apps/api/src/schedule/schedule.application-service.ts，app… | 部分／待同 SHA 回歸及 SESSION 外證；2026-11-20 盤點：11/16 主管與 11/18 櫃台分權實測皆通過（#523／#530），仍待 A04／E3-17／E4-09 同 SHA 回歸與 `audit.ts` claims 映射歸屬（列第八節 12 月） | #241、#251（文件）、#454（規劃狀態）、#481（別名測試）、#484（D-22）、#523／#530（雲端實測） | W1（manifest 同步，RC-02）／W3（實作） | Sonnet（同步）、長跑（gpt-6.1-terra）（實作） | 無（E4-09 已決） |
| SOL-RELEASE | PLANNED_CURRENT_EVIDENCE_SCOPE | HIGH | SOL-IAC-LIFECYCLE、SOL-IAM、SOL-INGRESS | E1-03、E1-05、E1-07、E1-13、E1-01、E1-02、E1-11 | scripts/cal-pilot-build-images.ps1，scripts/cal-pilot-extension-policy.mjs，scripts/cal-pilot-extension-policy.test.mjs | 已有來源切片（原無來源；2026-11-20 盤點：#498／#514 已合續期腳本修補與 12/31 期限同步；E1-01/02/03/05/07/11/13 其餘項與 release 回歸未完） | #498、#514 | W3 | 長跑（gpt-6.1-terra） | 部署相關變更需負責人核准 |
| SOL-RETENTION | PLANNED_CURRENT_EVIDENCE_SCOPE | HIGH | SOL-CONTRACTS | A03、D-36 | apps/api/src/business-delivery/business-retention.application-service.test.ts，apps/api/src/business-delivery/business-re… | ALREADY_FIXED（已終態） | 沿用 #268 對帳留言 6562505748 | — | — | 無 |
| SOL-RETURN | PLANNED_CURRENT_EVIDENCE_SCOPE | HIGH | SOL-CONTRACTS、SOL-IDENTITY、SOL-INGRESS | K4、D-08、E3-19 | apps/api/src/firestore/rate-limit.repository.ts，apps/api/src/patients/patient-directory.ts，apps/api/src/platform/runtime… | 已有來源切片；2026-11-20 盤點：#481／#485 已補限流文件與舊鍵碰撞測試，仍待 K4／D-08／E3-19 完整覆蓋與上游依賴 | #419（自述 K1，已裁定為額外回歸測試）、#481、#485 | W3 | 長跑（gpt-6.1-terra） | 無（return_sessions 24 小時已決） |
| SOL-ROUTE-INVENTORY | PLANNED_CURRENT_EVIDENCE_SCOPE | HIGH | SOL-LIST、SOL-RETURN | E1-16、E1-17、E3-10 | docs/architecture/api-v1-contract.md，scripts/booking-route-truth.mjs，scripts/booking-route-truth.test.mjs | 已有來源切片；2026-11-20 盤點：#481／#485 已補到診／回診與商業交付路由清單，仍待其餘路由盤點與上游依賴 | #415、#420（E1-16、E1-17）、#481、#485 | W3 | 長跑（gpt-6.1-terra） | 無 |
| SOL-RUNTIME-EVIDENCE | PLANNED_CURRENT_EVIDENCE_SCOPE | MEDIUM | SOL-IAM、SOL-PRIVACY | E1-18、E1-26、E2-02、E2-06、E2-10、E4-07 | docs/reviews/ui-visual-cp01-2026-09-29.md，firebase.json，scripts/generate-ci-evidence.mjs | 已有來源切片；2026-11-20 盤點：#481／#485 已補 shard 與過期 threshold 測試，仍待 6 finding 之 C1 smoke 腳本實跑與上游依賴 | #421、#423（E1-26，分支名的 config 為命名沿用）、#481、#485 | W3 | 長跑（gpt-6.1-terra）、Haiku | 無 |
| SOL-SAST | PLANNED_CURRENT_EVIDENCE_SCOPE | HIGH | — | B-14、B-30、B-28 | .github/workflows/sast-scan.yml，security/semgrep/clinic-javascript.js，security/semgrep/clinic-javascript.yml | ALREADY_FIXED（已終態） | 沿用 #268 對帳留言 6562505748 | — | — | 無 |
| SOL-SCHEDULE | PLANNED_CURRENT_EVIDENCE_SCOPE | HIGH | SOL-CONTRACTS、SOL-IDENTITY、SOL-LIFECYCLE、SOL-RBAC、SOL-RETURN、SOL-TTL | B-35、A08、K8、A02、D-07、D-42 | apps/api/src/calendar/calendar-pilot.application-service.test.ts，apps/api/src/firestore/booking.repository.ts，apps/api/s… | 已有來源切片；2026-11-20 盤點：#496 已補回診結束時間共用時段長度，仍待其餘 4 finding 來源回歸與上游依賴 | #410、#411（D-42）、#496 | W3 | 長跑（gpt-6.1-terra） | 排程啟用需負責人核准 |
| SOL-SECRETS | PLANNED_CURRENT_EVIDENCE_SCOPE | HIGH | — | B-29、E1-31、B-13、B-31、B-55 | .claude/settings.json，.gcloudignore，.gitignore | 已有來源切片；2026-11-20 盤點：11/16 完成雲端密鑰唯讀讀回並停用 3 個舊／未用版本（#525／#526）；runsheet §7 本機逐工具 canary／上傳清單外證仍為 `NOT_RUN` | #277、#291、#320、#330（宣告層）、#459、#525／#526（11/16 讀回與停用） | W1 | 負責人（重新登入）、Haiku（canary） | 登入與 canary 窗口 |
| SOL-SESSION | PLANNED_CURRENT_EVIDENCE_SCOPE | HIGH | SOL-CONTRACTS、SOL-INGRESS | K3、E4-14、C02、X-C02、NEW-02、NEW-03、NEW-07、NEW-08 | apps/api/src/appointments/appointment.controller.ts，apps/api/src/auth/calendar-pilot-session.controller.ts，apps/api/src/… | 已有來源切片；2026-11-20 盤點：七天邏輯已合並於 11/16 上線（#476／#523），11/17 完成 E4-14 技術判斷（#527），11/18 通過停權 401 與登出撤銷實測（#530）；仍待 `2026-11-23T08:23:00Z` 起 C3 七天讀回與 E4-14 模組組裝確認 | #387、#394、#397–#403、#406、#475、#476、#523／#527／#530（雲端實測與判斷） | W2 | Haiku（實測）、負責人（決定） | E4-14 authority（11/17 判屬技術判斷）；C3 session 窗口 |
| SOL-SESSION-DOCS | PLANNED_CURRENT_EVIDENCE_SCOPE | HIGH | SOL-RBAC、SOL-SESSION | E3-24、E3-35、D-38、E3-06 | docs/architecture/rbac-matrix.md，docs/plans/2026-10-01-cp-08-regression-evidence-worksheet.md，docs/runbooks/cal-pilot-30… | 已有來源切片；2026-11-20 盤點：#475／#481／#485 已同步七天決定與權威指標，仍待 E3-24／E3-35 盤點與 C3 七天實測後同步 | #360、#475、#481、#485 | W3 | Sonnet | 無 |
| SOL-SESSION-UI | PLANNED_CURRENT_EVIDENCE_SCOPE | HIGH | SOL-SESSION | C03、C09、X-C04、X-C05 | apps/web/public/admin-bootstrap.js，apps/web/public/calendar-pilot.css，apps/web/public/index.html | DONE-MERGED（已終態） | #245 | — | — | 無 |
| SOL-STRUCTURE-GATE | PLANNED_CURRENT_EVIDENCE_SCOPE | MEDIUM | — | E1-30 | scripts/check-structure.mjs，scripts/check-structure.test.mjs | DONE-MERGED（已終態） | #254 | — | — | 無 |
| SOL-SUPPLY | PLANNED_CURRENT_EVIDENCE_SCOPE | HIGH | SOL-CI-SECURITY、SOL-CONTRACTS、SOL-OBSERVABILITY | B-19、B-32、B-20、B-42、E1-08、E2-12、B-48、E4-08 | .github/workflows/verify.yml，.npmrc，docs/product/luna-local-project-completion-master-plan.md | 部分／待政策或文件；2026-11-20 盤點：RC-01 braces 已移除（#453）、FTP override 移除（#486）、SBOM 根元件（#500）、CI 開發依賴稽核規則已更新（#531）；8 finding 其餘項仍待收尾 | #280（最小修補）、#281（決定）、#453（RC-01）、#481、#486、#500、#531 | W1（braces，RC-01）／W3（整包） | 長跑（gpt-6.1-terra） | 無（不新增例外） |
| SOL-TTL | PLANNED_CURRENT_EVIDENCE_SCOPE | HIGH | SOL-IAC-LIFECYCLE、SOL-IDENTITY、SOL-RETURN、SOL-SESSION | A05、B-04、NEW-05 | apps/api/src/firestore/rate-limit.repository.ts，apps/api/src/internal-test-booking/internal-test-booking.authenticator.t… | 部分／待上游及同 SHA 回歸；現行雲端 TTL 未讀回；2026-11-20 盤點：11/16 已讀回 C5 Firestore `bd_export_chunks.purgeAt` TTL 為 `ACTIVE`（#525），仍待上游結案後同 SHA 回歸 | #371（來源切片）、#454（規劃狀態）、#525（11/16 TTL 讀回） | W1（manifest 同步，RC-02） | Sonnet | 無（已決） |
| SOL-VISUAL-EVIDENCE | PLANNED_CURRENT_EVIDENCE_SCOPE | MEDIUM | — | E5-01、E5-02、E5-03、E5-04、E5-05、E5-06、E5-07、E5-08、E5-09、E5-10 | — | DONE-MERGED（已終態）；2026-11-20 盤點：另於 #518、#519 合併 2026-11-15 UI 評分修正 | 沿用 #268 對帳留言 6562505748；#518、#519（UI 評分修正） | — | — | 無 |

## 五、RC 新增包（11）摘要

逐包內容見[細部包](2026-11-08-phase1-rc-packets.md)第三節。

| ID | 名稱 | 目的 | 波次 | 執行者 | 需核准 |
| --- | --- | --- | --- | --- | --- |
| RC-01 | 供應鏈 braces | 移除 braces 例外，firebase-tools 升 15.35.0。 | W1 | Claude（PR #453） | 無（Claude 驗收後合併） |
| RC-02 | manifest 與台帳同步 | 把 manifest 狀態與歸屬裁定同步，並讓本檔取代 #268 承載台帳。 | W1 | Sonnet | 關閉 #268 需負責人同意；manifest 是機器權威，修改前先向負責人說明 |
| RC-03 | 公開 repo 隱私收尾 | 清掉公開 repo 的個資疑慮。 | W1 | Haiku（掃描）、負責人（補同意） | 負責人補照片同意紀錄 |
| RC-04 | 分支保護定期讀回 | 用腳本定期讀回 main 分支保護，不手寫現況。 | W2 | Sonnet | 新增 workflow 屬 CI 變更，先向負責人說明 |
| RC-05 | Terraform 流量跟隨最新 revision | apply 後流量自動到最新 revision。 | W1 | Sonnet（寫） | Terraform apply 需負責人逐批核准 |
| RC-06 | C1 員工端第二窗口 | 補完 C1 員工端流程的未測項目。 | W1 | Haiku（實測）、負責人（開窗） | 開窗；observed_since |
| RC-07 | 日曆 Gate 2 | 專用測試日曆續期與真實日曆實測。 | W1–W2 | Haiku、負責人 | 續期；真實日曆寫入；延期決定 |
| RC-08 | 程式可維護性量測 | 建立量測基準，不擋 PR。 | W3（量測）／12 月（切分） | Sonnet | CI 變更先向負責人說明 |
| RC-09 | 文件入口整理 | 讓本計畫成為唯一現行入口。 | W3 | Sonnet | 無 |
| RC-10 | 長跑重啟與分工 | 11/9 重啟長跑並確立分工。 | W1 | Claude、長跑（gpt-6.1-terra） | 無 |
| RC-11 | 專案治理 | 把負責人的合併授權與角色分工落檔，並建立每週治理讀回。 | W1 | Sonnet（寫）、負責人（審） | 屬治理規則變更（邏輯變更），合併前必須先給負責人看 |

## 六、執行規則

- 實作交子代理：Sonnet 寫程式、Haiku 唯讀與實測；Claude 判斷與驗收；長跑（gpt-6.1-terra）照波次取包。
- 合併：CI 綠燈、驗收過由 Claude 合併；有邏輯變更先向負責人說明。
- 部署、雲端狀態、IAM、金鑰、業務決定、C1～C6：每批由負責人明確同意，核准不延伸到未列項目。
- 不得以合成、Emulator、預覽站或文件冒充正式環境證據。
- 電腦資源有限：本機只跑相關少數測試，完整測試以 exact-head CI 為準。

## 七、計畫檔現行／歷史對照

依 2026-11-08 對 `docs/plans/` 28 個檔的盤點（只依檔頭狀態與明文取代字樣；不改歷史檔內容）。

| # | 檔名 | 主旨 | 判斷 |
| --- | --- | --- | --- |
| 1 | 2026-09-14-agent-tooling-adoption.md | Agent 工具導入評估與計畫 | 歷史 |
| 2 | 2026-09-14-internal-preproduction-remediation-plan.md | INTERNAL_PREPRODUCTION 補強施工計畫（獨立稽核） | 歷史 |
| 3 | 2026-09-17-phase1-completion-packets.md | Phase 1 完成封包（plan-only，M11/M12 等） | 歷史 |
| 4 | 2026-09-18-business-delivery-follow-up.md | 正式交付與商務需求的後續程式規劃 | 部分現行、部分歷史 |
| 5 | 2026-09-22-current-project-acceptance-master-plan.md | 現有診所專案完整驗收主計畫 | 現行 |
| 6 | 2026-09-22-current-project-acceptance-matrix.md | 現有專案驗收矩陣與證據格式 | 現行 |
| 7 | 2026-09-22-current-project-execution-packets.md | 現有專案逐包執行計畫（Luna-ready） | 現行 |
| 8 | 2026-09-22-current-project-pr-history.md | PR #1～#161 全歷史與有效性 | 歷史 |
| 9 | 2026-09-22-p1-09-operator-packet.md | P1-09 C1 有界操作與關帳 packet | 歷史 |
| 10 | 2026-09-27-p1-09-closeout-quota-approval.md | P1-09 關帳追加額度核准 | 歷史 |
| 11 | 2026-09-28-cp-02-c1-runtime-approval.md | CP-02 C1 新預約驗收核准 | 歷史 |
| 12 | 2026-09-30-luna-execution-plan.md | GPT-6 Luna 逐步執行計畫 | 歷史 |
| 13 | 2026-10-01-c1-batch-deployment-packet.md | C1 商務交付批次部署 packet | 現行 |
| 14 | 2026-10-01-cp-08-regression-evidence-worksheet.md | CP-08 全系統回歸證據 worksheet | 現行 |
| 15 | 2026-10-01-cp-10-current-project-acceptance-checklist.md | CP-10 現有專案業主驗收清單 | 現行 |
| 16 | 2026-10-05-audit-followup-luna-plan.md | 外部稽核後續逐步計畫（Luna） | 歷史（執行入口；原稽核對照保留） |
| 17 | 2026-10-05-audit-gap-sol-luna-execution-plan.md | 稽核漏網複核與 Sol／Luna 執行圖補充 | 歷史（執行入口；原複核脈絡保留） |
| 18 | 2026-10-06-sol00-finding-manifest.md | SOL-00 254 ID current-evidence 索引（v3） | 現行 |
| 19 | 2026-10-06-sol00-safe-manifest-closeout-plan.md | SOL-00 current-evidence planning closeout | 現行 |
| 20 | 2026-10-06-sol00-safe-manifest.json | SOL-00 safe manifest（機器權威） | 現行 |
| 21 | 2026-10-18-sol-luna-autorun-prompts.md | Sol／Luna 一路跑完：設定與提示詞 | 歷史（執行入口；設定與提示詞為當時脈絡） |
| 22 | 2026-10-22-sol-business-adjustment-design.md | SOL-BUSINESS 可追溯試用調整模型提案 | 現行 |
| 23 | 2026-10-22-sol-calendar-lease-coordination.md | SOL-CALENDAR-LEASE 協調設計候選 | 現行 |
| 24 | 2026-10-25-external-acceptance-runsheet.md | Sol v2 外部驗收測試單 | 現行 |
| 25 | 2026-10-25-utc-caller-matrix.json | UTC caller 矩陣（參考盤點） | 現行 |
| 26 | 2026-10-30-sol-notification-design.md | SOL-NOTIFICATION publisher 範圍與 consumer 路徑提案 | 現行 |
| 27 | 2026-11-02-sol-maintenance-source-control.md | E3-07 共用停寫來源候選 | 現行 |
| 28 | verified-staging-execution-plan-v1.3-frozen.md | VERIFIED STAGING 執行計畫 v1.3 凍結版 | 歷史 |

`2026-11-08-phase1-rc-*` 兩份為新增現行。#23 的 Gate 2 敘述（檔頭與 :17、:176）不一致，待負責人釐清。

## 八、12 月正式上線草案（日期於 RC tag 後排定）

| 項目 | 前置條件 |
| --- | --- |
| 真實病患資料 | D-001～D-003、D-010 核准；Stage 4 實作證據；法律／隱私審查完成 |
| 正式隱私政策發布 | D-003 全文核准與審查；官網 PUB-03 實機接受 |
| 公開預約寫入 | D-004、D-005、D-011 正式核准；public API 與身分流程 |
| 備份還原、區域故障 | D-002 備份語意；實際還原一次並比對 |
| 負載、事故演練、人工無障礙 | RC 凍結後以同一 candidate 執行 |
| 五方簽核 | clinic、privacy、security、operations、technical 對同一 RC 共同決定 |
| 程式切分（RC-08） | Gate 2 結束；先補回歸 |
| 其餘 CP-10 12 月項目 | 見第一節表 |
| 正式網域與站台切換 | D-011 定案後：`robots`／indexability 改 route-specific fail-closed、`og:url`／canonical 換網域、分享預覽與快取在正式網域驗證、預覽頻道改正式 Hosting 並建立回滾流程、移除 `ONLINE PREVIEW` 標示、資料保存告知依核准政策改寫（[roadmap 第四節](../roadmap.md)） |
| 資安決定草稿定案 | T10 身分安全參數（TOTP 容忍窗、錯誤鎖定、手機遺失重綁、授權碼效期）上線前訂死；T11 維持不設 break-glass 萬能憑證；D-012 用到正式網站屬新情境須重新核准；T7、T9、T12、T14～T17 由負責人或資安定案（[草稿](../security/technical-security-decision-draft-2026-08-23.md):161–186、:266–269） |
| 員工帳號開通與教學 | A-09 手冊盲走通過；具名開通人、帳號清單、第一次教學日期 |
| 告警收件與事故聯絡 | 告警收件人、事故聯絡人與備援、日誌匯出去處（SOL-OBSERVABILITY 待決） |
| 既有預約資料 | 決定上線當天舊預約是否搬入；搬就需要對照與讀回，不搬就寫明人工並行期間 |
| 費用上限 | 雲端預算告警金額與收件人（屬雲端設定，負責人核准） |
| 實機相容 | 診所實際使用的裝置與瀏覽器清單，逐一跑主要流程 |
| 暫時做法升級 | `trusted-html.js` 換完整淨化（`shortcut:` 註記）；日曆對帳單次上限 100 筆的實際量評估；`packages/domain/src/audit.ts` 角色 claims 映射與執行（目前沒有封包涵蓋，最接近 SOL-RBAC；需指定歸屬） |
| 交付後安排 | 保固期與回報管道；第二階段範圍；本節各項的日期與負責人在 RC tag 後 3 日內排定 |

## 九、台帳現況（更新日 2026-11-10）

本節取代 #268 本文；#268 已於 2026-11-08 關閉。以下分別記已合併來源切片與尚在審查的 PR；CI 或來源文件不等於雲端／provider 實測、整包完成或操作授權。

### 第一批：2026-11-09 已合併

| 包 | PR 與 repo 來源切片 | 剩餘範圍 |
| --- | --- | --- |
| RC-02 | #454：manifest 兩項政策狀態及 finding 歸屬對帳 | 不代表相關實作或整包完成；本節為後續台帳 |
| RC-11 | #455：決定記錄、角色分工提案及每週讀回清單 | 每週實際讀回及適用的後續審閱仍須執行 |
| SOL-MAINTENANCE | #456：驗收單反映 #447 的來源入口接線 | 實際 store、跨程序、全 writer、排空與恢復外證未完成；雲端窗口待負責人 |
| RC-07 | #457：續期邊界與拒絕測試；#450 已提供續期來源 | 尚未實際續期、50 次試跑或 staging／雲端呼叫；窗口待負責人 |
| SOL-INGRESS | #458：合成轉送位址正反例 | 同桶與 handler／writer 安全觀測、兩入口外證尚缺；窗口待負責人 |
| SOL-SECRETS | #459：排除宣告測試 | 逐工具讀前拒絕、零外送與 upload-list 外證尚缺；窗口待負責人 |

### 第二批：2026-11-09 已合併

| 包 | PR 與來源範圍 | 尚未完成 |
| --- | --- | --- |
| CI 修補 | #460：固定 Gitleaks 下載有限次重試 | 未實際模擬 504 後恢復 |
| SOL-CALENDAR-LEASE | #461：合成來源證據索引 | 真實 runtime 接入範圍待釐清，續期、寫入與 Gate 2 窗口待負責人；先前 Draft 首輪 504 為歷史紀錄 |
| SOL-CALENDAR-ENVELOPE | #462：既有 inbound 拆批整數邊界測試 | 只屬來源切片；byte／time 與 provider 外證未完成，窗口待負責人 |
| SOL-IAC-LIFECYCLE | #463：B-10 占位目標拒絕及 mock 測試 | B-11、B-50、E2-08 與其他來源前置仍待處理；真實狀態 plan／apply 未執行且須逐次核准 |
| 台帳 | #464：本節記錄第一、二批來源切片與缺口 | 後續狀態由台帳負責人持續更新 |

### 第三批 A：來源切片審查中

| 包 | PR 與來源範圍 | 尚未完成 |
| --- | --- | --- |
| SOL-CALENDAR-CANDIDATE | #465：未授權拒絕不進入任一路徑 | 不同患者比對、SCHEDULE 依賴與 IAM／SESSION 外證 |
| SOL-CALENDAR-RESTORE | #466：既存衝突 link 不符不得 PATCH | cancelled 還原／read-back、smoke 唯一識別及其他 finding；真實日曆演練屬 12 月 |
| SOL-CALENDAR-TESTS | #467：合成非建檔時無關患者文件不變 | 獨跑、整套、反序與最終 RC 凍結 head 證據 |
| SOL-CI-IAC | #468：mock runner 中途 init 失敗即停 | 未改 workflow 或 gate；受保護部分及外部依賴仍未完成 |
| SOL-CLI | #469：合成 PATH 的明確 PATHEXT 正反例 | 其餘 CLI 入口／參數與依賴證據 |
| SOL-CONFIG | #470：未知值遮蔽與輸入不變 | 雙向 inventory、其他 consumer 與 IAC-LIFECYCLE 依賴 |
| SOL-EXPORT | #471：合成 CSV 引號與換行轉義 | 資源上限、交付額度、RBAC 及 RC-06 實測 |
| SOL-GOVERNANCE | #472：waiver 缺 owner／approver／evidence 的拒絕測試 | 其他 waiver 案例、B-18、文件對帳及 PRIVACY 依賴；不宣稱遠端讀回 |
| 台帳 | #473：本節更新第二批及第三批 A | 待審查，後續狀態以遠端讀回為準 |

上列第三批均為 PR 來源切片，不代表已合併、整包完成或雲端實測；實際 PR、CI 狀態以遠端 exact head 為準。

歷史基準：2026-11-07 main `63e59c94` 時，59 包中 25 包為台帳終態，另 34 包未整包完成；該快照不是目前重新盤點的數字。2026-11-08 已合併 #451（RC-03）。各包細節及依賴見第四節與細部包；外部證據仍以 IAM 與 SESSION 為主要依賴。

### 第三批 A／B 狀態快照（2026-11-09）

A 批 #466～#474 由 Claude 驗收合併中；以下只是來源切片，狀態以遠端讀回為準。
#465 已關閉並由 #474 取代，不再列為候選 PR。

| 包 | PR | 狀態及剩餘項 |
| --- | --- | --- |
| CALENDAR-CANDIDATE | #474 | 部分完成：候選完整矩陣、SCHEDULE 及外證仍待確認；#474 於快照時已合併 |
| CALENDAR-RESTORE | #466 | 部分完成：cancelled 還原、其他 finding 及 12 月真實日曆演練待完成；#466 於快照時已合併 |
| CALENDAR-TESTS | #467 | 部分完成：獨跑／反序及最終 RC head 證據待完成，PR 審查中 |
| CI-IAC | #468 | 部分完成：B-05 受保護部分及外部依賴待完成，PR 審查中 |
| CLI | #469 | 部分完成：其他 CLI 入口、參數及外證待完成，PR 審查中 |
| CONFIG | #470 | 部分完成：完整 inventory、consumer 及依賴待完成，PR 審查中 |
| EXPORT | #471 | 部分完成：資源上限、RBAC 及實測待完成，PR 審查中 |
| GOVERNANCE | #472 | 部分完成：其餘 waiver、文件對帳及外證待完成，PR 審查中 |
| A 台帳 | #473 | 部分完成：PR 審查中，後續狀態需讀回 |

| 第三批 B 包 | PR | 狀態及剩餘項 |
| --- | --- | --- |
| 員工登入決定與 SESSION 實作 | #475（決定文件） | 部分完成：七天安全邏輯、六位數 UI 與測試未實作；E4-14 authority、外證與部署另行處理 |
| HTML | — | 部分完成：既有來源仍需完整對照；refresh 核准政策及 PRIVACY／RUNTIME 依賴未核清 |
| IDENTITY | — | 部分完成：既有 #389／#417 之外的來源及 SESSION 外證未完成 |
| LIST | — | 部分完成：既有 #448 之外的 UI／文件、IDENTITY／RETURN 依賴未完成 |
| RBAC | — | 部分完成：E4-09 答案已記錄，A04、D-22、E3-17、E4-09 實作及 SESSION 依賴未完成 |
| RETURN | — | 部分完成：K4、D-08、E3-19 來源及 IDENTITY 依賴未完成；24 小時已決不等於實作 |
| ROUTE-INVENTORY | — | 部分完成：既有 #415／#420 之外的路由盤點、LIST／RETURN 依賴未完成 |
| RUNTIME-EVIDENCE | — | 部分完成：E1-26 等 repo 來源及明確環境外證未完成 |
| SESSION-DOCS | #475 | 部分完成：區分新決定與現有來源；SESSION／RBAC 與實測後文件同步未完成 |
| OBSERVABILITY | — | 部分完成：來源盤點與明確 log sink 目的地／runtime 外證未完成 |
| SUPPLY | — | 部分完成：八項 finding、依賴與 audit／lock 證據未完成；未新增例外 |
| RC-09 | #475 | 部分完成：README 新入口待 exact-head 文件 gate 與審閱 |
| B 台帳 | #475 | 部分完成：本快照待審閱；其他包及後續合併狀態需另行更新 |

以上「部分完成」包含先前已合併的來源，不代表本輪已實作所有 repo 工作；禁止把未開始的剩餘項當作僅差雲端實測。

### 第三批遠端讀回及後續部分切片（2026-11-10）

這是讀回時點的快照，取代上方 2026-11-09 的 PR 狀態，並不改變其歷史記錄。#465 已關閉，由 #474 取代；#466～#474 均已合併。#475、#476、#477 與 #478 也已合併；#476 處理七天 SESSION 的來源，不等於部署或外部驗收。

| 包 | PR | 讀回時狀態及剩餘範圍 |
| --- | --- | --- |
| HTML | #479 | Ready、部分完成；編碼繞過、form 與其他導向語法未完成，不得合併。 |
| IDENTITY | #480 | Ready、部分完成；回診電話預填已遮罩，其他顯示路徑仍須盤點。 |
| LIST | #482 | Ready、部分完成；截斷結果標示已改善，K7／E4-24 及跨包整合待完成。 |
| RBAC | #481 | 本 PR 部分完成：個管師別名測試；A04、D-22、E3-17 等尚未完成。 |
| RETURN | #481 | 本 PR 部分完成：限流參數文件；K4、D-08 與整合待完成。 |
| ROUTE-INVENTORY | #481 | 本 PR 部分完成：補到診及回診查詢兩條；其餘路由與回歸待盤點。 |
| RUNTIME-EVIDENCE | #481 | 本 PR 部分完成：shard 路徑測試；containment、其他 finding 與外部實跑仍缺。 |
| SESSION-DOCS | #481 | 本 PR 部分完成：兩份文件同步七天決定；其餘盤點、E3-24 與 E3-35 待完成。 |
| OBSERVABILITY | #483 | Draft、部分完成：D-34 分類與測試；其餘 finding 和外證待完成。當時 verification evidence 失敗，原因含 e2e 與 Gitleaks 回傳 `abandoned`，不得稱 exact-head CI 全綠。 |
| SUPPLY | #481 | 本 PR 部分完成：既有引號清單格式測試；未知 YAML 形狀拒絕及其餘 finding 尚未完成，未新增例外。 |
| 台帳 | #481 | 本快照屬文件變更；此 PR exact-head CI 及狀態以遠端讀回為準。 |

上述 PR 的狀態可能變更；合併、Ready 或 CI 綠燈均不等於整包完成、正式部署或雲端／實際資料權限。

### 後續切片快照（2026-11-10）

- #479：合入當時的 `origin/main` 解衝突；補拒絕編碼 scheme、動態
  form／formaction 的切片及回歸。仍保留 WIP／Draft；確切 head 的 CI
  正在執行，詞法 guard 不等於完整 HTML parser。
- #480：Ready、exact-head CI 曾通過；列印是否顯示完整身分證號待
  負責人決定，依指示不再推該分支。
- #484：D-22 預設拒絕未知欄位的部分切片已合併；其他 RBAC 項目仍待完成。
- #485（本 PR）：X-C03 協定裁定、RETURN 舊鍵碰撞測試、商業交付路由
  清單、E1-26 過期 threshold 測試、SESSION 權威指標及 OBSERVABILITY
  log cap 測試皆屬部分切片。台帳提交前的 head CI 通過；本提交後以
  新 exact-head checks 為準。日誌目的地尚待負責人決定，未建立 sink。
- #486：移除已不在 lockfile 依賴圖的 FTP override；lockfile-only
  重產本機逾時，手動刪除對應 override，凍結安裝與 audits 由 CI 驗證。
  當時為 Draft、CI 執行中；其餘 SUPPLY 項目未完成。

各 PR 的後續狀態以遠端實際 head 與檢查為準；不把未驗證的外部效果、
整包完成、部署或真實資料權限寫成已達成。

### 總讀回：2026-11-10（取代本節以上各快照的「審查中／未完成」狀態）

遠端讀回（`gh pr view`）：第三批 A 的 #466～#473 已合併（merge commit 依序 49f714bf、5366c9cc、78c1edbc、65aeb8fd、6c9bb86b、4863fe8e、a35ac971、307e5813）；#465 未合併即關閉，內容由 #474 取代。以下各 PR 皆已合併；「部分完成」指仍差該包其他 finding 或上游外證，合併不代表整包完成或雲端實測。

| PR | merge commit | 包 | 內容 | 狀態 |
| --- | --- | --- | --- | --- |
| #474 | 844b46de | CALENDAR-CANDIDATE | 候選拒絕未授權邊界 | 部分完成：還差 IAM／SESSION 外證 |
| #475、#477、#478、#481 | 41f43a4d、3bb596b3、5d2efbbf、7f2865b2 | 文件／測試 | W3 文件、回歸、保守裁定、七天 session 決定標記 | 整包完成（文件） |
| #476 | bf383c68 | SESSION | 員工七天 session 與驗證器教學 | 部分完成：還差雲端外證 |
| #479 | d23c2bcc | HTML | 導向語法裁定與 lexical 防護 | 部分完成：完整淨化列 12 月 |
| #480 | a868ccd9 | IDENTITY | 畫面遮罩、列印印完整（IDENTITY-PRINT-FULL-ID-2026-11-10） | 來源切片已合併 |
| #482 | 1abed5a5 | 管理介面 | 已載入預約與完整搜尋結果區分 | 來源切片已合併 |
| #483 | bcf8c36d | OBSERVABILITY | calendar session 監控分類 | 部分完成 |
| #484 | f325df2e | RBAC | 角色欄位投影預設拒絕 | 部分完成：還差 SESSION 外證與 claims 映射歸屬 |
| #485 | e0c4784f | 文件／測試 | X-C03 協定、W3 文件測試 | 整包完成（文件） |
| #486 | ca32606d | SUPPLY | 移除 FTP override | 部分完成 |
| #487 | 49c98f4e | RC-09 | RC 入口與測試模式文件 | 整包完成 |
| #488 | 1710dee9 | RC-08 | 不阻擋 PR 的可維護性基準 workflow | W3 量測部分完成；切分列 12 月 |
| #489、#502 | a91c5711、42c8fd4e | CALENDAR-ENVELOPE | 異常同步頁不靜默遺失；拒絕非字串事件狀態 | 部分完成：還差 dead-letter／統計與 provider 外證 |
| #490、#503 | 28c099fe、6b189b92 | CALENDAR-TESTS | 候選拒絕交易回歸；未匹配事件正反順序 | 部分完成：還差獨跑、反序與凍結 SHA |
| #491 | f2671ffa | CALENDAR-RESTORE | 衝突事件確認後才視為重放 | 部分完成：真實演練 12 月 |
| #492、#504 | 46e83218、8e12f36a | CONFIG | 語法樹與解構讀取盤點 | 部分完成：動態解構與 rest binding |
| #493 | 2263ac5b | CLI | 目錄不誤認為工具 | 部分完成 |
| #494、#505 | 8acb8979、a0798284 | EXPORT | 前導空白公式防護；分段保留 Unicode | 部分完成：還差 RC-06 實測 |
| #495 | 891c9256 | QUERY-INDEX | 雙向核對索引 | 部分完成 |
| #496 | 7777089e | SCHEDULE | 回診結束時間共用時段長度 | 部分完成 |
| #497 | 122399d5 | IAC-LIFECYCLE | 合成日曆遷移到期拒絕執行（未執行遷移） | 部分完成：plan／apply 待核准 |
| #498 | 52220e92 | RELEASE | 續期腳本不覆寫 PowerShell 自動變數 | 部分完成 |
| #499 | b110a674 | OBSERVABILITY | 彙總查詢計算合成日曆佇列 | 部分完成：provider aggregation parity 待開窗 |
| #500 | 3b29efdc | SUPPLY | SBOM 授權審查要求根元件識別 | 部分完成 |
| #501 | ff31b6fd | 計畫 | 第二、三、八節補漏 | 整包完成 |
| #506 | 2a4040b4 | OBSERVABILITY | D-15 空批次告警只看可 claim 工作 | 部分完成：還差 runtime 查詢層 emulator 測試 |

未在 repo 內處理、等負責人的：CI-IAC 的 Terraform plan-only 驗證（本機被 guard 擋，需開窗或 CI 變更）；RC-04（需 `administration:read` 身分與排程）；SOL-INTEGRATION 整合與凍結證據（W3）；第三節雲端窗口全部。

### 總讀回：2026-11-25（RC 凍結前）

本小節只追加，不改以上任何歷史快照。事實來源：`git log origin/main`（head `dc8be34e`）、`gh pr list --state merged`（PR #536～#582）、第十節、[決定登記](../product/phase-1-decision-register.md) 的 2026-11-23、2026-11-24 兩節。PR 與包的對應只依 PR 標題與內文；對不上的寫「無法對應」，不猜。

**怎麼讀這張表**：「已合併」只代表 repo 來源切片進了 `main`，不等於雲端實測通過；需要 C1 窗口驗證的一律標「11/26 開窗實測」，本檔不標 PASS。第十節 11/22 的負責人決定是「建議移 12 月清單不採用，34 個未終態包全部繼續完成」；下表「移 12 月」只收決定登記或本次交辦明列、不進本次 RC 窗口的子項。

**狀態代碼**：T＝終態且已合併；M＝11/22 起有新 PR 合併，整包是否結案本檔不斷言；W＝含需 11/26 開窗實測的項目；D＝列 12 月或不在本次窗口；N＝11/22 起無新 PR，沿用 11/20 盤點（第 10.1 節）。

#### 包別現況（59 包）

| 包 | 狀態 | PR／依據 |
| --- | --- | --- |
| LUNA-E2E-INVENTORY、LUNA-FIRESTORE-RUNNER、LUNA-ROBOTS-COMMENTS、LUNA-WORKBENCH-START、SOL-ARCH-GATE、SOL-ASSET-BUILD、SOL-BUILD、SOL-BUSINESS、SOL-CALENDAR-WATCH、SOL-CI-SECURITY、SOL-CONTAINERS、SOL-CONTRACTS、SOL-DESIGN-GATE、SOL-DOC-GATE、SOL-HTTP、SOL-LIFECYCLE、SOL-OUTBOX、SOL-READ-FAILURE、SOL-RETENTION、SOL-SAST、SOL-SESSION-UI、SOL-STRUCTURE-GATE、SOL-VISUAL-EVIDENCE（23 包） | T | 第 10.1 節類別 1；PR 編號沿用該節與更早快照，本次未逐包重列 |
| SOL-CUSTODY、NO-WORK | T | 第 10.1 節類別 4，無實作範圍 |
| SOL-SESSION | M、W | #562（R5 停止每分頁重發櫃台 session）、#565（E4-14 limiter 與模組組裝）、#573（C3 七天 session 自然到期唯讀讀回）。R5 與 C3 到期後拒絕行為：11/26 開窗實測 |
| SOL-CALENDAR-LEASE | M | #564（D-05／D-12 失去租約邊界測試）；Gate 2 50 次正常收斂讀回 #557（observations 50、blocked 0、conflicts 0） |
| SOL-CALENDAR-RESTORE | M、W | #568（D-01／D-02 409 還原確認、D-03 煙霧測試）、#576（D-31／D-32）。#568 行為：11/26 開窗實測；真實日曆還原演練仍列 12 月 Stage 6 |
| SOL-IAM | M、W | #535（B-01／B-02／NEW-10，已合併）、#563（R2：`c1-foundation` 預設維持 `c1-terraform-ci` 停用）。R2 plan：11/26 開窗實測；其餘 IAM finding 與 NEW-10 tfstate bucket 雲端項沿用 11/20 盤點 |
| SOL-IAC-LIFECYCLE | N、D（子項） | 最後相關 PR #535；B-11、B-50 列 12 月，不在本次窗口 |
| SOL-CI-IAC | N、D（子項） | 最後相關 PR #468；B-05 plan-only workflow 列 12 月，不在本次窗口 |
| SOL-INTEGRATION | D | 59 包中唯一無來源 PR；不在本次 RC，列 12 月（第 10.4 節第 4 項；11/22 決定未整批移月，此項依本次範圍判斷另列，見下方備註） |
| SOL-SCHEDULE | M | #566（B-35 區間驗證、D-07、A02、A08）、#575（B-35 `dateExceptions` 366／`blockedTimes` 500 上限，對應 11/23 決定登記） |
| SOL-SUPPLY | M | #567（E1-08、B-48）；B-20 工具鏈版本政策文件依 11/23 決定列 12 月，不擋 RC |
| SOL-RUNTIME-EVIDENCE | M | #569（E2-02／E2-10／E1-18）、#571（E4-07） |
| SOL-GOVERNANCE | M、D（子項） | #570（E1-21、E1-25）、#574（B-18 與 11/23 決定登記）；RC-04 依 11/23 決定列 12 月 |
| SOL-OBSERVABILITY | M | #572（B-06、B-54）；B-25 依 11/23 決定維持現狀（不加 sink，不改程式） |
| SOL-ROUTE-INVENTORY | M | #546（E3-10 補 CAL-PILOT 路由清單）、#577（E1-16／E1-17） |
| SOL-EXPORT | M | #549（A09 讀取資源上限）、#578（B-38 日期區間契約） |
| SOL-DOCS | M | #545（E3-13）、#579（E3-11／E3-20／E3-13／E3-31／D-38／E3-06） |
| SOL-RELEASE | M | #580（E1-01／02／03／05／07／11） |
| SOL-IDENTITY | M | #550（B-34 電話 wire schema 對齊 domain） |
| SOL-RBAC | M | #551（A04 讀班表網格獨立權限、E3-17） |
| SOL-CALENDAR-CANDIDATE、SOL-CALENDAR-ENVELOPE、SOL-CALENDAR-TESTS | N | 11/22 起無對應 PR；最後 PR 見第 10.4 節第 9 項 |
| SOL-INGRESS、SOL-MAINTENANCE、SOL-SECRETS、SOL-NOTIFICATION、SOL-QUERY-INDEX、SOL-TTL | N | 11/22 起無對應 PR；第 10.1 節類別 2 |
| SOL-CLI、SOL-CONFIG、SOL-HTML、SOL-LIST、SOL-PRIVACY、SOL-RETURN、SOL-SESSION-DOCS | N | 11/22 起無對應 PR；第 10.1 節類別 3 |

#### RC-01～RC-11

| ID | 狀態 | PR／依據 |
| --- | --- | --- |
| RC-01、RC-02、RC-05、RC-09、RC-10 | T | 第 10.2 節（#453、#454、#520、#487、#536） |
| RC-03 | 負責人文書 | 照片書面同意與 `staff-*.png` 檢視待負責人；D-001、D-002 同屬負責人文書，不是程式工作 |
| RC-04 | D | 11/23 決定登記：需 `administration:read` 與 CI 變更，延至 12 月 |
| RC-06 | W | #523、#530、#524 已合；凍結版 CP-08 回歸待 11/26 之後 |
| RC-07 | M | Gate 2 50 次讀回 #557；續期至 2026-12-16（#520） |
| RC-08 | T、D（子項） | 量測 workflow #488；程式切分列 12 月 |
| RC-11 | T | #455、#522；每週讀回持續 |

#### 11/22～11/24 其他合併 PR

| PR | 對應 | 備註 |
| --- | --- | --- |
| #536～#540 | 文件 | 長跑紀錄、11/21 窗口計畫、第十節草稿、凍結計畫、11/21 窗口讀回 |
| #541 | 第十節 | 記錄 11/22 負責人決定（不移 12 月） |
| #542、#543、#544、#547、#548、#552、#553、#554 | 無法對應包別 | Gate 2／calendar pilot 工具與對帳修補，標題未標包名 |
| #555、#556、#558～#561 | 無法對應包別 | 員工畫面患者欄與手機顯示（`STAFF-LIST-PATIENT-DISPLAY-2026-11-23`） |
| #581、#582 | CP-10 A-10 | 實作 `BD-POLICY-2026-11-24`（外部合約優先，政策版本更新）；金額不在本檔重列 |

#### 11/26 開窗實測清單（C1 窗口 2026-11-26 20:00 臺北，12:00Z）

此清單全部尚未實測，本檔不標 PASS。

- stage 2／3 項目。
- R5：#562。
- #568：409 還原確認與煙霧測試。
- C3 到期：#573 只證明 `2026-11-23T08:23:46Z` 自然到期且 `revokedAt` 為空；到期後拒絕與第 7 天仍可用未實機測試。
- R2 plan：#563。
- B-11 後 c1-foundation／c5-firestore：plan 只有 moved（0 新增／0 修改／0 刪除）才 apply。
- 八種故障注入（C1 專用合成日曆）。
- CAL-PILOT 專案：只准預算與 `expires` 標籤 in-place 更新，不動排程、不新增／刪除。
- 凍結版 CP-08 回歸（RC-06）在窗口之後。

#### 不在本次 RC 窗口

**2026-11-25 更新（負責人核准「全排26」）**：IaC B-11、B-50、CI B-05、`SOL-INTEGRATION` 已合併（#584～#586）；c1-foundation／c5-firestore moved apply、八種故障注入、CAL-PILOT 標籤與預算改排入 11/26 窗口。仍不在本窗：D-001／D-002（負責人補件）；C2、C6、`c1-internal-test-run`、`wp-b4-alerting` 仍以授權 SHA 決定資源存在（與 B-11 同型），移 12 月。CAL-PILOT 專案合成子範圍於 `2026-11-28T04:51Z` 到期，不延期；C1 日曆設定照 APPROVAL-RC-2026-11-14 續行。

#### 筆數

| 類別 | 數量 | 說明 |
| --- | --- | --- |
| T（終態） | 25 | 23＋2，與第 10.1 節類別 1、4 相同 |
| M（11/22 起有新 PR） | 15 | 其中 3 包含開窗項（SESSION、CALENDAR-RESTORE、IAM）；GOVERNANCE 含 D 子項 |
| N（無新 PR，沿用 11/20） | 18 | 其中 IAC-LIFECYCLE、CI-IAC 含 D 子項 |
| D（整包不在本次 RC） | 1 | SOL-INTEGRATION |
| 合計 | 59 | 25＋15＋18＋1 |

備註：第十節 10.4 的 11/22 負責人決定原文是不採用整批移 12 月；本小節把 SOL-INTEGRATION 與上列子項記為「不在本次 RC 窗口」，依據是 11/25 的範圍判斷與 11/23 決定登記（RC-04、B-20），不是新的負責人決定。SOL-NOTIFICATION 等原列 10.4 的包，現況仍是未結，本檔不改其狀態。

## 十、2026-11-22 決策草稿：59 包與 C2～C6 實際盤點與建議移 12 月清單

> **聲明（已決定）**：本節是 **2026-11-20 實查盤點草稿與建議**（以 `origin/main` 至 PR #537、#522、#518、#519 與 2026-11-16 至 11-19 審查報告為依據），**盤點本身不構成任何延後、縮範圍或雲端操作授權；負責人已於 2026-11-22 決定，見 10.4**。

距 2026-11-26 程式凍結僅剩 6 天（11/22 決策日距凍結僅剩 4 天）。依據本計畫第一節 RC 完成條件第 1 點（「59 包的來源工作全部結束：完成合併，或明確延後並寫理由與歸屬」）與第三節縮範圍準則（「先砍：C2～C6 中做不到的切片、W3 才開工的無來源包、SOL-INTEGRATION 整合」），本節提供 59 包、RC-01～RC-11 與 C2～C6 的精確現況，並擬具「建議移 12 月」與「建議留 11/30 RC 必保」兩份清單供 11/22 逐項拍板。

### 10.1 59 包實查統計（2026-11-20 盤點，合計 59 包）

以下四類互斥且完整覆蓋第四節全部 59 包；嚴守「不得將仍有未結 repo 來源項的包誤記為僅差雲端外證」原則：

| 分類 | 數量 | 完整包名清單 | 摘要說明 |
| --- | --- | --- | --- |
| 1. 已完成合併且無未結外證（`DONE-MERGED`／`ALREADY_FIXED` 已終態） | **23** | `LUNA-E2E-INVENTORY`、`LUNA-FIRESTORE-RUNNER`、`LUNA-ROBOTS-COMMENTS`、`LUNA-WORKBENCH-START`、`SOL-ARCH-GATE`、`SOL-ASSET-BUILD`、`SOL-BUILD`、`SOL-BUSINESS`、`SOL-CALENDAR-WATCH`、`SOL-CI-SECURITY`、`SOL-CONTAINERS`、`SOL-CONTRACTS`、`SOL-DESIGN-GATE`、`SOL-DOC-GATE`、`SOL-HTTP`、`SOL-LIFECYCLE`、`SOL-OUTBOX`、`SOL-READ-FAILURE`、`SOL-RETENTION`、`SOL-SAST`、`SOL-SESSION-UI`、`SOL-STRUCTURE-GATE`、`SOL-VISUAL-EVIDENCE` | 20 包 `DONE-MERGED`＋3 包 `ALREADY_FIXED`；其中 `SOL-READ-FAILURE` 另於 #534 補強內測取消逾時收斂，`SOL-VISUAL-EVIDENCE` 另於 #518、#519 合併 11/15 UI 評分修正 |
| 2. 主要來源已合併，尚待雲端外證、讀回或核准收尾 | **8** | `SOL-CALENDAR-LEASE`、`SOL-INGRESS`、`SOL-MAINTENANCE`、`SOL-NOTIFICATION`、`SOL-QUERY-INDEX`、`SOL-SECRETS`、`SOL-SESSION`、`SOL-TTL` | 核心來源切片均已合併；其中 `SOL-CALENDAR-LEASE`（11/21 重測＋Gate 2 50 次）與 `SOL-SESSION`（11/23 08:23Z C3 七天讀回，另附 E4-14 模組組裝確認）屬 RC 關鍵路徑；其餘 6 包卡在獨立雲端外證／讀回、ADR 或索引部署核准（`SOL-TTL` 已於 11/16 讀回 `bd_export_chunks.purgeAt` TTL ACTIVE，剩上游結案後同 SHA 回歸） |
| 3. 尚未開工或未完成全部來源（無來源或仍有未結 repo finding 切片） | **26** | **完全無來源（1 包）**：`SOL-INTEGRATION`。<br>**已有部分來源切片但仍缺 repo finding 實作與／或上游外證（25 包）**：`SOL-CALENDAR-CANDIDATE`、`SOL-CALENDAR-ENVELOPE`、`SOL-CALENDAR-RESTORE`、`SOL-CALENDAR-TESTS`、`SOL-CI-IAC`、`SOL-CLI`、`SOL-CONFIG`、`SOL-DOCS`、`SOL-EXPORT`、`SOL-GOVERNANCE`、`SOL-HTML`、`SOL-IAC-LIFECYCLE`、`SOL-IAM`、`SOL-IDENTITY`、`SOL-LIST`、`SOL-OBSERVABILITY`、`SOL-PRIVACY`、`SOL-RBAC`、`SOL-RELEASE`、`SOL-RETURN`、`SOL-ROUTE-INVENTORY`、`SOL-RUNTIME-EVIDENCE`、`SOL-SCHEDULE`、`SOL-SESSION-DOCS`、`SOL-SUPPLY` | 原本第四節標為「無來源」的 6 包中，5 包（`SOL-CALENDAR-RESTORE` #466/#491、`SOL-CI-IAC` #468、`SOL-HTML` #479/#485、`SOL-IAC-LIFECYCLE` #463/#497/#528/#535、`SOL-RELEASE` #498/#514）已於 11/09–11/19 合併來源切片，僅剩 `SOL-INTEGRATION` 仍完全無來源 PR。惟此 26 包距 11/26 凍結皆尚未完成全部 finding 整包結案 |
| 4. 原本即列終止或無實作（`PLANNING_TERMINAL_NO_IMPLEMENTATION`／`NO-WORK`） | **2** | `SOL-CUSTODY`、`NO-WORK` | 已終態，無實作範圍 |
| **總計** | **59** | `23 + 8 + 26 + 2 = 59` | 25 包已終態＋34 包未整包結案 |

**與 `safe-manifest.json` 差異誠實註記（不修改 manifest）**：

1. **命名對照**：[safe-manifest](2026-10-06-sol00-safe-manifest.json) 內的 `EXT-METADATA`、`EXT-NOTIFICATION`、`LUNA-READ-FAILURE` 分別對應本表 `SOL-CUSTODY`、`SOL-NOTIFICATION`、`SOL-READ-FAILURE`（finding 集合一致）。
2. **狀態快照落差**：`safe-manifest.json` 的 `packets[].status` 仍停留在規劃初期封鎖狀態（`OWNER_BLOCKED` 22、`RUNTIME_BLOCKED` 16、`SOL_DESIGN_REQUIRED` 14、`READY` 4、`NO_WORK_REQUIRED` 1、`METADATA_BLOCKED` 1、`ARCH_BLOCKED` 1），尚未反映 11/09–11/20 已合併之 PR #453–#537 與 11/14–11/15 負責人決策。本盤點以實際合併 PR 與 `docs/reviews/2026-11-16`～`2026-11-19` 審查報告為準，未動用或改寫 `safe-manifest.json`。

### 10.2 RC-01～RC-11 新增包（11 包）2026-11-20 實查附表

| ID | 名稱 | 2026-11-20 實查狀態與證據 | 11/22 建議歸屬（草稿） |
| --- | --- | --- | --- |
| RC-01 | 供應鏈 braces | 已完成（#453 升級 `firebase-tools` 移除 braces 例外） | 已結案（留 RC） |
| RC-02 | manifest 與台帳同步 | 已完成（#454 同步規劃狀態，#268 已關） | 已結案（留 RC） |
| RC-03 | 公開 repo 隱私收尾 | supportEmail 已完成（#451）；醫師照片書面同意（存 repo 外）與 `staff-*.png` 檢視待負責人確認 | 留 RC 補紀錄（無程式改動）；未及可併 12 月隱私審查 |
| RC-04 | 分支保護定期讀回 | 尚未開工（需 `administration:read` 身分與 CI workflow 變更核准） | **建議移 12 月** |
| RC-05 | Terraform 流量跟隨 | 已完成（11/16 唯讀讀回 #520 確認三服務 100% 跟隨最新） | 已結案（留 RC） |
| RC-06 | C1 員工端第二窗口 | 11/16 主管流程通過（#523）、11/18 櫃台角色通過（#530）、#524 修補 CSV BOM；剩凍結版 CP-08 回歸 | **留 RC 必保** |
| RC-07 | 日曆 Gate 2 | 11/16 已續期至 2026-12-16（#520）；50 次收斂規劃見 #537 第 4 節 | **條件式留 RC**（視 11/21 2.3／2.4 結果） |
| RC-08 | 程式可維護性量測 | 不阻擋 PR 之量測 workflow 已合（#488）；程式切分本列 12 月 | 量測已結案；切分原列 12 月 |
| RC-09 | 文件入口整理 | 已完成（#487） | 已結案（留 RC） |
| RC-10 | 長跑重啟與分工 | 已完成（11/19 交接 Gemini 長跑，見 #536） | 已結案（留 RC） |
| RC-11 | 專案治理 | 規則與分工已合（#455）；每週讀回持續執行，企業計分卡標準 v1 已合（#522） | 核心已合（留 RC）；每週讀回持續 |

### 10.3 C2～C6 切片逐片實查表（2026-11-20 盤點）

| 片別 | 11/16–11/18 已證明範圍與報告證據 | 仍待事項 | 是否進 11/21 窗口（#537） | 11/22 建議歸屬（草稿，待負責人決定） |
| --- | --- | --- | --- | --- |
| **C2 員工登入（Identity）** | `c2-identity` plan 無差異；Identity Platform MFA／TOTP `adjacentIntervals=1`／僅 Google IdP 與 repo 一致（[11/16 讀回](../reviews/2026-11-16-maintenance-secrets-c2-c5-readback.md)）；停用櫃台帳號後下一請求 401、恢復後 200（[11/18 報告](../reviews/2026-11-18-c1-window-c2-c6.md)） | 以 11/26 凍結版 commit 重部署 API 並補凍結 SHA 讀回；過期 `synthetic-review` 授權網域清理另核 | 僅隨 API 新映像重建更新；不重跑停權測試 | **留 11/30 RC**（核心已證明，凍結後補重部署讀回） |
| **C3 Session 安全** | 已隨 `df63bb85` 上線 7 天絕對到期 session（11/16 建立、`2026-11-23T08:23:46Z` 到期，[11/16 報告](../reviews/2026-11-16-c1-window-rc06-c3-c4.md)）；櫃台登出 `revokedAt` 撤銷通過（[11/18 報告](../reviews/2026-11-18-c1-window-c2-c6.md)）；主管 7 天 session 完好 | **`2026-11-23T08:23:00Z` 起主管 7 天自然到期唯讀讀回**；以凍結版重部署並補讀回（step-up TOTP、QR 綁定與真實 SDK 另核本列排除／12 月） | 僅第 3.5 節驗櫃台登出撤銷；全程保護主管 7 天 session 不動 | **留 11/30 RC**（11/23 讀回＋凍結版重部署） |
| **C4 RBAC** | 已隨 `df63bb85` 首次部署；主管預約／報表／CSV／封存復原通過（[11/16 報告](../reviews/2026-11-16-c1-window-rc06-c3-c4.md)）；櫃台允許查預約／班表 200、拒絕報表與 CSV 403 `AUTHORIZATION_DENIED` 通過（[11/18 報告](../reviews/2026-11-18-c1-window-c2-c6.md)） | 凍結版重部署（含 #524 CSV UTF-8 BOM、#534 取消後畫面收斂）；衝突佇列 `front_desk` vs `manager` 細分權限與 `audit.ts` claims 映射屬殘餘風險／未定案 | 第 3.4 節驗證 #534 櫃台取消後列表即時刷新 | **核心留 11/30 RC**；**細分衝突佇列權限與 `audit.ts` claims 映射建議移 12 月** |
| **C5 稽核（Firestore）與備份** | `c5-firestore` plan 無差異；PITR 7 天、刪除保護、每日備份 30 天（30 份 READY）、`bd_export_chunks.purgeAt` TTL `ACTIVE` 讀回一致（[11/16 讀回](../reviews/2026-11-16-maintenance-secrets-c2-c5-readback.md)）；`audit_events` 新增筆數讀回通過（[11/18 報告](../reviews/2026-11-18-c1-window-c2-c6.md)）；每週備份（14 週）Terraform #528 已合併 | (1) #528 每週備份 apply 與排程讀回；(2) 凍結版容器重部署與稽核讀回；(3) **`BACKUP-B-2026-11-15` 每月專案外 Cloud Storage 匯出（2 年）**尚無外部專案／bucket 位置與 Terraform；(4) 真實還原演練（CP-06-E／A-07 本列 12 月） | #528 列第 5 節方案 A（現場看 plan 決定併入或拆出）；第 3.5 節讀回稽核筆數 | **拆歸屬：C5 核心＋#528 每週備份留 11/30 RC；「每月專案外匯出（2 年）與還原驗證」建議移 12 月** |
| **C6 合成整合（Calendar 與 Gate 2）** | 11/16 C1 日曆設定續期至 `2026-12-16T04:51:37.000Z`（[11/16 日曆讀回](../reviews/2026-11-16-calendar-gate2-readback.md)）；11/18 預約投影（假名化）與取消補償移除通過；**唯 `internal-test-calendar-sync` 觸發回 500 異常退出，2.3 同步收斂與 2.4 衝突偵測未證明**（[11/18 報告](../reviews/2026-11-18-c1-window-c2-c6.md)）；11/19 已合 #532／#533（[長跑紀錄](../reviews/2026-11-19-gemini-long-run-record.md)） | (1) 11/21 驗證 #532／#533、2.3 同步收斂、2.4 衝突偵測；(2) Gate 2 至少 50 次正常收斂（預估 2～3 窗）；(3) Calendar watch controller 掛載（未掛載，另核）；(4) 八種故障注入與網站轉址演練 | **是（主測項：第 3.1～3.3 節）**；Gate 2 50 次規劃列第 4 節（不在 11/21 實跑） | **條件式留 RC**：若 11/21 通過 2.3／2.4，單輪雙向＋Gate 2 50 次留 RC（11/22–11/25 跑完）；若 11/21 再現 5xx 或 11/25 前不及完成，Gate 2 50 次移 12 月。**watch 掛載、故障注入與轉址演練一律建議移 12 月** |

### 10.4 「建議移 12 月」清單（草稿，待負責人 2026-11-22 逐項決定）

**2026-11-22 負責人決定**：本節「建議移 12 月」清單**不採用**；34 個未終態包全部繼續完成，不移 12 月，不縮範圍。雲端外證由 Claude 開窗執行。

> 以下均為建議方案，**尚未核准**。若負責人於 11/22 核准延後並記入決定登記，則對應 59 包可依第一節 RC 完成條件第 1 點合法標記「明確延後並具理由與 12 月歸屬」，避免 11/26 凍結被非關鍵路徑尾項卡死。

| 項目（59 包或 C2～C6／RC 子項） | 目前實際狀態與證據 | 建議移 12 月的具體理由（含時程現實） | 移出後對 11/30 RC 完成條件的影響與補救界線 | 建議預設與負責人選項 |
| --- | --- | --- | --- | --- |
| **1. C5 子項：每月專案外 Cloud Storage 匯出（保留 2 年）與還原對照** | `BACKUP-B-2026-11-15`（#516）已決；既有每日 30 天已讀回（[11/16 讀回](../reviews/2026-11-16-maintenance-secrets-c2-c5-readback.md)），每週 14 週 Terraform #528 已合待 apply；每月外部匯出尚缺目標專案／bucket 位置與 Terraform | 11/22 決策距 11/26 凍結僅剩 4 天，跨專案儲存桶建置、跨專案 IAM、Terraform 審查與測試還原無法在凍結前完成；屬 C2～C6 中本窗做不到的子項 | 不影響 11/30 RC（C1 僅合成資料，且保留 PITR 7 天＋每日 30 天＋#528 每週 14 週）；補救界線：12 月正式上線與真實病患資料前必須完成建置與還原驗證（同 A-07／CP-06-E） | **建議預設：移 12 月**。<br>替代：留 RC（須 11/22 即拍板外部專案與 bucket、另排 IaC＋IAM 窗口，將壓縮凍結與 CP-08） |
| **2. C6 子項：Calendar watch controller 掛載、八種故障注入、無正式 DNS 轉址演練（及 Gate 2 50 次之條件式備案）** | watch controller 未掛載（[C2～C6 申請](2026-11-15-c2-c6-rc-deployment-requests.md) C6 第 4 點）；八種故障注入另列待核（[11/21 計畫](2026-11-21-c1-window-plan.md)第 4 節）；11/18 2.3／2.4 因 `calendar-sync` 500 失敗，待 11/21 驗證 #532／#533 | watch 掛載需另核路由與安全審查；故障注入需另核獨立窗口；正式 DNS 本在 12 月。另若 11/21 再現 `calendar-sync` 5xx，11/22–11/25 剩餘 4 天不足以再修補＋重建＋跑滿 2～3 窗 50 次收斂 | watch／故障注入／轉址移 12 月不影響 RC 合成投影與輪詢收斂；若觸發 Gate 2 條件式備案，須於 11/22 或 11/25 明文記錄 RC 第 4 條降級為「單輪雙向已證、50 次收斂為 12 月上線前阻斷條件」 | **建議預設：watch／故障注入／轉址一律移 12 月；Gate 2 50 次視 11/21 結果，通過則留 RC、失敗則移 12 月**。<br>替代：即使 11/21 失敗仍留 RC（須延後 11/26 凍結與 11/30 RC 日期） |
| **3. C4 子項：衝突佇列 `front_desk` vs `manager` 細分權限與 `audit.ts` 角色 claims 映射** | 11/16 主管與 11/18 櫃台基礎分權已實測通過（#523／#530）；衝突佇列細分權限列殘餘風險（[C2～C6 申請](2026-11-15-c2-c6-rc-deployment-requests.md) C4 第 10 點）；`audit.ts` claims 映射已列第八節 | 需產品規則定案與額外 RBAC 修改，距 11/26 凍結僅 4 天；現行維持較嚴格 deny-default 已可安全支撐 RC | 不影響 RC 完成條件第 2、3 點；補救界線：衝突佇列維持 deny-default（較嚴格一方），12 月上線前完成權限細分與 claims 映射歸屬 | **建議預設：移 12 月**。<br>替代：留 RC（須 11/22 拍板規則並於 11/25 前補程式與重測） |
| **4. `SOL-INTEGRATION`**（1 包） | **59 包中唯一至今完全無來源 PR**；依賴全部其餘 50 包 | 本計畫第三節縮範圍準則明列「先砍：SOL-INTEGRATION 整合」，第四節亦載明「上游未結則延後 12 月」；11/22 時上游仍有 30 餘包未整包結案，強行開工只會產出不實整合證據 | 不影響 RC 交付（RC 以凍結版 CP-08 全系統回歸＋CP-10 驗收作為候選版整合證據）；補救界線：12 月正式上線前完成 D-40／E3-12／E4-01～04／E4-12～13 整包閉環 | **建議預設：移 12 月**。<br>替代：留 RC（須先結案全部 50 個上游包，11/30 前實務不可行） |
| **5. `SOL-CALENDAR-RESTORE`**（1 包） | 已合 #466（衝突 link 不符不得 PATCH）、#491（衝突確認後才重放）；仍缺 D-01／D-02／D-03／D-31／D-32 其餘 finding，且真實日曆還原演練本列 12 月 | 原排 W3 才開工、依賴 `SOL-CALENDAR-ENVELOPE`；距 11/26 凍結剩 4 天，且真實日曆演練本屬 12 月 Stage 6 | 核心衝突重放防護已在主線生效；補救界線：12 月正式日曆啟用前補齊 cancelled 還原／read-back 與還原演練 | **建議預設：移 12 月**。<br>替代：留 RC（需 11/22–11/25 投入專屬程式資源補齊其餘 5 finding 來源與 Emulator 測試） |
| **6. `SOL-NOTIFICATION`**（1 包，B-08） | 已合 #384、#404、#407；設計檔 `2026-10-30-sol-notification-design.md` 仍待負責人審閱核准 ADR，尚未執行 C1 publisher／IAM／DLQ 外證 | 尚缺 ADR 核准與獨立 IAM／Pub/Sub 外證窗口，且告警收件與事故聯絡本已列第八節（12 月） | 不影響 C1 員工預約、商務交付與日曆主流程；補救界線：12 月正式上線與告警收件人定案時一併核准 ADR 並完成 C1／prod publisher IAM 與 DLQ 外證 | **建議預設：移 12 月**。<br>替代：留 RC（須 11/22 核准 ADR 並於 11/23–11/25 加開 IAM／Pub/Sub 外證窗口） |
| **7. IaC 與進階 IAM 尾項：`SOL-IAM` 剩餘項、`SOL-IAC-LIFECYCLE`、`SOL-CI-IAC`**（3 包） | 11/17 已完成 IAM 盤點並停用 `c1-terraform-ci`（[11/17 讀回](../reviews/2026-11-17-iam-readback.md)，#527）；B-01／B-02／NEW-10 IaC 已合 #535 並排入 11/21 計畫第 2、6 節；`SOL-IAC-LIFECYCLE` 已合 #463/#497/#528/#535、`SOL-CI-IAC` 已合 #468；剩 NEW-10 tfstate bucket 雲端項、IAM 其餘 9 finding、B-11／B-50／E2-08、B-05 plan-only workflow | 高風險 `c1-terraform-ci` 已停用且 #535 已排 11/21 apply；剩餘 NEW-10 tfstate（compute／Cloud Build 帳號於凍結前重建映像仍需使用）與 B-05 CI workflow 變更風險高，4 天內不宜改動建置管線 | RC 維持 `c1-terraform-ci` 停用＋#535 權限收斂；補救界線：12 月正式上線前完成 tfstate bucket 權限收斂、其餘 IAM finding 回歸與 B-05 workflow 驗證 | **建議預設：#535 留 11/21 窗口，此 3 包剩餘尾項移 12 月**。<br>替代：留 RC（須另開 IAM 與 CI workflow 核准窗口，恐干擾 11/26 凍結重建映像） |
| **8. 進階外部 runsheet 外證尾項：`SOL-INGRESS`、`SOL-MAINTENANCE`、`SOL-SECRETS`**（3 包） | 11/16 已完成三項雲端唯讀讀回（[INGRESS](../reviews/2026-11-16-ingress-and-rc06-readback.md)、[MAINTENANCE／SECRETS](../reviews/2026-11-16-maintenance-secrets-c2-c5-readback.md)）：入口設定一致、API 停寫實測通過且確認兩 worker 接線、3 個舊／未用密鑰版本已停用；剩餘 runsheet §3.1 跨入口實發計數、§5 worker 逐 writer 實測排空、§7 本機逐工具 canary | 三包核心防護來源已合且雲端基本面已查證；剩餘項目均需另核精確授權與工具清單（`NOT_PROVEN`／`NOT_RUN`），在 11/22–11/25 優先度低於 Gate 2 50 次與 C3 七天讀回 | 不影響 RC 合成環境使用（C1 關窗時具維護開關＋閘門關閉＋排程暫停＋靜態 Hosting 四道護欄）；補救界線：12 月真實資料與公開流量開放前，補完三項 runsheet 外證 | **建議預設：移 12 月**。<br>替代：留 RC（須 11/22 另核 3 份 runsheet 精確授權並於 11/23–11/25 加開實測窗口） |
| **9. 日曆下游補齊 3 包：`SOL-CALENDAR-ENVELOPE`、`SOL-CALENDAR-CANDIDATE`、`SOL-CALENDAR-TESTS`**（3 包） | 核心來源已合（#408/#462/#489/#502/#532/#533、#363/#474/#514、#362/#467/#490/#503）；剩 dead-letter／統計與容量邊界外證、不同病患負向矩陣、獨跑／反序整包證據 | 上游依賴 `SOL-CALENDAR-LEASE`／`SOL-SCHEDULE`；11/21–11/25 應集中人力確保 2.3／2.4 與 Gate 2 50 次正常收斂，4 天內不足以同時補齊所有下游邊界回歸與額外容量邊界外證 | 不影響 11/21 雙向同步與 Gate 2 50 次收斂驗證；補救界線：凍結版仍須通過 CI 全部現有日曆測試，剩餘邊界回歸於 12 月正式日曆上線前補齊 | **建議預設：核心驗證留 RC（11/21＋Gate 2），3 包整包尾項移 12 月**。<br>替代：留 RC（須 11/22–11/25 同步加開程式長跑補齊來源） |
| **10. 預約／商務下游來源收尾 7 包：`SOL-RBAC`、`SOL-EXPORT`、`SOL-IDENTITY`、`SOL-LIST`、`SOL-RETURN`、`SOL-ROUTE-INVENTORY`、`SOL-SCHEDULE`**（7 包） | 核心來源與大量切片已合併（含 #480/#481/#482/#484/#485/#494/#496/#505/#524），且 C4 雙角色與 RC-06 CSV 匯出已於 11/16、11/18 雲端實測通過；各包仍殘留部分次要 audit finding 或上游結案後之同 SHA 回歸 | 7 包全屬 W3 下游包，依賴 `SOL-SESSION`／`SOL-IAM` 外證完全閉環；11/22 距 11/26 凍結僅 4 天，逐包重寫回歸易在凍結前引入不必要程式變動 | 核心流程由凍結版 CP-08 全系統回歸與已通過之 RC-06／C4 實測把關；補救界線：12 月正式上線前逐包清完剩餘 finding（含 11/16 發現「預約前兩天可標到診」業務規則確認） | **建議預設：移 12 月（功能回歸留 CP-08）**。<br>替代：留 RC（挑其中 1～2 個高優先包於 11/22–11/25 補完，其餘移 12 月） |
| **11. 觀測／隱私／治理／工具鏈／文件尾項 13 包：`SOL-OBSERVABILITY`、`SOL-PRIVACY`、`SOL-SUPPLY`、`SOL-CLI`、`SOL-CONFIG`、`SOL-GOVERNANCE`、`SOL-HTML`、`SOL-RELEASE`、`SOL-RUNTIME-EVIDENCE`、`SOL-DOCS`、`SOL-SESSION-DOCS`、`SOL-QUERY-INDEX`、`SOL-TTL`**（13 包） | 13 包皆已有來源切片合併（含 #453/#479/#495/#498/#499/#500/#506/#512/#515/#517/#525/#531 等）；仍缺 log sink 目的地決定（OBSERVABILITY）、9 finding 回歸與正式發布／法律審查（PRIVACY）、8 finding 收尾（SUPPLY）、完整 HTML parser 淨化（HTML，本列第八節）、Firestore 索引部署核准（QUERY-INDEX）、smoke 腳本實跑（RUNTIME-EVIDENCE）及上游結案後同 SHA 文件與回歸同步 | 全數為 W3 下游或依賴正式上線政策／雲端決定（如 log sink、法律審查、完整 HTML 淨化）之收尾包；4 天內無法完成全套上游解鎖＋逐項重測，且部分子項本已在第八節列為 12 月項目 | **必留防線不移出**：`SOL-PRIVACY` 之 D-001（登記全名與公用信箱）與 D-002（Google DPA 確認）補件仍留 RC 決策條件；`SOL-HTML` 維持 #479 lexical 防護；`SOL-SUPPLY` 維持 #453 無 braces 例外與 #531 CI 嚴格 prod 門檻；其餘整包收尾於 12 月上線前清零 | **建議預設：13 包整包收尾移 12 月（D-001／D-002 補件留 RC）**。<br>替代：留 RC（須延長 11/26 凍結日並補充決策與窗口） |
| **12. `RC-04`（分支保護定期讀回）** | `RC-04` 尚未開工（需 `administration:read` 與 CI workflow 變更核准）；另 #519（UI 評分修正）已於 `9302d1c4` 合併，不再需延後 | `RC-04` 屬治理自動化且需額外 GitHub 權限與 CI 變更核准，距 11/26 凍結僅剩 4 天 | 不影響 RC 功能與安全；補救界線：`RC-04` 於 12 月補建並回填 `SOL-GOVERNANCE` B-18 | **建議預設：`RC-04` 移 12 月**。<br>替代：留 RC（須 11/22 核准 `RC-04` 權限與 workflow） |

> **59 包歸屬核對**：上述第 4～11 項共涵蓋 **32 個未終態包**之整包收尾；另 2 個關鍵路徑未終態包 **`SOL-CALENDAR-LEASE`**（條件式留 RC，視 11/21 與 Gate 2 50 次）與 **`SOL-SESSION`**（留 RC，待 11/23 08:23Z C3 七天讀回；其中 E4-14 模組組裝確認若凍結前不及完成可隨 12 月補齊）合計 `32 + 2 = 34` 個未終態包，加上 25 個已終態包（23 完成＋2 NO-WORK），**精確等於 59 包**。

### 10.5 「建議留在 11/30 RC（11/26 凍結前必保）」核心清單

以下為建議於 11/22 確認**必保留在 11/30 RC** 的主路徑項目與日期節點（時間以 UTC 標記到期，台北日期為排程基準）：

| 日期節點 | 必保項目 | 對應來源／計畫 | 成功條件與備案 |
| --- | --- | --- | --- |
| **11/21 晚上（`11:00Z`–`16:00Z`）** | **C1 重測窗口**：從 `main` 重建 `api`／`worker` 映像並部署 Hosting；驗證 #532（結構化日誌＋防崩潰）、#533（`previousSourceId: null` 不再 503）、#534（取消後列表刷新）；重測 **C6 2.3 同步收斂與 2.4 衝突偵測**；執行 #535 `c1-internal-test-run` IAM plan／apply；現場決定是否併入 #528 C5 每週備份與 #535 `c1-foundation` IAM | [2026-11-21 開窗計畫](2026-11-21-c1-window-plan.md)（#537）、#532～#535、#528 | 2.3／2.4 通過且 #532～#534 驗證成功、關窗三道回復讀回齊備；若再現 5xx 即依計畫停下留證，於 11/22 啟動 Gate 2 移 12 月備案 |
| **11/22** | **負責人範圍決策與必補決策件**：(1) 依本節 10.4 拍板移 12 月清單與 Gate 2 去留；(2) 補齊 **D-001**（診所登記全名、公用信箱）與 **D-002**（Google DPA 確認截圖存 repo 外）；(3) 決定 **CP-10 A-10**（依[凍結準備計畫](2026-11-26-freeze-cp08-cp10-readiness.md)第二部去識別商務差異表逐條勾選） | 本節 10.4、[決定登記](../product/phase-1-decision-register.md)、[CP-10](2026-10-01-cp-10-current-project-acceptance-checklist.md)、[凍結準備計畫](2026-11-26-freeze-cp08-cp10-readiness.md) | 形成正式日期化決定紀錄，使 RC 完成條件第 1、5 點於凍結前達標 |
| **11/22–11/25（條件式留 RC）** | **Gate 2 真實測試日曆至少 50 次正常收斂**：視 11/21 2.3／2.4 通過結果，分 2～3 個獨立窗口（單窗 20～25 次）完成 ≥ 50 次收斂並以 `calendar-pilot-observation-check.mjs` 離線驗證入庫 | [2026-11-21 開窗計畫](2026-11-21-c1-window-plan.md)第 4 節、`SOL-CALENDAR-LEASE`、RC-07 | `trials >= 50`、`blocked == 0`、`conflict == 0`、`allConverged == true`；若 11/21 失敗或進度不及，於 11/22 或 11/25 核准移 12 月 |
| **11/23 `08:23Z` 起** | **C3 七天 session 自然到期讀回**：負責人先登入 gcloud ADC，唯讀查核 11/16 主管 7 天 session 到期狀態（`2026-11-23T08:23:00Z` 前保護主管 session 不登出、不停用） | [11/16 報告](../reviews/2026-11-16-c1-window-rc06-c3-c4.md)、[C2～C6 申請](2026-11-15-c2-c6-rc-deployment-requests.md) C3、`SOL-SESSION` | 讀回紀錄存進 `docs/reviews/`，補齊 C3 關鍵七天外證 |
| **11/25 前** | **11/25 已確認**：2026-11-24 補充：2026-12-31 是 APPROVAL-RC-2026-11-14 核准的上限；CAL-PILOT 專案（staging）合成子範圍依負責人 2026-11-24 決定不續期，2026-11-28 到期（以 `infra/terraform/cal-pilot/main.tf` 的 `approved_end_date` 為準）；C1 日曆設定照本核准續行，不受影響。 **CAL-PILOT 合成子範圍延期確認**：現行合成子範圍將於 `2026-11-28T04:51:37Z` 到期（落在 CP-10 驗收期間），確認既有 `APPROVAL-RC-2026-11-14`（延至 12/31）與 C1 日曆設定（已續至 `2026-12-16`）之銜接 | 第一節第 4 點、[11/16 日曆讀回](../reviews/2026-11-16-calendar-gate2-readback.md) | 避免 11/28–11/29 CP-10 驗收途中碰到子範圍到期 |
| **11/26** | **程式凍結與凍結版 C2～C5（及通過之 C6）重部署**：鎖定 RC exact commit、確認 exact-head CI 全綠；以凍結 commit 重建映像與 Hosting 並完成 C2～C5／C6 凍結版 SHA 讀回（若 #528 每週備份未於 11/21 apply，可併本窗） | 第一節第 2、3、6 點、[C2～C6 申請](2026-11-15-c2-c6-rc-deployment-requests.md) | 所有運行中服務 digest 與 RC exact SHA 100% 一致，關窗回復讀回齊備 |
| **11/27–11/29** | **CP-08 全系統回歸與 CP-10 負責人驗收**：依[凍結準備計畫](2026-11-26-freeze-cp08-cp10-readiness.md)第一部於凍結 commit 填完 [CP-08 worksheet](2026-10-01-cp-08-regression-evidence-worksheet.md)（人工無障礙 12 月）；11/28–11/29 負責人逐項驗收並簽核 [CP-10 清單](2026-10-01-cp-10-current-project-acceptance-checklist.md)（A-07、A-08 期滿路徑、PUB-03 移 12 月） | 第一節第 2 點、CP-08、CP-10、[凍結準備計畫](2026-11-26-freeze-cp08-cp10-readiness.md) | CP-08 全項有凍結 SHA 證據，CP-10 經負責人簽核 |
| **11/30** | **打 RC tag（如 `phase1-rc1`）並交接 12 月正式上線計畫** | 第一節第 6 點、第八節 | exact-head CI 全綠＋tag＋12 月移出清單交接完成 |
