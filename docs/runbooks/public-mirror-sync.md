# Runbook：公開鏡像同步

**狀態：可重複執行的操作程序。** 本文件把
[公開鏡像發布紀錄](../reviews/2026-07-29-sanitized-public-mirror-publication.md)
的八步關卡，補上執行時真正需要的判斷依據：鏡像到底是什麼、檔案要經過什麼轉換、
哪些東西公開端會直接拒絕，以及每一類檔案的預設處置。

寫這份文件的原因：2026-08-01 第一次執行同步時，前六步全部卡在「這個檔案到底該不該
搬」，而那些判斷每一次都要重新推導一遍。**判斷依據沒有寫下來，就等於每次同步都要
重新發現一次。**

## 1. 鏡像不是私有版的副本

這是最容易搞錯的一點，先講清楚，後面所有判斷都由它推導。

| 類別 | 鏡像裡的狀態 | 因此 |
| --- | --- | --- |
| 原始碼（`apps/`、`packages/`） | 同一份程式碼，**中文註解整段移除** | 同步 = 私有版內容套用「移除中文註解」轉換 |
| `README.md`、`CONTRIBUTING.md`、`SECURITY.md`、`NOTICE.md` | **獨立撰寫的公開文件**，不是私有版的衍生物 | **沒有「同步」這回事**。要問的是「公開文件本身需不需要更新」 |
| 設定檔（`package.json`、`pnpm-workspace.yaml`、`vitest.config.ts`…） | 精簡過的子集，只保留公開端用得到的項目 | 逐項判斷，不整檔覆蓋 |
| `scripts/` | 只有兩支：`check-tracked-secrets.mjs`、`check-public-safety.mjs` | 私有端其餘腳本不存在於公開端 |
| `.github/workflows/` | 公開端自己的 `verify.yml` 與 `codeql.yml` | 私有端的 workflow 變更**預設不同步** |

### 1.1 兩邊合理分歧之處，不得「對齊」

| 項目 | 私有端 | 公開端 | 為什麼不能同步 |
| --- | --- | --- | --- |
| SAST | Semgrep（`sast.yml`） | **CodeQL**（`codeql.yml`） | 私有端改用 Semgrep 的唯一理由是個人私有 repo 無法上傳 code-scanning 結果。公開 repo 沒有這個限制，且 `CodeQL` 是公開端的必要檢查。把私有端的刪除同步過去，等於用一個不適用的理由拆掉公開端唯一的深度掃描 |
| 套件別名 | `@beauessence/*` | `@appointment-platform/*` | 品牌名是公開端明文偵測並拒絕的字串 |
| 相依範圍 | 含 `firebase-tools` 等 CLI 工具鏈 | 不含 | 針對 CLI 傳遞相依的 override 在公開端沒有對應套件，搬過去是死設定 |
| 治理文件 | `docs/`、`AGENTS.md` | **完全不存在** | 見 §2 硬性拒絕 |

## 2. 公開端的硬性拒絕（`scripts/check-public-safety.mjs`）

這些不是慣例，是公開端 CI 會擋下的規則。判斷任何檔案前先過這一關：

**路徑層級直接拒絕**

- `apps/web/`、`docs/`、`infra/`、`.claude/`、`output/`、`test-results/`
- `AGENTS.md`
- 所有二進位副檔名（圖片、影片、Office 文件、壓縮檔、PDF…）

**內容層級偵測器**

| 偵測項 | 樣式 |
| --- | --- |
| 原始品牌名 | `beauessence`（不分大小寫） |
| 決策編號 | `D-###` |
| 台灣手機 | `09XXXXXXXX` |
| 台灣身分證 | `[A-Z][12]XXXXXXXX` |
| 本機絕對路徑 | `C:\Users\…`、`/home/…`、`/Users/…` |
| 私人信箱網域 | gmail／hotmail／outlook／yahoo |
| 受管預覽網址 | `.web.app`、`.firebaseapp.com` |

**實務推論**：任何提到決策編號、核准狀態、內部文件路徑或診所名稱的段落，**一律
不可能通過**。私有端的 `README.md` 與治理相關文字因此永遠不是同步候選。

## 3. 預設處置表

每次同步先用這張表分類，只有落在「需判斷」的才需要人為決定。

| 檔案類別 | 預設處置 |
| --- | --- |
| `packages/**`、`apps/api/**` 的邏輯變更 | **同步**，移除中文註解 |
| `pnpm-lock.yaml` | **同步**，它攜帶相依安全修補 |
| `pnpm-workspace.yaml` 的 override | **逐項**：公開端有該套件才搬 |
| `auditConfig` 例外 | **不同步**。公開端有自己的 Dependabot 與稽核策略 |
| `scripts/check-tracked-secrets.mjs` | **同步**，兩邊共用同一支 |
| 私有端獨有腳本 | **不同步** |
| `vitest.config.ts`、`eslint.config.mjs` | **逐項**：設定所指的路徑在公開端存在才搬 |
| `package.json` 的 `scripts` | **逐項**：對應腳本存在才搬 |
| `package.json` 的相依版本 | **同步**，公開端也有該套件時 |
| `.github/workflows/**` | **不同步** |
| `README.md`、`CONTRIBUTING.md`、`SECURITY.md`、`NOTICE.md` | **不同步**。改為判斷公開文件本身是否需要獨立更新 |
| `docs/**`、`AGENTS.md`、任何二進位檔 | **不同步**，公開端會擋 |

## 4. 執行步驟

完整的八步關卡見
[發布紀錄](../reviews/2026-07-29-sanitized-public-mirror-publication.md)。本節只補
執行細節。

1. **定義 allowlist**：用 §3 分類私有端自上次同步基準以來的變更，把「需判斷」的
   逐項裁決並記錄理由。
2. **全新 clone 公開鏡像**，在隔離目錄套用 delta。永不推送、fork 或嫁接私有 commit。
3. **逐行審查**每一個改動，對照 §2 的偵測項。
4. 在公開端執行 `corepack pnpm verify`
   （密鑰、public-safety、格式、建置、lint、測試）與兩道 audit。
5. **gitleaks 與 trufflehog 掃描完整公開歷史**。
   本機路徑含非 ASCII 字元時，trufflehog 的 `file://` URL 會解析失敗，需先用
   `subst` 對應一個 ASCII 磁碟代號，用完移除。
6. **另一個乾淨目錄再 clone 一次**，複驗 commit／tree／refs 與全部掃描。
7. 以 GitHub noreply 身分 commit，開公開 PR，`Public verification` 與 `CodeQL`
   皆通過後 **squash merge**。**這一步每次都要取得 repository owner 明確同意。**
8. 把重大範圍或控制變更記進新的日期化 review。

### 4.1 掃描器

| 工具 | 版本 | 取得方式 |
| --- | --- | --- |
| gitleaks | 8.30.1 | winget `Gitleaks.Gitleaks` |
| trufflehog | 3.96.0 | 官方 release，須比對發布的 SHA-256 |

私有端的 `gitleaks.toml` 以**值的樣式**豁免契約測試裡的合成冪等鍵。變更 allowlist 後
必須重新驗證它沒有過寬：植入一個真實形狀的憑證，確認仍被抓到。

## 5. 停止條件

以下任一情況**停止發布，候選版本維持私有**：

- 任何掃描器未安裝、未執行或結果無法解讀；
- 公開端 `check:public-safety` 有任何 finding；
- 候選 delta 含有 §2 的任一偵測樣式；
- 對某個檔案是否該公開存有疑義——**疑義本身就是停止條件**，不是討論題目；
- 未取得 owner 對該次公開推送的明確同意。
