# SOL-CALENDAR-LEASE：嚴格零派送的協調設計候選

日期：2026-10-22；更新：2026-10-29（Asia/Taipei）。狀態：**GATE-1-AUTHORIZED／PROOF-INCOMPLETE；GATE-2-BLOCKED-OWNER＋BLOCKED-EXTERNAL**。
Packet：SOL-CALENDAR-LEASE；findingIDs：D-05、D-12。原始研究 base：`37c10796d5e8f05a2d7b63b4bda7b7d7e99c6746`。
依據：[#268 保守方向](https://github.com/waydefu/clinic/pull/268#issuecomment-6322342715)、登記 PR #281，
[ADR-0002](../adr/0002-calendar-is-a-projection-not-the-lock.md)、AGENTS Safety Floor 第 3 條。
本文件不是已接受 ADR；Gate 1 不新建服務、不改共用 schema、不變更 provider／IAM，不授權部署或接入既有 provider runtime。

## 2026-10-29 授權切分與 Gate 1 交付

[Decision Register 的 2026-10-29 受委派決定](../product/phase-1-decision-register.md) 已核准選項 A 的 **Gate 1：設計與純合成原型**。
不得再把 Gate 1 標為等待業主選方向；Gate 2 的真實 worker／provider runtime wiring 仍須負責人另核。
原有 D-05／D-12 pending、production Calendar、provider／cloud／IAM／migration／部署與真實資料禁線不變。

Gate 1 沿用現有
[`CalendarPilotSyntheticLeaseCoordinator`](../../apps/worker/src/calendar-sync/calendar-pilot-lease-coordinator.synthetic.ts)
及[直接測試](../../apps/worker/src/calendar-sync/calendar-pilot-lease-coordinator.synthetic.test.ts)，不另造第二套 coordinator。
下表是來源核對與尚待補齊的合成驗收，不是新 runtime 證據：

| 要證明的承諾 | 目前模型能證明的範圍／缺口 | Gate 1 必須補齊的 oracle |
| --- | --- | --- |
| 排空後才交接、未知狀態 quarantine | 已建模 admission、in-flight、handoff 與 sticky quarantine 的記憶體內排序 | 保留現有拒絕舊 handle、在途未結束不得交接、未知結果不得繼續 admission 的斷言 |
| 跨 lease／兩個 worker 競爭 | 直接測試 `serializes two synthetic workers through one coordinator during handoff`：兩個合成 worker 共用同一 coordinator，交錯舊 worker 的在途／未開始工作與 successor；排空前不生效，交接後拒絕舊 handle，successor 的在途工作不被舊重播誤清除 | 保留外來 handle／複製 permit 的拒絕案例；此合成排序不等於真實跨程序的唯一 egress／隔離證明 |
| 到期後零新派送、無 progress／success | 已有測試供給的硬 deadline／clock；相等即到期、回退／不明時間與 quarantine 都拒絕新派送或成功回傳。新增五種在途結果回傳時的 clock fault，恢復 clock 也不能重新啟動 pending stub。未建模實際同步 cursor | 保留直接穿越 hard expiry、stub 零新開始、到期結果拒絕與 handoff 不前進的斷言；不得當成實際 provider 或同步進度證明 |
| 續租與 source binding | 已在同一模型區分 worker deadline／不可延長的 configuration hard deadline；明確 binding 的 admission 與同步續租提案有正反測試。未建模外部續租取得／遺失回覆或 registry 的來源切換 | 保留目前 issued handle、兩個 deadline、binding 與 closed phase 的拒絕案例；仍須補未知續租結果的交錯證明，保持隔離，不用假成功續租解鎖 |
| 大量 future bookings 有界搬移 | 只有 segment ID，沒有大量項目、分段 cursor 或 copy／cleanup／replay 流程 | 測試提供批次上限與合成未來項目，正常同步、copy、cleanup、replay 全部經同一邊界；每段有限、只收同 binding／generation 的 receipts，失 lease 不推進 cursor |
| 中斷後恢復與冪等重播 | quarantine 沒有已證明的恢復路徑；不能清掉 pending 或重建 instance 當復原 | 在 admission、派送後未知結果、receipt／cursor 寫入前後插入中斷；保留未決工作，以穩定 identity 查證／重播，只有合成排空／隔離證據完整才可接續 |

以上時間、批次與故障都是測試輸入，不設定 production TTL、safe margin、batch 預設值或新的接管政策。
stub 的開始計數只證明合成呼叫排序，不證明封包撤回、實際 Calendar 寫入停止或跨程序隔離。
Gate 1 只有在上述正例與拒絕／衝突案例都有 exact-head 合成執行證據、且經 Sol 審查後才可稱完成；不能拿現有 guard 單測或文件 CI 代替。

### 明確的合成續租與 binding（不等於完整 Gate 1）

本輪直接測試先得到既有 34 例通過／新增 18 例失敗，再由同一原型實作至 52／52 通過；其中 current-handle clone 與 stale handle 分開驗證。這是本機執行證據；CI 狀態以 PR 的 exact head 為準。

- 保留四參數建構方式的既有單一硬 deadline 行為；它不取得新的 source-binding／續租證明。
- 可選第五參數由測試明確供給 `workerLease: { sourceBinding, expiresAtMillis }`。複製 primitive 值，不保留可變呼叫者物件；binding 是合成的 opaque 標識，不接 registry 或 Calendar ID，也不在此重定義持久化 binding 的格式規則。
- 既有第三參數仍是不可延長的 configuration hard deadline；額外 worker deadline 必須有限且不晚於它。所有派送開始、結果回傳與交接判斷都同時受兩個 deadline 約束。
- bound 模式的 `admit(lease, segmentId, sourceBinding)` 要求明確且一致的 binding；遺漏或不一致不得取得 admission。既有未綁定模式不擅自獲得 binding。
- `renew(lease, sourceBinding, expiresAtMillis)` 僅是此 coordinator 內、對明確提案的同步原子判斷：必須 active、目前 issued handle、目前仍有效的 clock／兩個 deadline，以及相同 binding。新 worker deadline 僅可嚴格延長且不可超越 configuration hard deadline；不更換 owner、generation、token 或既有 admission。
- 錯誤提案不能改動 deadline、binding 或工作計數；到期／不明 clock 仍沿用 sticky quarantine，不能透過續租復活，draining／quarantine 也不能續租。
- 正反測試涵蓋明確延長、硬上限、錯誤／遺漏 binding、舊／複製 handle、失效提案、到期、closed phase 及呼叫者物件變動。這不建模實際續租取得／遺失回覆、來源 registry 切換或恢復；這些仍是 Gate 1 的未完成證明，不把此增量升格成完整協調或 Gate 2 授權。

## 現有證據與未關閉的窗口

`calendar-pilot-runtime.ts` 的 `withLease` 交易讀取 configuration／job，回傳 closure；
`guardedFetch` 在 closure 執行後才 `fetch`。closure 再看時鐘，**不重新讀取資料庫**。
因此時間已到期可拒絕，但 transaction reply 後 owner／generation 被改掉時仍可能送出一次。

可重現 oracle 位於 `tests/firestore/calendar-pilot-runtime-fencing.test.ts` 的
`documents the non-atomic snapshot-to-dispatch window`：交易回覆後改 owner 或 generation，預期派送 **1 次**。
這是殘餘窗口的文件化，不是嚴格零派送的驗收。#263 及既有 exact-head CI 不可換名當成該承諾已通過。
D-12 activation 的 `copy`、`removeOld` 都使用同一 guarded writer；checkpoint fence 只保護後續資料寫入，
不能把已送出的外部 HTTP 收回。不能只修一般 upsert，漏掉 activation 的 copy／cleanup／重播。

## 必須分開的三個時點

1. **要求變更**：有人要求換來源、關閉或交接，不應立即把舊 generation 當成已安全停止。
2. **派送開始**：唯一 egress owner 將請求交給 transport 的線性化時點；不是先前 DB snapshot 的時間。
3. **新配置生效**：舊 egress 已不可再派送、在途工作已結束或被可驗證地隔離後，才可提交新 generation／owner。

已在合法時點派送的請求，後來超過期限，不能靠事後 fence 假裝從未派送。
若「零派送」包含收回已合法送到 provider 的封包，現有架構沒有這個能力，不能宣稱軟體內再讀一次即可保證。
本提案仍維持：**失效／被取代後的舊 owner 不得開始新派送**，不接受 snapshot 後一次的例外。

## 建議候選：先排空再生效，未知狀態停止而非強制接管

以下設計與純合成原型已在 Gate 1 授權範圍；真實 worker／provider runtime 接入仍待 Gate 2 另核，不是把更多 Firestore check 疊在現有 worker 上。

- 由唯一可驗證的 dispatch admission 邊界統一排序 configuration 變更與所有外部派送。
  一般 worker 仍只讀 outbox／提出派送意圖，不能繞過此邊界直接呼叫 provider；不能把 fencing token 只放進無人檢查的 HTTP 欄位。
- 配置由「active → draining → quiescent → 新 generation active」遞移。
  draining 關閉新 admission；既有 in-flight 工作保留 pending／uncertain，不以 lease 到期直接當完成或遺失。
- 新配置只能在可驗證 quiescent 後生效。先前 worker 的網路寫入能力確實撤回／終止，且沒有可能晚到的未決 admission，才可交接。
  **不能**只憑 heartbeat 消失、lease deadline 或程序自稱 release 就證明此事。
- Admission 至 transport 開始之間也必須與 draining／generation 生效互斥；單純「發一張短效許可」仍有相同窗口，不合格。
- 時鐘是每次 boundary 讀取的可靠單調時間；達 hard expiry 前若不能確保 transport 不再開始，停止 admission 並隔離。
  不擅自延長配置 expiry 或 lease。具體 safe margin／transport bound 若需要數值，須有執行環境證據後另審，不在本文編造。
- crash／網路分割／reply lost 時若不能證明舊 dispatcher 已無派送能力，維持 quarantined，**不自動選新 owner**。
  排隊保留待重試並告警；恢復須有排空／隔離證據，不靠清掉 pending job 解鎖。
- 已派送但結果不明，沿用穩定 event identity 查證／冪等補救，不能直接再次執行不具冪等性的副作用。

### 此候選還必須證明的部分

目前 repository 沒有已證明能同時序列化所有真實 egress 與 configuration writer 的 runtime coordinator；現有純合成模型不補上這個證據。
「唯一 dispatcher」若仍以相同會過期的 DB lease 選主，舊程序仍有網路能力，**並未解決問題**。
在沒有 provider 可驗證 fencing／單一 transport owner 或可證明程序與網路隔離機制之前，本候選不得落地成「已保證」。
Gate 1 的 admission／排空模型已授權；把相應狀態、操作能力接入真實 runtime 仍屬 Gate 2 待核範圍，雲端資源、IAM、migration、部署另要精確授權。

## 最小驗收設計（尚未執行）

| 插入變更的位置 | 必須觀察到的結果 |
| --- | --- |
| DB snapshot 後、transport 前改 generation／owner | 舊 owner dispatch count = 0；不能保留現有預期 1 的 oracle 作成功 |
| token 取得中／DB reply 延遲直到 hard expiry | 不開始派送、job 保留可恢復、不延長設定 |
| configuration 要求變更時已有合法 in-flight | 新 admission 停止；變更維持 draining，不能先宣布新 generation 生效 |
| dispatcher crash／不確定網路結果 | quarantine、待重試保留、無 successor 新派送，直到有 quiescence 證明 |
| activation copy／cleanup 每項、分頁與 checkpoint 之間失去權限 | 無新的外部派送、無 stale checkpoint；只處理相同 source binding／generation 的 receipts |
| 新 owner 可安全生效後重播 | 沒有重複非冪等副作用，不覆寫 successor，不錯刪舊／新日曆投影 |

需要完整 worker＋兩個交錯執行者的 Emulator 測試及可記錄 dispatch 開始時點的 provider stub，
再以 fresh authorised isolated provider packet 驗證實際 transport／隔離與恢復。unit 或 stub 綠燈不能證明 provider 的停止能力。

## 證據與剩餘邊界

本次補齊已授權 Gate 1 的設計與來源／缺口對照，以及現有 coordinator 的最小硬到期／clock 純合成實作與直接測試；**不是整個 Gate 1 合成驗收完成**。
文件檢查與 stub 測試都不會提升成實際零派送 runtime proof。本機重型測試 NOT_RUN（依執行電腦限制交 CI）；
provider／cloud／IAM／migration／部署 NOT_RUN（未授權）。

Gate 1 不再等待選方向，續作上表的最小純合成證明；目前仍是 PROOF-INCOMPLETE。
Gate 2 仍等待負責人核准真實 runtime 接入及具體隔離／恢復機制，不以 Gate 1 的完成代替其授權。
若要降低未知狀態停止的可用性取捨，須另提政策選擇；不得由代理降低零派送承諾。
D-05／D-12 不改 approved，SOL-CALENDAR-LEASE 尚未整包完成；原有修復及 activation receipts 保留，不倒退也不誇大。
