# E3-07：共用停寫來源候選（2026-11-02）

狀態：SOURCE-ONLY。依登記簿 2026-10-31 已核准施工；不是新決定、實際維護控制或部署授權。

## 範圍與不變條件

- 沿用 `MaintenanceGate`／既有 503 契約；新增共用 reader、到期判定及在途 callback 計數，不建 operational store。
- control 僅在 `underMaintenance === false`、有效 UTC `expiresAtUtc` 尚未到期時開放；缺值、布林舊格式、讀取失敗或不合法 clock 都 fail closed。
- AppModule 預設改用沒有 reader 接線的共用控制，故非 health 准入預設關閉；合成測試須明確注入假 reader，不由環境變數自動開放。
- API 在 onRequest 記在途、onResponse 結束；abort／timeout 不假定工作已取消，保留未知在途數。既有 health、來源、auth、稽核及快取契約不削弱。
- worker 的實際 run 與排程使用的同一 run 入口先准入再執行；已准入 callback 可排空，未完成前不把在途數報零。
- Calendar worker 的 run 同樣受控，但不啟用 Calendar lease Gate 2，不接新 provider，也不變更既有 lease／scope／合成限制。
- callback 數是單一 process 的來源觀測，不是分散式鎖、provider 取消證明或全域零寫入證明。未知外部效果仍需既有 lease／quarantine 與獨立外證。

## 最小寫入邊界

`packages/domain` 擁有 UTC 狀態判定、reader 契約及純 callback 計數；API adapter 只映射既有 503。
`AppModule`／`createApplication` 提供明確注入；Fastify hooks 覆蓋 guard／handler 執行期間。
`internal-test-outbox-runtime` 與 `CalendarPilotRuntime.run` 使用同一控制類別；排程仍走既有 runtime，不新增排程或外部接線。
現存布林 `ReadThroughMaintenanceGate`／`setMaintenanceControl` 保留相容，但不是新的有效到期控制，亦不能重新開啟預設 gate。

需一併更新：default composition 與 routed 測試、共用假 reader、worker UTC／emulator fixtures、三份維運 runbook、文件目錄。
不改角色、HTTP payload、資料 schema、Firestore Rules、IAM、provider、部署設定、guard 或 CI 門檻。

## 驗證與回復

同 SHA 正反案例涵蓋正常／關閉／未知／到期／無效 UTC／讀取錯誤、多 instance 共讀、排程拒絕、延遲 callback 排空、HTTP abort／timeout 保留未知。
本機只跑 Node 真來源／fake-port 小測；已知 frozen install EPERM 不再重試或修環境。格式、lint、型別、unit、emulator 及完整矩陣由 exact-head CI 執行，不以舊 SHA 綠燈代替。
回復僅為尚未部署的來源 PR 不合併／後續來源 revert；不操作實際控制或還原資料。

## 仍欠外部證據

實際 store、跨 process 原子性、writer inventory、控制權限、所有 instance／worker 接線、排程停用、provider 在途排空與安全恢復都未驗證。
`MAINTENANCE_WRITE_QUIESCENCE = RUNTIME_PROOF_REQUIRED` 不變；來源或 callback 數歸零不能解除 restore／切換的 BLOCKED。
