# 手術排程、回診、付款與結算擴充規劃（2026-07-28）

**狀態：plan-only／業主需求輸入已正規化。** 本文件把 2026-07-28 提供的手術排程
與回診系統邏輯納入 repository，避免之後只靠桌面文字檔重建需求。它不是醫療、
隱私、財務或 Google Calendar 雙向同步的核准，也不會建立 route、cloud resource、
真實病患資料、付款或結算紀錄。

**目前位置不變：** Stage 0／Checkpoint A 已完成，目前仍在 Stage 1。D-006 與
D-010 target 已核准；Stage 2 下一個必要步驟是審查
[身分與 Cloud Staging change plan](../architecture/stage-2-identity-and-cloud-change-plan-2026-07-28.md)，
不是直接建立資源或改碼。這份擴充規劃是獨立的 Expansion S 軌，不擴大目前
Phase 1 release scope，也不延後原預約平台的 Stage 2～6，除非業主日後明確把它
納入同一 release。

## 1. 為何另開 Expansion S

現有 Phase 1 刻意不處理病歷、手術臨床內容、付款或實際薪資。新增需求同時跨越：

1. **醫療敏感資料**：手術名稱、麻醉、實際手術時間、回診內容及特殊備註；
2. **病患財務資料**：總價、訂金、尾款、退款與欠款；
3. **人員結算資料**：醫師、個管／諮詢師及客服的結算基礎；
4. **Google Calendar 反向輸入**：外部建立、修改或刪除事件後影響系統資料。

這些都不能靠增加幾個 UI 欄位安全完成。台灣《個人資料保護法》第 2、6 條把病歷、
醫療、健康與財務資料列入個人資料範圍，醫療／健康資料另有較嚴格的處理條件；正式
範圍仍須由診所的醫療、隱私／法務與財務負責人核准。法規基線見
[台灣隱私法規基線](../security/taiwan-privacy-legal-baseline.md)與
[全國法規資料庫：個人資料保護法](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=I0050021)。

## 2. 2026-07-28 已確認與尚未確認

### 已確認

- 正式營業時間：週三至週五 12:00–20:00、週六 10:00–18:00。
- 一筆正式預約可選多項服務。
- 止鼾與醫美的實際療程時長都只在到診／執行後形成，不在服務目錄寫死固定分鐘、
  40～60 range、可選級距或自動結束時間。先前 40～60 分鐘是已被本次回答取代的
  規劃輸入。
- 管理者可刪除符合限定理由的**預約紀錄**；audit 永久、append-only，任何角色
  都不能刪除 audit evidence。
- D-006 全部核准：全員 MFA、自管帳號 TOTP、30 分鐘 idle、8 小時 absolute
  session、停權後下一個 protected request 即拒絕，授權碼雜湊、可個別撤銷並
  限制錯誤嘗試。
- 任一部分超出正式營業時間的自訂手術時段只允許 `administrator` override，
  且理由必填；不得用櫃檯權限或刪預約授權碼委派。休診日／國定假日是否也可
  override 尚未由本次回答決定。
- Google Calendar 的 inbound 狀態必須與工作臺同步；工作臺是操作與可見性入口。

### 尚未形成可執行規則

- 預約時不使用服務時長，因此仍須決定 published slot block 的開始／結束、容量、
  多服務占用一個或多個 slot、緩衝與現場超時如何處理。
- 「到診才知道」只解除服務目錄的固定 duration，不解除預約時對醫師／診間／設備
  的 operational interval lock。
- Calendar 與工作臺同步的目標已確認；2026-08-16 input 已選擇 manual review＋
  system authoritative，不自動套用 linked edit。reviewer identity、matching、
  Google deletion 語意、衝突優先序、approval metadata 與處理 SLO 尚未核准；
  D-016 保持 pending。

## 3. 需求如何對應現有系統

| 新需求 | 可重用基線 | 尚缺工作／決策 |
| --- | --- | --- |
| 病患完整時間軸 | patient、appointment、follow-up、case-assignment 的 ID 與歷程模型 | D-014 醫療／手術紀錄邊界；不可做成一筆可任意覆寫的大文件 |
| 初診／醫美／回診／手術日曆 | 週檢視、事件文字＋色彩、Calendar outbox | 新事件類型、資源時長、顏色 token、無障礙 regression |
| 手術排程與衝突 | slot transaction、schedule planner、patient active-booking guard | 醫師／手術室／病患三種資源鎖、published slot block 與現場 actual interval 分離 |
| 回診生命週期與次數 | follow-up planner、正式回診鏈、完成狀態 | 手術來源關聯、臨床內容分類；僅 `completed` 計數 |
| Google 雙向同步 | outbound projection、固定 event ID、retry/dead-letter | 工作臺同步方向已確認；D-016 尚缺 inbound 套用／review、watch 續訂、sync token、410 full resync 與衝突規則 |
| 角色與欄位權限 | D-006 已核准的 Phase 1 staff baseline、server-side action/resource scope 設計 | Expansion S 新角色與 field projection；金額欄位不得只靠前端隱藏 |
| 付款／退款 | 尚無 ledger | D-015、不可變 money transaction、會計對帳與更正流程 |
| 人員結算 | payroll credit／period lock／adjustment 基線 | D-008＋D-015；金額公式、稅務／會計來源與核准角色 |
| 永久 audit | audit v2、同交易寫入 | Cloud append-only storage、查閱／匯出權限與容量成本 |

## 4. 領域資料必須拆開

病患詳細頁可以呈現一條時間軸，但資料來源不能合併成一筆可覆寫的「病患大物件」。

| Aggregate／ledger | 保存內容 | 主要不變條件 |
| --- | --- | --- |
| `patients` | 最小身分與聯絡索引 | 不以姓名自動合併；合併需人工覆核與 lineage |
| `appointments` | operational slot 開始／結束、類型、複數服務、狀態 | slot interval 來自已發布排班而非服務分鐘；建立／改期用交易鎖資源；取消不等於刪除 |
| `encounters` | 實際到診目的、`actualStartedAt`／`actualEndedAt` | 實際分鐘由兩個 timestamp 衍生；預約與實際到診分開，不回寫竄改原預約 interval |
| `surgery_cases` | 手術項目、醫師、麻醉、預定／實際時間 | 臨床更正留版本；實際時間不可覆蓋預定時間 |
| `follow_ups` | 來源就診、預約／完成／取消／未到狀態 | 只有 `completed` 計入已完成回診數 |
| `case_assignments` | 個管／諮詢師的 effective-dated 指派 | 改派關閉舊期間並新增新期間，不覆寫歷史 |
| `payment_transactions` | 訂金、尾款、退款及更正 | 金額使用 TWD 最小單位整數；不可直接改累計數字 |
| `settlement_entries` | 各角色應結算、已結算與調整 | 與病患付款 ledger 分開；規則版本與來源交易可追溯 |
| `calendar_links` | 內部事件與 Google event ID／sync 狀態 | Google 不是容量或病患資料權威 |
| `audit_events` | actor、action、target、before/after 摘要、理由、時間 | 永久 append-only；管理者也不可刪除 |

`PatientTimeline` 應是上述資料的只讀 projection。頁面可以依時間合併顯示初診、醫美、
諮詢、手術、回診、付款與結算狀態，但任何修改都要回到各自的 command 與權限。

病患詳細頁的 projection 需求完整保留：

- 初診、實際到診、確認手術與實際手術時間；
- 手術醫師、諮詢師／個管師與客服；
- 手術項目與麻醉方式；
- 每次回診、已完成回診數與下一次回診；
- 特殊備註（依 D-014 欄位分類後才可保存）；
- 病患付款與人員結算狀態；金額是否出現在 DTO 仍依角色投影。

## 5. 日曆與手術時段

### 系統日曆

四種主要事件保留文字與顏色兩種辨識：

| 類型 | 建議 token | 顯示要求 |
| --- | --- | --- |
| 醫美 | `calendar-aesthetic`／粉紅 | 顯示「醫美」文字，不只靠顏色 |
| 初診 | `calendar-initial`／藍 | 顯示「初診」文字 |
| 回診 | `calendar-follow-up`／紫 | 顯示「回診」文字與次序／來源 |
| 手術 | `calendar-surgery`／紅 | 顯示「手術」文字與資源衝突狀態 |

每個**系統日曆**事件引用 `patientId`、event type、開始／結束、負責醫師、
諮詢師／個管師、狀態與受權限保護的 note reference；不要複製病患主檔或完整自由
文字到 event document。這是後台 system calendar 的關聯，不表示相同欄位可以投影
到 Google Calendar。

### 到診與手術流程

到診目的的候選 closed set 為：

```text
initial_consultation / aesthetic_treatment / follow_up / examination / surgery
```

- 單純檢查不強制建立手術；保存核准的檢查結果分類／備註後，可選擇建立下一次
  回診。
- 諮詢後確認手術時，依序選手術項目、諮詢師／個管師、手術醫師、麻醉方式、
  預定開始／結束、費用／訂金狀態與特殊備註，再以同一 transaction 保留資源，
  最後由 outbox 投影 Calendar。
- 當日手術不是衝突檢查的例外；仍須取得醫師、手術室與病患 interval lock。

手術欄位 inventory：

- 病患：姓名、聯絡方式、出生月／日與選填出生年；正式欄位仍受 D-001～D-003；
- 人員：諮詢師／個管師、手術醫師、客服、建立者；
- 手術：名稱、預定日期／開始／結束、實際開始／結束、狀態、特殊備註；
- 麻醉 closed set 候選：`general`、`local`、`sedation`、`none`、`other`。

手術狀態、誰能確認／取消／完成，以及 `other` 是否允許自由文字都屬 D-006／D-014，
不能由上述 inventory 自動推定。

手術候選模板：

- 週三至週五：12:00、14:00、16:00；
- 週六：10:30、12:00、14:00；
- 另允許自訂開始／結束時間；營業時間內依排班權限，超出營業時間只允許
  `administrator` override 且必填理由。Override 與時段變更須在同一 transaction
  append actor、server time、原／新 interval 與理由；不可委派。

模板不是實際可用性。建立或改期前必須用同一筆 server transaction 檢查：

- 手術醫師 interval；
- 手術室／設備 interval；
- 病患 interval；
- 營業時間、日期例外與具理由的 override；
- 原時段釋放與新時段保留必須原子完成。

Override 只放行「營業時間」檢查，不放行手術醫師、手術室／設備或病患衝突，也
不自動涵蓋整日休診或國定假日。

每個可保留事件都仍須有 operational `startsAt`／`endsAt`，但它們來自已發布的
slot block／具權限自訂時段，不由止鼾或醫美服務名稱推算。到診時只新增
`actualStartedAt`，完成時新增 `actualEndedAt`；兩者才形成實際療程分鐘。實際值
不得覆寫原預約 interval，也不得因多選服務自動相加。若現場超時，工作臺顯示
resource overrun／conflict 供人工處理，但不竄改其他已成立預約。

### 回診生命週期

手術完成後可以建立下一次回診。每筆回診保留日期／時間、醫師、諮詢師、原因、
內容分類、核准備註與狀態。狀態 closed set 候選為 `scheduled`、`rescheduled`、
`cancelled`、`arrived`、`completed`、`no_show`。

- 只有 `completed` 計入病患的已完成回診數；
- 改期新增歷程並保存原開始／結束、改期人與 reason code，不覆蓋原值；
- 取消保留回診紀錄，只改生命週期狀態；
- 完成回診後可再建立下一筆，形成初診／手術 → 回診 1 → 回診 2 的可追溯鏈。

## 6. Google Calendar：保留系統權威，雙向審核佇列提案

現行 [ADR-0002](../adr/0002-calendar-is-a-projection-not-the-lock.md) 不撤銷：
Firestore／domain transaction 仍是預約與資源容量的唯一權威。Outbound projection
沿用固定 event ID、outbox、retry、dead-letter 與 reconciliation。

業主已確認 inbound 必須與工作臺同步；下列是 D-016 未核准前的安全提案，不代表
review queue 已獲核准：

1. `events.watch` 通知只觸發「有變更」工作，不直接改 appointment；
2. worker 使用保存的 `syncToken` 執行 incremental sync；
3. `410 Gone` 時清除失效 token，做完整 resync 後再保存新 token；
4. 由本系統建立且仍有有效 `calendar_links` 的事件，可產生具 before/after 的
   inbound change candidate；
5. Google 直接建立且無內部 link 的事件，一律進「待補資料／待審核」，不得以
   姓名自動合併病患；
6. Google 刪除事件只建立取消候選，不直接刪除或取消系統紀錄；具權限櫃檯／管理者
   核准後才走正式 cancellation command；
7. 衝突、過期、權限不足或病患不明都留在 operator queue，不猜測結果；
8. 工作臺顯示 `pending_review`、`conflict`、`approved`、`rejected`、
   `superseded`、`sync_error`，並同時顯示 outbound 的 `queued`、`synced`、
   `failed`；同步不是只藏在 worker log；
9. `410 Gone` 只重建 Calendar mirror 與 candidate，不清除 appointment、
   surgery、encounter 或 audit；
10. 工作臺核准候選時仍執行正式 domain command，重新檢查最新版本、權限、
    營業時間與資源衝突；超出營業時間的手術只有管理者可核准且理由必填。

Google 官方文件確認：

- push notification **沒有事件內容**，收到後仍須呼叫 API 查詢；channel 會到期且
  沒有自動續訂方式：
  [Push notifications](https://developers.google.com/workspace/calendar/api/guides/push)；
- incremental sync 需要保存並輪替 `syncToken`，且會包含刪除項目：
  [Synchronize resources efficiently](https://developers.google.com/workspace/calendar/api/guides/sync)；
- scope 應選最小必要範圍，不使用可管理全部 calendar／ACL 的廣泛 scope：
  [Choose Google Calendar API scopes](https://developers.google.com/workspace/calendar/api/auth)。

Google event 僅保存 opaque booking/event ID、事件類型、時間與最小狀態。病患姓名、
電話、手術名稱、麻醉、金額與備註不得放進 Google Calendar。系統日曆可依 RBAC
顯示病患與工作資訊，但那不代表資料可以外送至 Google。

## 7. RBAC 與欄位投影

2026-07-28 文字檔提出以下 **Expansion S 候選矩陣**。D-006 已核准 Phase 1 的
administrator／front desk／physician 身分與安全基線，但下列臨床、金額與指派
範圍仍受 D-007／D-008／D-014／D-015 審核，不因寫入本文就成為正式權限：

| 角色 | 候選資料範圍 | 候選金額範圍 |
| --- | --- | --- |
| 主管／管理者 | 全部病患、醫療、手術、回診與行政資料 | 全部付款與結算 |
| 醫師 | 全部病患的醫療、手術與回診必要資料 | 不回傳病患付款；僅本人結算 |
| 櫃檯 | 全部病患的預約與行政必要資料 | 全部病患付款；結算操作另授權 |
| 會計 | 付款與結算必要資料 | 全部付款與結算 |
| 諮詢師／個管師 | 僅有效指派病患 | 指派病患金額及本人結算 |
| 護理師 | 與照護工作相關資料，不含財務 | 不回傳 |
| 客服 | 聯絡／追蹤必要資料，不含臨床敏感內容 | 不回傳病患付款；僅本人結算 |

必須分開檢查 `action`、`resource scope` 與 `field projection`。沒有金額權限時，
API DTO 本身不得包含總價、訂金、尾款、欠款、折扣、退款或他人結算；前端
`display:none` 不算授權。

## 8. 付款與人員結算

病患付款使用不可變 transaction ledger，畫面上的總額由交易加總：

```text
已付款總額 = 有效收款交易總和
已退款總額 = 有效退款交易總和
可用實收金額 = 已付款總額 − 已退款總額
尚欠金額 = 手術核准總價 − 可用實收金額
```

畫面可依衍生值顯示 `unpaid`、`deposit_paid`、`partially_paid`、`paid`、
`refund_pending`、`refunded`，但狀態不得成為可任意修改且與 ledger 矛盾的欄位。
每筆 transaction 需有類型、TWD 金額、來源、操作者、server time、reason code、
外部對帳 ID（若有）與 reversal link。

原文字檔提出「依可用實收金額 × 結算比例」作為醫師、個管／諮詢師與客服的候選
公式。它比直接按手術總價預先結算保守，但仍須 D-008／D-015 核准下列內容：

- 各角色採固定金額、手術總價百分比、實收百分比或人工輸入；
- 訂金、尾款、退款、折扣、稅務／會計調整如何影響可結算金額；
- 規則版本、生效日、結算期間、覆核者與 lock；
- 已 lock 後只新增 adjustment，不覆寫或刪除原結算；
- 櫃檯是否可操作結算，以及會計與管理者的分工。

每筆 settlement entry 的 inventory 保留：對象、病患、手術、計算方式、比例或
固定金額、應結算、已結算、尚未結算、日期與狀態。計算方式候選為 fixed amount、
手術總價百分比、實收百分比及人工輸入；人工輸入仍需理由與覆核，不能成為跳過
ledger 的捷徑。

## 9. Audit 與更正

已核准邊界：

- 管理者可刪除符合限定理由的錯誤預約紀錄；
- audit 永久保存且 append-only，管理者也不可刪；
- 改期、取消、換醫師／個管、手術項目、金額、收款、退款、結算與 Calendar inbound
  decision 都產生新 audit event；
- audit 保存 actor、server time、reason code、target ID 與最小 before/after 摘要，
  不複製完整臨床自由文字、病患電話或金額明細。

必留 audit 的完整動作 inventory：預約／手術改期、預約／手術取消、更換醫師、
更換諮詢師／個管師、修改手術項目、修改核准價格、收訂金、收尾款、退款、結算
與 adjustment，以及 Google Calendar inbound/outbound reconciliation。

永久 append-only 是安全與證據不變條件；D-002、D-014、D-015 仍須決定 audit
中的可識別連結在法定／業務目的消失後如何 pseudonymize 或解除連結。這不等於
允許任何角色刪除或覆寫原 audit event。

臨床內容、付款與結算的「更正」都應新增 correction／adjustment，不做無痕覆寫。

## 10. Expansion S 實作順序

| 階段 | 內容 | 前置 gate | 完成證據 |
| --- | --- | --- | --- |
| **S0 現在** | 需求正規化、資料分類、command／event inventory、決策包 | 無；plan-only | 本文件、decision register、無 route／無真資料 |
| **S1 領域基線** | surgery/encounter/payment/settlement 純 domain 與 synthetic tests | D-004、D-014／D-015 對應規則核准；沿用已核准 D-006 安全不變條件 | 狀態機、interval conflict、ledger、RBAC projection tests |
| **S2 合成手術排程** | 手術資源、到診目的、時間軸 projection | Stage 2 auth/API 完成；只用 synthetic data | 交易競態、改期釋放、patient/surgeon/room conflict E2E |
| **S3 臨床時間軸** | 手術、麻醉、實際時間、回診鏈 | D-001～D-003、D-014；隱私／醫療責任核准 | 欄位 inventory、access log、correction、retention/DSR drill |
| **S4 付款與結算** | payment ledger、refund、settlement、lock/adjustment | D-008、D-015；財務／會計核准 | 金額不變量、退款、period lock、field-level BOLA tests |
| **S5 Calendar inbound** | watch、incremental/full sync、review queue、reconciliation | D-009、D-016；Stage 3 outbound 穩定 | channel renewal、410、delete candidate、duplicate/lost notification rehearsal |

S3～S5 是否進同一個 production release，要在 S0 結束時另外做 release-scope
決定；不得因為資料模型已規劃就自動一起上線。

## 11. 需要正式關閉的決策

| 決策 | 本次輸入 | 尚需回答 |
| --- | --- | --- |
| D-004 排程／容量 | 正式時段、多服務；止鼾／醫美實際時長到診後記錄、不寫死；超時段手術限管理者＋理由 | published slot block、容量、多服務占用、緩衝／現場超時 |
| D-006 身分／RBAC | **已核准** Google＋自管帳號、全員 MFA、自管帳號 TOTP、30m idle／8h absolute、立即停權、角色／委派、永久 audit | Phase 1 無剩餘 policy answer；實作與驗證依 Stage 2 change plan |
| D-007 個管 | 病患以有效指派的個管／諮詢師為「自己」 | 多重有效指派、改派／代理／離職與 merge |
| D-008 結算 | 三種角色分帳、實收基礎候選 | 正式公式、規則版本、lock owner、爭議與 adjustment |
| D-009 Calendar | 需要 production shared calendar 與最小事件 | owner、OAuth／service identity、最小 scope、專用 calendar |
| **D-014 臨床／手術紀錄** | 手術、麻醉、臨床回診與時間軸 | 法律／醫療紀錄邊界、owner、欄位、保存、更正與匯出 |
| **D-015 付款／退款** | 總價、訂金、尾款、退款、欠款與結算來源 | 會計權威、付款／退款 reason、核准與對帳 |
| **D-016 Calendar inbound** | Google 直接新增／修改／刪除的狀態須同步到工作臺；2026-08-16 input 選擇 manual review＋system authoritative | reviewer identity、matching、approval metadata、衝突優先序、刪除語意與 SLO |

在上述決策關閉前，允許的工作只有文件、schema inventory、風險分析與不帶政策值的
純設計；不得新增正式 route、真實 Calendar watch、臨床資料或付款資料。
