# SOL-INTEGRATION 讀回（2026-11-25）

**類型：日期證據。** 本文件記錄 SOL-INTEGRATION 封包（D-40、E3-12、E4-02、E4-04、E4-13、E4-01、E4-03、E4-12）
在 main `826cf0d74b11c59495334bcfbe80f58fee47dcd5` 之上的處理結果。它不核准部署、apply、真實資料或任何
D-series 決策；沒有執行任何雲端操作。證據層級為 `CODE-ONLY`（本機未安裝依賴、未執行測試），
測試與文件檢查由本 PR 的 exact-head CI 判定，CI 結果以 PR 上的 check 為準，不在此預填。

規則：需要 11/26 C1 凍結窗口實測的項目一律標為「11/26 開窗實測」，不寫成 PASS。

## 結果總表

| Finding | 類型 | 結果 | 證據路徑 |
| --- | --- | --- | --- |
| D-40 | 文件 | 已加歷史標示；原始紀錄與數值未動；無新增現況宣稱 | `docs/implementation/phase-1-booking-mvp-execution-log.md`（檔頭附註） |
| E3-12 | 文件 | 已加逐能力四層表（決策／實作／同版本證據／部署授權）；舊文原樣保留 | `docs/reviews/phase-1-approval-gate.md`（檔頭附註） |
| E4-02 | 文件 | 已加 dashboard 與 canonical scope 對照，並標明兩張 dashboard 為 2026-08-11 快照；live gate 例外未移動 | 同上 |
| E4-04 | 程式（僅測試） | 現行 main 的 transport 對 API 5xx／401／403／網路失敗已會拋錯，不會變成空清單（既有測試）；本 PR 補上「伺服器清單取代不一致的本機 appointments」與「timeout 不偽裝成空清單」兩個合成測試。未改產品程式碼。測試結果待 CI；runtime 顯示未驗：11/26 開窗實測 | `apps/web/public/modules/internal-test-booking-transport.js`（`listBookingPages` 不吞錯）；`apps/web/src/internal-test-booking-transport.test.ts` |
| E4-13 | 文件（已知限制） | 委派 lockout 仍為 InMemory 且未接線；已記為已知且接受的限制，未接線、未改 auth／RBAC | `docs/architecture/rbac-matrix.md`（3.1 節 ※ 後的限制註記） |
| E4-01 | 文件 | 舊 PASS 加範圍更正；列出限流與防枚舉的 exact-source、負向案例測試路徑與 current-main CI 指標。真實入口下來源 IP 歸因與現行部署版 runtime 限流：11/26 開窗實測 | `docs/reviews/2026-10-02-full-project-audit.md`（後續更正）；`docs/reviews/2026-09-26-p1-09-handoff.md`、`docs/reviews/2026-09-28-p1-09-closeout.md`（檔頭附註） |
| E4-03 | 文件 | 已寫關帳鏈：PR #238 合併 commit 為 main 祖先、負向案例測試路徑、#238 合併 commit 與 current main 的 `verify` run；不公開私有 manifest。部署後身分隔離 runtime：11/26 開窗實測 | `docs/reviews/2026-10-05-aud01-identity-isolation.md`（關帳鏈核對）；`docs/reviews/2026-10-04-audit-closeout-handoff.md`（檔頭附註） |
| E4-12 | 文件 | 日期 PASS 與 current-main 判斷分開，以更正附註呈現；原文未改 | `docs/reviews/2026-10-02-full-project-audit.md`（後續更正）；`docs/reviews/2026-10-04-audit-closeout-handoff.md` |

## 各項說明

**E4-04（唯一的程式相關項目）。** 在 `internal-test-booking-transport.js` 的 `/state` 覆蓋路徑中，
`/v1/slots`、`/v1/schedule`、`/v1/bookings` 任一讀取失敗都會向上拋出，既有測試已涵蓋 401／403／503／網路失敗。
`patient-app.js` 在讀取失敗時清空 appointments 並標示資料未就緒，而非顯示成合法空清單。
僅 `refreshPublishedOccupancy` 與寫入後 occupancy 重讀失敗時把 `slots` 設為空，這是 fail-closed
（沒有可預約時段），不是偽裝的空預約清單，故不需改程式碼，修改量為 0 行產品程式碼，
沒有觸碰 auth 或 RBAC。新增測試只用合成資料。

**E4-13。** 依封包指示不接線。限制已寫入 RBAC 矩陣：目前沒有已部署的委派 lockout 可被稱為跨 instance
或重啟後仍有效的控制；日後若獲准接線，須先補並行、跨重啟持久、失敗上限與 audit 測試。

**E4-01／E4-03／E4-12。** 皆為 append-only 更正。舊 PASS 與舊 `EXACT-CI-PENDING` 原文保留。
current-main 指標：main `826cf0d7` 的 `verify` run `45541626196` success；#238 合併 commit `9e082f6e`
的 `verify` run `37291773264` success。這些只是 source／CI 層級證據。

## 仍待 11/26 C1 窗口（不是 PASS）

1. 11/26 開窗實測：現行部署版的限流與防枚舉 runtime 行為（E4-01）。
2. 11/26 開窗實測：現行部署版的身分上下文隔離 runtime 行為（E4-03）。
3. 11/26 開窗實測：workbench 在 API 失敗時的實際畫面（E4-04，目前只有單元測試與原始碼證據）。

## 未做與邊界

- 未修改 `infra/terraform/**`、`.github/workflows/**`、決策登錄、任何 gate、auth、RBAC、IAM、共用 schema 或 migration。
- 未使用真實資料；未讀取 secret。
- 本檔的 PR 與 CI 編號不自我引用，請由 PR 頁面查看。
