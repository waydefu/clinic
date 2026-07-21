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

1. `packages/domain` 編譯出的 `dist/*.js` 直接複製到 `apps/web/public/vendor/domain/`。
2. 兩個頁面以 import map 將裸名 `@beauessence/domain` 對應到該路徑，讓瀏覽器
   端的匯入寫法與伺服器端完全一致。
3. 以雜湊比對檢查確認 vendored 副本與 `dist` 一致，納入 `verify`；不一致即失敗。
4. `apps/web/public/modules/` 中與 `packages/domain` 重複的規則刪除，改為匯入。

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

### import map 已是可用的瀏覽器標準

Import maps 目前在所有現代瀏覽器可用，可將裸名對應到實際 URL，使瀏覽器與
Node 的匯入寫法一致，不需要別名解析器。

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
  Node 專屬 API 或第三方套件**。這條限制需要一個檢查來保護。

## 替代方案

- **引入 bundler**：見上表。可解決問題，但代價與本問題無關。
- **把規則改寫成帶 JSDoc 的純 JS**：瀏覽器可直接載入且免建置，但會失去
  `packages/domain` 現有的嚴格型別（`exactOptionalPropertyTypes`、
  `noUncheckedIndexedAccess`），而那些型別已經在本專案抓出過真實缺陷。
- **維持兩份實作**：現況。人工同步在只有一位維護者時勉強可行，交接後必然漂移。
