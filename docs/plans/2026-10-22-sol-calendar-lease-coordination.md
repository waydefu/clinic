# SOL-CALENDAR-LEASE：嚴格零派送的協調設計候選

日期：2026-10-22（Asia/Taipei）。狀態：**DESIGN-PROPOSED／BLOCKED-OWNER＋BLOCKED-EXTERNAL**。
Packet：SOL-CALENDAR-LEASE；findingIDs：D-05、D-12。base：`37c10796d5e8f05a2d7b63b4bda7b7d7e99c6746`。
依據：[#268 保守方向](https://github.com/waydefu/clinic/pull/268#issuecomment-6322342715)、登記 PR #281，
[ADR-0002](../adr/0002-calendar-is-a-projection-not-the-lock.md)、AGENTS Safety Floor 第 3 條。
本文件不是已接受 ADR，不新建服務、不改 schema、不變更 provider／IAM、不授權實作或部署協調架構。

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

這是要另核的架構變更，不是把更多 Firestore check 疊在現有 worker 上。

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

目前 repository 沒有已證明能同時序列化所有 egress 與 configuration writer 的 coordinator。
「唯一 dispatcher」若仍以相同會過期的 DB lease 選主，舊程序仍有網路能力，**並未解決問題**。
在沒有 provider 可驗證 fencing／單一 transport owner 或可證明程序與網路隔離機制之前，本候選不得落地成「已保證」。
是否接受新增 admission／排空狀態與相應操作能力，屬業主待核的架構範圍；雲端資源、IAM、migration、部署另要精確授權。

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

## 證據與業主待決定

本 PR 只有可審設計與索引，證據為來源推論；文件 CI 不會提升成零派送 runtime proof。
本機重型測試 NOT_RUN（依執行電腦限制交 CI）；provider／cloud／IAM／migration NOT_RUN（未授權）。

建議業主核准先研究並實作「排空後生效、無法證明隔離就停止」的 admission 邊界設計，
而不是接受一次窗口；核准後先交出可證明唯一 egress／隔離機制的具體架構與 mock 原型，再核實作範圍。
若不能接受未知狀態停止的可用性取捨，應另提明確政策選擇；不得由代理降低零派送承諾。
D-05／D-12 與 SOL-CALENDAR-LEASE 維持 BLOCKED，原有修復及 activation receipts 保留，不倒退也不誇大。
