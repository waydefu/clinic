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

分支 `claude/audit-fix-docs-2026`，PR
[#13](https://github.com/waydefu/clinic/pull/13)（2026-08-06 開啟，尚未合併，
無 merge commit）。

本輪自 `2645b6c` 起九個 commit：

| Commit | 內容 |
| --- | --- |
| `ce6b42b` | 官網語意 token 骨架（畫面不變） |
| `66d46b6` | 官網掃描路由取樣抽成單一 export |
| `ad71a49` | `<summary>` 納入 44px 掃描並修到達標 |
| `eb812c8` | 字級依語意重分級 ＋ typography 兩層掃描 |
| `df72a27` | `clinic-site.css` 納入完整 token gate |
| `e4dccd0` | 流體字級改為逐項驗證，取消 clamp 豁免 |
| `80d9fcc` | 間距 ratchet 首批收斂 |
| `e626483` | 三份既有設計文件同步 ＋ 本交接紀錄 |
| `c317d53` | 視覺基線重拍為 2026-08-06 ＋ 記錄兩個順手發現的缺陷 |

**PR 的範圍比本輪大。** 這個分支在本輪開始前**已經有五個未合併的 commit**
（`96dabf2`、`79609e6`、`79272ed`、`204f78b`、`2645b6c`：2026-08-06 企業級審查、
伺服器角色收斂、可達性走查改 fail-closed、品牌標誌響應式、標準矩陣）。它們會跟著
這個 PR 一起進 `main`，但**不屬於本文件描述的 UI 收斂**——review 時要分開看。

## 每道關卡的實際結果

| 關卡 | 結果 |
| --- | --- |
| `pnpm verify` | 通過。60 個測試檔、**947 個單元測試** |
| `check:tokens` | 通過。硬性類別全零；ratchet：字級 0／0、間距 11／11 |
| `check:pages` | 通過。5 個進入點、8 條資料驅動路由雙向一致 |
| `check:perf` | 通過。5 個進入點，預算**未調整** |
| Playwright（本輪最大一次） | **195 passed**（typography／responsive／mobile-layout／affordance／axe／clinic-site／theme／clinic-motion） |
| `check-design-tokens.test.mjs` | 23 passed（新增 6 個：括號配對 2、clamp 驗證 4） |
| `capture:ui` | 通過。10 張 PNG，每個情境 console errors 0／warnings 0。基線已重拍為 [2026-08-06](ui-visual-baseline-2026-08-06.md) |

### CI（PR #13，commit `c317d53`）

| Job | 結果 |
| --- | --- |
| 結構、文件、格式、lint、型別與單元測試 | pass（1m42s） |
| Firestore Emulator（交易、冪等、outbox、預設拒絕） | pass（1m27s） |
| Semgrep CE SAST | pass（2m54s） |
| e2e-ui | pass（2m16s） |
| e2e-accessibility | pass（1m52s） |
| e2e-mobile | pass（4m14s） |
| e2e-appointments | pass（3m49s） |
| e2e-auth-rbac | pass（2m59s） |
| e2e-patient-portal | pass（2m32s） |
| Tracked secrets、dependency audit 與 inventory | **本文件寫入時仍在執行** |

**最後一項的結果要自己去看，不要照抄這張表。** 供應鏈那道 gate（audit 加 SBOM）
在本機與 CI 都偏慢，寫這份紀錄時已跑超過十分鐘還沒回。九綠一未完不等於十綠——
合併前必須確認它。`main` 的 required check 是 `Verification evidence`（strict）。

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

## 順手發現、本輪未修的既有缺陷

這兩項是重拍基線時看圖看到的，**都不是這一輪改出來的**，也都不在本輪範圍內。
記在這裡是因為它們有實際的使用者影響，而且沒有任何 gate 看得到。

### 一、療程卡的圖片被置中裁掉，資訊跟著不見（P1）

`scripts/build-clinic-assets.mjs` 對療程卡設 `aspect: 4 / 3`，`encode()` 遇到比目標
寬的來源就**置中裁切**。四張來源全都比 4:3 寬：

| 圖 | 原圖 | 原比例 | 4:3 裁掉 | 畫面上的結果 |
| --- | --- | ---: | ---: | --- |
| `service-snoring`（止鼾五合一） | 1024×281 | 3.64 | **63.4%** | 一張橫向的多欄流程圖只剩中間一欄「❸ 咽喉結構異常」，左右兩欄各剩半個字 |
| `service-turbinate`（下鼻甲手術） | 2560×1440 | 1.78 | 25% | 圖內標題被切成「鼻甲手術」 |
| `service-septoplasty`（鼻中隔手術） | 2560×1440 | 1.78 | 25% | 圖內標題被切成「中隔手術」 |
| `service-mouthguard`（止鼾好眠牙套） | 2560×1440 | 1.78 | 25% | 圖內標題被切成「**子眠牙套**」 |

**CSS 沒有錯**——出貨的 WebP 本身就已經是 4:3，`object-fit: cover` 不再裁任何東西。
裁切發生在建置階段，所以看 CSS 或看 DOM 都找不到原因。

為什麼這比「圖沒對齊」嚴重：這四張是**衛教資訊圖**，不是裝飾。`alt` 寫「止鼾五合一
療程示意」，畫面上卻只有一個症狀分類；「子眠牙套」則根本不是一個詞。`alt` 與實際
呈現不符，而截掉的是內容本身。

**沒有修，因為修法是內容決定不是版面決定**，至少三條路而且各有代價：把療程卡的
`aspect` 改成貼近來源的 16:9（卡片會變矮，四欄網格的節奏跟著變）、為這四張另外
產出「為 4:3 重新構圖」的來源圖（要重做圖）、或是改用 `object-fit: contain` 加背景
（會出現留白邊）。`service-snoring` 的 3.64:1 更是任何裁切都會傷到它。

### 二、麵包屑不符 WAI-ARIA APG 的 breadcrumb pattern（P2）

```html
<nav class="clinic-breadcrumb" aria-label="麵包屑">
  <div class="clinic-shell">
    <a href="/clinic">診所首頁</a><span>/</span><a href="…">鼻功能醫學</a><span>/</span><span>止鼾五合一</span>
  </div>
</nav>
```

三個偏離：

1. **不是清單。** APG 的 breadcrumb 用 `<ol>`／`<li>`；規則書 R-1 也要求「清單使用
   對應的原生 HTML」。現在報讀器聽不到「共 3 項，第 2 項」。
2. **最後一項缺 `aria-current="page"`。** 目前位置沒有程式可辨識的標記，只靠「沒有
   底線」這個視覺差異表達（R-2 的狀態不得只靠視覺）。
3. **分隔符 `/` 是真的文字節點**，報讀器會逐個唸出「斜線」。APG 建議用 CSS 生成或
   加 `aria-hidden="true"`。

視覺沒有問題——實測五個項目的 `top`／`bottom`／`height` 完全一致（134／178／44），
字級都是 16px。**axe 不會報這一項**，因為它不檢查麵包屑是否用清單語意。

這三點修起來低風險（只動結構與屬性，不動樣式），但屬於元件語意重構，本輪的範圍是
token 與 gate 涵蓋，所以留給下一位；`clinic-site.js` 是 DOM 生成端，改那裡要一併看
`clinic-site.test.ts` 釘住的節點契約。

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

1. **`test:rules` 沒跑。** 本輪沒有動 Firestore Rules。要跑必須用 `subst` 繞開中文
   路徑（見下）。
2. **人工無障礙與實體裝置驗收沒跑。** 規則書 §5.2／§5.3 要求的鍵盤全流程、
   200% 文字放大、400% 縮放、forced-colors、實機 iOS Safari／Android Chrome、
   VoiceOver／TalkBack 一項都沒做。

   **行動裝置模擬**有跑（iPhone 15 直／橫向、Pixel 7、320×568 四個設定檔 × 官網四
   條路由 ＋ 患者預約四步驟，用真實 touch、行動 UA 與 DPR），零真實缺陷——三筆初判
   逐一查證後都不是產品問題：20×20 的 checkbox 全部被 `<label>` 包住而 label 是
   60×44～319×98；「欄位落在可視範圍外」是 659.x > 659 的浮點邊界，且畫面上沒有任何
   sticky／fixed 元素蓋住它；「軟鍵盤近似」是腳本把可視高度砍半而沒有觸發瀏覽器的
   自動捲動，是模擬的限制。

   **但模擬不是實機。** 沒有真實軟鍵盤（`visualViewport` 不會因鍵盤縮小）、沒有
   WebKit 引擎（iPhone descriptor 跑的仍是 Chromium，本機沒裝 webkit）、沒有真實
   報讀器、沒有系統字級放大。§5.3 的實體裝置矩陣仍然全部欠著。
   驗收腳本沒有進 repo（進了就要納入 e2e-groups 與維護），需要時重寫即可。
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

1. **逐張比對新舊基線**（無阻塞）。基線已重拍為
   [2026-08-06](ui-visual-baseline-2026-08-06.md)，舊的保留為歷史證據。`/clinic`
   的差異是刻意的且已量化；**`/booking`、`/`、`/privacy` 沒有刻意改動，但那不等於
   零差異**——`styles.css` 有三個字級 clamp 改過，那三頁的圖仍要人工比對一次。
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
7. **決定療程卡圖片怎麼處理**（阻塞：需要內容／設計決定）。見上面「順手發現」的第
   一項。`service-snoring` 被裁掉 63.4%，另三張的圖內標題各被切掉開頭。這是資訊
   遺失，不是版面瑕疵。
8. **麵包屑改成 APG 的 breadcrumb pattern**（無阻塞）。`<ol>`／`<li>`、
   `aria-current="page"`、分隔符 `aria-hidden`。改 `clinic-site.js` 的節點生成時要
   一併看 `clinic-site.test.ts` 釘住的契約。

## 目前 Stage 位置

**不變。** 仍是 Stage 1（治理決策）。本輪不觸及任何 decision gate，也不構成 Stage 2
的前置條件。
