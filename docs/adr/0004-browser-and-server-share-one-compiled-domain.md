# ADR-0004：瀏覽器與伺服器共用同一份編譯後的領域規則，不引入 bundler

**狀態：** 已接受
**日期：** 2026-07-21

## 背景

同一套預約規則目前有兩份實作：

| 位置 | 語言 | 使用者 |
| --- | --- | --- |
| `apps/web/public/modules/` | 瀏覽器原生 ESM（JS） | 兩個頁面 |
| `packages/domain/` | TypeScript | `apps/api`、`apps/worker` |

兩者必須手動保持一致。這在 2026-07-21 新增五種狀態轉換時已經是人工對照著寫的，
能對齊是因為當天有人盯著，不是因為有機制保證。這是專案當時唯一剩下的技術債。

先前的評估認為收斂需要引入 bundler（Vite 或類似工具），代價是 `apps/web/public`
失去「存檔即生效」、`scripts/check-web-ui.mjs` 的安全界線檢查要重寫、Firebase
Hosting 的部署路徑改變。**該評估是錯的。**

## 決定

**不引入 bundler。** 以 `tsc` 既有的輸出作為共用來源：

1. `packages/domain` 編譯出的 `dist/*.js` 由 `scripts/sync-domain-vendor.mjs`
   複製到 `apps/web/public/vendor/domain/`，並寫入 sha256 manifest。
2. 瀏覽器模組以**相對路徑** `../vendor/domain/index.js` 匯入該產物。
3. 以雜湊比對檢查（`check:sync`）確認 vendored 副本與 `dist` 一致，且未被手動
   竄改，納入 `verify`；不一致即失敗。
4. `apps/web/public/modules/` 中與 `packages/domain` 重複的規則刪除，改為匯入。

### 落實進度

- **第一步（2026-07-21）**：建立 vendor 同步、雜湊防漂移與相對路徑載入，並把
  重複的常數（`ACTIVE_BOOKING_LIMIT`、`ACTIVE_BOOKING_STATUSES`）改為匯入。
- **第二步（2026-07-22）**：規則邏輯本身收斂。四組規則（時段可預約、防重複
  上限、狀態轉換允許、改期允許）抽到 `packages/domain/src/appointment-rules.ts`
  的純斷言函式；伺服器 planner 與瀏覽器 `appointment-domain.js` 都呼叫同一份。

  瀏覽器透過 `modules/domain-rules.js` 呼叫這些斷言，並把 `DomainError` 的錯誤碼
  翻成中文訊息——**規則在領域套件，措辭在瀏覽器邊緣**。掛號別不符時仍能給出
  「初診請選整點／30 分」這類具體提示，因為那是措辭而非規則：是否允許由共用
  斷言決定，瀏覽器只是換一種說法。

  至此瀏覽器與伺服器對「什麼被允許」是同一份程式碼，漂移風險關閉。

### 為何用相對路徑，而非 import map 的裸名

原本的設計是用 import map 讓瀏覽器以裸名 `@beauessence/domain` 匯入，與 Node 端
寫法一致。**實機測試推翻了這個做法。**

`<script type="importmap">` 是 inline script，受 CSP 的 `script-src` 管制。本專案
的 CSP 是 `script-src 'self'`（無 `unsafe-inline`，這是先前為防 XSS 刻意訂的），
因此 import map 被瀏覽器靜默拒絕，裸名無法解析，整個模組圖載入失敗——頁面的
靜態骨架仍在，但 JS 不會啟動。

替代方案是為 import map 內容計算 CSP hash 並釘進 `server.mjs` 與 `firebase.json`
兩處的 CSP 標頭。但那會新增一個必須跨兩處同步的漂移面，只為換取「裸名」這個
外觀。相對路徑不涉及 CSP，單一來源與防漂移的目的完全不變，因此採用相對路徑。

這正是「先實機驗證再定案」的價值：import map 在文件上看起來合理，但與本專案
既有的安全設定衝突，只有真的在瀏覽器載入才會發現。

## 原因

### tsc 的產物已經是合格的瀏覽器 ESM

這不是推測，是實測結果。將 `dist` 複製到 `public/vendor/domain/` 後，於瀏覽器
`import('/vendor/domain/index.js')`：

```text
planBooking 執行成功            → status: confirmed
DomainError 正常拋出            → BOOKING_KIND_MISMATCH
backoffSeconds(1, 2, 3, 10)     → 30, 60, 120, 3600
```

成立的條件本專案早已滿足：

- `packages/domain` 是純函式，沒有 `node:` 匯入，也沒有 `require`。
- `tsconfig.base.json` 使用 `module: NodeNext`，這會**強制相對匯入帶 `.js`
  副檔名**——而那正是瀏覽器 ESM 的必要條件。

[TypeScript 官方文件](https://www.typescriptlang.org/docs/handbook/modules/guides/choosing-compiler-options.html)
對「撰寫不經 bundler、直接在瀏覽器執行的 ES module」給出的建議正是
`module: nodenext` + `moduleResolution: nodenext`，並明確指出該組合會強制加上
副檔名。換言之，這條路一直是開著的。

### 與 bundler 方案的取捨

| | Bundler（Vite） | 本決定 |
| --- | --- | --- |
| 新依賴 | 需要 | 無 |
| `public/` 存檔即生效 | 失去 | 保留（僅 `vendor/` 為產物） |
| `check-web-ui.mjs` | 需重寫 | 不變 |
| Firebase Hosting 部署 | 路徑改變 | 不變 |
| 防止兩份漂移 | 由打包保證 | 由雜湊比對檢查保證 |

bundler 能多帶來的好處（打包成單檔、hashed 檔名長期快取、樣式分頁）都屬於
效能最佳化，與本 ADR 要解決的「規則漂移」無關，且可在正式化階段單獨評估。
為了解決 A 問題而付出 B、C、D 的代價，不划算。

## 後果

- `apps/web/public/vendor/` 是**產物目錄**，不得手動編輯，且必須納入
  `.gitignore` 以外的考量：因為 Firebase Hosting 直接部署 `public/`，此目錄
  必須存在於部署內容中，因此仍需提交。雜湊檢查是防止它與 `dist` 脫節的機制。
- 改動 `packages/domain` 後必須重新執行 `pnpm build` 並同步 vendor，否則
  `verify` 會失敗。這是刻意的：讓漂移在 CI 就被擋下，而不是在正式環境才發現。
- 瀏覽器端仍保有自己的模組，但只剩下與 UI 相關的部分（渲染、狀態容器、
  表單互動）。純規則一律來自 `packages/domain`。
- `packages/domain` 從此同時是伺服器與瀏覽器的相依，因此**永遠不得引入
  Node 專屬 API 或第三方套件**。`scripts/sync-domain-vendor.mjs` 會在同步時
  掃描產物的每一個 import，發現 `node:` 內建或裸名第三方相依即中止，讓錯誤
  停在建置階段而不是使用者的瀏覽器。

## 替代方案

- **引入 bundler**：見上表。可解決問題，但代價與本問題無關。
- **把規則改寫成帶 JSDoc 的純 JS**：瀏覽器可直接載入且免建置，但會失去
  `packages/domain` 現有的嚴格型別（`exactOptionalPropertyTypes`、
  `noUncheckedIndexedAccess`），而那些型別已經在本專案抓出過真實缺陷。
- **維持兩份實作**：現況。人工同步在只有一位維護者時勉強可行，交接後必然漂移。
