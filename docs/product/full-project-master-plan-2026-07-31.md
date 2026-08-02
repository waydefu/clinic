# 全專案總體規劃書（2026-07-31）

**狀態：規劃書／plan-only。** 本文件把整個專案剩餘工作的**技術策略**寫成單一
權威來源：品質模型、維護性、效能、身分安全、資料保護、Calendar 同步與可靠性。
它**不核准任何事**，不建立雲端資源，不解除任何 D-series 決策，也不改變目前的
Stage 1 位置。

**配套文件：** 逐步動作見
[全專案執行書](full-project-execution-book-2026-07-31.md)；核准順序見
[後續執行與核准清單](current-execution-and-approval-plan.md)；決策狀態見
[決策登錄](phase-1-decision-register.md)；業主原始需求見
[業主需求彙整索引](owner-requests-consolidated-2026-07-31.md)。

**2026-08-01 查核更新：** Stage 0 已完成；目前仍在 Stage 1，尚未取得任何 C1～C6
雲端套用授權。本次把兩份決定清單、D／T／OR 系列、Stage 0 交接缺口、Phase 1、
Production 與 Expansion S 的**全部未完成事項**收斂到 §10 的單一 work-package baseline，
並依 NIST SP 800-63B-4、NIST SSDF、OWASP ASVS 5.0.0、W3C、Google Cloud／Firebase
官方文件及全國法規資料庫補強執行控制。新增內容是條件式規劃與證據要求，不把待決
事項改寫成已核准，也不授權建立資源、花費或處理真實個資。

## 0. 為什麼要有這份文件

專案已累積 20 份以上的規劃、審查與決策文件，各自正確但分散：架構在一份、交付
順序在另一份、業主需求在第三份，而**維護性與效能從來沒有被寫成可驗證的目標**。
本文件補的正是最後這一塊，並把散落的技術判斷收斂成一份可被引用、可被反駁的
基準。所有數值目標都標註出處，避免用「感覺很快」「應該夠好維護」當驗收標準。

---

## 1. 專案範圍

### 1.1 目前 release scope（Phase 1）

預約、排班、回診、個管指派、櫃檯處置、稽核與 outbox。**刻意不含**病歷臨床內容、
手術排程、付款與薪資結算。

### 1.2 Expansion S（獨立軌）

手術排程、回診時間軸、付款與人員結算，以及 Google Calendar 雙向同步。這一軌
同時跨越醫療敏感資料、病患財務資料與外部系統回寫，**不得**併入 Phase 1 的
release scope，除非業主明確決定合併並補齊 D-008／D-009／D-014／D-015／D-016。

### 1.3 永遠不做的事

以合成介面、Emulator、預覽站或文件提案冒充正式環境的安全、隱私、備份、權限或
上線證據。這一條不因任何階段通過而解除。

---

## 2. 品質模型：維護性怎麼被量出來

採用 **ISO/IEC 25010** 產品品質模型的維護性定義。該模型把維護性拆成五個子特性：
**modularity（模組性）、reusability（可重用性）、analysability（可分析性）、
modifiability（可修改性）、testability（可測試性）**
（[ISO/IEC 25010:2023](https://www.iso.org/obp/ui/en/#!iso:std:78176:en)）。

下表把五個子特性各自對應到**本專案已經存在的機制**與**還缺的部分**。這是本規劃書
最重要的一張表：沒有對應機制的子特性，就是維護性會先崩掉的地方。

| 子特性 | 定義重點 | 本專案的落實方式 | 缺口 |
| --- | --- | --- | --- |
| Modularity | 改一個元件對其他元件影響最小 | `check:architecture` 強制三層相依方向；`packages/domain` 為預約規則單一來源，瀏覽器端只用 vendored 複本 | 手術／付款／結算尚無模組邊界設計，須在 Expansion S 動工前先定 |
| Reusability | 資產可跨系統使用 | 預約規則同時服務工作臺與患者頁，不寫兩份 | 目前僅一個消費端類型（瀏覽器）；API 化後須驗證同一份規則能被伺服器端重用 |
| Analysability | 能評估變更影響、能診斷失敗原因 | append-only audit 記錄操作者／時間／前後狀態；outbox 死信保留失敗個案 | audit 的「修改原因」目前只在刪除等特定動作必填，未涵蓋全部異動（見 OR-69） |
| Modifiability | 改動不破壞品質 | 14 道 `verify` 檢查在每次 push 與 PR 執行；`main` 強制 `Verification evidence` | Stage 0 已補大多數 gate 自測；兩支 gate 與一組整體 fixture 仍缺（見 §9.2） |
| Testability | 能建立測試準則並執行 | 820 項單元測試、152 項 E2E、Firestore rules 測試、10 張視覺基準 PNG | 手術／付款／結算尚無測試策略；金額計算需 property-based 測試而非只有樣例測試 |

### 2.1 把關本身的品質標準

DORA（Google Cloud 的 DevOps Research and Assessment 研究計畫）對持續整合的兩個
結論直接適用於本專案
（[DORA: Continuous Integration](https://dora.dev/capabilities/continuous-integration/)、
[DORA: Test Automation](https://dora.dev/devops-capabilities/technical/test-automation/)）：

1. **回饋時間上限約 10 分鐘。** 超過就要拆分或平行化，而不是讓人習慣「跑很久所以
   先跳過」。現況：`verify` 約 2～3 分鐘（含完整 build）＋單元測試約 40 秒，在預算內；
   `test:e2e` 與 `test:rules` 另計，屬於 deployment pipeline 的後段。
2. **有效的測試套件要「抓得到真失敗、且只讓可發布的程式通過」。** 由此可導出兩種
   必須主動排除的失效模式，兩者今天都實際出現過：

| 失效模式 | 本專案的實例 | 對策 |
| --- | --- | --- |
| 假紅燈：gate 因自身缺陷崩潰 | `check:secrets` 在工作區有已刪除檔案時 ENOENT 崩潰，被讀成「掃描失敗」 | 定義三種工作區情境的行為，並補測試 |
| 假綠燈：測試落後於實作 | SAST 證據產生器的測試仍使用已被拆分的舊環境變數，所有案例都停在 `invalid-evidence`，分類邏輯從未被驗證 | 測試與 workflow 的變數契約同步；改動其一必須同時改另一 |
| 不穩定測試 | `apps/api` 健康檢查測試在高負載批次中曾 5 秒逾時，單獨執行僅 327 毫秒 | 不用調高 timeout 掩蓋；應拆分執行序或明確標記並追蹤 |

第三列尚未處理，列為待辦而非已解決。

### 2.2 維護性的三條硬規則

1. **單一來源優先於同步機制。** 每當出現「兩個地方要保持一致」，先問能不能合成
   一份。做不到時才用自動檢查比對——本專案已有五處對外頁面清單抄本、六份樣式表
   與 vendored domain 三個案例，全部由 `check:pages`、`check:tokens`、`check:sync`
   把關，缺一份就紅。
2. **把關腳本本身也是產品程式碼。** 它們決定什麼能進 `main`，因此同樣需要測試、
   同樣不得在髒工作區崩潰。
3. **拒絕「先做再說」的資料模型。** 醫療與金額欄位一旦寫入就難以回收，模型錯誤
   的成本遠高於延後兩週。

---

## 3. 效能策略

### 3.1 前端：Core Web Vitals

採用 Google 官方門檻，並以**第 75 百分位**判定，而非平均值
（[web.dev / Web Vitals](https://web.dev/articles/vitals)、
[門檻的訂定方式](https://web.dev/articles/defining-core-web-vitals-thresholds)）：

| 指標 | 「良好」門檻 | 本專案目標 |
| --- | --- | --- |
| LCP（最大內容繪製） | ≤ 2.5 秒 | 患者預約頁與工作臺皆 ≤ 2.0 秒，留 20% 餘裕 |
| INP（互動到下次繪製） | ≤ 200 毫秒 | 時段選取、送出預約 ≤ 150 毫秒 |
| CLS（累積版面位移） | ≤ 0.1 | ≤ 0.05；時段格線與備註區為動態插入，最易踩雷 |

為什麼要留餘裕：門檻是「良好／需改善」的分界，不是目標。以門檻為目標等於把一半
的使用者放在邊緣。

### 3.2 人因基準：使用者到底能等多久

Nielsen 整理的三個回應時間界線至今仍是設計依據，其根據可回溯到 Miller（1968）與
Card 等人（1991）的實驗
（[NN/g: Response Time Limits](https://www.nngroup.com/articles/response-times-3-important-limits/)）：

- **0.1 秒**：使用者感覺系統是即時反應，不需要額外回饋；
- **1 秒**：思緒不被打斷，但會察覺延遲，此時應顯示狀態；
- **10 秒**：注意力的上限，超過必須給進度與可離開的出口。

對應到本專案的具體要求：

| 操作 | 目標 | 超過時的處理 |
| --- | --- | --- |
| 點選時段、勾選備註標籤 | < 0.1 秒 | 純前端狀態，不得等待網路 |
| 送出預約、櫃檯處置 | < 1 秒 | 超過須顯示進行中狀態並鎖住重複送出 |
| 月檢視、報表、結算試算 | < 10 秒 | 超過須分頁或背景化，並提供取消 |

### 3.3 後端：Firestore 的效能陷阱

依 Google 官方最佳實務
（[Firestore best practices](https://firebase.google.com/docs/firestore/best-practices)、
[Understand reads and writes at scale](https://firebase.google.com/docs/firestore/understand-reads-writes-scale)）：

1. **不要用單調遞增的 ID。** 官方明言以自動產生的 document ID 建立文件不會踩到寫入
   熱點；自訂遞增序號（例如 `appointment_000001`）正是製造熱點的典型做法。本專案
   目前的合成序號僅供測試。**2026-08-01 的 ENG-03 已定案：正式模型使用資料庫產生的
   document ID，診所需要的營運連號一律另存欄位，永遠不當作 document ID。** 建立
   持久化切片時仍須補一份 ADR 記錄鍵設計與遷移方式。
2. **單一文件的持續高併發會形成熱點。** Firestore 的鍵範圍最多只能切到單一文件，
   因此「一個診所一份 counter 文件」這種設計在尖峰會爭用。容量／名額計數必須分片
   或改以查詢聚合。
3. **500/50/5 暖機規則。** 新集合的流量從每秒 500 次操作起步，之後每五分鐘最多
   增加 50%。壓力測試若一開始就全速打，測到的是暖機失敗而不是真實容量。

### 3.4 效能不是上線後才量

效能預算（`check:perf`）已在 `verify` 中阻斷式執行，`/clinic.html` 的影像預算為
180 KiB／14 檔（2026-08-02 由 560 KiB／3 檔調降）。**Expansion S 的每一個新頁面都
必須先進預算表再開發**，不能先做完再來減肥——官網素材（原本約 2.2 MB 未最佳化）
就是先做完再減肥的例子，2026-08-02 才壓到 129 KiB。

---

## 4. 身分與連線安全

### 4.1 已核准值與國際基準的對照

D-006 的已核准值**維持不變**；但不能再宣稱「完全符合 NIST AAL2」。2025 年發布的
**NIST SP 800-63B-4** 建議 AAL2 的整體重新驗證上限不超過 24 小時、閒置上限不超過
1 小時，並要求 verifier 至少**提供一種抗網路釣魚的驗證選項**。TOTP 可作為 AAL2 的
OTP 因子，但本身不是抗網路釣魚方法
（[NIST AAL2 requirements](https://pages.nist.gov/800-63-4/sp800-63b/aal/)）。

| 本專案已核准值（D-006） | NIST SP 800-63B-4 AAL2 | 結論 |
| --- | --- | --- |
| 8 小時 absolute session | 建議 ≤ 24 小時 | 時間上更嚴格 |
| 30 分鐘 idle | 建議 ≤ 1 小時 | 時間上更嚴格 |
| 全員 MFA、自管帳號 TOTP | 需兩個因子；verifier 另須提供至少一種抗釣魚選項 | **TOTP 可作第二因子，但不足以單獨支撐完整 AAL2 對齊聲明** |
| 停權後下一個 protected request 即拒絕 | session host 必須執行逾時、失效與重新驗證 | 需由伺服器端負向測試證明 |

因此 C0／C2 必須由 security owner 書面選一項：加入 passkey／FIDO2 等抗釣魚選項；或
明確記錄本專案**不宣稱完整符合 NIST AAL2**及其剩餘風險。這是新發現的標準差距，不得
由實作者自行改寫 D-006。8 小時／30 分鐘本身不用重新爭論，但是否提出 AAL2 對齊聲明
必須定案。

### 4.2 連線階段的實作要求

驗收基準改採目前穩定版 **OWASP ASVS 5.0.0**；證據須記錄版本及 requirement ID，避免
未來 ASVS 改版後只留下無法重現的「已符合 ASVS」一句話
（[OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/)）。
同時依 NIST SP 800-63B-4 的 session 規範：

- token 至少 64 bits 亂度，且由核可的密碼學演算法產生；
- **絕不出現在 URL 參數**；
- 驗證成功時必須換發新 token（防固定攻擊）；
- cookie 使用 `Secure`、`HttpOnly`、`SameSite=Lax` 或 `Strict`、最小 host／path；可行時採
  `__Host-` 前綴與 `Path=/`；
- POST／PUT 必須驗證 CSRF 防護值，session secret 不得存於 `localStorage`；
- 登出與逾時要真正失效，不能只靠前端跳轉——上一頁或下游系統不得能續用。

Firebase session cookie 的有效期可設 5 分鐘至 2 週，但那只是產品允許範圍，**不會取代
D-006 的 8 小時 absolute／30 分鐘 idle 與伺服器端撤銷檢查**。C3 必須對 29:59／30:00
及 7:59:59／8:00:00 邊界做伺服器端測試
（[Firebase session cookies](https://firebase.google.com/docs/auth/admin/manage-cookies)、
[NIST session management](https://pages.nist.gov/800-63-4/sp800-63b/session/)）。

### 4.3 權限：後端拒絕，不是前端隱藏

業主要求的金額權限（OR-57、OR-58）必須在 API 層回 403 並且**不回傳欄位本身**。
把按鈕藏起來而後端照給資料，等同沒有權限控管。這一點已寫入 C4 切片的明確排除項。

---

## 5. 資料保護與法遵基線

### 5.1 特種個人資料

《個人資料保護法》第 6 條把**病歷、醫療、基因、性生活、健康檢查及犯罪前科**列為
原則禁止蒐集、處理或利用的特種個人資料，僅在六款例外（含當事人書面同意且未逾越
特定目的必要範圍）下才可為之
（[全國法規資料庫：個資法第 6 條](https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=I0050021&flno=6)）。

**直接後果：** 手術名稱、麻醉方式、術後回診內容都落在「醫療」範圍。Expansion S
不是「多加幾個欄位」，而是把系統的資料分類整個往上提一級，必須先有 D-014 的
醫療紀錄邊界與 D-001～D-003 的告知同意基礎。

### 5.2 病歷保存年限

《醫療法》第 70 條規定醫療機構病歷應指定適當場所及人員保管，**至少保存七年**；
未成年者的病歷保存至成年後**再加七年**；人體試驗相關紀錄**永久保存**
（[全國法規資料庫：醫療法第 70 條](https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=L0020021&flno=70)）。

**直接後果：** D-002 的「預約資料保存多久」與病歷保存年限**不是同一件事**，
必須分開決定。若把預約資料與臨床紀錄放在同一份文件裡，保存與刪除政策會被迫
一起套用最長的那個年限——這是資料模型設計上必須先切開的理由。

### 5.3 無障礙

以 **WCAG 2.2 Level AA** 為目標。WCAG 2.2 於 2023-10-05 成為 W3C Recommendation，
相對 2.1 新增 9 條成功準則，並移除已過時的 4.1.1 Parsing；符合 2.2 即同時符合
2.0 與 2.1
（[W3C: What's New in WCAG 2.2](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/)、
[WCAG 2.2 Recommendation](https://www.w3.org/TR/WCAG22/)）。

現況：E2E 已含六頁 axe 掃描、三主題與九個寬度的重排驗證。**自動掃描不等於符合
AA**——新增的 2.2 準則（如焦點外觀、目標尺寸、一致的說明位置、避免重複輸入）
多數需要人工驗證，這正是 Stage 6 列有「人工無障礙」關卡的原因。

### 5.4 上線前的法規版本與適用性鎖定

公開收集真實個資前，privacy／legal owner 必須產出一份日期化的適用性判定，至少涵蓋：

1. 個資法第 8 條告知項目如何逐欄映射到隱私告知；
2. 第 11 條正確性、更正、目的消失或期限屆滿後的刪除／停止處理流程；
3. 第 12 條事故通知、通報、應變與紀錄保存，在**預計上線日實際生效版本**下的責任；
4. 預約資料、病歷與稽核紀錄各自的保存依據、期間、刪除例外與備份處理；
5. 受託處理者、跨境／跨區處理、資料主體權利、事件聯絡人與回覆時限。

全國法規資料庫目前明示 2025 年個資法修正有部分條文施行日未定，因此規劃書只提供
工程檢核，不替代法律意見，也不把尚未生效文字當成既有義務。衛福部的
《醫院個人資料檔案安全維護計畫實施辦法》可作控制設計參考，但是否適用本診所須由
privacy／legal owner 依機構類型書面判定，不得由工程人員推定。

---

## 6. Google Calendar 同步架構

以下全部依 Google 官方同步指南
（[Synchronize resources efficiently](https://developers.google.com/workspace/calendar/api/guides/sync)、
[Push notifications](https://developers.google.com/workspace/calendar/api/guides/push)）。
**本節是設計，不是授權**；實際接線仍由 D-009 與 D-016 阻擋。

### 6.1 三個官方事實決定了架構

1. **必須持久化 syncToken。** 先做一次完整同步取得 token，之後每次增量同步帶入
   舊 token、儲存新 token。token 不能只放在記憶體。
2. **token 會失效，且以 HTTP 410 Gone 告知。** 收到 410 就必須退回完整同步，
   而不是重試或報錯。這是必須實作的分支，不是例外處理。
3. **推播不是 100% 可靠。** 官方明說正常運作下仍會有少量訊息遺失，應用程式必須
   在完全沒收到推播的情況下也能同步。

### 6.2 由此推導出的設計

| 設計決定 | 理由 |
| --- | --- |
| 推播 + 定期輪詢雙軌 | 官方明示推播會掉訊息；只靠推播會靜默漏單 |
| 每筆事件保存 Google Event ID | 業主已指出（避免重複建立）；同時是冪等的鍵 |
| 外部刪除→標記「已取消」，不真刪 | 業主要求；也符合稽核不可覆蓋原則 |
| 增量同步的查詢參數必須與初次一致 | 官方限制：參數集不同會使 token 無效 |
| 失敗進 outbox 死信並告警 | 已有機制，直接沿用，不另造一套 |

### 6.3 邊界

Google Calendar 是**投影**，不是預約量能或衝突的 source of truth。容量、衝突與
營業時間判斷一律在系統內完成。日曆事件內容是否可含療程名稱，屬 D-009／業主
清單第 34 題，未決前一律不寫。

---

## 7. 可靠性與可觀測性

### 7.1 SLO 與錯誤預算

採 Google SRE 的定義：錯誤預算 = 1 − SLO；燃燒率（burn rate）是相對於 SLO 消耗
預算的速度，SLO 99.9%／30 天下持續 0.1% 錯誤率剛好用完預算，即燃燒率 1
（[Google SRE Workbook: Alerting on SLOs](https://sre.google/workbook/alerting-on-slos/)、
[Error Budget Policy](https://sre.google/workbook/error-budget-policy/)）。

### 7.2 一個容易抄錯的地方

SRE Workbook 同時指出：**multiwindow、multi-burn-rate 告警在低流量系統會出問題**，
因為請求數太少時無法形成有意義的訊號。

**本專案正是低流量系統**——一間診所每天數十至上百筆預約，夜間與週日至週二完全
沒有流量。因此：

- **不要**照抄多視窗燃燒率告警；
- 改用**絕對計數**告警（例如「連續 3 筆同步失敗」「死信佇列 > 5」「outbox 最舊
  未處理項目 > 15 分鐘」）；
- 可用性 SLO 以**營業時間內**為分母，否則週一整天沒人用會把數字灌到 100%。

### 7.3 必須看得見的東西

outbox 待處理最舊項目年齡、死信數量、Calendar 同步落後時間、預算使用率、
稽核寫入失敗數。這五項若無人接收告警，等於沒有監控——這也是 C0 要求具名主要與
備援接收者的原因。

---

## 8. 簽核後的交付控制平面

簽核不是「可以直接執行」的同義詞。它只確定政策答案；任何雲端或資料變更仍須沿著
以下控制鏈逐片前進。完整欄位與逐步動作見執行書 §3、§10。

### 8.1 六道關卡

| Gate | 必須回答的問題 | 最低證據 | 未通過時 |
| --- | --- | --- | --- |
| G0 核准基線 | 哪些決策已核准、版本是什麼、還有哪些矛盾 | 決策快照、核准人／日期、文件 commit、未決清單 | 不得建立切片 request |
| G1 切片申請 | 這一片做什麼、不做什麼、誰執行、花多少 | scope、排除項、owner、時窗、成本、資料分類、回滾 | 不得產生 provider plan |
| G2 計畫驗證 | 實際 provider plan 是否只包含核准範圍 | plan 檔及 SHA-256、provider lock、政策掃描、成本差異、state 基準 | 修正後重跑；舊 plan 作廢 |
| G3 Apply 核准 | 核准者是否看過**同一份** plan | approver、operator、plan hash、到期時間、剩餘風險 | 不得 apply |
| G4 套用與驗收 | 套用結果是否等於 plan，負向控制是否真的拒絕 | apply log、實際資源 ID、測試數、告警、drift、回滾結果 | 停止後續切片並回滾或隔離 |
| G5 穩定與交接 | 新能力是否有人營運，證據是否可重現 | 觀察窗、dashboard、runbook、主要／備援 owner、handoff | 階段不算完成 |

上一片的 G5 不會自動核准下一片的 G1。C1～C6 每一片都需要自己的 request、deployment
authority、provider-backed plan、apply approval、驗收與交接。

### 8.2 基礎設施與供應鏈硬規則

依 Google Cloud 的 Terraform、IAM、Cloud Run、Firestore 與 Secret Manager 官方文件：

- Terraform state 使用受限的遠端 backend；state、plan 與輸出都按敏感資料處理，不把
  secret 值寫進 configuration、state、CI log 或 artifact。套用前跑政策檢查，套用後跑
  持續稽核；stateful 資源預設 deletion protection。
- CI 對 Google Cloud 採短期 Workload Identity Federation，不使用長期 service-account key。
  attribute condition 必須限制 GitHub organization／repository／branch／workflow，能用數字
  `*_id` claim 時不用可改名、可被重新註冊的名稱；IAM 不授權整個 identity pool。
- Cloud Run 以不可變 artifact digest 建立無流量 revision，先過 startup／readiness 與 synthetic
  smoke，再分段移轉流量。回滾是把流量切回已驗證 revision；資料 schema 必須向前／向後
  相容，否則「程式回滾」不等於「系統回滾」。
- Firestore location 在建立時即固定且不可變；建立前必須核對 D-010。啟用 deletion
  protection、備份／PITR 與實際 restore 演練。官方 backup 與來源在同一 location，且
  restore 會建立新 database，故**同區備份不是 regional DR**。
- Secret Manager 版本不可變；production 不盲用 `latest`。輪替採「新增版本 → 指定版本
  小流量部署 → 驗證 → 停用舊版 → 觀察後銷毀」，輪替工作需可重入，並有最小權限身分。
- 一般 Cloud Billing budget 是告警，不是硬性支出上限，且資料有延遲。不得把收到預算
  告警當作成本已被自動封頂的證據。

### 8.3 Plan 有效性與停止條件

下列任一變化都使既有 plan／apply approval 失效：base commit、Terraform configuration、
variables、provider lock、state serial、目標 project、identity、成本或核准時間窗改變。必須
重新產生 plan、重新計算 hash、重新審查；不得以「差異很小」沿用舊核准。

遇到以下任一情況立即停止，不進下一片：plan 出現未列入 scope 的資源或刪除、敏感值進入
log／artifact、實際成本超過核准容忍範圍、主要或備援 owner 不在場、負向測試失敗、告警
收不到、drift 未解、回滾不可執行、真實個資誤入 synthetic 環境，或法規／決策版本有矛盾。
停止後保全證據，由 approver 決定回滾、隔離或另開核准；operator 不得自行擴張權限處理。

### 8.4 資料與 schema 變更順序

所有不可逆資料變更採 expand／migrate／verify／contract：先加入向後相容欄位與讀寫路徑，
以合成資料或遮罩副本排演並核對筆數／checksum，再切換讀取，觀察一個核准的穩定窗，最後
才移除舊欄位。涉及真實資料時另需 D-series 授權、privacy／legal 判定、備份與 restore
證據。禁止把 destructive migration 與新 runtime 首次上線放在同一個不可分割步驟。

---

## 9. 本次規劃過程中發現的實際缺陷

### 9.1 `check:secrets` 會在髒工作區崩潰（已修）

`git ls-files` 讀的是 index，會列出「已在版控、但工作區已刪除」的檔案；腳本直接
`readFile` 該路徑會 ENOENT，讓整個 gate 以「掃描失敗」告終。這正是 §2.1 第 2 條的
實例：**把關腳本自己沒有被測試**。修法是明確跳過並回報跳過數量，不靜默略過。

### 9.2 由此得出的規劃結論

`scripts/` 下每一支阻斷式檢查都應具備：(a) 至少一支測試；(b) 在髒工作區、
淺複製與全新 clone 三種情境下的行為定義。Stage 0 已替九支阻斷檢查補測；目前剩下
`check-architecture.mjs`、`check-web-ui.mjs` 的核心邏輯自測，以及
`checkPublicPageConfiguration` 的完整組態 fixture。三者分別由 TW-01～TW-03
接手，不再把已完成的 Stage 0 誤寫成尚未開始。共同規則見
[開發與交接規約](../../CONTRIBUTING.md) 第 8 條。

### 9.3 SAST 證據產生器的測試從未通過（已修）

`scripts/generate-sast-evidence.test.mjs` 使用的是舊的 `SAST_RULE_CONFIGS`，而
`.github/workflows/sast.yml` 早已改為 `SAST_LOCAL_RULE_CONFIGS`、
`SAST_UPSTREAM_RULE_MANIFEST`、`SAST_UPSTREAM_RULE_ROOT`、
`SAST_EXPECTED_UPSTREAM_RULE_COUNT`、`SAST_CONFIGURED_RULE_COUNT` 五個變數，且測試
未傳入 `ruleFiles` 與 `ruleManifestRaw`。結果所有案例都在規則中繼資料檢查就停在
`invalid-evidence`，**分類邏輯一條都沒有被驗證過**。

這一點對 **SEC-02 具有實質影響**：該核准案的前提之一是「規則正反測試」，但在修好
之前，證據產生器本身的分類行為並未被任何測試涵蓋。已改寫測試並補上四個原本完全
沒有覆蓋的路徑：規則檔缺漏、manifest 被重排或竄改、規則測試失敗、SARIF 載入的規則
數與宣稱數不符。

---

## 10. 全部未完成事項的工作分解

本節是**全專案 open-work baseline**。一項工作只有在本節有唯一 work-package ID、owner、
前置與完成證據，才算已被規劃；散落在其他文件中的 `pending`、`TBD`、`尚未` 不可再成為
無主待辦。已完成的 Stage 0、T1～T5、T21、D-012 preview scope、D-013 與既有合成原型
只保留為歷史／前置證據，不重複列成待辦。

### 10.1 來源覆蓋與去重規則

| 原始來源 | 未完成範圍 | 收斂到 |
| --- | --- | --- |
| 業主決定清單 39 題 | 1～6 對外／隱私；7～14 預約；15～17 個管；18～23 財務；24～27 醫療；28～32 個資／供應商；33～36 Calendar；37～39 雲端費用 | GOV-01～GOV-07、PUB、OPS、CAL、S 系列 |
| 技術資安清單 T1～T21 | T1～T5、T21 已完成；T6～T13 是 C0；T14～T17 是 Calendar；T18～T19 是 Stage 2 實作；T20 是 production scope 重審 | GOV-07～GOV-08、C1～C6、CAL-01、GO-01 |
| Decision register | 12 筆 pending：D-001～D-005、D-007～D-009、D-011、D-014～D-016；D-006／D-010 只缺實作證據 | GOV-02～GOV-07、C2～C6、PUB、OPS、CAL、S 系列 |
| Owner requests OR-01～OR-69 | 未完成／部分完成：OR-07、OR-22、OR-37、OR-40～OR-61、OR-63～OR-69 | GOV-03、TW-06～07、OPS、CAL、S 系列 |
| 2026-07-27 owner batch 6 | 官網 C1 尚待業主實機接受；C2 的 WebP 轉換與影像預算已於 2026-08-02 完成（2.2 MB → 129 KiB，預算改為 180 KiB／14 檔），**圖片授權仍未取得** | PUB-03 |
| Stage 0 交接／§2.1 實測 | 兩支 gate 無自測、public-page 整體 fixture、單元測試收集時間、API health test 批次逾時 | TW-01～TW-04 |
| Roadmap | 人工螢幕閱讀器與高對比驗證尚未執行 | TW-05、GO-01 |

若同一件事同時出現在 OR、D、T 或 C 切片，只保留一個工作包，其他編號列為 traceability，
不建立四份重複實作。新增待辦時必須先更新本節與執行書的 tracker；關閉時要附證據連結，
不能只把字樣改成「完成」。

### 10.2 Work packages

#### A. 決策與治理

| ID | 範圍／原始編號 | Accountable owner | 前置 | 完成定義 |
| --- | --- | --- | --- | --- |
| GOV-01 | 回收兩份清單、逐題完整性與矛盾檢查 | Clinic owner＋technical owner | 無 | 39 題、T1～T21、C1～C6 都有答案／N/A、核准人、日期；pending 明列 blocker |
| GOV-02 | 隱私與資料治理 D-001～D-003（業主 1～2、28～32） | Clinic＋privacy/legal＋operations | GOV-01 | controller／contact、告知版本、權利請求、retention、vendor／region／DPA、事故與備份例外均簽核 |
| GOV-03 | 預約政策 D-004～D-005；OR-07／22／37／48 矛盾 | Operations＋legal | GOV-01 | 營業時間、重複上限／比對、多服務占位、容量、blackout、取消／no-show／費用與例外均定案 |
| GOV-04 | 個管與薪資 D-007～D-008（業主 15～20、23） | Case management＋finance＋operations | GOV-01 | 指派／改派／merge、計薪來源、rule version、lock／adjustment／爭議流程均定案 |
| GOV-05 | Outbound Calendar 與公開網站 D-009／D-011（業主 3～5、33～34） | Clinic＋security＋operations | GOV-01 | Calendar／credential／scope／欄位；URL／語言／人工預約／故障備援均定案 |
| GOV-06 | Expansion S D-014～D-016（業主 21～27、35～36；OR-40～69 未完成部分） | Medical＋privacy/legal＋finance＋clinic＋security | GOV-01 | 臨床邊界、付款權威、結算來源、inbound review／conflict／delete／SLO 與 release scope 均簽核 |
| GOV-07 | C0：T6～T13＋業主 37～39 | Technical＋security＋billing owner | GOV-02～GOV-05 的 C0 必要輸入 | reviewers、IAM、用量／價格／預算、DR、身分參數、告警主備完成，C0=`approved` |
| GOV-08 | 上線範圍重審：SEC-02、D-012、D-013 bypass、法規／供應商版本 | Security＋clinic＋privacy/legal＋technical | release candidate | Semgrep 能力差距、正式網域署徽、bypass 使用紀錄、有效法規與 vendor terms 有日期化結論 |

#### B. 不阻塞決策的 repository 補強

本節使用 `TW`（technical work）編號，避免與 2026-08-01 已存在的 `ENG-01～ENG-04`
決策／追加條件混淆。

| ID | 工作 | Owner | 可開始時間 | 完成定義 |
| --- | --- | --- | --- | --- |
| TW-01 | `check-architecture.mjs` 抽純函式、正常／髒工作區／全新 clone 測試 | Technical | 現在 | 核心相依判斷與失敗輸出有正負測試，`verify` 阻斷 |
| TW-02 | `check-web-ui.mjs` 拆分 1070 行檢查並補回歸測試 | Technical＋UX | TW-01 可平行 | permission／safety／a11y／DOM guard 各有 fixture，不改弱既有規則 |
| TW-03 | `checkPublicPageConfiguration` 全組態 fixture | Technical | 現在 | inventory、budget、Firebase、scan routes 的缺漏／漂移／重複均被測試擋下 |
| TW-04 | 測試效能與穩定性：Vitest collect、API health test 批次逾時 | Technical | 現在 | 至少三次 before／after；拆出 collect／prepare／test 數據；重現或以長跑證明 health test 穩定，不靠拉高 timeout 掩蓋 |
| TW-05 | 人工無障礙：螢幕閱讀器、鍵盤、200%／400%、高對比 | Accessibility reviewer＋UX | 合成環境現在可預演；Go 前正式執行 | 依 WCAG 2.2 AA success criteria 留 browser／AT／版本、步驟、缺陷與修復重測；自動 axe 不代替人工 |
| TW-06 | 多服務模型由 UI `itemIds` 對齊 domain／API 單一 `serviceId` | Operations＋technical | GOV-03 後 | ADR、schema migration、容量／衝突／效能／相容測試；不得自行推定時長相加 |
| TW-07 | 所有受控異動的 reason／correction 規則（OR-68～69） | Operations＋privacy＋finance＋medical | 各資料域決策後 | command inventory 逐項定義 reason 必填、before／after、actor、correction；無無痕覆寫 |

TW-01～TW-05 可以與 Stage 1 決策並行；TW-06～TW-07 含政策值，必須等對應決策。
依 NIST SSDF，安全實務要嵌入整個 SDLC；因此這些不是「有空再做」的孤立清理，而是
各切片的供應鏈與驗證前置。

#### C. Stage 2～Production

| ID | 工作包 | 決策／授權前置 | 完成證據 |
| --- | --- | --- | --- |
| C1 | 隔離 staging foundation | GOV-07＋C1 request／authority | remote state、WIF／IAM 負向測試、budget／alerts；Firestore／IdP／runtime／Calendar absence |
| C2 | 合成 staff identity | C1＋IdP／recovery 核准 | Google＋local、email、MFA／recovery、抗釣魚選項或 AAL2 non-claim |
| C3 | Server session | C2＋threat model | cookie／CSRF、8h／30m、logout／revocation 邊界測試 |
| C4 | Server authorization | C3＋role/action／KDF 參數 | default-deny RBAC、field projection、停權／限流負向矩陣 |
| C5 | Firestore／audit／restore | C4＋D-002 對齊＋C5 authority | location／protection、direct-client deny、append-only audit、backup／PITR restore |
| C6 | Staff-only synthetic staging | C1～C5＋C6 authority | digest-bound 0% revision、分段流量、E2E／效能／告警／rollback、無 public／真資料 |
| CAL-01 | Stage 3 outbound Calendar | C6＋GOV-05＋獨立 authority | 最小 scope／PII、outbox、syncToken／410、push＋poll、DLQ、rotation／reconciliation |
| PUB-01 | Privacy／vendor／legal operating controls | GOV-02＋上線日法規版本 | data inventory、DPA／subprocessor owner、notice／consent、DSR、retention／deletion、incident drill |
| PUB-02 | Patient identity／public API | GOV-03＋GOV-05＋PUB-01＋D-006／D-010 evidence | 本人驗證、rate／abuse／idempotency、PII 不進 localStorage／URL／log、kill switch |
| PUB-03 | Clinic website acceptance／licensed media | GOV-05＋content／license owner | C1 實機接受；C2 素材來源與授權證據（manifest 已備、授權未取得）；WebP／responsive images 進 180 KiB／14 檔預算（2026-08-02 已達成）；SEO／a11y／visual／preview 驗收 |
| OPS-01 | 正式 slot／多服務／schedule | GOV-03＋TW-06 | versioned schedule、容量／resource conflict、blackout、delay／override、migration／E2E |
| OPS-02 | Case management／merge | GOV-04＋C4／C5 | assignment lifecycle、代理／離職、merge preview／雙人覆核／restore、field scope |
| OPS-03 | Payroll／period close | GOV-04＋D-015 邊界 | versioned rule、source snapshot、lock、append-only adjustment、recompute／dispute evidence |
| GO-01 | Phase 1 production Go／No-Go | 所有 release-scope WP 完成＋GOV-08 | 同一 release candidate 的 security／privacy／a11y／load／DR／rollback／operations 聯合簽核 |

#### D. Expansion S

| ID | 工作包 | 前置 | 完成證據 |
| --- | --- | --- | --- |
| S-00 | Release-scope、資料分類、command／event／role inventory | GOV-06 | S1～S7 分批策略、資料域 owner、明確排除與每片 request |
| S-01 | surgery／clinical／payment／settlement 模組邊界與純 domain | D-004／D-014／D-015 對應規則 | ADR、狀態機、interval conflict、money property tests、RBAC projection；仍無 route／真資料 |
| S-02 | 合成手術排程 | S-01＋Stage 2 API／auth | surgeon／room／patient conflict、休診／override、到診轉手術、改期釋放與 concurrency E2E |
| S-03 | 臨床時間軸與回診 | D-001～D-003＋D-014＋S-02 | 最小欄位、medical owner、access log、correction、retention／export／DSR drill |
| S-04 | Patient payment／refund ledger | D-015＋S-01 | accounting source、decimal／currency、deposit／balance／refund、reconciliation、append-only correction |
| S-05 | Staff settlement | D-008＋D-015＋S-04 | 三角色分帳、rule version、實收／退款基礎、period lock／adjustment、工資／紀錄適用性 memo |
| S-06 | Inbound Calendar review | D-009＋D-016＋CAL-01 穩定 | watch renewal、incremental／410、unknown／delete candidate、conflict、review RBAC、reconciliation SLO |
| S-07 | Expansion integration／Go-No-Go | S-02～S-06 中本次 release scope 完成 | 欄位級 BOLA、audit、migration、DR、rollback、privacy／medical／finance／security 聯合簽核 |

薪資／結算是否屬《勞動基準法》工資與出勤紀錄，須由 finance／legal owner 依實際僱用與
給付性質判定；若適用，第 23 條要求提供工資各項目計算明細並保存工資清冊五年，第 30 條
要求出勤紀錄逐日至分鐘並保存五年。工程端只把它列成 S-05 的法律適用性 gate，不自行
把所有「結算」等同工資。

### 10.3 里程碑與關鍵路徑

| Milestone | 退出條件 | 可並行工作 | 下一個被解鎖的工作 |
| --- | --- | --- | --- |
| M0 完整盤點 | §10 與執行 tracker 覆蓋所有來源 | TW-01～TW-05 | 可控制地回收決策 |
| M1 決策基線 | GOV-01～GOV-06 完成；12 筆 pending 決策各有簽核或明確 deferred scope | TW-01～TW-05、純 plan-only | C0、TW-06～07、各產品切片 request |
| M2 C0 | GOV-07，C0=`approved`；只讓 C1 request-ready | GOV-08 的資料蒐集 | C1 |
| M3 合成 cloud | C1～C6 各自 G5 完成 | OPS 純 domain、ENG 補強 | CAL-01、PUB preparation |
| M4 外部整合 | CAL-01 完成；Calendar 仍非 source of truth | PUB-01、OPS-01～03 | 公開 release candidate |
| M5 真資料 readiness | PUB-01～PUB-03、OPS release scope、人工 a11y 完成 | Expansion S 的 S-00／S-01（如已核准） | GO-01 |
| M6 Phase 1 production | GO-01＋hypercare 退出 | 未納入 release 的 Expansion S | 常態維運／Expansion |
| M7 Expansion S | S-00～S-07 按核准 release scope 完成 | Phase 1 BAU | Expansion production／後續版本 |

**真正關鍵路徑：** GOV-01～07 → C1～C6 → PUB-01～03 → GO-01。TW-01～05 是可並行
技術補強；S 系列不應插入 Phase 1 關鍵路徑，除非 clinic owner 以新的 scope decision
明確合併並接受時程／法遵／財務複雜度。

### 10.4 角色責任

| 角色 | Accountable 範圍 | 不可被默認替代 |
| --- | --- | --- |
| Clinic owner | 對外、scope、production Go、資料與供應商接受 | 開發者不能替診所接受營運／法律風險 |
| Operations | slot、取消、人工備援、櫃檯流程、告警處置 | UI 現況不能當政策答案 |
| Privacy/legal | 個資、告知、保存、權利、事故、vendor／跨境與法規版本 | 本文件不是法律意見 |
| Medical owner | 臨床／病歷邊界、欄位、更正與責任 | 行政或工程人員不能定義臨床紀錄 |
| Finance/accounting | payment source、refund、payroll／settlement、close／adjustment | 程式公式不能取代會計權威 |
| Case-management owner | 指派、改派、代理、merge 與 workload source | 既有 synthetic flow 不能自動升格 |
| Security owner | 身分、MFA／recovery、threat model、IAM、AAL claim、Go security | operator 不得自批 apply 或風險接受 |
| Technical owner／operator | 設計、實作、證據、rollback、handoff | 只執行核准 scope，不擴張決策 |

---

## 11. 風險登錄

| # | 風險 | 影響 | 對策 | 現況 |
| --- | --- | --- | --- | --- |
| R1 | 醫療與財務資料先做後補核准 | 個資法第 6 條違規風險 | Expansion S 獨立軌，D-014／D-015 未過不動工 | 已控制 |
| R2 | Calendar 推播漏訊息造成靜默漏單 | 病患白跑 | 推播＋輪詢雙軌、死信告警 | 設計已定，待 D-009 |
| R3 | 單調遞增 ID 造成寫入熱點 | 尖峰逾時 | 正式模型改自動 ID，營運連號另存欄位 | **2026-08-01 已由 ENG-03 定案**；實作前仍需 ADR |
| R4 | 把關腳本自身無測試 | 假綠燈 | TW-01～TW-03 逐支補測試 | 進行中（§10.2） |
| R5 | 低流量下照抄燃燒率告警 | 告警不會響 | 改絕對計數 | 設計已定 |
| R6 | 效能預算在功能做完後才套 | 大幅重工 | 新頁面先進預算表；PUB-03 先確認授權再轉 WebP／responsive image | 官網素材待處理 |
| R7 | 業主需求前後不一致 | 做錯方向 | 四項待確認已列表 | 待業主回覆 |
| R8 | plan 與 apply 之間 configuration／state 已改變 | 套用未經核准的差異 | plan 有效性條件、hash 與短時窗；任何變更重審 | 控制已定，待 C1 證明 |
| R9 | Terraform state／plan／CI artifact 洩露 secret 或敏感值 | 憑證或基礎設施資訊外洩 | 遠端受限 state、敏感 artifact、不得把 secret 寫入 state／log | 待 C1 實證 |
| R10 | WIF 只按可改名的 repo claim 授權 | 名稱被接管後取得雲端權限 | 限制 issuer、數字 ID、repo、branch、workflow；不授權整 pool | 待 C1 實證 |
| R11 | TOTP 被誤寫成完整 NIST AAL2 對齊 | 對外保證超過實際控制 | C0／C2 決定抗釣魚選項或明列不宣稱完整 AAL2 | **待 security owner** |
| R12 | 把 Cloud Billing budget 當硬上限 | 異常費用未被自動阻止 | 告警 owner、停用 runbook、每日成本觀測；不宣稱自動封頂 | 待 C1 實證 |
| R13 | Cloud Run revision 已回退但 schema 不相容 | 應用看似回滾、資料仍不可用 | expand／contract、雙向相容、資料回復演練 | 待 C6 實證 |
| R14 | 以尚未生效修法或不適用醫院辦法當成診所義務 | 法遵缺口或錯誤承諾 | 上線日前由 privacy／legal owner 鎖定有效版本與適用性 | **待 D-001～D-003／D-011** |
| R15 | 待辦散落在 OR／D／T／C 與交接文件，重複或漏做 | 假完成、無主工作 | §10 單一 work-package ID 與來源覆蓋表 | 本次已建立；後續需維護 |
| R16 | 付款／結算公式先於會計與勞動法適用性定案 | 金額錯誤、薪資爭議 | S-04／S-05 分域、具名 finance／legal gate、append-only adjustment | 待 D-008／D-015 |
| R17 | 自動 a11y 掃描被當成人工符合證據 | 輔具使用者無法完成預約 | TW-05＋GO-01，記錄 AT／browser／SC 與修復重測 | 待人工執行 |

---

## 12. 引用來源

- [ISO/IEC 25010:2023 產品品質模型](https://www.iso.org/obp/ui/en/#!iso:std:78176:en)
- [web.dev — Web Vitals](https://web.dev/articles/vitals)
- [web.dev — Core Web Vitals 門檻的訂定方式](https://web.dev/articles/defining-core-web-vitals-thresholds)
- [Nielsen Norman Group — Response Time Limits（Miller 1968；Card et al. 1991）](https://www.nngroup.com/articles/response-times-3-important-limits/)
- [Firebase — Cloud Firestore 最佳實務](https://firebase.google.com/docs/firestore/best-practices)
- [Firebase — Understand reads and writes at scale](https://firebase.google.com/docs/firestore/understand-reads-writes-scale)
- [NIST SP 800-63B-4 — Authentication Assurance Levels](https://pages.nist.gov/800-63-4/sp800-63b/aal/)
- [NIST SP 800-63B-4 — Session Management](https://pages.nist.gov/800-63-4/sp800-63b/session/)
- [OWASP ASVS — current stable release](https://owasp.org/www-project-application-security-verification-standard/)
- [NIST SP 800-218 — Secure Software Development Framework](https://csrc.nist.gov/pubs/sp/800/218/final)
- [Firebase — Manage Session Cookies](https://firebase.google.com/docs/auth/admin/manage-cookies)
- [Google Cloud — Terraform security best practices](https://docs.cloud.google.com/docs/terraform/best-practices/security)
- [Google Cloud — Terraform general style and structure](https://cloud.google.com/docs/terraform/best-practices/general-style-structure)
- [Google Cloud IAM — Workload Identity Federation for deployment pipelines](https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines)
- [Google Cloud Run — Rollbacks, gradual rollouts and traffic migration](https://docs.cloud.google.com/run/docs/rollouts-rollbacks-traffic-migration)
- [Google Cloud Run — Health checks](https://docs.cloud.google.com/run/docs/configuring/healthchecks)
- [Google Cloud Firestore — Locations](https://docs.cloud.google.com/firestore/native/docs/locations)
- [Google Cloud Firestore — Back up and restore data](https://docs.cloud.google.com/firestore/native/docs/backups)
- [Google Cloud Firestore — Export and import data](https://docs.cloud.google.com/firestore/native/docs/manage-data/export-import)
- [Google Cloud Secret Manager — Rotation recommendations](https://docs.cloud.google.com/secret-manager/docs/rotation-recommendations)
- [Google Cloud Billing — Budgets and alerts](https://docs.cloud.google.com/billing/docs/how-to/budgets)
- [Google Cloud — Data Processing Addendum](https://cloud.google.com/terms/data-processing-addendum)
- [W3C — What's New in WCAG 2.2](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/)
- [W3C — WCAG 2.2 Recommendation](https://www.w3.org/TR/WCAG22/)
- [W3C WAI — How to Meet WCAG 2.2](https://www.w3.org/WAI/WCAG22/quickref/)
- [W3C WAI — Easy Checks](https://www.w3.org/WAI/test-evaluate/preliminary/)
- [Google Calendar API — Synchronize resources efficiently](https://developers.google.com/workspace/calendar/api/guides/sync)
- [Google Calendar API — Push notifications](https://developers.google.com/workspace/calendar/api/guides/push)
- [DORA — Continuous Integration](https://dora.dev/capabilities/continuous-integration/)
- [DORA — Test Automation](https://dora.dev/devops-capabilities/technical/test-automation/)
- [Google SRE Workbook — Alerting on SLOs](https://sre.google/workbook/alerting-on-slos/)
- [Google SRE Workbook — Error Budget Policy](https://sre.google/workbook/error-budget-policy/)
- [全國法規資料庫 — 個人資料保護法第 6 條](https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=I0050021&flno=6)
- [全國法規資料庫 — 個人資料保護法第 8 條](https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=I0050021&flno=8)
- [全國法規資料庫 — 個人資料保護法第 11 條](https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=I0050021&flno=11)
- [全國法規資料庫 — 個人資料保護法第 12 條](https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=I0050021&flno=12)
- [全國法規資料庫 — 醫療法第 70 條](https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=L0020021&flno=70)
- [全國法規資料庫 — 勞動基準法第 23 條](https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=N0030001&flno=23)
- [全國法規資料庫 — 勞動基準法第 30 條](https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=N0030001&flno=30)
- [衛生福利部 — 醫院個人資料檔案安全維護計畫實施辦法](https://www.mohw.gov.tw/fp-18-54747-1.html)

本專案既有的法規基線另見
[台灣隱私法規基線](../security/taiwan-privacy-legal-baseline.md)。
