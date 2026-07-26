# 2026 網頁規範稽核與修復 — 2026-07-26

## 這份文件是什麼

2026-07-26 對前後端做了一次 2026 網頁規範稽核，找到 19 項問題，全部修復完成。

這份文件最初是**計畫書**：每張任務卡帶著檔案位置、實測證據、目標狀態與驗收指令，
好讓另一位開發者可以單獨接手一張卡。所有卡片完成之後，逐張的實作細節已經沒有讀者
——它們現在活在程式碼的註解、測試，以及每一次 commit 的訊息裡。因此本文改為**結果
紀錄**：留下發現了什麼、決定了什麼、代價是什麼，以及還沒解決的是什麼。

要看某一項的完整推理，`git log` 找對應的 commit；訊息刻意寫得完整。

這仍然是合成資料的測試平台，不是正式醫療資訊系統。本輪**未解除任何 Phase 1
決策閘門**。

## 稽核當時已經通過的部分

這些先寫，因為 19 條 finding 很容易被誤讀成「這個專案很糟」。實際不是：

- axe 在 WCAG 2.0／2.1／2.2 的 A 與 AA 加上 best-practice 全開下，患者頁
  （375×812）與工作臺（1280×720、375×812）皆為 **0 violations**。
- `escapeHtml` 覆蓋完整，29 處 `innerHTML` 的每一個插值都逸出過。
- CSP 嚴格（無 `unsafe-inline`／`unsafe-eval`），`<dialog>` 用原生 `showModal()`。
- Firestore 交易的 read-before-write、冪等重播、患者預約守衛設計正確。

## 兩項決策（記錄於決策登記簿）

| ID | 問題 | 結果 |
| --- | --- | --- |
| X1 | 是否改為 per-entry bundling？ | **否決**。`dist` 必須與 `public` 逐檔對應，出貨程式碼才能被讀、被對照檢查。 |
| X2 | 預約頁的對外網址？ | **`/booking`**。`canonical` 早就這樣宣告，但沒有 rewrite，實際會 404。 |

X1 的否決有一個必須寫下來的後果：**`modulepreload` 因此是永久解法而非過渡手段**，
所以守住模組往返深度的閘門（D2）從選配升為必要。

正式網域是否為 `beauessence.com.tw` **仍未定案**，上線前要由診所確認。

## 修復內容

| 項目 | 結果 |
| --- | --- |
| A1 | 建置注入 `modulepreload`：模組往返 **5 趟 → 1 趟**（實測 25／27 支 JS 同時開始下載） |
| A2 | vendor barrel 拆成深層 import：vendor 請求 **14 → 7** |
| A3 | 修正 `build-web.mjs` 裡「CSP 要求不能 bundling」這個不成立的理由 |
| B1 | 兩個進入點加 `<noscript>`；患者頁在 JS 失效時仍給得出電話、地址與門診時間 |
| B2 | HTML `no-store` → `no-cache`：不再放棄 bfcache（實測上一頁 19,983 bytes → 0） |
| B3 | 預約頁改由 `/booking` 提供（rewrite + 301），對外網址與 canonical 一致 |
| C1 | 補 COOP／CORP |
| C2 | CSP 導入 Trusted Types，逸出從紀律變成瀏覽器強制 |
| C3 | Permissions-Policy 兩份設定對齊，並退出 Privacy Sandbox |
| C4 | 本地 server 提供 `.json`；`asset-manifest.json` 不再出貨 |
| D1 | a11y 閘門補上 WCAG 2.2（`target-size` 自此真的會執行） |
| D2 | 效能預算納入模組圖往返深度與 preload 完整性 |
| E1 | outbox 領取改為依到期時間排序：佇列不再有排隊死角 |
| E2 | 租約與結算改用各自的時刻，不再整批共用凍結的 `now` |
| E3 | 時間戳只接受規範定義的 ISO-8601（`"Jul 25 2026 Z"` 不再通過） |
| E4 | rate limiter 回收過期視窗，且每個視窗最多清掃一次 |
| E5 | 429／503 帶 `Retry-After` |
| E6 | api-client 逾時改用 `AbortSignal`，真的取消請求；重試加退避與抖動 |
| F1 | `uuid` 鎖到已修補版本；其餘三筆 CLI-only advisory 記錄在案；Actions 釘 commit SHA |
| G1 | 移除週檢視內層那條無用的垂直捲軸 |
| G2 | 手機版週檢視改為行程表：**橫向捲動完全消失**（832px 內容塞進 331px 容器 → 不再需要） |

順帶做的三項清理：

- 四份互相矛盾的 E2E `login` helper 收斂成一份（其中一份在手機寬度必定逾時）。
- 門診時間的漂移改由 `check:ui` 擋下，不再只靠註解提醒。
- 本文件由計畫書改為結果紀錄。

## 驗收

```
corepack pnpm verify     → 通過（39 個測試檔、469 項；稽核前 36 檔、389 項）
corepack pnpm test:rules → 通過（61 項；稽核前 60 項）
corepack pnpm test:e2e   → 通過（82 項；稽核前 73 項）
```

## 代價與已知限制

這一節比上面的表格重要：它記的是「做了之後才知道的事」。

- **`nextAttemptAt` 成為 outbox 工作的必填欄位。** Firestore 的文件明確指出
  `orderBy()` 會過濾欄位是否存在，而不等式篩選隱含以該欄位排序。所以 E1 的查詢
  一旦上線，缺這個欄位的工作不是被排到後面，是**整個看不見**。三條建立路徑與
  `requeue` 都已補上；目前沒有雲端資料庫所以不需回填，但第一次部署前要確認。
- **索引檔無法在本機驗證。** `firestore.indexes.json` 已宣告 E1 需要的兩個複合
  索引，但**測試通過不代表索引正確**：Firestore Emulator 不強制複合索引——餵給它
  一份刻意寫壞的索引檔，它照樣啟動、測試照樣全綠。第一次雲端部署前必須人工複查。
- **Trusted Types 用的是 default policy，不是具名 policy。** 代價已實測確認：
  原始字串會被**檢查**，不會被**拒絕**。保證是「沒有任何字串能未經檢查寫進
  `innerHTML`」，不是「開發者被迫顯式宣告」。把 29 個 sink 改成顯式呼叫是獨立的
  後續工作（見下）。
- **這個 policy 不是消毒器。** CSP 禁止外部資源，引入 DOMPurify 是另一個決定。
  它做的是結構檢查：擋掉 script／iframe／object／embed、行內事件處理器與
  `javascript:` URL。
- **`/index.html` 的 document 預算 10 → 11 KiB。** A1 注入的 28 條 preload 讓
  document 的 gzip 量變成 10.4 KiB。這不是重複下載（已確認 budget checker 以
  `Set` 計算閉包），而是 preload 清單本身的成本：約 0.4 KiB 換掉 4 趟往返。
  **這是刻意放寬，不是為了讓紅燈變綠。**
- **三筆 moderate advisory 刻意不鎖**（`@opentelemetry/core`、`@hono/node-server`、
  `tar`）。它們只存在於 firebase-tools 這條 CLI 線上：不打包、不出貨、不處理外部
  輸入。硬鎖跨 major 的傳遞相依風險更高。解除條件記在 `pnpm-workspace.yaml`。
- **CI 從未真的執行過。** 這個 repository 沒有 git remote，所以 `verify.yml` 與
  `codeql.yml` 的價值目前是「設定正確」，不是「把關生效」。

## 後續工作

沒有阻擋項，以下都是可以獨立開卡的改善：

1. **把 Trusted Types 的 sink 改成顯式呼叫**——以具名 policy 取代 default policy，
   讓 29 處 `innerHTML` 各自經過明確的 `createHTML`。稽核面更清楚，但那是一次橫跨
   多行呼叫點的大改，機械改寫會弄壞語句邊界（已實測），值得單獨排。
2. **第一次雲端部署前**：人工複查兩個 Firestore 複合索引定義；確認 outbox 沒有
   缺 `nextAttemptAt` 的舊資料。
3. **確認正式網域**，然後把 `patient.html` 的 `canonical`／`og:url` 與 `noindex`
   一起處理。
4. 推上 git remote，讓 `verify.yml` 與 `codeql.yml` 真的開始跑。
