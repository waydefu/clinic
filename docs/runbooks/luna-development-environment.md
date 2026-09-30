# Luna 開發環境與額度使用流程

**範圍：** 本機／雲端開發、合成資料、原始碼 PR。這份手冊不授權部署或使用雲端帳號。
工作包仍依 [2026-09-30 執行計畫](../plans/2026-09-30-luna-execution-plan.md)。
本次狀態見 [環境修復交接](../reviews/2026-09-30-luna-environment-readiness.md)。

## 1. 先固定工具，再執行工作包

從專案根目錄確認版本；版本來源是 `package.json`、lockfile 與 CI，不能自行改成 latest。

```bash
node --version                       # >=24.20.0 <25；CI 使用 24.20.0
corepack --version                   # 本次環境使用 0.34.6
corepack pnpm --version              # 11.9.0
java -version                        # Firebase 15 emulator 使用 Java 21+
```

已有 Node 版本管理器時用它切換到 24.20.0。沒有時，可從允許的 npm registry 安裝
npm 上的 Node Linux binary package 到使用者目錄；不要改寫平台管理的 `/opt` runtime。
下列步驟適用 Ubuntu x64／arm64，安裝目錄不能已有另一套待保留的 Node。

```bash
case "$(uname -m)" in
  x86_64) node_arch=x64 ;;
  aarch64|arm64) node_arch=arm64 ;;
  *) echo '請使用該平台的 Node 版本管理器'; exit 1 ;;
esac
node_bootstrap=$(mktemp -d)
npm install --prefix "$node_bootstrap" --ignore-scripts --no-audit --no-fund \
  --package-lock=false "node-linux-$node_arch@24.20.0"
mkdir -p "$HOME/.local/share/clinic-tools/node-v24.20.0/bin" "$HOME/.local/bin"
cp "$node_bootstrap/node_modules/node-linux-$node_arch/bin/node" \
  "$HOME/.local/share/clinic-tools/node-v24.20.0/bin/node"
ln -s "$HOME/.local/share/clinic-tools/node-v24.20.0/bin/node" "$HOME/.local/bin/node"
export PATH="$HOME/.local/bin:$PATH"
node --version
```

讓 shell 啟動檔保留上述 PATH；若 `.profile` 已加入 `~/.local/bin`，不用再改。
Corepack 缺少時，在使用者目錄安裝 `corepack@0.34.6`：

```bash
corepack_root="$HOME/.local/share/clinic-tools/corepack"
npm install --prefix "$corepack_root" --ignore-scripts --no-audit --no-fund \
  --package-lock=false corepack@0.34.6
export PATH="$corepack_root/node_modules/.bin:$PATH"
corepack pnpm --version
```

讓 shell 啟動檔保留新增的 Corepack PATH。
新 shell 必須再確認 `command -v node` 和版本，不能只依賴某次指令的暫時 PATH。

## 2. 依賴安裝要明確

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm exec node --version
corepack pnpm exec firebase --version
corepack pnpm exec playwright --version
```

`enableGlobalVirtualStore: false` 讓依賴留在工作目錄，與專案既有安裝方式一致。
`verifyDepsBeforeRun: error` 讓過期安裝直接報錯；`run`／`exec` 不會偷偷重裝。
遇到 `ERR_PNPM_VERIFY_DEPS_BEFORE_RUN`，先核對 Node、pnpm、workspace／lockfile，
再明確跑 frozen install。不要用 `warn`／關閉檢查來隱藏差異。

若既有 `.modules.yaml` 的 `storeDir` 不同，先確認該 store 確實存在，再把它的
版本目錄父層傳給 `--store-dir`。本次雲端既有 store 是 `/tmp/clinic-pnpm-store/v11`，
因此使用 `--store-dir /tmp/clinic-pnpm-store`；這是環境特有值，不可寫進專案設定。
乾淨 clone 使用預設 store 即可。只有依賴修補工作才重建 lockfile。

## 3. 一次準備 emulator 與瀏覽器

```bash
corepack pnpm exec firebase setup:emulators:firestore
corepack pnpm exec playwright install --with-deps chromium webkit
```

使用 lockfile 裡的 Firebase CLI；不要安裝 global latest。Java 不足時，由環境套件管理器
安裝 Java 21。下載指令只準備開發工具，不會啟動 Firebase 雲端後端。
Firestore cache 預設在 `~/.cache/firebase/emulators`，瀏覽器在
`~/.cache/ms-playwright`；有環境變數覆寫時，以工具實際路徑為準。
保留 cache 可避免每包重抓；換 Firebase／Playwright 版本後需重新核對。

本次 Firebase 15.25.0 要求 Firestore emulator 1.22.0，大小 136707194 bytes，SHA-256：

```text
9b6498b7f62714d67f48f59b3818883cd682dbcd46b9f59511de81c97bb5166c
```

以當前安裝套件的 `firebase-tools/lib/emulator/downloadableEmulatorInfo.json`
為下載版本與校驗值來源。不能把下載失敗的 HTML 當 JAR 留在 cache。

### 雲端網路設定

若代理回傳 403，先看環境 Network 設定；不要繞過代理或移除注入的憑證。
本次 `package_managers` preset 可讀 npm registry，但沒有下列主機。
在 Codex 雲端環境的 Network 設定保留 preset，依工作需求加入並套用：

| 用途 | 主機 |
| --- | --- |
| Firestore emulator／Google CLI archive | `storage.googleapis.com` |
| Playwright 官方下載 | `cdn.playwright.dev`、`playwright.download.prss.microsoft.com` |
| OpenAI 官方模型／Codex 文件 | `developers.openai.com`、`openai.com`、`platform.openai.com` |
| GitHub CLI API | `api.github.com` |
| 後續需要 Google CLI 套件安裝時 | `packages.cloud.google.com` |
| 後續需要 Terraform 安裝時 | `releases.hashicorp.com`、`apt.releases.hashicorp.com` |

本次沒有可修改此設定的工具，需環境擁有者套用。設定完成後重新下載並核對結果；
不要把「已列出主機」寫成「已解除封鎖」。

## 4. GitHub 與後續雲端工具

`git fetch`／`git push` 與 `gh` 使用不同存取管道。原生 git 可用且 GitHub connector
可開 PR 時，就使用這兩者。代理注入的 `GH_TOKEN` 可能只供代理辨識；
`gh auth status` 的 invalid 訊息不代表 repo push 失效。
不要清除注入 token、把 token 寫入 repo，或自行發起登入。

本次環境尚未安裝 `gcloud`／`terraform`。需要相關 CLI 的後續工作包，先按
[本機 playbook Card 0](../product/luna-local-authorized-playbook.md#card-0--tools)
準備工具並核對平台架構。只安裝工具不構成登入、部署、apply 或資料存取授權。
L6 的部署清單仍交給業主執行。

## 5. 以完成同一工作包的總額度為指標

避免重複讀完整歷史與重複搜尋；每包只載入 `AGENTS.md`、`docs/INDEX.md` 對應路徑、
該工作包與需要改的檔案。先確定根因，再編輯。把獨立讀取合併成一次工具呼叫。
安裝與 cache 準備做一次，後續復用；測試依工作包要求與使用者授權執行。
不要為填報數字重跑同一 gate；CI 的數字只算在它實際驗證的 commit 上。

業主在本次對話允許簡單重複工作交給 `gpt-6-luna` 子代理，並要求先讀官網評估。
截至本次交接，官網仍被網路政策封鎖，**尚未完成評估，也沒有派出 Luna**。
可查閱的官方入口：
[模型目錄](https://developers.openai.com/api/docs/models)、
[Codex 文件](https://developers.openai.com/codex/)。這些連結是待查入口，並非已讀證據。
不能把其他 mini／nano 模型的價格或成績當成 Luna 的證據。

完成官方評估後，採用以下分工作為本專案的工作安排（不是官方能力宣稱）：

- Luna：有確定輸入、限定檔案與可判定輸出的機械工作，例如逐檔連結盤點、
  固定格式整理、按已審定對照表做替換。先試一個有界任務，檢查品質後再擴大。
- 主代理：根因判斷、政策／權限／交易／隱私設計、跨包整合與最後審查。
- 同一檔案只能有一位編輯者；子代理帶最小上下文，回報結果、檔案與未解問題。
  卡住時一次附上證據交回主代理，避免重複嘗試消耗額度。

記錄每包可取得的用量／耗時、重試次數與返工；工具未提供額度或價格時標成不可量測，
不要宣稱已節省某個百分比。子代理產生的 diff 必須由主代理審查後才交付。

## 6. 下個執行者的第一步

先確認這份環境 PR 已合併，從 `origin/main` 開工作包分支並明確 frozen install。
CP-05 是獨立 PR；待環境修復進 main 後更新它的 base，再讀該 SHA 的 CI。
不要把環境 PR 的綠燈當成 CP-05 的綠燈，也不要疊在未合併工作包上。
網路、emulator／browser cache 或必要 CLI 未就緒時，只繼續不依賴它們的原始碼工作，
把執行障礙交給手冊所列的環境擁有者。
