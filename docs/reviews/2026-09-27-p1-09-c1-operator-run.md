# P1-09 C1 操作者執行紀錄（2026-09-27）

**一句話：** 業主在場並授權，本 session 以業主帳號執行了追加額度中的 B、E1、A、C、D，五項都達到判定標準。E2 觸發停止條件未執行，I、G 未執行。`P1_09 = NOT_CLOSED`。

這份紀錄是帶日期的證據，不核准任何事。核准範圍見
[P1-09 關帳追加額度核准](../plans/2026-09-27-p1-09-closeout-quota-approval.md)。
完整紀錄與證據依 `WP-B6A-2026-09-27` 交由業主存放在私有資料夾；
repository 只保留下方的[私有證據清單](#私有證據清單)。

## 授權與操作者

- 業主在對話中指定本 Claude Code session 為操作者，以業主帳號的 gcloud 與 ADC 身分執行，業主在場。這偏離 `CLAUDE.md`「把指令交給使用者執行」的程序，是業主明確做的決定。`terraform apply` 前另取得業主對已審 plan 的確認；PR 由業主本人合併。
- Gate 00：`c390c9e` 之後唯一的非文件變更是 `0f48d4d` 新增的單元測試，業主同意以 `b857749` 繼續。#186 合併後，業主同意 A 改綁 `d2af163`。
- 所有 C1 變更都在 2026-09-27 14:31Z～15:33Z 之間，早於 `2026-09-30T10:00:00Z`。

## 結果

| # | 驗收列 | 結果 | 摘要 |
| --- | --- | --- | --- |
| B | P09-03 IAM 唯讀審查 | PASS | 沒有服務帳號持有 owner 或 editor；每個 secret 只有對應的執行身分可讀，且以數字版本掛載 |
| E1 | SEC-14 CSP 讀回 | PASS | 部署環境的 CSP 不含 staging 來源 |
| A | P09-02 run stack 對帳 | APPLIED | 先以 #186 修正單一版本戳記；plan 為 0 add／4 change／0 destroy，只有 gcloud metadata 與排程 `max_doublings`；只套用已審的 saved plan；流量、image、env 讀回不變 |
| C | P09-10 同 key 並發 | PASS | 同一 key 同時送 5 次：5 個位元組相同的 201，Firestore 預約與 outbox 各只多 1 筆，outbox 處理 1 次；之後業主在 Workbench 取消 1 次 |
| D | SEC-13 gate 關閉與過期 | PASS | 兩個 0% 流量的探測 revision 各送 1 次寫入請求，都回 503；探測 tag 已移除，正式流量不變，Firestore 沒有寫入 |
| E2 | SEC-14 停用員工 | NOT_RUN | 員工白名單沒有合成帳號，觸發「涉及任何非合成帳號」停止條件 |
| I | OPS-06（選做） | NOT_RUN | 需要帳單帳戶等輸入 |
| G | Gate 17 Stage F evaluator | NOT_RUN | 需要私有 runner |

## 後續要注意的事

1. A 的 apply 讓三個服務各多了一個 0% 流量的 revision，image 與 env 都和現行版本相同，流量沒有移動。
2. inbound 排程的 `max_doublings` 無法設成 0：Cloud Scheduler 把 0 當作未設定而套回預設值，所以這個差異每次 run stack plan 都會出現。這個排程的重試間隔上下限相同，行為不受影響。要消除它需要另一個原始碼 PR。
3. D 之後，API 服務範本是探測設定。依[核准文件的 D 項注意事項](../plans/2026-09-27-p1-09-closeout-quota-approval.md#核准的-c1-變更)，任何 Hosting 部署前都要先核對 `/v1/**` 指向；下一次 run stack plan 也會看到對應的差異。
4. C 的合成日曆事件數是由 outbox 推論（事件 ID 由預約決定，只有一次 projection），沒有直接讀回日曆。
5. E2 要完成，需要先建立並登記一個專用的合成員工帳號。

## 私有證據清單

證據組 `P1-09-C1-OPERATOR-RUN-2026-09-27`。依 `WP-B6A-2026-09-27` 交由業主上傳，本紀錄提交時尚未上傳。這裡只記錄檔名、大小、SHA-256 與 UTC 時間，不含內容或連結。

| 檔名 | 大小（bytes） | SHA-256 | UTC |
| --- | --- | --- | --- |
| `a-apply-output.txt` | 2311 | `8aec05cdb99a91df6ab2a9a5918deea0655d4500b5295af731a12ff7968c476d` | 2026-09-27T15:50:19Z |
| `a-plan-output.txt` | 13096 | `397c9973bdeb92b38bd6112fbe426596502d620a9c4f637af3712173dcfc99fa` | 2026-09-27T15:50:18Z |
| `a-private.tfvars` | 1738 | `0695389c0924f490e17be6c8dc8c51ab7c0357ba620d76b28e0cb868c03b4a63` | 2026-09-27T15:50:19Z |
| `a-run.tfplan` | 40590 | `ad1c5d3fabfc6b94a6fab87ef1ffc33709b5dcde8d51cdeec1dceebd0c65b6ed` | 2026-09-27T15:50:18Z |
| `c-request-body.json` | 276 | `debdcdb5b5b6f075ea33ff23a6aafe695c6eb0306d60afce542f0e1ae7a06646` | 2026-09-27T15:50:19Z |
| `c-response-1.json` | 147 | `f2b0136e2687ad99d033da9347a2e2c7019096b6ff2ab89eb3d671a418de3d11` | 2026-09-27T15:50:19Z |
| `c-response-2.json` | 147 | `f2b0136e2687ad99d033da9347a2e2c7019096b6ff2ab89eb3d671a418de3d11` | 2026-09-27T15:50:19Z |
| `c-response-3.json` | 147 | `f2b0136e2687ad99d033da9347a2e2c7019096b6ff2ab89eb3d671a418de3d11` | 2026-09-27T15:50:20Z |
| `c-response-4.json` | 147 | `f2b0136e2687ad99d033da9347a2e2c7019096b6ff2ab89eb3d671a418de3d11` | 2026-09-27T15:50:20Z |
| `c-response-5.json` | 147 | `f2b0136e2687ad99d033da9347a2e2c7019096b6ff2ab89eb3d671a418de3d11` | 2026-09-27T15:50:20Z |
| `d-request-body.json` | 274 | `aaaa132d85c5241a72f8804c0ba71e986a52bee2f8b82e948b45054a47131999` | 2026-09-27T15:50:20Z |
| `d-response-gateexp.json` | 153 | `b90160187c85c32f295547fed5160b06d0b0ef8c604b2b438b36daa34dc1b34a` | 2026-09-27T15:50:21Z |
| `d-response-gateoff.json` | 153 | `947c9cb0eab0d86b5847f42bc33a8dea11bb41759a7a0990e892cd374613a81b` | 2026-09-27T15:50:20Z |
| `record-full.md` | 8409 | `8cc9fb1ca45fc93517612cbb1b371e9a390856bdafca050a69de537668ab9c19` | 2026-09-27T15:51:00Z |
| `tool-firestore-count.sh` | 1172 | `209590eea6614b24d90453cc37c36e99010baa1b3f7778a6e16005c96144a031` | 2026-09-27T15:50:21Z |
| `tool-outbox-readback.mjs` | 1874 | `50d8460d23a3890c6433cd81ec17c3083976520fc1608809a58fa8d04b4a5b98` | 2026-09-27T15:50:21Z |

五個 `c-response-*.json` 的 SHA-256 相同，對應 C 的「回應位元組相同」。

## 關帳狀態

`P1_09 = NOT_CLOSED`。還缺：

1. E2：需要合成員工帳號。
2. G：Stage F evaluator 在私有 runner 重跑。
3. F-06：上方證據組要實際上傳完成，並補齊先前各次執行的證據清單。
4. H：以上全部 PASS 後才寫關帳 PR。

追加額度的時窗到 `2026-09-30T12:00:00Z`；預約 gate 在 `2026-09-30T10:00:00Z` 到期。時窗內沒做完的項目要重新申請。
