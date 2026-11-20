# 2026-11-26 凍結準備：CP-08 凍結回歸執行計畫與 CP-10 A-10 商務差異選擇表

**狀態：`PLAN-ONLY／待負責人核准`**。本文件是 2026-11-26 程式凍結（RC，上線候選版）前的執行準備計畫與逐條選擇表，**不是核准、不是任何測試或雲端證據，也不覆寫任何既有已核准政策**（例如 `BD-POLICY-2026-09-29` 或歷史核准紀錄）。所有雲端操作、回歸實測與商務條款拍板，皆須經診所負責人於現場或決定登記明確核准後始得執行。

- **適用專案**：僅限 C1 隔離合成環境（`beauessence-clinic-stg-c1a01`，合成資料）；**絕不**混用 `beauessence-clinic-staging`、真實病患資料、正式行事曆或正式 DNS。
- **公開倉庫去識別聲明**：本倉庫為公開倉庫（`GC-001`）。本文件嚴守 [L6/L7 來源就緒紀錄](../reviews/2026-10-01-luna-l6-l7-source-readiness.md) 第 34 行紅線，**不寫入**業主私有 Google Drive 文件之總價金額、分期金額明細、Drive 檔案 ID、私有原文、人員 email、密鑰或帳密；僅引用倉庫內原已公開之 `BD-POLICY-2026-09-29` 數值與去識別差異維度。
- **依據文件**：
  - [CP-08 全系統回歸證據 worksheet](2026-10-01-cp-08-regression-evidence-worksheet.md)（88 個矩陣 ID 原文）
  - [CP-10 現有專案業主驗收清單](2026-10-01-cp-10-current-project-acceptance-checklist.md)（A-01～A-11）
  - [商務交付未決政策封板（`BD-POLICY-2026-09-29`）](../product/2026-09-29-business-delivery-policy-decisions.md)
  - [第一階段 RC 交付計畫](2026-11-08-phase1-rc-delivery-plan.md)（第一、二、十節）
  - [管理者操作手冊（C1 合成測試版）](../runbooks/manager-operations-manual.md)
  - [2026-11-21 C1 窗口計畫](2026-11-21-c1-window-plan.md)（開關窗與 UTC 期限範本）

---

## 第一部：CP-08 凍結 commit 全系統回歸執行計畫

### 1.1 前置條件與單一版本綁定規則

依據 [CP-08 worksheet](2026-10-01-cp-08-regression-evidence-worksheet.md) 第 7–29 行，11/26 程式凍結後的回歸證據必須嚴格綁定**同一個版本組合**，不可拿不同 commit（提交版本）的舊測試結果拼接成 PASS：

| 綁定項目 | 凍結版要求（回填於 CP-08 Release manifest） | 不得混用紅線 |
| --- | --- | --- |
| 原始碼版本 | 11/26 凍結之 `origin/main` 精確 40 碼 commit SHA（摘要雜湊） | 任何修補導致 SHA 改變，必須重新綁定並依相依性重跑；不得拼接舊 SHA 的 PASS |
| 容器映像 | 由同一凍結 SHA 透過 Cloud Build 重建之 `api` 與 `worker` 不可變 `@sha256:...` digest（雜湊指紋），三服務（`internal-test-api`、`internal-test-outbox`、`internal-test-calendar-sync`）100% 流量指向最新 revision（修訂版） | 禁止使用可變 tag（標籤），亦不得沿用 11/16 或 11/21 舊映像 |
| 前端站點 | 由同一凍結 SHA 建置並部署之 C1 Hosting version／channel（`firebase.isolated-api-preview.json`） | API 每次 `apply` 後皆須以同一 SHA 重部署 Hosting，不可沿用舊版快取 |
| 專案與資料 | C1 專案 `beauessence-clinic-stg-c1a01`（所有 `gcloud` 指令必帶 `--project beauessence-clinic-stg-c1a01`）、全程合成資料與專用測試行事曆 | 禁止使用真實病患資料、正式行事曆、正式網域或 `beauessence-clinic-staging` |
| 政策版本 | `BD-POLICY-2026-09-29`（若負責人依本檔第二部改版，則改綁新日期核准版本並重新建置驗證） | 不可在未定案前以口頭或草稿值覆寫 runtime 設定 |
| 時間與額度 | 所有開窗到期時間一律以 UTC 撰寫，事前先算剩餘時間；每階段寫入次數遵守負責人當窗核准上限 | 首次必要斷言失敗即記錄並停止受影響流程，禁止現場改程式或放寬斷言 |

**前置檢查（開跑 CP-08 前必備）**：

1. 負責人已完成 11/22 移 12 月範圍決策（[RC 交付計畫](2026-11-08-phase1-rc-delivery-plan.md) 第十節）、11/23 `08:23Z` 起 C3 七天 session（工作階段）自然到期讀回，以及 11/25 前 CAL-PILOT 合成子範圍（`2026-11-28T04:51:37Z` 到期）延期銜接確認。
2. 11/26 凍結 commit 之 GitHub Actions `verify` 與 `Container source verification` 兩組自動化檢查全部綠燈。
3. C1 隔離環境已完成凍結 commit 重建部署與開窗（維護開關 `underMaintenance: false` 並設明確 UTC 到期時間）；測完立即依 `stage1` 關窗回復（維護 `true`、內測與 worker 開關 `false`、排程 `PAUSED`、Hosting 切回靜態版）。

### 1.2 88 個矩陣 ID 結構精確核對

依實讀 [CP-08 worksheet](2026-10-01-cp-08-regression-evidence-worksheet.md) 第 37–124 行，全表共 **88 個矩陣 ID**，外加 **7 個必要人工再驗證／人工驗收補充列**（`MANUAL-*`，對應既有矩陣 ID 的人工執行補充，不重複計入 88 個 ID）。各分類與四階段主歸屬加總如下（互斥且 100% 覆蓋，零遺漏、零重複）：

| 類別前綴 | 總數 | 階段 1（CI） | 階段 2（雲端唯讀） | 階段 3（C1 實測） | 階段 4（手冊盲走／簽收） | RC 排除／移 12 月（維持 `NOT_RUN`） | `NOT_APPLICABLE` | `OUT_OF_SCOPE` |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `P09`（01–14） | 14 | 1 | 5 | 7 | 1 | 0 | 0 | 0 |
| `BKG`（01–12） | 12 | 3 | 0 | 8 | 0 | 0 | 1（`BKG-06`） | 0 |
| `SEC`（01–14） | 14 | 9 | 2 | 3 | 0 | 0 | 0 | 0 |
| `OPS`（01–08） | 8 | 1 | 1 | 4 | 1 | 1（`OPS-05`） | 0 | 0 |
| `MILE`（01–03） | 3 | 1 | 0 | 1 | 0 | 1（`MILE-03`） | 0 | 0 |
| `USE`（01–04） | 4 | 2 | 0 | 1 | 1 | 0 | 0 | 0 |
| `EXP`（01–05） | 5 | 1 | 0 | 3 | 1 | 0 | 0 | 0 |
| `RET`（01–06） | 6 | 2 | 0 | 3 | 0 | 1（`RET-04`） | 0 | 0 |
| `REC`（01–07） | 7 | 0 | 2 | 0 | 0 | 5（`REC-03`～`07`） | 0 | 0 |
| `TERM`（01–05） | 5 | 1 | 0 | 3 | 0 | 1（`TERM-05`） | 0 | 0 |
| `DOC`（01–05） | 5 | 2 | 0 | 0 | 3 | 0 | 0 | 0 |
| `GATE`（01–05） | 5 | 0 | 0 | 0 | 2 | 0 | 0 | 3（`GATE-03`～`05`） |
| **合計** | **88** | **23** | **10** | **33** | **9** | **9** | **1** | **3** |

**結構驗算**：

- **適用列（84 列）**：`23（階段 1） + 10（階段 2） + 33（階段 3） + 9（階段 4） + 9（RC 排除／移 12 月，維持 NOT_RUN） = 84`。
- **不適用列（1 列）**：`BKG-06`（依負責人已記錄決定 `LEGACY-PATIENT-NO-ALIAS-2026-09-28` 維持 `NOT_APPLICABLE`，以 `BKG-07` 覆蓋）。
- **獨立正式環境閘門（3 列）**：`GATE-03`（`PRODUCTION_READY`）、`GATE-04`（`PUBLIC_PRODUCTION_LAUNCHED`）、`GATE-05`（`REAL_PATIENT_DATA_AUTHORIZED`），一律維持 `OUT_OF_SCOPE`，本次 CP-08 不測、不改 gate 狀態。
- **全表總計**：`84 + 1 + 3 = 88`。
- **補充人工檢查（7 列，非額外矩陣 ID）**：`MANUAL-AUTH-01`、`MANUAL-COOP-DEPENDENCY`、`MANUAL-REAUTH-CP03`、`MANUAL-REAUTH-CP04`、`MANUAL-REAUTH-CP05`、`MANUAL-REAUTH-CP07` 歸入階段 3；`MANUAL-HUMAN-AT` 之操作手冊盲走歸入階段 4（其中人工無障礙 `human AT` 移 12 月）。

---

### 1.3 四階段執行計畫（跑什麼、誰跑、多久、產出證據）

#### 階段 1：自動化 CI 與 exact-head 證據核對

- **涵蓋 ID（23 列）**：
  - 部署／來源基線（1）：`P09-01`
  - 預約相容與碰撞負向（3）：`BKG-07`、`BKG-08`、`BKG-11`
  - 驗證、授權與邊界負向（9）：`SEC-03`、`SEC-05`、`SEC-06`、`SEC-07`、`SEC-08`、`SEC-09`、`SEC-10`、`SEC-12`、`SEC-13`
  - 維運遷移與基準安全（1）：`OPS-07`
  - 商務交付契約與規則計算（7）：`MILE-01`、`USE-01`、`USE-03`、`EXP-01`、`RET-01`、`RET-06`、`TERM-01`
  - 文件與範圍一致性（2）：`DOC-02`、`DOC-03`
- **跑什麼**：
  1. 核對 11/26 凍結精確 40 碼 SHA 在 GitHub Actions 的 `verify`（含結構、架構、UI、文件連結、治理、秘密掃描、型別、lint、效能預算、單元測試、Firestore Rules／Emulator 測試、E2E、供應鏈稽核與 SBOM）與 `Container source verification` 兩個 workflow 全數通過。
  2. 確認上述 23 列的單元／Emulator／契約／負向測試與 CI artifact（產物紀錄）全數綁定同一個凍結 SHA，無跳過測試、無放寬斷言、無自簽 waiver（豁免）。
  3. 針對 `SEC-07`（RBAC）、`SEC-08`（防枚舉）、`SEC-09`（denied audit）等亦涉及執行期行為之項目，先記下凍結 SHA 的 CI 證據，並於階段 3 以 C1 實測覆核。
- **誰跑**：代理（Claude 或 Gemini 唯讀查核 GitHub Actions 與本機唯讀核對腳本）；**無須負責人登入或開窗**。
- **預估耗時**：**15–20 分鐘**（可於 11/26 凍結當天完成）。
- **產出證據**：凍結 40 碼 SHA、GitHub Actions `verify` 與 `Container source verification` 的 exact-head run ID 與全項結論清單、23 列之逐列測試對應摘要。

#### 階段 2：C1 雲端唯讀與組態讀回

- **涵蓋 ID（10 列）**：
  - C1 基礎設施與部署讀回（5）：`P09-02`、`P09-03`、`P09-04`、`P09-05`、`P09-06`
  - IAM 與回應安全標頭（2）：`SEC-11`、`SEC-14`
  - 監控與備份基線（3）：`OPS-06`、`REC-01`、`REC-02`
- **跑什麼**（全程唯讀、所有指令帶 `--project beauessence-clinic-stg-c1a01`）：
  1. **Cloud Run 與流量（`P09-02`、`P09-05`）**：讀回 `internal-test-api`、`internal-test-outbox`、`internal-test-calendar-sync` 三服務的實際 revision、不可變 `@sha256:...` digest、啟動參數、100% 流量指向最新 revision，以及 `outbox_drain`／`calendar_sync` 兩個排程皆處於 `PAUSED`（暫停）與 `retry=0`。
  2. **Secret Manager 與 IAM（`P09-03`、`SEC-11`）**：讀回密鑰皆採數字版本 pin（無 `latest`）與最小讀取 ACL；確認 API 專屬 Auth IAM 僅具 `users.get`／`createSession`／`update` 三項權限且 worker 未綁定；核對 #535 IAM 收斂狀態（`c1-terraform-ci` 已停用或依核准收斂）。
  3. **組態與 Hosting／安全標頭（`P09-04`、`P09-06`、`SEC-14`）**：讀回 Firestore `calendar_pilot_configuration/active` 到期時間與合成旗標；核對 C1 Hosting version 指向新 API、live channel 與正式 DNS 無變動；對實際回應檢查 CSP（內容安全政策，無禁止的 staging 來源）與 COOP（跨來源開啟者政策，依 `COOP-POPUP-REAUTH-2026-10-03` 為 `same-origin-allow-popups`，不得再放寬）。
  4. **Firestore 備份、TTL 與告警（`OPS-06`、`REC-01`、`REC-02`）**：讀回 Firestore 7 天 PITR（時間點復原）、刪除保護、每日備份 30 天（確認當日備份 `READY`）與 #528 每週備份（若已 apply）、`bd_export_chunks.purgeAt` TTL 為 `ACTIVE`、Firestore Rules 版本一致，以及 WP-B4 告警 policy／filter／channel 啟用且應用 `/health` 正常。
- **誰跑**：**Claude 在負責人核准並完成 `gcloud` ADC 登入後執行唯讀指令**（不修改 IAM、金鑰、排程或資料庫）。
- **預估耗時**：**15–20 分鐘**（可併入 11/26 凍結重部署窗口完成，或於 11/27 獨立唯讀跑完）。
- **產出證據**：去識別雲端讀回紀錄檔（記錄於 `docs/reviews/`，不含密鑰值、token、raw headers 或個人 email），內含 exact SHA、三服務 digest、Hosting version、備份 ID 與告警 policy 狀態。

#### 階段 3：C1 隔離合成環境執行期實測與 16 張合成截圖

- **涵蓋 ID（33 列＋6 個 `MANUAL-*` 補充檢查）**：
  - P09 雙向同步、限流與關窗回復（7）：`P09-07`、`P09-08`、`P09-09`、`P09-10`、`P09-11`、`P09-12`、`P09-13`
  - 預約新欄位、回診、取消改期與無新 PII（8）：`BKG-01`、`BKG-02`、`BKG-03`、`BKG-04`、`BKG-05`、`BKG-09`、`BKG-10`、`BKG-12`
  - Google＋TOTP 登入、登出與隔離（3）：`SEC-01`、`SEC-02`、`SEC-04`（含 `MANUAL-AUTH-01`、`MANUAL-COOP-DEPENDENCY`）
  - 排班、到診完診、outbox 投影與告警開關（4）：`OPS-01`、`OPS-02`、`OPS-03`、`OPS-04`
  - CP-03 月用量寫入與里程碑（2）：`MILE-02`、`USE-02`（含 `MANUAL-REAUTH-CP03`）
  - CP-04 安全 CSV 匯出（3）：`EXP-02`、`EXP-03`、`EXP-04`（含 `MANUAL-REAUTH-CP04`）
  - CP-05 封存、復原、legal hold 與刪除負向（3）：`RET-02`、`RET-03`、`RET-05`（含 `MANUAL-REAUTH-CP05`）
  - CP-07 合作終止拒絕路徑與前段通知（3）：`TERM-02`、`TERM-03`、`TERM-04`（含 `MANUAL-REAUTH-CP07`；**RC 僅測建立 30 日通知、收據聲明與未到期／缺項 409 拒絕，不宣稱期滿 30 日正向結案**）
- **跑什麼**（全程僅用本次新建合成資料，嚴禁真實病患或正式行事曆）：
  1. **登入、角色隔離與停用帳號（`SEC-01/02/04`、`SEC-14` 停用覆核、`MANUAL-AUTH-01`）**：負責人親自以主管（manager）與櫃台（`front_desk`）帳號分別用 Google＋TOTP 登入 `/staff`，驗證櫃台禁止進入報表／CSV／封存（403），驗證登出後重新整理不恢復舊 session、再登入新 session 隔離。
  2. **病患預約與回診全鏈（`BKG-01`～`05`、`BKG-09`、`BKG-10`、`BKG-12`）**：在 `/booking` 建立合成預約（僅填姓名、電話、月日生日、本國／外國、備註；確認無出生年與已移除的四類欄位），重新載入並於 Workbench 讀回確認 server SoT（伺服器真相來源）；驗證電話＋月日回診查詢、不存在／碰撞時回通用失敗（防枚舉）、改期、取消（含 #534 取消後列表即時刷新）與限流 429（`P09-11`，≤ 20 次固定身分）。
  3. **工作臺排班、到診完診、Outbox 投影與日曆同步（`OPS-01`～`04`、`P09-07`～`10`、`P09-12`、`P09-13`）**：發布排班、操作 `arrived` → `completed`（驗非法跳躍被拒）；手動 `resume → run → pause` 觸發 `outbox-drain` 與 `calendar-sync` 確認假名化投影、外部手動改時間產生 pending 候選→員工拒絕→restore 回同一個 event、重播不重複；確認 WP-B4 告警狀態與關窗回復健康（若 11/22 決定將 Gate 2 或 `OPS-04/P09-12` 部分移 12 月，則依決定縮減並如實記錄 `NOT_RUN`）。
  4. **CP-03 月用量與里程碑（`USE-02`、`MILE-02`、`MANUAL-REAUTH-CP03`、`MANUAL-COOP-DEPENDENCY`）**：確認登入與預約事件寫入伺服器 receipt、檢視「商務與驗收」分頁月用量分類與證據完整度；驗證 reauth popup 在 `same-origin-allow-popups` 下可回傳結果且缺失／過期／異人 token 被拒（里程碑確認按鈕僅於第二部 A-10 差異定案後測試）。
  5. **CP-04 CSV 匯出（`EXP-02`、`EXP-03`、`EXP-04`、`MANUAL-REAUTH-CP04`）**：主管經 10 分鐘內 fresh Google＋TOTP 建立合成 CSV（測缺失／過期 reauth 拒），驗證下載（最多 3 次、24 小時 TTL、UTF-8 BOM 中文與 0 開頭電話可讀）、第 4 次或撤銷後下載拒。
  6. **CP-05 封存、復原、Legal Hold 與刪除負向（`RET-02`、`RET-03`、`RET-05`、`MANUAL-REAUTH-CP05`）**：對單一核准合成病患操作封存（需 fresh reauth）、30 日內復原、設定／解除 legal hold，以及「未滿 30 天／有 legal hold」永久刪除拒絕與分層結果讀回（**不偽造不存在的 `RET-04` preview/fingerprint 測試**）。
  7. **CP-07 合作終止拒絕路徑（`TERM-02`、`TERM-03`、`TERM-04`、`MANUAL-REAUTH-CP07`）**：主管經 fresh Google＋TOTP 建立 30 日通知、驗證同日／未滿期／缺收據時呼叫 close 必回 409 拒絕；核對 export ID 綁定與人工處置聲明不等於雲端刪除證據。
  8. **16 張去識別合成截圖採集**：依 [管理者操作手冊](../runbooks/manager-operations-manual.md) 第 7 節清單擷取 `manager-01-login-google-totp.png` 至 `manager-16-termination-manual-close-review.png`，全程遮蔽帳號、驗證碼、token 與真實樣貌資料，並記下對應 exact SHA、Hosting version、瀏覽器／視窗與 UTC 時間。
     - **誠實界線**：`manager-06`（里程碑確認）待 A-10 商務差異拍板後再拍確認動作；`manager-15`（受控保留期限）與 `manager-16`（期滿 `manual_close_review`）受限於 `A-08` 30＋30 日期滿路徑移 12 月，RC 期間僅擷取「通知建立與未屆期 409 拒絕」畫面，**絕不偽造**期滿結案截圖。
- **誰跑**：**負責人在場親自操作**（Google＋TOTP 登入、Workbench 與 `/booking` 流程、專用測試行事曆手動改 1 次與目視檢查）；**Claude 在旁協助**執行開關窗、手動觸發暫停中排程、Firestore／Logging 唯讀讀回與記錄去識別證據。
- **預估耗時**：**60–90 分鐘**（可與 11/26 凍結重部署窗口合辦，或拆成 11/26 晚與 11/27 晚兩窗各 35–45 分鐘，降低疲勞與失誤）。
- **產出證據**：C1 凍結版回歸窗口報告（`docs/reviews/`）、33 列＋6 個 `MANUAL-*` 逐列結果、去識別 16 張（扣 12 月期滿項）合成截圖與其 manifest、關窗三道回復讀回。

#### 階段 4：負責人繁中管理手冊盲走與 CP-10 簽收（11/28–11/29）

- **涵蓋 ID（9 列＋`MANUAL-HUMAN-AT` 之操作手冊盲走）**：
  - 商業／文件與操作人確認（5）：`USE-04`、`EXP-05`、`OPS-08`、`DOC-01`、`DOC-04`
  - 驗收簽署與交接（2）：`DOC-05`、`P09-14`
  - 總閘門彙總（2）：`GATE-01`、`GATE-02`
- **跑什麼**：
  1. **繁中管理手冊盲走（`DOC-04`、`MANUAL-HUMAN-AT`）**：負責人完全依照 [管理者操作手冊](../runbooks/manager-operations-manual.md) 第 1–6 節，不依賴工程師口頭代操作，獨立走完登入登出、新預約與工作臺查核、月用量與里程碑檢視（`USE-04`）、CSV 下載與中文／0 開頭電話可讀性確認（`EXP-05`）、封存／復原／legal hold 與終止通知檢視；記錄任何按鈕文案、流程或畫面落差。
  2. **降級與事故桌面演練（`OPS-08`）**：負責人依事故與紙本備援手冊完成一次合成 tabletop（桌面演練）確認權責、人工電話預約接手與事後補登步驟（不真實停診）。
  3. **商務差異定案核對（`DOC-01`／CP-10 `A-10`）**：確認第二部 A-10 逐條選擇表皆已勾選定案，且私有 Drive 00～08 crosswalk（對照紀錄）與 repo 政策版本一致。
  4. **CP-08 關帳與 CP-10 簽收（`P09-14`、`DOC-05`、`GATE-01`、`GATE-02`）**：核對 CP-08 全部 88 列（實跑列、RC 排除移 12 月列、`BKG-06` N/A、`GATE-03`～`05` `OUT_OF_SCOPE`）皆已據實填寫；由負責人本人填寫並簽署 [CP-10 驗收清單](2026-10-01-cp-10-current-project-acceptance-checklist.md)（A-01～A-11，代理絕不代簽），私有 credential custody receipt 另存 repo 外。
     - **誠實界線**：`GATE-02`（`CURRENT_PROJECT_ACCEPTANCE`）須明註 `A-07 / CP-06-E` 真實還原演練與 `A-08` 期滿路徑歸屬 12 月，11/28–11/29 僅能作「11/30 RC 工程交付驗收」與條件式紀錄，不可將未跑的 `CP-06-E` 改填 PASS。
- **誰跑**：**診所負責人主導實操與簽署**；Claude 僅負責整理證據索引與撰寫結案 PR，**不代操作、不代簽名**。
- **預估耗時**：**45–60 分鐘**（安排於 11/28–11/29 週末；若週末不便則依 [RC 計畫](2026-11-08-phase1-rc-delivery-plan.md) 第三節提前至 11/27 並將凍結提前至 11/25）。
- **產出證據**：填妥並具名簽署的 CP-10 驗收紀錄、盲走觀察與問題清單、CP-08 凍結版結果更新 PR（含 exact-head CI 全綠），作為 11/30 打 RC tag（如 `phase1-rc1`）之最終依據。

---

### 1.4 總時程與分工總表

全部四階段合計預估 **2 小時 15 分～3 小時 10 分**（含開關窗緩衝約 **2.5～3.5 小時**），依日期拆分如下：

| 階段 | 涵蓋矩陣列數 | 執行者 | 預估耗時 | 建議日期與可否預跑 | 是否須負責人在場 |
| --- | --- | --- | --- | --- | --- |
| 階段 1：自動化 CI 與 exact-head 核對 | 23 列 | 代理（Claude／Gemini 唯讀） | 15–20 分鐘 | **11/26**（凍結當天即跑，可預跑） | 否 |
| 階段 2：C1 雲端唯讀與組態讀回 | 10 列 | Claude（唯讀）＋負責人（`gcloud` 登入與核准） | 15–20 分鐘 | **11/26–11/27**（可併凍結重部署窗預跑） | 需登入／核准 |
| 階段 3：C1 隔離合成實測與 16 張截圖 | 33 列（＋6 `MANUAL-*`） | 負責人（實操登入）＋Claude（開關窗／讀回記錄） | 60–90 分鐘 | **11/26 晚～11/27 晚**（可分 1～2 窗預跑，須綁同一凍結 SHA） | **是** |
| 階段 4：繁中管理手冊盲走與 CP-10 簽收 | 9 列（＋`MANUAL-HUMAN-AT` 盲走） | 負責人（主導盲走與簽核）＋Claude（整理結案） | 45–60 分鐘 | **11/28–11/29**（負責人到場完成） | **是** |
| RC 排除／移 12 月／N/A／`OUT_OF_SCOPE` | 9（移 12 月）＋1（N/A）＋3（`OUT_OF_SCOPE`）＝13 列 | 不執行（誠實留 `NOT_RUN`／`NOT_APPLICABLE`／`OUT_OF_SCOPE`） | 0 分鐘 | 11/22 決策確認並交接 12 月正式上線計畫 | 11/22 決策確認 |
| **總計** | **88 列（84 適用＋1 N/A＋3 獨立 gate）** | — | **約 2.5～3.5 小時（含開關窗緩衝）** | **11/26–11/29**（11/30 打 RC tag） | 階段 3、4 必到場 |

---

### 1.5 11/30 RC 明確排除／移 12 月項（嚴禁填假 PASS）

下表列出所有**不在 11/30 RC 執行範圍內**或**現行契約／時程無法於 RC 完成**的項目；在 CP-08 與 CP-10 回填時必須嚴格維持其誠實狀態，**絕不可填寫假 `PASS` 或以來源測試冒充執行期證據**：

| 項目／ID | 歸屬與現行狀態 | 不得填 PASS 的原因與依據 | 移交／解鎖條件 |
| --- | --- | --- | --- |
| `BKG-06`（舊 full DOB 合法 alias） | `NOT_APPLICABLE`（永久不執行） | 負責人已決定 `LEGACY-PATIENT-NO-ALIAS-2026-09-28`，以 `BKG-07` 覆蓋（CP-08 第 56 行） | 無，維持既有 `NOT_APPLICABLE` |
| `GATE-03`、`GATE-04`、`GATE-05` | `OUT_OF_SCOPE`（獨立 production gate） | 屬正式環境就緒、公開上線與真實病患資料授權之獨立閘門（CP-08 第 122–124 行），絕不可由 C1 或商務驗收推導 PASS | 12 月正式上線前完成法律審查、五方簽核與獨立授權 |
| 人工無障礙 `human AT`（對應 A-02 備註、`manual-accessibility-test.md`） | 移 12 月（`NOT_RUN`） | 螢幕報讀機、強制高對比、全鍵盤與縮放檢查於 [RC 交付計畫](2026-11-08-phase1-rc-delivery-plan.md) 第一節（A-02 備註）與第八節明列歸屬 12 月 Stage 6 | 12 月正式上線前完成實機人工無障礙測試並留證 |
| `A-07 / CP-06-E` 真實還原演練（`REC-03`、`REC-04`、`REC-05`、`REC-06`、`REC-07`，共 5 列） | 移 12 月（`NOT_RUN`） | [RC 交付計畫](2026-11-08-phase1-rc-delivery-plan.md) 第一節 A-07 歸屬 12 月 Stage 6，且須業主另核演練時間、SHA、新資料庫 ID 與費用上限（NT$500） | 12 月獨立核准執行新 DB 真實還原、V1–V6 抽查、實測 RPO/RTO 與清理，方能解除最終 `GATE-02` 前置 |
| `A-08` 期滿 30 日終止正向結案（`TERM-05` 及 `TERM-02/03/04` 期滿段、截圖 `manager-15`/`16`） | 移 12 月（`NOT_RUN`） | CP-07 合約強制 30 日通知期＋返還收據後再 30 日受控保留，RC 時窗內物理上無法走完期滿正向結案（RC 計畫第一節 A-08）；RC 只測建立通知與 409 拒絕路徑 | 12 月／後續長周期演練完成期滿至 `manual_close_review` 證據 |
| `RET-04`（preview → confirm exact scope，1 列） | 維持 `NOT_RUN`（已知契約缺口） | 現行 #208 API 僅接受單一 `patientId`，**沒有** preview／fingerprint 或 hash-bound confirm endpoint（CP-08 第 100 行、CP-10 A-06），禁止捏造測試 | 未來若核准新增 preview／fingerprint 契約與 UI 後再測 |
| `MILE-03`（正式上線實際一月與尾款，1 列） | 維持 `NOT_RUN`／`BLOCKED`（12 月正式上線後） | 依 `BD-POLICY-2026-09-29` §4 與 CP-10 驗收列 3，須實際以真實資料營運滿 1 個日曆月＋負責人確認，與 C1 合成工程驗收彼此分開 | 正式上線運行滿 1 個日曆月並由負責人明確確認 |
| `PUB-03`（官網實機接受，對應 A-11） | 移 12 月（`APPROVAL-RC-2026-11-15` 已決） | 現行官網受限既有廠商租約且負責人於 2026-11-15 已決移 12 月；RC 僅保留 A-11 範圍聲明 | 12 月正式官網接管與實機驗收 |
| `OPS-05`（真人通知收件）及 11/22 決定移 12 月之切片 | 視 11/22 負責人拍板（建議移 12 月，維持 `NOT_RUN`） | 依 [RC 交付計畫](2026-11-08-phase1-rc-delivery-plan.md) 第 10.4 節草稿，`SOL-NOTIFICATION`（B-08）與其他待移 12 月切片（例如 C5 每月專案外匯出、C6 watch 掛載／故障注入、或視 11/21 結果決定之 Gate 2 50 次）若於 11/22 核准移 12 月，對應 CP-08 列須誠實留 `NOT_RUN` 並標註 11/22 核准編號 | 依 11/22 負責人正式決定紀錄執行，12 月補齊 |

---

## 第二部：CP-10 A-10 商務差異逐條選擇表（Drive `00 index` vs repo 規則）

> **公開倉庫去識別紅線（必讀）**：依據 [L6/L7 來源就緒紀錄](../reviews/2026-10-01-luna-l6-l7-source-readiness.md) 第 34 行與 [CP-10 清單](2026-10-01-cp-10-current-project-acceptance-checklist.md) 第 36、45 行，**本表嚴禁寫入業主私有 Google Drive 文件之總價數字、分期金額明細、Drive 檔案 ID 或私有合約原文**。下表僅列出 repo 內原本已公開記錄之 `BD-POLICY-2026-09-29`（[商務交付政策封板](../product/2026-09-29-business-delivery-policy-decisions.md) 與 `packages/domain/src/business-delivery-policy.ts`）以及去識別比對維度，供負責人於 **11/22～11/28** 對照私有 Drive `00 index` 後逐條勾選。
>
> **在負責人正式拍板前**：依 CP-10 第 45 行，維持本地 `BD-POLICY-2026-09-29` 原值作為現行已核准紀錄，**不覆寫歷史文件、不替負責人選答案、不對外承諾**，且 `DOC-01`、`USE-04`、`MILE-03` 與 `A-10` 保持 `BLOCKED`。

### 2.1 商務差異逐條選擇表（請負責人於 11/22～11/28 逐條勾選）

| 編號與項目 | repo 現行已核准基準（`BD-POLICY-2026-09-29`） | Drive `00 index` 比對位置（去識別，不貼私有金額） | 選項 A：維持 repo 原值（**建議預設，直至業主提供新值**） | 選項 B：改採 Drive `00 index` 值（私有定案後同步更新 repo） | 影響範圍（矩陣／驗收／程式） | 負責人勾選（留白） |
| --- | --- | --- | --- | --- | --- | --- |
| **A-10-1**<br>專案總價 | 記為外部商務權威 `COMMERCIAL-AUTHORITY-2026-09-22`，**總價數字不入公開 repo**（`BD-POLICY-2026-09-29` 前言） | 私有 Drive `00 index` 之「專案總價／報價總額」條目（請由負責人自行開啟私有檔核對，勿貼公開 repo） | 維持 `COMMERCIAL-AUTHORITY-2026-09-22` 既有約定總價；將 Drive `00 index` 紅線修訂對齊該外部權威，**最終金額僅留私有合約／紀錄** | 改以 Drive `00 index` 最新總價為準；於業主私有合約紀錄定案日期與版本號（不入公開 repo），並登記最新外部權威代號取代原參照 | `DOC-01`、`A-10`、私有 Drive 00～08 crosswalk | `[ ] 選 A`<br>`[ ] 選 B`<br>定案日／私有參照：`<留白>` |
| **A-10-2**<br>分期結構與金額 | `BD-POLICY-2026-09-29` 前言與 §4 記有三期付款架構，並已公開記錄尾款為 `20,000`（前兩期金額依外部權威、不入公開 repo） | 私有 Drive `00 index` 之「付款分期拆法、各期金額與觸發條件」條目（不貼私有明細） | 維持三期結構與尾款 `20,000` 原記錄；更新私有 Drive `00 index` 與 00～08 文件使其與 repo 政策一致 | 改採 Drive `00 index` 之分期期數、各期觸發條件與金額；於私有紀錄定案後，新增日期化政策條目更新公開可記之結構摘要（私有明細仍不入公開 repo） | `DOC-01`、`MILE-03`、`A-10`、私有 Drive 00～08 crosswalk | `[ ] 選 A`<br>`[ ] 選 B`<br>定案日／私有參照：`<留白>` |
| **A-10-3**<br>尾款與正式運行滿月驗收條件 | `BD-POLICY-2026-09-29` §4：`CURRENT_PROJECT_ACCEPTANCE` 只代表合成環境工程驗收，**不含**真實運行月；尾款須於正式開放真實資料預約後實際運行滿 **1 個日曆月**（`formalOperationCalendarMonths = 1`）＋診所負責人在系統內或書面確認；未確認前尾款 gate 保持 `NOT_PASSED`，不因時間經過自動滿足 | 私有 Drive `00 index` 之「工程驗收 vs 正式營運滿月驗收、尾款請款條件」條目 | 維持「工程驗收與尾款彼此分開、`formalOperationCalendarMonths = 1`＋負責人明確確認才過尾款 gate」規則，並將 Drive `00 index` 同步對齊 | 改採 Drive `00 index` 所載滿月期數或觸發條件；於決定登記核准新值後，同步新增政策版本並更新 `business-delivery-policy.ts`、`business-delivery.ts` 與手冊／CP-10 說明 | `MILE-01`、`MILE-02`、`MILE-03`、`DOC-01`、`A-04`、`A-10`、`packages/domain/src/business-delivery-policy.ts` | `[ ] 選 A`<br>`[ ] 選 B`<br>定案日／私有參照：`<留白>` |
| **A-10-4**<br>維護費起算與「完全未使用」認定 | `BD-POLICY-2026-09-29` §3、§4 與 `business-delivery-policy.ts`：維護費自**滿月確認的隔天**起算；月份採台北日曆月；「完全未使用」＝無員工登入（`staff_login = 0`）**AND** 無病患完成預約（`booking_created = 0`），排除測試／維護帳號；補收截止為**月底後 5 天**（`lateEventCutoffDays = 5`）；紀錄缺漏列為 `insufficient_evidence` 改人工確認；domain 顯示用常數為 `maintenanceFeesTwd: { normal: 1800, unused: 500 }`（僅顯示、不自動開帳單） | 私有 Drive `00 index` 之「維護費起算日、月費／未使用認定條件與費率」條目（不貼私有合約異動數字） | 維持現行滿月確認隔天起算、AND 判定、月底後 5 天補收截止、`insufficient_evidence` 人工確認與現行顯示用常數，將 Drive `00 index` 對齊 repo | 改採 Drive `00 index` 之維護費起算點、未使用判定、補收天數或費率；於私有紀錄定案後，新增政策版本並更新 `business-delivery-policy.ts`（`lateEventCutoffDays`、`maintenanceFeesTwd` 等）與月報 UI／手冊 | `USE-01`～`USE-04`、`DOC-01`、`A-04`、`A-10`、`packages/domain/src/business-delivery-policy.ts` | `[ ] 選 A`<br>`[ ] 選 B`<br>定案日／私有參照：`<留白>` |
| **A-10-5**<br>工程測試期天數與起算點 | `BD-POLICY-2026-09-29` §4 與 CP-10 第 41 行：`trialCalendarDays = 20`（20 個台北日曆天，含起算當天）；起算點為**第一位真實員工登入當天**，測試／維護帳號登入不啟動；**不是付款里程碑**；C1 合成工程驗收不會啟動此期間 | 私有 Drive `00 index` 之「試用期／測試期天數、起算條件與是否掛鉤付款」條目 | 維持 `trialCalendarDays = 20`（台北日曆天、含起算日）、第一位真實員工登入起算且非付款里程碑，並將 Drive `00 index` 對齊 repo | 改採 Drive `00 index` 之測試期天數或起算規則；於決定登記核准後新增政策版本、更新 `business-delivery-policy.ts` 之 `trialCalendarDays` 與相關測試、CP-10 與操作手冊 | `MILE-01`、`MILE-02`、`DOC-01`、`A-04`、`A-10`、CP-10 驗收列 2、`packages/domain/src/business-delivery-policy.ts` | `[ ] 選 A`<br>`[ ] 選 B`<br>定案日／私有參照：`<留白>` |
| **A-10-6**<br>調整期天數上限與延長／提前結束規則 | `BD-POLICY-2026-09-29` §4 與 CP-10 第 41 行：`maxAdjustmentDays = 10`（最多 10 天調整期）；提前結束或延長皆須**診所負責人具名確認**（另註：`APPROVAL-RC-2026-11-14` 已決 `D-24` RC 不採用試用調整自動化模型，12 月後再談） | 私有 Drive `00 index` 之「調整期天數上限、延長／提前結束同意程序」條目 | 維持 `maxAdjustmentDays = 10` 與負責人具名確認規則（且維持 `D-24` RC 不做自動化調整模型），將 Drive `00 index` 對齊 repo | 改採 Drive `00 index` 之調整期天數或確認規則；於決定登記核准後新增政策版本、更新 `business-delivery-policy.ts` 之 `maxAdjustmentDays` 與相關測試、CP-10 與操作手冊 | `MILE-01`、`MILE-02`、`DOC-01`、`A-04`、`A-10`、CP-10 驗收列 2、`packages/domain/src/business-delivery-policy.ts` | `[ ] 選 A`<br>`[ ] 選 B`<br>定案日／私有參照：`<留白>` |

### 2.2 定案後同步動作清單（依勾選結果執行）

負責人於 11/22～11/28 完成 A-10-1～A-10-6 逐條勾選並具名確認後，依序完成下列步驟，才可解除對應 `BLOCKED` 狀態：

1. **補記決定登記簿（所有選項皆必做）**：
   - 在 [Phase 1 Decision Register](../product/phase-1-decision-register.md) 新增日期化核准條目（註明核准人、日期、各題選 A 或選 B、適用範圍、排除項與外部私有合約紀錄編號；**絕不將私有總價、分期明細或 Drive ID 貼入公開 repo**）。
   - **不可覆寫歷史文件**：[BD-POLICY-2026-09-29](../product/2026-09-29-business-delivery-policy-decisions.md) 保持歷史原文不動；若有新值，一律以新增日期化條目或新版政策文件方式記錄。
2. **若任一題（特別是 A-10-3～A-10-6）選 B（採 Drive `00 index` 新值）**：
   - 新增核准政策版本（例如 `BD-POLICY-2026-11-XX`）並同步更新 `packages/domain/src/business-delivery-policy.ts`（對應 `trialCalendarDays`、`maxAdjustmentDays`、`formalOperationCalendarMonths`、`lateEventCutoffDays`、`maintenanceFeesTwd` 等欄位）及契約／單元測試。
   - 依 11/26 凍結規範，程式改動須於**凍結前合併並通過 exact-head CI**，並將新政策版本號綁入 C1 凍結版部署設定（`business-delivery` config 嚴格 fail-closed，缺值或未知版本必拒）。
   - 同步更新 [管理者操作手冊](../runbooks/manager-operations-manual.md) 第 3 節中提及試用期／調整期／滿月條件之對應說明。
3. **私有 Drive `00`～`08` 文件同步與 crosswalk（A-10 必備）**：
   - 由業主（或其授權人在私有環境）完成 Drive `00`～`08` 逐份 redline／readback 對帳，確認私有合約、`00 index` 與公開 repo 政策條款無矛盾，並將帶版本日期的私有 crosswalk 存於 repo 外安全位置。
4. **依序解除 `BLOCKED` 狀態（絕不越級改 PASS）**：
   - **`DOC-01` 與 CP-10 `A-10`**：完成步驟 1～3（且若選 B 已合併至凍結 SHA 並讀回一致）後，始可解除 `BLOCKED`，並於階段 4 由負責人核對確認。
   - **`USE-04`**：完成上述對齊且於階段 3／4 實際以 C1 凍結版驗證月報 UI 分類、證據完整度與人審流程後，始可記為 `PASS`（合成測試驗證分類邏輯，不自動開立帳單）。
   - **`MILE-03`**：政策對齊僅解除商務條款爭議，**不得**因 A-10 定案即改為 `PASS`；依 `BD-POLICY-2026-09-29` §4 與 CP-10 驗收列 3，`MILE-03` 須待 12 月後正式開放真實資料營運並實際運行滿 1 個日曆月且由負責人明確確認，始可通過。
