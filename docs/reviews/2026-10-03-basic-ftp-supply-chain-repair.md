# basic-ftp 供應鏈阻擋修復 — 2026-10-03

本次由業主「修」授權，範圍是解除待合併 PR 共用的 basic-ftp high advisory
阻擋。它是來源／供應鏈修復，不是六位驗證功能變更或 runtime 交付驗收。
來源基線為 main `4ccc752e0235b10b9dc8e4b903a149354250fdac`。

## 根因與修復範圍

**CONFIRMED**：修改前 `pnpm audit --audit-level high --json` exit 1，回報
9 moderate、1 high；high 為
[GHSA-c475-qrg2-pj4r](https://github.com/advisories/GHSA-c475-qrg2-pj4r)。
舊 lockfile 的 development chain：

```text
firebase-tools@15.25.0 > proxy-agent@6.5.0 > pac-proxy-agent@7.2.0
> get-uri@6.0.5 > basic-ftp@5.3.1
```

官方 affected 為 `<=6.2.0`，patched floor 為 `6.2.1`。2026-10-03 查詢 registry：
firebase-tools 最新 15.32.1 仍要求 proxy-agent 6.x，get-uri 最新 8.0.1 仍要求
basic-ftp 5.x；升父套件不能排除這筆 advisory。

- `pnpm-workspace.yaml`：新增唯一 parent-scoped override
  `get-uri@6.0.5>basic-ftp: 6.2.1`，附 advisory、path、跨 major 相容性與解除條件。
- `pnpm-lock.yaml`：用 repository 指定 pnpm 11.9.0 生成；只改 override、basic-ftp
  package/integrity/snapshot 及 get-uri edge。其他父套件與 importers 未變。
- `scripts/basic-ftp-compatibility.test.mjs`：兩項回歸測試，沿實際 Firebase CLI
  的五層解析鏈檢查安全版本，並以 loopback synthetic FTP 測 get-uri 的
  MDTM 失敗→MLSD→RETR 及快取不重複下載。
- 本紀錄與 `docs/README.md`：登記修復、驗證及限制。

6.2.1 於 2026-08-27 發布，超過既有 24 小時成熟窗，MIT、CJS、Node >=10、無新
傳遞相依。這是 **5.x→6.x**，不是同 major patch；get-uri 使用的 API 仍存在，
6.x 對不同 PASV data host 的預設拒絕更嚴格。回歸測試涵蓋同 host 的 EPSV、
MLSD、RETR 與 cache；不證明 PASV、FTPS 或 Unix parser 的 CPU 行為。

沒有新增 ignore／audit exception、放寬 gate／成熟窗、刪測試或 dismiss alert。
production audit 仍以 moderate 阻擋，full audit 仍以 high 阻擋。

## 驗證與交付

**Evidence rung：GATE-VERIFIED，限下列本機 audit／文件／格式子 gate。**
完整 supply-chain／compatibility 尚待此修復 PR 的 exact-commit CI。

| Gate | 結果 | 實際證據／限制 |
| --- | --- | --- |
| baseline audit | FAIL | 修復前 exit 1；9 moderate、1 high |
| candidate full audit | PASS | 修復後 exit 0；9 moderate、0 high；basic-ftp findings 0 |
| candidate production audit | PASS | exit 0；所有 severity 均 0 |
| check:audit-exceptions | PASS | 0 ignored advisories；沒有新增例外 |
| compatibility regression / CLI smoke | UNAVAILABLE | 本機 frozen install 在 EPERM 失敗；交由新 CI regression 與 Emulator CLI 啟動驗證 |
| 完整 check:supply-chain / SBOM | UNAVAILABLE | 本機相依未安裝完成；audit 子 gate 已執行，其餘交由新 CI supply-chain／SBOM／attestation job |
| check:format | PASS | 既有 Prettier 3.9.5 direct CLI 全倉庫 check；只排版新增 regression file |
| check:lint | UNAVAILABLE | 本機相依未安裝完成；交由新 CI verify job |
| check:docs | PASS | 265 Markdown files；links/index/lifecycle |
| check:governance | PASS | 既有 AGENTS/INDEX/CLAUDE size advisory；沒有 state drift 或新增 waiver |
| check:structure | PASS | 359 required files；17 reference PNG；clean-clone verify ordering 與 Node floor |
| tracked-secret / diff whitespace / test syntax | PASS | 1173 tracked files；git diff --check；node --check regression |
| 完整 verify／Emulator／E2E／SAST／Gitleaks／Verification evidence | NOT_RUN | 委由此修復 PR 的 exact-commit required CI；沒有沿用其他 PR 綠燈 |
| 合併／部署／runtime／provider 驗收 | NOT_RUN | 本輪是修正 PR，未執行上述動作 |

Windows 原先深層 worktree 的 frozen install 在 package copyfile 出現 EPERM；
改較短 worktree 路徑後仍重現同一錯誤，不能把縮短路徑當成已修環境。
Offline frozen install 因 store 少 tarball 失敗；明確 online frozen install 再次
EPERM 失敗。本機安裝 `FAIL`，完整 gate 執行 venue 改為 required CI。
沒有在 verify/run 中 implicit install，
沒有修改 Node／pnpm 版本或 workspace/global-store policy。

本紀錄自身 commit 不能自我引用，請用
`git log -- docs/reviews/2026-10-03-basic-ftp-supply-chain-repair.md` 查找；分支
`agent/fix-basic-ftp-20261003`。merge commit 不存在，PR／CI URL 見此分支的 GitHub
PR；required CI 成功後才可升為 CI-VERIFIED。

## 產物、剩餘事項與接手第一步

鎖檔 SHA-256：`0d14ef1342a26d1007313d71c6cfdace9eb3971ebfed1b41c1aa4e0389b8a2ec`。
稽核原始 JSON 留在本機交付封存；可攜摘要保存在本文件。SHA-256：

| 本機 artifact | SHA-256 |
| --- | --- |
| basic-ftp-before-audit.json | b74190b4714a5eba2231dfb9a262ad33b90a321754ec9c0f88b7598073f5ad43 |
| basic-ftp-after-audit.json | e5e1df2a17ee440d87f9a96aaa883b96e6324041e2a7448175ee75a420c37f1c |
| basic-ftp-after-prod-audit.json | 900d9ea0d1ce9ac49d48cf93464d615387a38127d6274cca953710802e9d0b4b |

Regression 在舊／新本機依賴上均未能執行，不能宣稱本機 red→green；根因重現使用
baseline audit 的 FAIL，新增測試的執行證據由新 CI 提供。
SBOM／digest／attestation 必須重產並由新 CI 綁定，不能沿用舊 purl 或 digest。
domain vendor 產物不在此次 dependency chain，未修改。

- 修復目標是這筆 high；現有 9 個 development moderate 仍開放，沒有納入本輪或
  宣稱風險已接受。既有 15 項全專案稽核 findings 仍須逐項修復。
- 未解 finding owner：供應鏈維護者；具名 owner 尚未指定。下一個可核准範圍為
  本次 scoped 修復 PR，沒有新 Roadmap 核准或 production 權限。
- 接手第一步：確認本 PR exact head 的 required CI，再依已記錄順序同步 #219／#218、
  #214、#215、#216、#217 到修復後 main，處理重疊 diff，逐支重跑 CI。
- rollback：回退此依賴修復 commit 並用原 lockfile frozen install；會重引入已知
  high，合併 gate 將再次阻擋，不能當成可發布版本。沒有 runtime rollback 步驟。
