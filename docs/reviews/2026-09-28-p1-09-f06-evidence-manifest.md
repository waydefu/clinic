# P1-09 F-06 私有證據清單與缺漏（2026-09-28）

**一句話：** 依 `WP-B6A-2026-09-27` 記錄 9/23～9/24 業主本機 P1-09 證據組的清單，並確認 9/27 證據組已由業主上傳。9/25～9/26 各次執行的私有產物在業主本機與業主的 Drive 都找不到，依 [2026-09-24 交接](2026-09-24-p1-09-unclosed-source-fix-handoff.md#private-evidence-custody-and-access)的規則，這些執行的結果不能直接拿來關帳；Stage F 部分改由[唯讀重建](2026-09-28-p1-09-stage-f-readback.md)補上。`P1_09 = NOT_CLOSED`。

這份紀錄是帶日期的證據，不核准任何事。只記錄檔名、大小、SHA-256 與 UTC 時間，不含內容或連結。

## 證據組狀態

| 證據組 | 內容 | 狀態 |
| --- | --- | --- |
| `P1-09-C1-OPERATOR-RUN-2026-09-27` | [2026-09-27 操作者執行紀錄](2026-09-27-p1-09-c1-operator-run.md)的 16 個檔案 | 業主於 2026-09-28 在對話中確認已上傳；操作者本機副本已刪除 |
| `P1-09-OWNER-LOCAL-2026-09-23` | 下方 14 個檔案，位於業主本機 | 清單已記錄；由業主上傳 |
| 9/25～9/26 各次執行 | Gate 14 runtime、Gate 14／429 重跑、流量切換、監控與回退、Stage F、回診重驗 | **找不到**：業主本機與業主的 Drive 都沒有；宣告 `HISTORICAL_ARTIFACTS_LOST` |
| `P1-09-STAGE-F-READBACK-2026-09-28` | [Stage F 唯讀重建](2026-09-28-p1-09-stage-f-readback.md)的 27 個檔案 | 清單已記錄；由業主上傳 |

## `P1-09-OWNER-LOCAL-2026-09-23` 清單

範圍是業主本機暫存資料夾中檔名以 `p1-09`／`P1-09` 開頭的檔案。同一位置另有兩個資料夾，不列入：一個是 Node 執行環境，一個是 `p1-09-web-dist-caaa69e-20260923.tgz` 的解壓內容。

| 檔名 | 大小（bytes） | SHA-256 | UTC |
| --- | --- | --- | --- |
| `P1-09-20260923-execution-ledger.md` | 56877 | `76fe8d14043e3354652def795b0db13e14af86da4480e6b7b3d8100c187ac8ae` | 2026-09-24T11:44:21Z |
| `p1-09-c1-bootstrap-rest-20260923.mjs` | 6404 | `25b76679e233e56ec1ff8f73c51e962ee1d1ec2cea9e709efdf3ef2120f0a892` | 2026-09-23T03:04:53Z |
| `P1-09-C1-exact-SHA-approval-packet-20260924.md` | 17876 | `8b93937be9b4cad76b8b268e5887d08a144a1ed29772b84b3c62768c006441b7` | 2026-09-24T14:49:27Z |
| `p1-09-c1-patient-seed-20260923.mjs` | 6837 | `8c3fa5e09c077f199c7499d8fb88f080c95f1d7c74feb509a65e3d293ac06f38` | 2026-09-23T03:07:12Z |
| `p1-09-human-alert-correlation-20260923.md` | 1304 | `0a55ad6b64e6b221b43983b2ee76e84257bc3331d3c38d1ace79f3c207cbeaff` | 2026-09-23T02:46:14Z |
| `p1-09-post-attribution-20260923.tfplan` | 37086 | `b77bb3be5b149599fc2eac9f817f9591379e7dd26e53ec2bd42132fa7ba5e319` | 2026-09-23T12:42:24Z |
| `p1-09-source-caaa69e-20260923.tar.gz` | 41750028 | `bf282e7ee45f919899b7f17889baa21a6773c84c5184c673e985936b37ab0c40` | 2026-09-23T12:05:30Z |
| `p1-09-stage1-20260923.tfplan` | 35722 | `3d92df04eb5823a7c239edd27300a00a047a8ceda9e36532f701acd49205f374` | 2026-09-23T02:22:40Z |
| `p1-09-stage1-20260923.tfvars` | 1461 | `32c8f3d7d1b897b21c267cc64c48b50f84b76f70f9034fb95db223177ce529eb` | 2026-09-23T02:21:33Z |
| `p1-09-stage2-20260923.tfplan` | 34720 | `8be4d3fd19ad4256dd362a610251f50ce624d7484d361889bb885a1795a565e9` | 2026-09-23T03:32:49Z |
| `p1-09-stage2-preview-20260923.tfvars` | 1450 | `11b74f5a15d205bffb6dcabc6ac3334abc2e19c739ec98385750348a79fce595` | 2026-09-23T02:33:41Z |
| `p1-09-stage-f-evaluate-20260923.mjs` | 3321 | `c9dfa8e323bfda25bbcc3427795f443bb861bce5117d3e12b3615b8d2eb33de1` | 2026-09-23T02:41:21Z |
| `p1-09-web-build-20260923.yaml` | 671 | `7a42011799ab334e66c53095dec2d279502567fe0a6a3178309ea8d1388bc704` | 2026-09-23T12:04:52Z |
| `p1-09-web-dist-caaa69e-20260923.tgz` | 393513 | `a46a027857d4da5aeb9e568ea46abb8b1212b4f396d05988750b24d9061af233` | 2026-09-23T12:09:54Z |

製作清單時只計算雜湊，沒有開啟檔案內容。

## 找不到的證據對關帳的影響

9/25～9/26 的紀錄（[Gate 14 runtime](2026-09-25-p1-09-gate-14-runtime-result.md)、[Gate 14／429 重跑](2026-09-26-p1-09-gate-14-429-rerun.md)、[流量切換](2026-09-26-p1-09-traffic-cut.md)、[監控與回退](2026-09-26-p1-09-monitoring-and-rollback.md)、[Stage F](2026-09-26-p1-09-stage-f-run.md)、[回診重驗](2026-09-26-p1-09-follow-up-rerun.md)）只剩 repository 裡的摘要，沒有可查的原始產物。依 2026-09-24 交接的規則，證據拿不到時，就視為該 gate 缺少證據，要建立新的證據組，不能從摘要或雜湊推定 PASS。因此：

- **Gate 17（G）：** 沒有 11 個案例的原始產物可以餵給 Stage F evaluator，需要新的證據組。同日業主以 `WP-B6B-2026-09-28` 決定：這個 gate 的新證據組可以用唯讀讀回 C1 現存紀錄的方式建立，結果見 [Stage F 唯讀重建](2026-09-28-p1-09-stage-f-readback.md)。
- 那幾份紀錄描述的程式修正（例如 #170、#177／#178）仍然有效，因為它們有原始碼、測試與 CI 可查；缺少的只是當時部署環境實測的原始產物。

## F-06 狀態

`PARTIALLY_DELIVERED`：9/27 證據組已上傳；9/23～9/24 證據組清單已記錄，待業主上傳；9/25～9/26 各次執行的原始產物宣告 `HISTORICAL_ARTIFACTS_LOST`，由 `P1-09-STAGE-F-READBACK-2026-09-28` 取代，待業主上傳。
