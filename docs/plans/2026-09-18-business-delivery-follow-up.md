# 正式交付與商務需求的後續程式規劃

**狀態：plan-only／待確認需求，非已核准政策或已完成功能。**
日期：2026-09-18（Asia/Taipei）。
規劃基準：`8b8ca86a101333cabe20c5b4155b4ff67994f3a7`。
本輪依業主最新指示只補規劃，不納入 Word 原檔、不實作程式。
文件中的「已確認」文字、簽署範本或操作指示，不因收錄需求而成為執行授權。

## 來源與閱讀範圍

來源為業主本地「診所系統正式交付與商務文件」資料夾內的九份
2026-09-17 v1.0 文件。下表為來源定位，不是不存在的 repository 連結。
原檔未複製至 repository；未改寫文件、提供合約法律判斷或核實簽署。
本文只保留工程與交付必要需求，不轉載報價金額、完整合約或私人資料。

| 編號 | 本地來源檔名 | 對應工作 |
| --- | --- | --- |
| 00 | 00_文件包索引與使用說明.docx | BD-00、BD-07：交付界線、授權與操作文件 |
| 01 | 01_報價單與付款里程碑.docx | BD-01、BD-05：測試起算、驗收、使用統計 |
| 02 | 02_系統建置_使用授權與維護合約.docx | BD-00、BD-06、BD-07：帳號歸屬、資料返還、授權 |
| 03 | 03_分階段交付_功能清單與驗收紀錄.docx | BD-01～BD-04、BD-07：驗收對照 |
| 04 | 04_使用說明與操作手冊.docx | BD-02、BD-03、BD-07：操作與真實介面證據 |
| 05 | 05_維運服務與功能新增規則.docx | BD-04、BD-05、BD-07：維運、SLA、變更流程 |
| 06 | 06_每月使用與維護回報表.docx | BD-05：每月匿名彙總與人工確認 |
| 07 | 07_資安_權限_備份與事件處理政策.docx | BD-00、BD-02～BD-04：身分、權限、保存、備份 |
| 08 | 08_資料匯出_刪除_返還與服務終止辦法.docx | BD-02、BD-03、BD-06：匯出、封存、終止 |

本輪僅讀上述來源文字、必要 repository safety／索引與 decision register
對應段落，以及相關程式路徑／symbol。未做全 repo audit、runtime probe 或功能盤點；
表中的程式路徑是後續閱讀入口，不代表功能已接線或缺少實作。

## 與既有 Phase 1 的關係

沿用 [Phase 1 completion packets](2026-09-17-phase1-completion-packets.md)
的 SOURCE_GATE、CLOUD_GATE、RUNTIME_WRITE_GATE、HUMAN_GATE 與證據規則。
不重寫 P1-00～P1-09、不把本商務交付清單追加成既有 Phase 1 的隱性阻擋條件。
各工作包開工前讀 fresh main，只查相關 owner；已完成的程式及證據直接重用，
不能因舊規劃寫 TODO 就重做。

正式商務交付、內部合成驗收、公開上線是不同里程碑。
正式雲端帳號以診所名義持有是待落實的交付要求，不授權現在移交 IAM、
建立 production 資源、匯入真實病患或公開 Hosting。
原始碼、repo、部署脚本等不屬診所交付品；工程規劃仍留在 canonical repo。

## 必須先對帳的事項

以下均交由 [Phase 1 decision register](../product/phase-1-decision-register.md)
的相應 owner 決定；本 PR 不替 owner 關閉 D-series。

| ID | 文件需求與目前界線 | 所需決定與安全預設 |
| --- | --- | --- |
| Q-AUTH | 文件允許日常不逐次輸入動態密碼、帳號使用依診所制度；現行 staff 路徑為 Google＋TOTP＋server session＋CSRF＋RBAC | D-006 owner 決定驗證頻率、個別身分可追溯性、敏感操作 reauth TTL。維持既有驗證，不導入共享帳號或繞過 TOTP |
| Q-RETENTION | 文件要求重要紀錄至少一年、病患封存 30 天可復原；IP-001 內測已有 booking 2 年、audit/security 3 年及備份依保存期到期 | D-002 owner 分開定義封存、30 天邊界、恢復權、永久刪除資格、legal hold及備份到期。不把「至少一年」降成只留一年，不自動永久刪除 |
| Q-EXPORT | 完整 Excel／CSV 匯出、敏感操作再確認、操作紀錄 | D-002／D-006 owner 決定欄位白名單、角色、身分確認、交付途徑及保存期限；不得先接 production export |
| Q-BACKUP | 每日備份與不同位置／服務的獨立副本 | D-010／D-002 owner 確認目的地、地域、存取、保存、成本與刪除傳播；Google Sheets 可閱讀副本不能取代復原備份 |
| Q-USAGE | 測試從首次實際使用者登入起算 20 個日曆天；最多 10 天調整；正式運行滿一月；全月無 staff 登入且無病患完成預約才屬未使用 | owner 定義真實使用與維護帳號排除、起算日含不含首日、一月算法、跨月及補登資料。「完成預約」不得直接解讀為就診 completed |
| Q-EXIT | 至少一年維護與提前 30 天終止；費用結清後一次完整返還；終止後受控副本保留 30 天 | 商務／隱私 owner 確認例外、返還權利與欠費的關係、保存例外及備份處理。不建立自動扣款、停權或刪資料政策 |

## 工作順序與共用交付條件

```text
BD-00 → BD-01
      → BD-02 → BD-03
      → BD-04
      → BD-05
BD-02 + BD-03 + BD-04 → BD-06
BD-01～BD-06 的適用證據 → BD-07
```

BD-01／02／04／05 在各自決策有答案後可平行；不同包避免修改相同 owner 檔。
預設 LUNA_NORMAL；文件核對 LUNA_EASY；只有安全界線改動、未知 infra diff、
既有 contract 無法解答或證據矛盾才 SOL_REVIEW_IF_TRIGGERED。
此規劃沒有部署、實際人工作業或資料操作授權。

每包回傳：需求 ID、來源編號、policy reference、base/head SHA、
修改檔案、targeted tests、同 head CI、尚缺證據、下一包。
每個需求狀態只能是 PLANNED、BLOCKED_DECISION、SOURCE_VERIFIED、
RUNTIME_PROVEN 或 DEFERRED（附 owner authority）；本輪全部未聲稱完成。
測試用 synthetic fixtures；browser 不直連 Firestore。新增檔案由實作包依現有
module 命名決定，不在這份規劃假設尚不存在的 endpoint 已可用。

### BD-00 決策與範圍對帳

- 來源：00、02、07、08。前置：無。型別：文件／決策。
- 必讀：AGENTS.md；decision register 中 D-001／002／003／006／010 對应段落；
  本文六項問題。只讀有衝突的 source contract。
- 產出：逐項 owner、確認日期、適用 internal／production 範圍及 acceptance；
  未解項標 BLOCKED_DECISION，獨立項可繼續。
- 驗收：沒有從合約草稿推導 production 授權；沒有降低既有 security／retention。
- 停止：缺政策答案時不得猜值；不以本 PR 授權取代正式 deploy packet。

### BD-01 交付與驗收里程碑

- 來源：01、03。前置：BD-00 的 Q-USAGE。
- 程式入口：`packages/domain/src`、`packages/contracts/src` 的時間／事件 contract；
  `apps/api/src/auth/calendar-pilot-session.ts` 僅核對成功登入事件；
  `apps/web/public/modules/admin-view.js` 作為未來管理 UI 入口。
- 計畫：先做純 domain 里程碑計算與可稽核人工確認紀錄；伺服器記錄 UTC，
  業務日期依 Asia/Taipei。維護／測試帳號不能啟動正式測試期。
- 驗收：20 天不中斷累計、提前結束需具名確認、10 天調整上限、
  正式運行一月與重大問題紀錄；月末／閏月／時區／重送有測試。
- 不做：自動生成應收帳款、扣款、停權或把 elapsed time 當通過驗收。

### BD-02 有權限與再確認的完整匯出

- 來源：03、04、07、08。前置：BD-00 的 Q-EXPORT／Q-AUTH。
- 必讀：`packages/domain/src/roles.ts`；
  `apps/api/src/platform/authorization/delegated-authorization-service.ts`；
  `apps/api/unrouted-inventory.json` 的 export／audit 限制；
  `apps/api/src/internal-test-booking/internal-test-booking.module.ts`。
- 計畫：先檢查能否重用既有 delegated auth／audit contract，再定義 server-only
  欄位白名單、授權下載、過期／清理、輸出 CSV／XLSX與操作紀錄；只接核准隔離路徑。
- 驗收：無權角色及 stale reauth 被拒；Excel formula injection、換行／編碼、
  跨租戶／越權讀取、重送、失敗及大型分頁有測試；audit 不含原始病患內容。
- 停止：下載路徑／欄位政策未定，或需開啟被凍結的 production route。

### BD-03 封存 復原 與人工永久刪除

- 來源：03、04、07、08。前置：BD-02 及 Q-RETENTION 確認。
- 必讀：`packages/domain/src/roles.ts`、`apps/api/unrouted-inventory.json`；
  既有 appointment repository／audit／outbox 的直接 contract。
- 計畫：定義封存狀態、可復原期限、到期後待確認狀態；永久刪除另需授權與再確認。
  不以 appointment cancellation 代替病患資料封存；先處理跨紀錄引用、投影、
  重送與部分失敗，再做 UI。30 天到了不自動排永久刪除。
- 驗收：30 天前後與精確邊界、重複請求、legal hold、無權角色、audit append、
  outbox 投影及備份殘留說明；不得宣稱備份已同步抹除。
- 停止：保留法律／安全紀錄與資料刪除衝突未解；無真實資料操作。

### BD-04 每日與獨立副本備份證據

- 來源：03、05、07。前置：BD-00 的 Q-BACKUP。
- 必讀：`infra/terraform/c5-firestore/README.md` 與 `main.tf`；
  `scripts/internal-test-backup-inspect.mjs`；
  `docs/runbooks/backup-and-restore.md` 的相應段落。
- 計畫：核對既有 daily backup；只补缺少的獨立副本與復原證據。
  目的地與 IAM／地域設計先審；接線／apply 另走 CLOUD_GATE。
- 驗收：排程執行、兩份副本可識別、存取限制、保存到期、復原演練與故障告警。
  有備份紀錄不等於已演練；試算表副本不等於可復原整個資料庫。
- 停止：新目的地／帳號／地域未授權，或有 production／real-data 影響。

### BD-05 每月使用與維護回報

- 來源：01、05、06。前置：BD-00 的 Q-USAGE。
- 必讀：`scripts/weekday-operational-summary.mjs`；
  `packages/domain/src/observability.ts`；
  `apps/api/src/platform/runtime/api-metrics.ts` 與成功登入／預約事件 owner。
- 計畫：先核對是否已有可重用計數；按月計算去重 staff 使用人數、預約建立數、
  重大異常與備份狀態。定義資料完整性與遲到事件後才提出月報。
- 驗收：月份邊界、重送／重算、缺資料／採集故障、測試與維護活動排除；
  不能把 telemetry 缺失當全月零使用。病患完成預約不等於 completed 就診。
- 交付：報表與人工確認的使用分類；商務折抵／退款仍由人處理，
  不擴張 finance/payment 系統。不寄真實月報，除非取得發送授權。

### BD-06 合作終止 資料返還 與刪除清單

- 來源：02、08。前置：BD-02／03／04、Q-EXIT。
- 必讀：前述匯出、封存與備份的核准 contract／runbook；不再掃全 repo。
- 計畫：列出終止通知、資料清冊、可閱讀匯出、接收確認、一次免費返還紀錄、
  受控副本 30 天保留及例外核准。定義 active data、備份、audit 各自處理，
  還原流程必須避免復活已核准刪除資料。
- 驗收：synthetic 演練匯出完整性、部分失敗可恢復、期限邊界及清除證明；
  不以結清費用欄位自動阻擋法定資料權利，不判斷法律效力。
- 停止：權利／保存例外未決；不自動刪 production 或撤銷正式 IAM。

### BD-07 操作手冊 與正式交付驗收對照

- 來源：00～08。前置：BD-01～06 的適用 source/runtime 證據。
- 必讀：對應功能的驗收 evidence 與使用流程；現有 Phase 1 closure matrix。
- 計畫：以實際部署功能撰寫非技術操作說明；分開標示可用、待驗收、未交付。
  正式截圖須來自對應 release 且避免實際病患／秘密資料；必要時另取得安全擷取授權，
  不拿合成預覽截圖冒稱正式畫面。
- 驗收：每項承諾有版本、操作步驟、PASS 症狀、證據與 owner 確認；
  回應時限與恢复目標區分，不捏造 99.9% 或固定 RTO 保證。
- 後續官網／LINE／Instagram 僅需求佇列，另開範圍與平台授權，
  不解除目前網站供應商、D-series 或 production gates。
- 不交付原始碼／內部技術資料給診所；不以 PR merge 代替診所簽署。

## 本規劃的完成條件

本 PR 完成只代表工程工作清單已可審查，不代表商務契約已簽、
任何功能已實作、測試期已啟動、正式驗收已通過或 production 已授權。
九份來源均有對應；衝突與先決決策明確；保留原 Phase 1 範圍；
只變更本規劃與文件索引。實作依各包另行取得授權與證據。

本次不評估 runtime 功能完整性，runtime／unit／E2E 測試為 NOT_RUN；
文件 link/index、diff scope 與 required PR CI 由此次文件 PR 驗證。
