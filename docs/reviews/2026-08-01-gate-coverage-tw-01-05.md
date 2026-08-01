# 階段交接紀錄：TW-01～TW-05 把關覆蓋與測試效能 — 2026-08-01

**狀態：已交付。TW-05 的螢幕閱讀器部分依其性質仍未完成，且不可能由自動化完成。**
本階段對應[全專案執行書](../product/full-project-execution-book-2026-07-31.md)
階段 1A 的五項技術待辦，來自
[前一份交接紀錄](2026-08-01-gate-script-test-coverage.md)的「下一位從這裡開始」。

## 1. 一句話

把最後兩支沒有測試的阻斷式檢查拆成可測模組並補上測試、把對外頁面 gate 的完整
組態比對納入測試、把單元測試時間從 53.5 秒降到 16 秒，並把人工無障礙 runbook 中
機器可驗的前置條件自動化——過程中修掉兩個真缺陷。

## 2. 驗收證據

| 關卡 | 起點 | 結果 |
| --- | --- | --- |
| 單元測試 | 55 檔 / 820 項 | **58 檔 / 895 項**（+3 檔 / +75 項） |
| 單元測試耗時 | 53.5 秒 | **15.6–16.2 秒**（連跑三次） |
| 結構檢查 | 200 required files | 205 |
| E2E | 175 項 | 180 項（+5，TW-05） |
| `verify` | — | 全綠 |

## 3. 各項結果

### TW-01　`check-architecture.mjs`

腳本的邏輯全部在 top-level 執行，import 就會整個跑起來，所以照
`unrouted-inventory.mjs` 既有的拆法把純判斷抽成 `scripts/architecture-rules.mjs`：
`stripComments`、`importSpecifiers`、`isBareSpecifier`、`layerViolations`、
`forbiddenBrowserPatterns`。重構後實際執行，輸出與重構前逐字相同。

同時發現 `scripts/unrouted-inventory.mjs` 有 **7 個匯出函式、零測試**，一併補上。

- `architecture-rules.test.mjs` — 26 項
- `unrouted-inventory.test.mjs` — 19 項

### TW-02　`check-web-ui.mjs`

1070 行、同樣是 top-level 執行。抽出 `scripts/web-ui-rules.mjs`：
`normalizeWhitespace`、`containsNormalized`、`reviewTextRequirements`、
`reviewInjectedInputs`、`duplicateIds`。輸出同樣逐字不變。

- `web-ui-rules.test.mjs` — 21 項

### TW-03　`check-public-pages.mjs` 完整組態測試

先前只覆蓋兩支解析器。把 `repositoryInputs()` 匯出後，改用**真實輸入當基準、
逐一破壞副本**的方式測整個 `checkPublicPageConfiguration`——手寫 fixture 只能證明
比對邏輯自洽，證明不了它讀得懂這個 repository 現在的組態，而後者才是這道 gate
的用途。新增 9 項，涵蓋 server pretty-path 漂移、Firebase rewrite 清空、掃描矩陣
失去覆蓋、資料驅動路由來源清空。

### TW-04　單元測試耗時

`maxWorkers: 1` 是 2026-07-20 匯入版控時就帶進來的，**沒有留下任何理由**。實測：

| 設定 | 耗時 |
| --- | --- |
| `forks` + `maxWorkers: 1`（原設定） | 53.5 秒 |
| `forks`，不限制 worker | 18.3 秒 |
| `threads` + 4 workers | 16.1 秒 |

**選擇保留 `forks` 只放開平行度**：`threads` 共用行程，而 `apps/api` 的測試會啟動
Nest，共用行程會讓它們看得見彼此的模組狀態。為了 2 秒換掉行程隔離不划算。
連跑三次皆 895 項全過、15.6–16.2 秒。

這同時解釋並消除了先前那個健康檢查測試的偶發逾時：它單獨執行只要 327 毫秒，
撞到上限的是序列化下的 Nest 啟動。

### TW-05　人工無障礙

**螢幕閱讀器的部分無法自動化，也不應假裝完成。** runbook 第 1 節已經寫明 axe
能判定的只是機器可判定的那一部分；播報內容是否讓人聽得懂，只能由人判斷。

但 runbook 的通過條件裡有一部分是**結構性**的，而其中兩項（B4 skip link 的
`#main-content`、B9 週檢視的 `tabindex`）**先前完全沒有任何自動覆蓋**。新增
`tests/e2e/manual-accessibility-preconditions.spec.ts` 涵蓋 B2、B4、B9、B12、C1
共 5 項，並在 runbook 新增 §1.1 明確標示「這不縮減人工測試範圍」。

## 4. 過程中發現的真缺陷

1. **`importSpecifiers` 會把註解掉的 import 算成真的依賴。** 樣式只要求
   `import` 前面是空白或分隔符，而 `// import x from 'y';` 的 `//` 後面正是空白。
   `check-architecture.mjs` 是把它套在未剝註解的原始碼上，所以瀏覽器程式碼裡
   一行被註解掉的 import 就會變成一筆改不掉的假違規。已改為先剝註解再比對。
   原本的註解宣稱「註解裡的字串不會匹配」——那句話講的是任意字串，不是被註解掉的
   import 敘述。

2. **結構檢查清單出現重複項。** 登記新檔案時我把
   `scripts/check-public-pages.test.mjs` 加了第二次，由 `check-structure.test.mjs`
   的「不得有重複項」測試當場抓到。**那正是上一階段補的那支測試。**

## 5. 未處理事項

### 5.1 TW-05 的螢幕閱讀器測試

runbook 的 A1～A7、B1、B3、B5～B8、B10、B11、B13 與 C2 以後仍須真人操作。
自動化只證明結構前提還在。

### 5.2 runbook B4 的措辭比實作窄（已修文件，未改實作）

實測按下 skip link 後焦點落在 `#main-content` **內**的第一個區段標題
`#overview-heading`，不是裸的 `<main>`。那比停在 `<main>` 更好——報讀器會順帶
念出區段名稱。runbook 原本寫「焦點真的移到 `#main-content`」，照字面判會產生
假失敗，已修正措辭並註明實測落點。**實作沒有改。**

### 5.3 `check-web-ui.mjs` 仍有大量未抽出的內嵌斷言

本階段抽出的是文字比對的基礎與兩條資料驅動規則。檔案裡還有數百行以
`requireText`／`refuseText` 直接寫死的斷言，它們的正確性仍只由 gate 本身保證。
那些斷言的性質是「這一段標記必須長這樣」，抽成純函式的邊際效益低於前述五支。

### 5.4 `reviewInjectedInputs` 的已知限制

規則要求 `data-*=`（帶等號），所以無值的 `data-request-tag` 會被判成缺繫結。
行為刻意維持原樣，並由一支測試把限制釘住——將來真有人寫出無值屬性時，看到的會是
那支測試而不是一段查不出原因的 gate 失敗。

## 6. 下一位接手者從這裡開始

| 順序 | 待辦 | 卡在哪 |
| --- | --- | --- |
| 1 | 回收兩份決定清單、召開 C0 | **需業主與各負責人。這是目前唯一擋住整個專案的事** |
| 2 | 人工無障礙的螢幕閱讀器部分 | 需真人與 NVDA／VoiceOver |
| 3 | `check-web-ui.mjs` 其餘內嵌斷言 | 純技術工作，邊際效益遞減 |

目前位置不變：**Stage 1**。本階段沒有建立任何雲端資源、沒有開啟任何路由、
沒有接觸任何真實病患資料。
