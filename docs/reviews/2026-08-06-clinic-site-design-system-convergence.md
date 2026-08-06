# 診所官網併回設計系統與 gate 涵蓋修補 — 2026-08-06

**一句話：** 診所官網的 UI 偏離不是寫的人不照規則，是**五道 gate 都沒有宣告涵蓋
它**；這一輪把官網併回 token 系統、補掉那五個缺口，並修好一個讓兩份樣式表各有數百
行長期不受檢查的 gate 解析缺陷。

## 對應執行書段落

不對應任何已排程的 work package。這是既有合成預覽範圍內的維護（AGENTS.md「May
proceed during Stage 1」的第二項：維護或修正既有的本機／合成實作，不擴張已核准的
欄位、角色、外部效果或資料權限）。**Stage 位置不變**，仍是 Stage 1。

沒有動到後端、Firestore Rules、API contract、RBAC、`packages/domain` 或任何商業
規則。沒有新增表單欄位。沒有新增執行期依賴。字型預算維持 0 KiB。

## 分支／commit

分支 `claude/audit-fix-docs-2026`，自 `2645b6c` 起七個 commit：

| Commit | 內容 |
| --- | --- |
| `ce6b42b` | 官網語意 token 骨架（畫面不變） |
| `66d46b6` | 官網掃描路由取樣抽成單一 export |
| `ad71a49` | `<summary>` 納入 44px 掃描並修到達標 |
| `eb812c8` | 字級依語意重分級 ＋ typography 兩層掃描 |
| `df72a27` | `clinic-site.css` 納入完整 token gate |
| `e4dccd0` | 流體字級改為逐項驗證，取消 clamp 豁免 |
| `80d9fcc` | 間距 ratchet 首批收斂 |

尚未合併，無 merge commit。

## 每道關卡的實際結果

| 關卡 | 結果 |
| --- | --- |
| `pnpm verify` | 通過。60 個測試檔、**947 個單元測試** |
| `check:tokens` | 通過。硬性類別全零；ratchet：字級 0／0、間距 11／11 |
| `check:pages` | 通過。5 個進入點、8 條資料驅動路由雙向一致 |
| `check:perf` | 通過。5 個進入點，預算**未調整** |
| Playwright（本輪最大一次） | **195 passed**（typography／responsive／mobile-layout／affordance／axe／clinic-site／theme／clinic-motion） |
| `check-design-tokens.test.mjs` | 23 passed（新增 6 個：括號配對 2、clamp 驗證 4） |
| `capture:ui` | 可執行，console errors 0／warnings 0。**產物已還原，見未處理事項** |

### 收斂前後（瀏覽器 computed style 實測，非讀 CSS 推測）

| 指標 | 前 | 後 |
| --- | ---: | ---: |
| `/clinic` 相異字級 @1440px | 20 | **6** |
| `/clinic` 相異字級 @375px | 18 | **7** |
| 低於 14px 的可見文字 @375px | **32 處** | **0** |
| `/clinic/doctors/*` 低於 16px @1440px | 34 處 | 0（次要標記除外） |
| 字重階數 | 6（含 650／750 兩個假階） | 4 |
| 硬編碼色（`:root` 外） | 13 | 0 |
| 圓角字面值 | 21 | 0 |
| 動效時長／緩動字面值 | 33 | 0 |
| 間距字面值 | 49 | 11 |
| `font-size` 字面值 | 23 ＋ 9 個免檢 clamp | 0 |

對照組：`/booking` 5 種字級、工作臺 6 種，兩者本來就全部落在尺度上。**問題從頭到尾
只在官網**，而官網剛好是唯一不受檢查的那一份。

## 發現並修好的真缺陷

1. **`outsideRootBlocks` 用縮排猜區塊結尾。** 它比對「換行後頂格的 `}`」，遇到寫在
   `@media` 裡的 `:root` 就一路吃到整個媒體查詢的結尾。實測吞掉 `clinic-site.css`
   230 行／44 條 class 規則、`workbench.css` 114 行／27 條——**那些規則裡的寫死值
   從來沒有被檢查過，而 gate 一直是綠的**。兩份檔案都只是寫了
   `@media (max-width: 48rem) { :root { --shell: ...; } }` 這種完全正當的斷點覆寫。
   改為大括號配對，`definedTokens` 與 `outsideRootBlocks` 共用同一個掃描，並有兩個
   迴歸測試釘住。修好後又露出 1 個圓角與 10 筆間距。
   **這個缺陷早於本分支，與官網無關，工作臺同樣受害。**
2. **`font-size: clamp()` 無條件放行。** 只要包進 `clamp()` 就完全免檢。官網 18 個
   端點只有 1 個在尺度上。**這是全專案缺口**：`styles.css` 有三處
   `clamp(var(--text-2xl), 4.5vw, var(--text-3xl))`——端點是 token、中間是純 `vw`，
   正是規則書 R-6「流體字級必須混合 rem」禁止的寫法，只是沒有工具查。
3. **44px 掃描的選擇器不含 `<summary>`。** 原生 disclosure 控制項從未被量。抓到
   官網 FAQ 四個 293×24、患者頁「開發工具」368×21。
4. **`CEILINGS` 是全域單一數字。** 一份樣式表減一筆、另一份加一筆，總數不變，新債務
   隱形。改為逐檔記帳。
5. **字級提高後的版面回歸。** hero 服務連結從 13.12px 升到 16px 後，320px 的兩欄
   grid 只剩約 85px 文字空間，「止鼾好眠牙套」六個字需要 96px 而被逐字折行（違反
   R-4）。改為依可用寬度決定欄數；8.5rem 下限是量出來的（320px 內寬 262px → 單欄，
   375px 內寬 317px → 維持兩欄）。

## 推翻既有文件說法的實測

**`boutique-clinical-command-2026-07-25.md` §10 說「字體家族只有 Regular 與 Bold
兩檔，所以 600 以上全部渲染成同一個粗體」。在本機不成立。** 用 canvas 量墨水量
（`font-synthesis: none`）：

```text
sans   400 | 500 | 600 = 650 = 700 = 750 | 800
serif  400 | 500 | 600 | 650 = 700 = 750 | 800
```

**650 與 750 確實是假階，但 500 與 800 不是。** 工作臺沒有用到 500／800，所以那段
結論在工作臺上碰巧成立；官網用到了，合併會實際改變畫面。因此官網收成四階而非三階。
中文系統字體的字重供應本來就因平台而異——**這是單一 Windows 環境的量測，跨平台
複核時要重量一次**，已在該文件加註。

## 未處理、未跑或繞過的事項

**這一段是這份紀錄最重要的部分。**

1. **視覺基線截圖沒有更新。** `pnpm capture:ui` 會直接覆寫
   `docs/reviews/assets/ui-visual-baseline-2026-07-28/`，而它的 `manifest.json`
   **只更新 sha256、不更新 `captureDate`**。保留就等於宣稱那些圖是 2026-07-28 拍的
   ——規則書 §5.5 明文禁止（「若沒有實際擷取 timestamp，不得用固定時間冒充」）。
   已 `git checkout` 還原，工作區乾淨。**現行基線因此與程式碼不符**：官網標題與間距
   都變了。更新基線要開新的 dated 目錄與 manifest，是獨立決定。
2. **`test:rules` 沒跑。** 本輪沒有動 Firestore Rules。要跑必須用 `subst` 繞開中文
   路徑（見下）。
3. **人工無障礙驗收沒跑。** 規則書 §5.2／§5.3 要求的鍵盤全流程、200% 文字放大、
   400% 縮放、forced-colors、實機 iOS Safari／Android Chrome、VoiceOver／TalkBack
   一項都沒做。自動化只涵蓋 axe 能判定的部分。
4. **三個疑點沒有結論**，全部需要人工或實機判定：
   - `/clinic` 的 `<h1>` accessible name 可能重複。DOM 是
     `<span class="visually-hidden">全文</span>` ＋ `<span aria-hidden="true">` 逐字
     版本，作者意圖正確；但瀏覽器不對 JS 暴露 computed accessible name，無法在本機
     判定。**需 NVDA／VoiceOver 實聽或 axe DevTools。**
   - `.clinic-ticker` 26s 無限橫向捲動是否觸及 WCAG 2.2.2（暫停／停止／隱藏）。
     `prefers-reduced-motion` 有全域關閉，但那是系統偏好，不等於 2.2.2 要求的**頁面
     內**機制。判定關鍵是它是否承載 information。
   - 焦點環用的是品牌金 `--clinic-focus-ring: #d49b45`。R-16 對共用系統的規定是
     「品牌香檳金只作裝飾，不承載狀態、焦點、互動」。命名已把功能性與裝飾分開，
     **顏色值沒動**；要不要換成非品牌色必須先量它對相鄰顏色的對比（R-11 要求 3:1）。
5. **11 筆間距字面值留在 ratchet 上。** 六個大間距（6／3.5／2.75／2.5／2.25／1.75rem）
   離網格 4–32px，網格在 1.5→2→3→4rem 之間跳得太開，官網的大留白沒有對應的階。
   要補哪一階是決定，不是四捨五入。兩處 `margin: -1px` 是邊框對齊修正，不是間距。
6. **24 個非字級 `clamp()` 仍免檢**（間距、容器寬度）。它們走的是另一條豁免
   （`parts.some(p => p.includes('('))`）。`width: clamp()` 與 `font-size: clamp()`
   不可能共用同一套 type scale 判定，需要依屬性分類制定規則。
   **本輪只修好字級 clamp——不得描述為「clamp 盲點已修復」。**
7. **深底文字的六個色階沒有收斂**，只是從散落的字面值搬進具名 token。合併它們會改變
   對比，需要逐組重量 WCAG 比值。
8. **卡片重複連結沒有處理。** 每張服務／醫師卡片有三個指向同一 href 的連結（圖片、
   標題、「了解更多」）。這通過 SC 2.5.8 的 Equivalent 例外**不是違規**，但鍵盤
   使用者每張卡要按三次 Tab。改動會影響 `hasEquivalent` 豁免的成立前提。
9. **`workbench.css` 先前被吞掉的 114 行只確認沒有硬性違規，沒有逐條複核。**

## 本機環境陷阱

1. **`capture:ui` 會就地覆寫正式基線目錄**，且不更新 manifest 的 `captureDate`。
   跑之前先確認工作區乾淨，跑完檢查 `git status`。
2. **本機 preview server（port 3100）供應 `public/`，Playwright（port 3210）供應
   `dist/`。** 兩者不同步——改完 CSS 在瀏覽器看不到變化通常是 CSS 快取，加 query
   參數強制重載；而 Playwright 每次都會重新 build。
3. **Firestore Emulator 在含中文的路徑下無法啟動**（既有問題）。要跑 `test:rules`
   須 `subst Y: "D:\診所專案\beauessence-appointment-platform-fresh"`，跑完 `subst Y: /D`。
4. **Bash 工具不吃 PowerShell here-string。** 用 `@'...'@` 寫 commit message 會把
   `@` 當成訊息第一行。用 heredoc。
5. **量中文字重不能量文字寬度。** 漢字是等寬方塊，400 與 800 的寬度完全相同。要用
   canvas 量墨水量（alpha 總和）才分得出字面。

## 記錄的決策與剩餘風險

**沒有新的核准決策。** 這一輪全部在既有授權範圍內，不需要 D-series 決策，也沒有
產生需要業主回答的問題。

分層原則（結構層併回系統、表現層正式化為 gated token 集合）是本輪的設計決定，已寫進
`clinic-site-integration-2026-07-27.md`，**不是核准過的政策**——下一個人可以推翻它，
但要連同那份文件一起改。

剩餘風險：

- **視覺基線與程式碼不符**（見未處理事項 1）。在更新前，任何以那組截圖做的比對都會
  得到假的差異。
- **跨平台字重呈現未驗證。** 官網現在用了 500 與 800 兩階，在只提供 Regular／Bold
  的裝置上會退化成兩階。功能不受影響，層次會變平。
- **人工無障礙驗收未跑**，因此不得宣稱本輪達成 WCAG 2.2 AA。自動化通過只代表
  「該工具、該版本、該頁面狀態沒有掃到指定等級的問題」（規則書 §1.2）。

## 下一位從這裡開始

1. **更新視覺基線**（阻塞：需決定是否開新的 dated 目錄）。開
   `docs/reviews/assets/ui-visual-baseline-<新日期>/`，跑 `capture:ui`，寫新的
   manifest，更新規則書 §5.5 的「現行基線」指向。舊目錄留作歷史證據。
2. **跑人工無障礙驗收**（阻塞：需要實機與報讀器）。順便一次解決三個疑點中的前兩個
   ——h1 的 accessible name 與 ticker 的資訊性質，兩者都要實聽才有結論。
3. **量焦點環的對比**（無阻塞）。`#d49b45` 對白底與霧綠底各量一次，未達 3:1 就換成
   非品牌色，並在規則書 R-16 補上官網的具名例外或修正。
4. **決定間距網格要不要補階**（無阻塞）。看 6／3.5／2.75／2.5／2.25／1.75rem 這六個
   值實際用在哪，再決定是補 1.75／2.5／3.5rem 三階，還是把它們併到現有階並接受版面
   位移。這是 ratchet 剩下的 11 筆裡的 9 筆。
5. **非字級 `clamp()` 的分類規則**（無阻塞）。間距類對 `--space-*`、容器寬度類對
   layout token、圖像／裝飾尺寸逐案判定、無法分類則明確失敗或具名豁免。
6. **`workbench.css` 那 114 行逐條複核**（無阻塞）。硬性檢查已通過，但那段區域從來
   沒有人用眼睛看過。

## 目前 Stage 位置

**不變。** 仍是 Stage 1（治理決策）。本輪不觸及任何 decision gate，也不構成 Stage 2
的前置條件。
