# Sol v2 外部驗收測試單（2026-10-25）

**狀態：PLAN-ONLY／NOT_RUN。這不是部署、停機、IAM、工具設定、還原或實測授權。**

工程負責人挑操作日並逐項核准後，由具權限且在場的操作者執行；Sol 本輪不執行任何一步。
這份單子不選凍結 SHA、不延長既有例外，不把來源或 CI 通過改稱外部驗收完成。
正式營運、隱私告知與公開信箱由有權代表診所的人確認，不把工程負責人誤稱診所業主。

依據：[決定登記簿](../product/phase-1-decision-register.md)、
[逐包來源與 finding manifest](2026-10-06-sol00-safe-manifest.json)、
[Stage F 精確授權模板](../templates/stage-f-exact-sha-authority-packet.md)。
Sol v2 四項決定已逐字登記在 [#268](https://github.com/waydefu/clinic/pull/268#issuecomment-6384695242)，
並已收入 main 的決定登記簿；另依 2026-10-29／2026-10-30 已決事項修正下列準備清單。
既有來源 PR 的合併不是本單任何實際操作的授權。

## 1. 操作日前置：缺一項就不執行

| 欄位 | 操作者當天填寫／確認 |
| --- | --- |
| 執行 SHA | 執行當天的 main SHA，由操作者填；須為完整 40 字元 SHA |
| 版本證據 | 上述 SHA 的原 required CI、來源 PR、artifact 與候選 tree 對應；不同 SHA 不混用 |
| 精確目標 | 只用登記簿核准的 exact host／isolated project；本單不產生新的 host、project 或 calendar ID |
| 既有 isolated project | `beauessence-clinic-stg-c1a01` 是既有登記的 C1 標識，不是本次執行授權；不得換成 `beauessence-clinic-staging` |
| 新鮮授權 | 每項列 SHA、host／project、操作者、UTC 起訖、允許效果／上限、停止及回復；舊時窗與既有預覽核准不沿用 |
| 到場角色 | 工程負責人核工程方案與當次授權；涉及診所正式承諾，另由具相應權限者確認 |
| 合成資料 | 只用明標 `SYNTHETIC-ONLY` 的測試識別碼與非秘密 canary，不使用患者、員工、付款、真實訊息或 NAS 資料 |
| 來源缺口 | 先完成下節列出的來源／設計前置，不讓操作者臨場補 IAM、選新 subscriber 或發明共用維護旗標 |
| 證據位置 | 另核准安全保存位置；公開紀錄只留 SHA、工具版本、非敏感測試 ID、拒絕碼、計數及結果 |

所有時間證據記 UTC，顯示可另列 `Asia/Taipei`。任何頁面、工具或 log 出現真實資料、
秘密、cookie、authorization header、token 或未核准目標，立刻停止，不複製進報告或聊天。

## 2. 來源盤點與尚未完成的前置

這裡是 repo 來源盤點，不是實際部署盤點。執行前必須以當天 main 重核。

| 包 | 可追溯來源 | 不可省略的前置／未證明內容 |
| --- | --- | --- |
| INGRESS／B-03 | [client-ip](../../apps/api/src/platform/runtime/client-ip.ts)、[WP-B2A 身分桶](../../apps/api/src/platform/runtime/wp-b2-rate-limiter.ts)、[internal-test gate](../../apps/api/src/internal-test-booking/internal-test-booking.gate.ts)、#278／#285／#292 | 方案 A 接受直連 run.app 可達；須驗核准正門正常、偽造最左側 X-Forwarded-For／格式錯誤／多地址與換 IP 不能重置身分桶鎖定、未核准 host 及關閉／逾期 gate 拒絕。安全計數取得仍有 §3.1 缺口；exact host、直連目標與操作時窗須新鮮核准 |
| NOTIFICATION／B-08 | [WP-B4 main](../../infra/terraform/wp-b4-alerting/main.tf)、[設計](2026-10-30-sol-notification-design.md)、[consumer](../../apps/worker/src/alert-notification-consumer.ts)、#357 | 純 consumer 的 allowlist／dedupe／retry／dead-letter 合成測試已合；application topic 的 publisher binding、subscription／DLQ 與實際 worker 接線仍缺，不能只列「待實測」 |
| MAINTENANCE／E3-07 | [maintenance gate](../../apps/api/src/platform/runtime/maintenance-gate.ts)、[AppModule](../../apps/api/src/app.module.ts)、[還原 runbook](../runbooks/backup-and-restore.md)、[事件應變](../runbooks/incident-response.md) | `ReadThroughMaintenanceGate` 只建立讀取邊界；AppModule 仍注入 `StaticMaintenanceGate(false)`，不是全域停寫控制。共用 operational control 的設計／接線、worker 與在途工作控制仍須先核定，不能當純外驗缺項 |
| LEASE／D-05、D-12 | [runtime](../../apps/worker/src/calendar-sync/calendar-pilot-runtime.ts)、[協調設計](2026-10-22-sol-calendar-lease-coordination.md)、#287 | 合成協調測試不證明實際唯一 egress、舊 worker 終止／隔離與 provider 在途工作排空；未知必須 quarantine |
| SECRETS／B-31、B-55 | [.claude source policy](../../.claude/settings.json)、[upload exclusion](../../.gcloudignore)、[tracked exclusions](../../.gitignore)、#277／#291 | Claude source deny 不自動涵蓋 Hermes、Codex 或其他工具；每個實際工具與 upload 路徑要各自驗證 admission-before-read |

**NOTIFICATION 與 MAINTENANCE 不因本單已寫好就成為 SOURCE-DONE。**
只差本單外部實測的包，才能依登記簿 2026-10-19 第 12 題 B 標
`BLOCKED-EXTERNAL／SOURCE-DONE／外部驗收未完成`；仍不報 DONE，也未獲逐包來源凍結核准。

### 2.1 C1 Stage 1：數字版本必填清單（僅名稱與 variables.tf 行號）

Stage 1 填入 `exact_apply_authority_sha` 啟用 apply 時，以下 mount 各自需要數字版本；
API 必填驗證在 `variables.tf:313–326`，worker 在 `variables.tf:344–350`。
名稱只取自 [main.tf 的 api_secret_env／worker_secret_env](../../infra/terraform/c1-internal-test-run/main.tf)，
下表連到每項的 [variables.tf](../../infra/terraform/c1-internal-test-run/variables.tf) 必填驗證行。

| Secret 名稱 | variables.tf 行號 |
| --- | --- |
| `c1-staff-firebase-web-api-key` | [variables.tf:318](../../infra/terraform/c1-internal-test-run/variables.tf#L318) |
| `c1-staff-manager-allowlist` | [variables.tf:319](../../infra/terraform/c1-internal-test-run/variables.tf#L319) |
| `c1-staff-front-desk-allowlist` | [variables.tf:320](../../infra/terraform/c1-internal-test-run/variables.tf#L320) |
| `c1-synthetic-calendar-id` | [variables.tf:347](../../infra/terraform/c1-internal-test-run/variables.tf#L347) |

各項數字版本均為 UNKNOWN；不從描述、舊 fixture 或已退役共享 pin 猜版本。
本輪沒有讀本機參數檔、Secret Manager 或 secret 值，也沒有確認部署的 mount。
這只列 Stage 1 必填名稱；另行啟用功能的條件式版本不自動納入。操作日再以當天 main 重核行號與條件。
2026-11-02 的 C1 部署已取消，日期另排；本表不是 C1 準備、apply 或秘密操作授權。

## 3. INGRESS：方案 A 的兩路徑一致性與拒絕對照

- 包／ID：SOL-INGRESS／B-03；既有 K9、K6、E1-04、E1-14、X-C06 的拒絕邊界保持。
- SHA：執行當天的 main SHA，由操作者填。
- 依據：[登記簿 2026-11-02 來源更正](../product/phase-1-decision-register.md)、既有 Q5／Q7 方案 A，
  及 [負責人取消 C1 與驗收標準](https://github.com/waydefu/clinic/pull/268#issuecomment-6562141735)。
  測試期接受直連 run.app 可達；**直連請求不必一律在 handler 前被拒絕**。
  安全控制不依賴 IP 或入口；來源選取不是身分保證，不靠 IP 或轉送 header 保證呼叫者身分。
  本單不以 repo 的 ingress 宣告推定目前端點公開或封閉。
- 目標：核准正門的 exact Hosting host 及其確切 direct Run 對照目標。
  **需要新的精確授權：兩個目標、UTC 時窗、合成請求上限與允許的測試寫入。** 不猜 host。
- 資料與允許效果：只用隔離的合成 booking／lookup 案例，固定合成電話／生日對應的 opaque lookup identity。
  各測試變更 IP／header／入口時不得換該身分；只產生當次明列的合成紀錄，不公開原始輸入或 opaque key。
- 人工步驟（§3.1 證據缺口補齊並另核准後才可執行）：
  1. 核對版本、endpoint 契約與現行限流政策；取得身分桶狀態、handler counter／writer counter 的安全基準。
  2. 對核准 Hosting rewrite 送正常合成請求，確認正門正常；對 direct Run 做同一契約對照。
     授權／limiter／gate 不能因入口不同被繞過，不把直連可達當成失敗。
  3. 固定同一合成身分，交替兩入口、偽造最左側 `X-Forwarded-For`、格式錯誤／多地址欄位及不同來源 IP。
     按既有 WP-B2A 第二桶 `lookup_identity_failure` 的門檻／窗口累積失敗；確認同一身分桶持續計數。
     第一桶身分加 IP 的拒絕不能冒充第二桶證據；合法多跳不只因包含多個地址就判失敗。
  4. 身分桶進入拒絕狀態後，在原窗口／鎖定有效期間再換 IP、轉送值與入口；換 IP 不能重置鎖定，
     仍須依契約 429 並有有效 `Retry-After`，不能重新取得允許額度。不得調整限流數字或等待窗口自然到期來假裝繞過失敗。
  5. 另測未核准 host、錯誤授權（需驗證的 endpoint）、關閉／逾期 gate；按既有契約無副作用拒絕。
     若格式錯誤等請求在 limiter 前已拒絕，分開記拒絕與零副作用，不能宣稱它已證明身分桶持續計數。

| 對照 | 成功條件 | 安全計數／狀態證據 |
| --- | --- | --- |
| 核准 Hosting rewrite 正常合成請求 | 正門依 endpoint 契約正常，符合授權／limiter／gate | handler／writer 只增加當次明列效果 |
| direct Run 正常合成請求 | 同一契約與控制；不只以可達判失敗 | 按實際結果核對，不預設所有 direct Run 都是零 handler |
| 偽造最左側 X-Forwarded-For、格式錯誤／多地址及換 IP | 同一 opaque lookup identity 仍受第二桶限制，不能以自選來源換桶 | 同桶比較為真、計數前後及拒絕狀態；先拒絕的案例另列 |
| 身分桶已拒絕後換 IP／入口／header | 換 IP 不能重置鎖定，原有效期間持續拒絕 | 同桶拒絕狀態持續，無新允許額度；429／Retry-After 僅作輔證 |
| 未核准 host、授權失敗、關閉／逾期 gate | 按既有契約拒絕，不能因入口不同繞過 | 受保護 handler／writer 零增量 |

- 成功：核准正門正常；直連、偽造及格式反例無身分桶繞過，換 IP 不能重置鎖定；
  未核准 host、關閉／逾期 gate 仍拒絕，合法效果不超出授權，所有結論有 §3.1 證據。
  不以 HTTP 狀態碼單獨推定同桶鎖定、handler 未執行或沒有寫入。
- 停止／回復：非核准目標、身分桶可繞過、觀測缺失、未授權副作用或真實資料即停止；
  依另核准方式關閉合成入口並恢復原設定，保留不含 payload 的安全計數，不自行改 ingress 或 IAM。
  不建立負載平衡器或 Cloud Armor，不改 `main.tf` 的 ingress／invoker，不改限流數字。
- 證據：SHA、授權目標引用、非敏感測試 ID、同桶比較結果、計數／鎖定前後狀態、handler／writer 增量及拒絕碼。
  不提供電話、生日、opaque key、原始 IP／header、cookie、token 或 payload。
- 排程估計：30–45 分鐘；授權與來源缺口處理不包含在內。

### 3.1 安全計數取得方式與缺口

- **現有來源可查：** [limiter](../../apps/api/src/platform/runtime/wp-b2-rate-limiter.ts) 的第二桶不含 IP；
  [limiter 合成測試](../../apps/api/src/platform/runtime/wp-b2-rate-limiter.test.ts) 覆蓋換 IP 仍受同身分限制，
  [routed lookup 合成測試](../../apps/api/src/appointments/appointment.patient-flow.test.ts) 覆蓋持續換 X-Forwarded-For 仍 429。
  既有測試可把合成 Map 傳入 `InMemoryDurableRateLimitStore`，只在測試程序內核對 key、`count` 與 `lockedUntilMs`；
  公開只留 assert 結果、測試 ID 與 CI，不輸出 Map／原始 key。這不是讀取 C1 真實狀態的工具。
- **現有計數不足：** [API metrics](../../apps/api/src/platform/runtime/api-metrics.ts) 的 `returnLookupRateLimited`
  是單 process、route／status 級的拒絕彙整，不含身分桶鍵／鎖定狀態；不能證明換 IP 前後是同一桶。
  `trackedKeyCount` 也只是本機 Map 大小，不是 handler／writer 或持久身分桶的前後計數。
- **外部缺口：** 所查 repo 沒有可對外讀取的身分桶、handler／writer 計數工具，亦沒有本單可直接採用的完整安全匯出流程。
  不虛構 endpoint、查詢指令、既有 dashboard 或已部署 instrumentation；本 PR 不新增工具或接線。
  單 process 在途計數也不能替代持久身分桶及完整 writer 的效果證據。
- **操作日前須另補：** 經核准的 server-side 安全觀測方式，能在同一 SHA／時窗內取得同桶比較、允許／拒絕及鎖定前後狀態，
  並取得核准範圍所有相關實例的 handler／writer 前後增量。原始識別資料留在受控觀測內，只交上述安全彙整；不開啟完整 header／body log。
  若當天沒有這種既有且已核准的觀測，或只有 HTTP 429／aggregate metrics，結果記 `NOT_PROVEN`，本項不能排成可執行或填 PASS。

## 4. NOTIFICATION：來源技術清單與實際投遞

### 4.1 不含 secret 的來源技術清單

| 路徑／欄位 | repo 已表達的值 | 邊界／尚缺內容 |
| --- | --- | --- |
| application topic | `c1-application-alerts`，由 WP-B4 定義 | 有 topic 來源不等於已建立、已有 publish grant 或已有 subscriber |
| application channel | `google_monitoring_notification_channel.application_pubsub`，指向上述 topic | 所查 WP-B4 無此 topic 的明確 publisher binding；不能把 budget topic 的 binding 當成它的 |
| application publisher | 未由所查 WP-B4 來源綁定 | 需要確認實際 principal、topic 與來源差異；不猜 service agent、不新增權限 |
| application subscription／worker consumer | [consumer 來源](../../apps/worker/src/alert-notification-consumer.ts) 只有 ports；Terraform 未列出已綁定的 subscription | #357 的合成案例不證明 subscriber 或 transport 已接線；不虛構 subscription、service 或 DLQ 名稱 |
| retry／DLQ | consumer 已有重試／dead-letter 決策及合成測試；WP-B4 未列出相應 subscription 的 retry／DLQ 資源 | source decision 不等於實際 queue 行為；仍需 subscription、consumer 與 DLQ 的核准配對 |
| human channel | `human_email`；收件值來自 `alert_email_address`，不入 Git | 不記錄私人信箱；正式收件目標由當次有權者核准，測試不得投到未核准者 |
| 預設開關 | `exact_apply_authority_sha = not_granted`，WP-B4 預設零資源 | 輸入一個 SHA 不構成 apply 授權；目前來源標籤是 `HUMAN_NOTIFICATION_PATH_IMPLEMENTED_NOT_DEPLOYED` |
| 既有 budget topic | `c1-budget-notifications`，位於 [c1-foundation](../../infra/terraform/c1-foundation/main.tf) | 不得刪除、覆寫或拿它的投遞成功替 application 路徑驗收 |
| budget publisher | `billing-budget-alert@system.gserviceaccount.com` | 公開 system principal 來源字串，不是 application publisher 已核證據 |
| budget monitoring publisher | `service-${data.google_project.c1[0].number}@gcp-sa-monitoring.iam.gserviceaccount.com` | 原樣保留來源模板，不填 project number、不替 application topic 沿用 grant |

- 包／ID：SOL-NOTIFICATION／B-08。
- SHA：執行當天的 main SHA，由操作者填。
- 目標：只在已登記 isolated C1 的精確 topic／subscription／worker consumer。
  **需要新的精確授權：尚缺的 publisher 配對、上述資源、投遞對象、UTC 時窗、最多投遞量與任何 IAM／部署差異。**
- 資料與允許效果：非個人、非臨床的合成訊息 ID；明列一次成功投遞、重送、暫時失敗重試及耗盡後 DLQ。
  不發給真實患者，不以實際診所訊息測試。
- 人工步驟：
  1. 技術清單與來源缺口先核定；任何 principal／topic／consumer 未知就不啟動。
  2. 觀察 browser／API 不能直接完成外部投遞；只有核准 worker consumer 可處理該合成訊息。
  3. 投遞同一合成 ID 兩次，確認重送不造成第二次非冪等副作用。
  4. 在另核准的合成接收端製造暫時失敗，再恢復，記重試與成功；另一路持續失敗至核准上限，確認進正確 DLQ。
  5. 以未核准 publisher、無授權 consumer 或錯誤 topic 做拒絕對照，不追加權限解決拒絕。
- 成功：worker-only 投遞、冪等重送、實際重試及 DLQ 都有該 SHA 的計數證據；錯誤身分或 topic 不成功。
- 停止／回復：出現非核准收件者、額外訊息、未知 retry／DLQ 或權限不足即停；依當次已核准停止／隔離方式處理。
  不刪訊息掩蓋失敗，不改 budget 通道，不在未核准狀態 restore 或改 IAM。
- 證據：安全 principal 引用、topic／subscription／consumer 的核准清單、合成 ID、attempt／dedupe／DLQ 計數與拒絕碼；不提供內容、私人收件值或連線秘密。
- 排程估計：40–60 分鐘；來源缺口未補齊時本項不得排成可執行。

## 5. MAINTENANCE：入口關閉、停寫與恢復

- 包／ID：SOL-MAINTENANCE／E3-07。
- SHA：執行當天的 main SHA，由操作者填。
- 目標：既有 isolated C1 中經核准的全部 API 實例、worker、排程與對應共用控制。
  **需要新的精確授權：共用控制來源、實例／排程範圍、停機時窗及回復方式；restore 另核准。**
- 資料與允許效果：只有合成寫入探針與已知的在途合成工作；允許效果為核准時窗內拒絕／隔離，不是刪資料。
- 人工步驟：
  1. 先核對當日完整 route／writer inventory、共用控制接線與實例清單；仍只有 static gate 就停止準備，不宣稱可停寫。
  2. 記錄所有寫入／外部投影與在途工作計數；只按已核准方式關閉新請求入口及排程。
  3. 讓在途工作排空，或按已核准設計隔離。對每條 API、worker、直接 callback 與重試路徑逐一送合成探針。
  4. 加入讀取控制失敗、控制未知／逾期與另一實例未更新的反例；均須 fail closed，而非用快取的允許狀態繼續寫。
  5. 在確認零寫入且取得另外的 restore 核准前，不開始資料還原。恢復時核對版本／控制／排程順序，再試一組合成讀寫。
- 成功：所有入口拒絕新寫入，在途工作已排空或有效隔離，整段觀察期間寫入／投影無新增；未知狀態拒絕；核准回復後合成流程恢復。
- 停止／回復：任何漏列 writer、未隔離在途工作或未知狀態仍成功，即維持封閉並停止；
  無法證明全域停寫不能開始 restore。只用另外核准的回復方案，不以網頁維護畫面或停排程替代零寫入證據。
- 證據：writer inventory、各實例／worker 安全識別、控制狀態、在途／寫入前後計數、拒絕矩陣、恢復結果；不提供資料列或私有 log。
- 排程估計：45–75 分鐘；排空與來源控制未接線的等待另計。

## 6. LEASE：嚴格零派送與交接排空

- 包／ID：SOL-CALENDAR-LEASE／D-05、D-12。
- SHA：執行當天的 main SHA，由操作者填。
- 目標：既有 isolated C1 的精確兩個 worker 身分與核准合成 egress 目標。
  **需要新的精確授權：worker／egress／專用合成 calendar（若需要）的確切識別、允許效果、數量與 UTC 時窗。**
- 資料與允許效果：明標合成的工作 ID；延遲工作、失去 lease 與接任者交接。未明列的 provider 動作全部不允許。
- 人工步驟：
  1. 確認實際唯一 egress 邊界與強制隔離／排空方式；source-only coordinator 或呼叫前 snapshot 不能代替這個證據。
  2. 讓舊持有者有一個已准入但延遲的合成工作，再按核准方式使 lease 失效；接任者不能在排空／隔離證明前啟用。
  3. 從失去所有權到交接完成，觀察接收端實際 dispatch／completion 計數；舊持有者不得新增派送或寫入完成。
  4. 測舊持有者 retry、接任者競爭、設定本身到期、排空未知／逾時與中斷恢復；未知進 quarantine，不續租掩蓋未知。
  5. 用核准上限內的多筆合成未來工作核對切換的續租／恢復，不接真實預約、不跨來源覆蓋。
- 成功：失去 lease 後舊 owner 零新派送，舊在途效果已排空或確實隔離，接任前有證據，無重複效果／越權完成；未知狀態保持停止。
- 停止／回復：任何舊 owner 新派送、接任太早、效果未知或設定逾期即停止並 quarantine；
  人工終止、網路隔離、重新啟用與 provider 清理各依當次授權，不把 timeout 當成效果已取消。
- 證據：lease／控制版本、合成工作 ID、drain／隔離狀態、接收端 dispatch／completion 計數及拒絕原因；不提供 provider payload、credential 或真實事件。
- 排程估計：40–60 分鐘；排空與 quarantine 調查可能超出，不因此縮短觀察。

## 7. SECRETS：逐工具 admission-before-read 與不上傳

- 包／ID：SOL-SECRETS／B-31、B-55；既有 B-29、B-13、E1-31 來源保護不得放寬。
- SHA：執行當天的 main SHA，由操作者填。
- 目標：當天逐一核准的工具／版本／profile、隔離的合成 canary workspace 與 upload-list 檢視。
  **需要新的精確授權：實際工具清單、canary 路徑家族、拒絕觀測方法與上傳排除檢視；不授權讀真實秘密或修改 guard。**
- 資料與允許效果：每個工具各有一份內容為 `PUBLIC-CANARY-NOT-A-SECRET` 的非秘密檔，另有一份允許讀取的合成來源對照。
  只能在核准隔離 fixture 建立 canary；不能複製真實設定／密鑰、不能把 canary 放入實際秘密檔取代內容。
- 人工步驟：
  1. 列出實際使用的 Hermes、Claude Code、Codex 及其他工具；逐列填版本、profile／策略版本、測試 ID，不因名稱相近就套用另一工具的結果。
  2. 對每個工具的核准 canary 路徑提出讀取，確認准入層在內容開啟前拒絕；用安全的 open/read 計數或拒絕階段證據佐證。
  3. 試可允許的合成來源對照，確認不是整個工具壞掉或全面封鎖；拒絕後不換工具／路徑／命令繞過同一條保護。
  4. 檢視核准的安全外送紀錄，確認沒有讀後才遮罩或上傳；找不到 canary 文字本身不足以證明未開檔。
  5. 對實際 upload 工具另查檔案清單，確認 canary 被排除、必要 source/config 仍保留；Git ignore 不等於 cloud upload exclusion。
- 成功：每個實際工具都有 admission-before-read 拒絕碼、零讀取／零外送證據與允許來源正例；upload-list 反例不漏必要檔。
- 停止／回復：若先讀後遮罩、外送或無法觀察拒絕階段，停止該工具測試並隔離，不嘗試真實秘密；
  原因與待補工具版本列明。工具設定／guard 修改須另核，canary 清理由操作者依核准範圍處理。
- 證據：工具／版本／策略版本、合成測試 ID、拒絕碼、拒絕階段與計數、upload-list 摘要；不交付全域配置、登入狀態、cookie、token 或真實內容。
- 排程估計：每個實際工具15–25分鐘；工具總數由操作者當天填，未列工具不能自動算通過。

## 8. C1 操作日建議順序與收尾

排程估計，不是實測：預留一個操作日；來源缺口、授權等待、真正 restore 與事故處理不含在內。
前置核對預留20–30分鐘；各項時間見上節，不因總時數或到期壓力省略反例。

1. 核對 main SHA、原 CI、來源缺口與每項新鮮授權；不符合就只做資料準備，不執行該項。
2. SECRETS 的非秘密 canary／不上傳驗證先做，未過不進行後續操作。
3. INGRESS 核准路徑與拒絕對照。
4. NOTIFICATION 在技術清單與來源缺口已解、且逐項授權後才做。
5. MAINTENANCE 關入口、排空／隔離與逐 writer 反例；這不是 restore 授權。
6. LEASE 在核准的隔離條件下做兩 worker 交接、舊 owner 零派送與未知 quarantine；不得臨時啟用 provider。
7. 只按已核准回復順序恢復控制與排程，再做合成 smoke；沒有回復授權就維持封閉並交接。
8. 收尾預留20–30分鐘：逐項記 PASS／FAIL／NOT_RUN、實際 SHA／版本、授權引用、允許效果與安全證據連結。
   缺項不填 PASS，不上傳私有 log。更新 #268 的外部驗收缺口，不自行凍結或把 SOURCE-DONE 改 DONE。

| 項目 | 操作者／核准引用 | 實際 main SHA／UTC | 結果／安全證據 | 停止／回復結果 |
| --- | --- | --- | --- | --- |
| INGRESS B-03 | 待填 | 待填 | NOT_RUN | 待填 |
| NOTIFICATION B-08 | 待填 | 待填 | NOT_RUN | 待填 |
| MAINTENANCE E3-07 | 待填 | 待填 | NOT_RUN | 待填 |
| LEASE D-05、D-12 | 待填 | 待填 | NOT_RUN | 待填 |
| SECRETS B-31、B-55 | 待填 | 待填 | NOT_RUN | 待填 |

## 9. 轉交診所：只確認正式文案，不重問已決政策

正式草稿以 [privacy-policy-draft](../legal/privacy-policy-draft.md) 及
[現有隱私頁](../../apps/web/public/privacy.html) 為準；兩者仍保留草稿／待核准界線。
本單不另寫一份告知原文，不把來源測試或工程負責人核工程方案當成診所正式審定。

以下均已在決定登記簿與 BD-POLICY 定案，不再列為問答或使用待填佔位符：

- 看診兩年後封存，不自動永久刪除；回診者先標「待櫃台確認」。
- 稽核／安全紀錄三年，`return_sessions` 24 小時；已決保存設計不表示雲端 TTL 已啟用。
- 隱私聯絡窗口使用診所電話，暫無 email；不要求工程師提供私人信箱。
- 告知由診所負責人署名，由工程負責人代為轉達確認；法務不列待辦。

尚需轉達的只有：請有權代表診所的人確認正式告知的最終版本與生效安排。
在此之前保留現行內容，不自行發布、代簽、變更 D-series、保存政策或公開聯絡值。
這項文案等待不代替其他來源缺口、實測或生產上線授權。
