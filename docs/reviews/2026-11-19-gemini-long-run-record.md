# 2026-11-19 Gemini 長跑紀錄：CI 解鎖、calendar-sync、取消畫面、權限收斂

Claude 額度將盡，11/19 把工作交給 Gemini：neon 當主代理（切包、驗收、合併），hydrogen 施工。交接檔放在 repo 外（含私有窗口位置），不提交。負責人當天核准兩件事：改 CI 規則（不登記 picomatch 例外），以及「CI 綠就合」。權限類 PR 例外，要等負責人。11/20 由 Claude 逐項核對後記錄於此。

本紀錄是事後證據，不核准任何雲端動作。

## 結果

| 包 | PR | 合併 commit | exact head／CI | 內容 |
| --- | --- | --- | --- | --- |
| ① CI 開發依賴稽核 | #531 | `575dc211` | `e42e9e71`／16 綠 | `audit:all` 改跑 `scripts/audit-dev-fixable.mjs`：正式依賴 high／critical 一律擋；開發依賴有已發布修補版才擋，上游沒修補版只印警告；掃描或 registry 異常一律擋。`audit:prod` 與 `security/audit-exceptions.json` 不動 |
| ② 11/18 窗口報告 | #530 | `eea135ec` | `0c51c90e`／13 綠 | 純文件 |
| ③ calendar-sync 500 | #532 | `232adf71` | `8e0fd6bd`／16 綠 | 唯讀查 C1 日誌：11/18 15:43:50Z `/live` 通過後約 20 秒容器結束，stdout／stderr 0 筆、記憶體監控 0 sample。補上防止同步拋錯炸掉進程，並加不含個資的結構化日誌。**根因未證明**（`NEEDS-RUNTIME-REPRODUCTION`），要下次開窗用新映像重跑 |
| ③-B 設定檔空值 | #533 | `f2a34a62` | `5b8407ca`／17 綠 | C1 的 `calendar_pilot_configuration/active` 與 bootstrap 腳本都存 `previousSourceId: null`，契約 schema 不接受 null，下次開窗必回 503。補 `.nullable().optional()`、讀取邊界正規化與回歸測試 |
| ④ 取消後畫面誤報 | #534 | `e1869b81` | `107389d5`／14 綠 | C1 日誌實證：取消請求遇 API 冷啟動 10.2 秒，伺服器 11.61 秒後回 201 成功，但前端 10 秒逾時，顯示「服務暫時無法使用」且跳過重繪。內測 HTTP client 逾時改 30 秒（只限內測 client，不是測試 timeout）；逾時後唯讀回查 `GET /bookings/:id` 收斂，`finally` 確保列表刷新 |
| ⑤ 盤點 #518／#519／#522 | — | — | — | 只回報：#518 落後 main 14、上次 CI 全綠；#519 落後 21，CI 紅在 `check:perf`（`/index.html` 10.2 KiB 超過 10 KiB 預算）；#522 落後 16、上次 CI 全綠 |
| ⑥ 清 worktree | — | — | — | 移除 146 個「已合併且乾淨」的 worktree（`git worktree remove`，非資源回收筒）。8 個因 Windows 路徑過長只刪一半，已不在 `git worktree list`，資料夾殘留 |
| ⑦ B-01／B-02／NEW-10 | #535 | `1cd3af92` | `af23ab76`／13 綠 | 只改 Terraform 原始碼與測試。B-02：WIF provider 加 `attribute.workflow_ref`，GitHub 綁定改由 `github_wif_binding_enabled`（預設 false）控制，預設 0 筆。B-01／NEW-10：`c1-foundation` 拿掉 CI 帳號的 `projectIamAdmin` 與專案層 `storage.admin`，`projectIamAdmin` 列入永久禁止；`c1-internal-test-run` 拿掉專案層 `iam.serviceAccountUser`，改綁在 4～5 個本模組 runtime 服務帳號上。負責人 11/20 核准後由 Claude 合併 |

雲端全程唯讀，只用 C1；沒有部署、apply，也沒改 IAM、金鑰、排程或 Firestore。

## Claude 核對（11/20）

- 合併順序與 head 和回報一致；#535 合併前 head `af23ab76`、`CLEAN`、13 項全綠。
- #531：`pnpm-workspace.yaml` 只改註解，沒有新增 `ignoreGhsas`；`check-structure` 只是登記新腳本。
- #534：逾時常數 `INTERNAL_TEST_HTTP_TIMEOUT_MS = 30_000`，只用在內測 client。交接規則寫「不加大 timeout」，本意是指測試；這是產品端修正，判定可接受。
- 沒有逐行審 #532、#533、#534 的全部 diff，只抽查高風險段落。

## 未做／未證明

- calendar-sync 11/18 那次 500 的真正原因：NOT_RUN，要開窗重現。
- C6 同步收斂與衝突（窗口計畫 2.3、2.4）：NOT_RUN。
- #535 的雲端套用，以及不在 Terraform 內的 NEW-10 雲端項（預設 compute 與 Cloud Build 帳號對 tfstate bucket 的 `storage.objectAdmin`）：未做，要負責人的 IAM 窗口。
- 本機 `pnpm install` 在新 worktree 遇到 pnpm store 權限錯誤（`ERR_PNPM_EPERM`），所以本輪完整驗證都靠 CI。

## 下次開窗要注意

- #532、#533、#534 改了程式，要從新的 main 重建 api、worker、calendar-sync 映像，並更新 `api_source_sha`／`worker_source_sha`。
- #535 合併後，`c1-internal-test-run` 的 plan 會多出 IAM 變更：移除 1 筆專案層 `iam.serviceAccountUser`，新增 4～5 筆服務帳號層綁定。plan 裡要逐筆認出來，再加上已知的排程 `max_doublings` 差異。
- `c1-foundation` 的變更（CI 帳號降權、WIF 綁定歸零）要另外 plan／apply，屬 IAM 變更，需負責人逐項核准。

## 對 agent 流程的觀察

- 主代理＋施工子代理照工作包推進，一天合了 6 個 PR，順帶抓到一個必現缺陷（#533）。
- 兩點偏離交接檔字面：worktree 用永久刪除而不是資源回收筒；改了一個產品端逾時。下次交接檔要寫清楚：「只刪 Git 已登記的 worktree，用 `git worktree remove`」是否允許，以及「timeout 禁令只限測試」。
- 這份文件不能引用自己的 commit，請用 `git log -- docs/reviews/2026-11-19-gemini-long-run-record.md`。
