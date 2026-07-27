# 介面規則書

**版本：** 2026-07-27（2026 官方資料複核版）

**狀態：** 生效中

**適用範圍：** 本專案所有對外頁面、內部工作臺、響應式 Web 與行動裝置瀏覽器

## 0. 這份文件的地位

這是**規則**，不是靈感清單。每條規則都必須能由自動測試或本文的人工驗收矩陣判定。

- **必須／不得**：沒有走完例外程序就不能合併。
- **應／優先**：預設要做；不做時要在 PR 或 review evidence 說明理由。
- **可以**：情境允許的做法，不是強制門檻。

要改規則，先改這份文件，並在同一個變更裡調整對應測試或人工檢查清單。不得先放寬
測試、再事後補理由。

發生衝突時依下列順序取捨：

1. 患者安全、資料正確性、隱私與可回復性；
2. 無障礙與完成任務的能力；
3. 任務清楚、狀態可知、錯誤可修；
4. 效率與資訊密度；
5. 視覺風格。

## 1. 標準基線與合規邊界

### 1.1 採用的基線

截至 2026-07-27：

- Web 無障礙的工程基線是 **WCAG 2.2 Level AA**。W3C 在 2026-05 仍建議使用最新的
  WCAG 2 版本；WCAG 2.2 也是 ISO/IEC 40500:2025。
- WCAG 3.0 在 2026-03 仍是 **Working Draft**，不得拿來宣稱本專案合規。
- 台灣數位發展部已公告「網站無障礙規範（115.11）」於 2026-11-30 起用於新版標章
  檢測。本專案提早以 WCAG 2.2 AA 準備，但是否需要、或是否取得政府標章，是另一個
  正式檢測與法務判斷，不能由這份工程文件自行宣稱。
- WAI-ARIA APG、Apple HIG、Material Design、GOV.UK／NHS Design System、NN/g 與
  Baymard 是實作與可用性依據；它們不是 WCAG 合規證書。

### 1.2 不得做的合規宣稱

- `axe` 零違規只代表「該工具、該版本、該頁面狀態沒有掃到指定等級的問題」。
- 單一瀏覽器、模擬器或 320px 截圖通過，不代表行動裝置可用。
- 通過 WCAG 2.2 AA 工程門檻，不等於已取得台灣無障礙標章。
- APG 範例是模式參考；客製元件仍要實測鍵盤、報讀器與觸控。

完整驗收必須同時有：語意檢查、鍵盤流程、縮放與重排、視覺狀態、實機觸控、行動裝置
報讀器、真實任務與錯誤／等待／空白等非理想狀態。

## 2. 為什麼需要規則

以下缺陷在 2026-07 反覆出現，每次都是「同類問題、不同位置」：

| 日期  | 症狀                                     | 根因                            |
| ----- | ---------------------------------------- | ------------------------------- |
| 07-25 | 「清除選取」「前往處理清單」看不出可以按 | `.text-button` 沒有形狀         |
| 07-25 | 同一個 class 在兩個容器裡長得不一樣      | 樣式被父層選擇器綁住            |
| 07-26 | 手機上英文副標消失                       | 用 `display: none` 解決空間不足 |
| 07-27 | 政策頁的返回入口只像一句文字             | 新頁面沒進掃描範圍              |
| 07-27 | 頁尾連結被擠成一個字一行                 | flex 項目被縮到比內容窄         |
| 07-27 | 900px 導覽項各排成兩行                   | 缺少斷點邊界與實際狀態檢查      |

CSS 不會因為這些問題報錯。因此測試要量**畫面算出來的結果與真實互動**，不能只搜尋
原始碼裡是否出現某個屬性。

## 3. 核心規則

### R-1　優先使用原生語意；動作用按鈕，導覽用連結

- 改變資料、狀態、顯示內容或提交表單：使用 `<button>`。
- 前往另一頁、另一個 URL 或頁內錨點：使用 `<a href>`。
- 標題、清單、表格、表單、導覽與主要內容使用對應的原生 HTML。
- 不得以 `<div onclick>`、`<span role="button">` 或沒有 `href` 的 `<a>` 模擬控制項。
- 導覽若是流程主線，可以有按鈕外觀，但語意仍維持連結。
- ARIA 只補足 HTML 沒有的語意；不得用 ARIA 覆蓋正確的原生語意。

**依據：** WAI-ARIA APG 的原生命名／鍵盤原則、NN/g〈Buttons vs. Links〉。

**驗證：** `check:ui`、axe、鍵盤人工巡覽；`affordance.spec.ts` 驗算出來的外觀。

### R-2　互動元素必須可辨識，且所有狀態都看得懂

互動元素至少要有一種持續可見的形狀：邊框、底色、外框、陰影、底線或公認的控制項
外觀。只靠文字顏色、游標變化、滑入動畫或位置猜測，不算完整線索。

所有適用狀態都必須可分辨：

- default、hover、active／pressed、focus-visible；
- selected／current／expanded；
- pending、success、warning、error；
- disabled（若真的需要渲染）。

狀態不得只靠顏色；至少再加文字、圖示、形狀、粗細或位置。hover 不能是唯一回饋，
因為觸控裝置沒有穩定 hover。

**限定豁免：**

1. 已在明確 `<nav>` 區域中的一般導覽連結，可由位置、目前頁標記與一致外觀共同表達；
2. 掛 `brand` class 的首頁標誌連結；
3. 行文內有持續底線的連結。

**依據：** WCAG 1.4.1、1.4.11、2.4.7；NN/g〈Beyond Blue Links〉。

**驗證：** `affordance.spec.ts`、`theme.spec.ts`、forced-colors 人工檢查。

### R-3　點擊／觸控目標尺寸

- 所有指標輸入目標至少 **24×24 CSS px**，或符合 WCAG 2.2 SC 2.5.8 的間距例外。
- 患者端、行動版、主要動作與高頻操作採至少 **44×44 CSS px**。
- icon 可以小於 44px，但它的可點擊區不能小於門檻。
- 相鄰的高風險與主要動作要有足夠間距，避免單手誤觸。

本專案對 44px 的採用是觸控可用性規則，不冒充 WCAG AA 的數值要求。Apple 對 iOS
建議 44×44 pt；Android／Material 常用 48dp。Web 的 CSS px、原生 pt 與 dp 不是同一單位，
這裡採 44 CSS px 是專案自己的保守門檻。

WCAG 2.5.8 的 Inline、Equivalent、Spacing、User agent control 與 Essential 例外必須
逐案判斷；不可把「看起來附近還有空間」當成自動豁免。

**依據：** WCAG 2.5.8／2.5.5、Apple HIG Accessibility／Buttons。

**驗證：** `typography.spec.ts`、`mobile-layout.spec.ts`；axe 的 `target-size` 規則
必須**明確啟用**，因為 axe-core 4.12 預設將它停用。24px 由 axe 把關，**44px 由
`affordance.spec.ts`「患者端的可點目標在手機寬度達到 44px」逐一掃描**——它量的是
可點擊方框（含內距），並依 Inline 例外略過句子裡的連結。加入這條掃描時抓到兩個：
標誌連結 280×41、政策頁頁尾的電話 90×20。

### R-4　短標籤不得逐字斷行；長標籤必須能正常換行

- 8 個中文字以內、沒有空格的獨立短標籤，正常狀態應維持單行。
- flex／grid 子項要正確使用 `min-width: 0`、`flex-shrink`、`flex-wrap`，不能被壓成
  一個中文字寬。
- 長按鈕、翻譯後文字、200% 放大文字必須允許在語意合理的位置換行；不得全站套用
  `white-space: nowrap`。
- 不得以裁切、`text-overflow: ellipsis` 或隱藏重要操作文字來通過版面測試。
- 只有當完整內容可在 focus／啟用後取得，且另有非 hover 的可發現提示時，次要資訊
  才可截斷。

「寧可整組換行，不把一個短詞拆成直書」與「長內容要能重排」必須同時成立。

**依據：** WCAG 1.4.4、1.4.10；web.dev typography。

**驗證：** `affordance.spec.ts` 在寬度矩陣量實際行盒；另以 200% 文字縮放檢查長標籤。

### R-5　動作排列依優先級、風險與可用空間決定

- 2–3 個短且同層級的動作，在每個目標都保有尺寸、標籤與間距時，優先並排。
- 空間不足、標籤較長、主要 CTA 需要全寬，或需要把破壞性動作與安全動作分開時，
  **可以且應該**換行或堆疊。
- 主要動作在視覺與 DOM 順序都要一致；不得只用 CSS `order` 改變視覺順序。
- 破壞性動作不得緊貼最常用的主要動作，也不得因「省垂直空間」排到容易誤觸的位置。
- 可重用元件的重排依容器可用空間決定，優先使用 flex/grid 與 container query；
  不以「手機／平板／桌機」名稱猜裝置。
- 不得無理由在寬斷點強制直排，也不得把「所有按鈕都禁止滿寬」寫成通則。

這條取代舊版「有空間就一律並排、最高優先」的過度規則；WCAG 1.4.10 要求的是重排
後不遺失功能，不要求按鈕一定橫排或直排。

**依據：** WCAG 1.4.10；web.dev responsive design；NN/g 的錯誤預防原則。

**驗證：** `affordance.spec.ts` 驗寬畫面不出現無理由堆疊；手機與長標籤由
`mobile-layout.spec.ts` 及人工檢查判定。

### R-6　文字可讀性與縮放

- 正文、導覽、表單標籤、錯誤、提示與控制項的計算後字級至少 **16px**。
- 14px 只用於代碼、徽章、eyebrow、極次要 metadata 等不影響任務完成的短文字。
- 不得小於 14px；不得把說明縮小來修版。
- 字級使用設計 token；流體字級必須混合 `rem` 等可縮放單位，不能只用 `vw`。
- 正文使用 unitless `line-height`，一般為 1.5–1.8；繁體中文長文不做左右齊行。
- 長文建議限制在約 32–40 個中文字寬；目前共用實作可用約 `68ch` 作保守上限。
- 必須通過 200% 文字放大與 400% 頁面縮放對應的重排；不得禁止 pinch zoom。
- 使用者覆寫行高、段距、字距與詞距時，不得遺失內容或功能。

16px 表單控制項也能避免 iOS Safari 常見的聚焦自動放大；這是實務相容性門檻，不是
WCAG 明定的最小字級。

**依據：** WCAG 1.4.4、1.4.10、1.4.12；web.dev typography；CSS-Tricks 的 iOS
表單聚焦實測。

**驗證：** `check:tokens`、`typography.spec.ts`、`responsive.spec.ts`、人工文字間距
與縮放測試。

### R-7　表單要有永久可見的標籤、說明與正確輸入目的

- 每個控制項都要有程式可辨識、肉眼持續可見的 label；placeholder 不能代替 label。
- 行動裝置直向表單預設將 label 放在欄位上方，使輸入值有完整寬度。
- 同一題的選項用 `<fieldset>`／`<legend>` 或等效原生分組。
- 必填／選填、格式、單位、限制與蒐集原因要在輸入前可取得，不得等錯誤後才說。
- 個人資料欄位使用正確的 `type`、`name` 與標準 `autocomplete` token；不得全表一律
  `autocomplete="off"`。
- 手機鍵盤使用正確 `inputmode` 與需要時的 `enterkeyhint`。`inputmode` 只提示鍵盤，
  不能代替資料驗證。
- 密碼管理器、貼上與 OTP 自動填入不得被阻擋；OTP 可使用 `autocomplete="one-time-code"`。
- 身分證等高敏感或不適合共用裝置自動填入的欄位可以關閉 autocomplete，但要有逐欄
  隱私理由，不得用自造 token 欺騙瀏覽器。
- 一個邏輯資料預設使用一個欄位；電話、識別碼不得無理由拆成多格。接受合理的空白、
  連字號與全／半形差異，再於資料層正規化。

**依據：** WCAG 1.3.1、1.3.5、3.3.2、3.3.7；HTML／MDN `autocomplete`、
`inputmode`；WAI-ARIA APG names；Baymard mobile forms。

**驗證：** `check:ui`、axe、表單 E2E；iOS／Android 實機打開每種鍵盤與 autofill。

`check:ui` 逐欄釘住患者表單的 autocomplete token（`name`／`tel`／`bday`，身分證
為具名決定的 `off`）。**自造 token 不會報錯、只會被瀏覽器忽略**，畫面上完全看不
出差別，所以這是必須由掃描而非目視把關的一項。

### R-8　驗證時機與錯誤訊息

- 送出按鈕不得因欄位未完成而長期 disabled；允許使用者按下後取得完整、可修正的原因。
- 不在使用者尚未完成輸入時搶先報錯。一般在欄位離開後或送出時驗證；即時驗證只用於
  高錯誤率且已證明能幫助完成的格式。
- 錯誤要靠文字指出「哪一欄、發生什麼、怎麼修」，不得只有紅框、星號或「格式錯誤」。
- 錯誤文字要靠近欄位，以 `aria-describedby` 關聯並設定適當 `aria-invalid`。
- 送出失敗必須保留使用者已輸入的安全資料，不得清空整份表單。
- 多錯誤或長表單要有頁首錯誤摘要，連回各錯誤欄位；短表單至少要聚焦第一個錯誤，
  並公告錯誤數量。
- 錯誤修正後要移除過期錯誤狀態；後端與前端驗證規則不得互相矛盾。
- 文案使用自然語言，不怪罪使用者，不顯示內部例外、堆疊或無補救方向的錯誤碼。

**依據：** WCAG 3.3.1、3.3.3；GOV.UK validation／error message；NHS error summary；
NN/g error-message guidelines；Baymard inline validation。

**驗證：** 患者完整流程 E2E；人工以空值、格式錯誤、過期時段、網路失敗逐一測試。

### R-9　每次操作都要有就地、可理解、可報讀的狀態

- 啟動後立即提供 pressed／pending 回饋；未完成前防止重複提交。
- pending 文字要說明正在做什麼，例如「正在建立預約」，不能只剩 spinner。
- 成功只在權威結果確定後顯示；預約成功要包含預約編號、台北時間與下一步。
- 失敗要說明資料是否已送出、可否重試、是否需改用電話等替代管道。
- 就地回饋放在操作點附近；簡短狀態另由 `role="status"` 或 `aria-live="polite"` 公告。
- 空白、無搜尋結果、無權限、離線、逾時、維護、部分成功都要有專屬狀態與下一步；
  不得把空白畫面當作結果。
- 非同步失敗不得把尚未保存的輸入靜默丟掉。

**依據：** WCAG 4.1.3；NN/g「系統狀態可見」與錯誤復原原則。

**驗證：** `workbench-lifecycle.spec.ts`、患者預約 E2E、斷網／慢速與重複點擊人工測試。

### R-10　重要、破壞性與不可逆操作要能避免誤觸

- 優先提供 Undo 或可回復設計；不能回復時才要求確認。
- 確認畫面要寫出**對象、動作、後果**，按鈕標籤使用具體動詞，不能只寫「確定」。
- 高風險確認預設焦點放在取消或最不破壞的選項。
- 不為每個低風險儲存都跳確認框，避免確認疲勞。
- 修改／刪除持久資料、提交重要患者資料或造成法律／財務結果前，至少要能撤銷、
  檢查修正，或在最後一步確認。
- 離開仍有未保存內容的流程，要保留草稿或明確警告；重新整理與旋轉螢幕不得無故
  清空內容。

**依據：** WCAG 3.3.4；WAI-ARIA APG dialog；NN/g error prevention／confirmation。

**驗證：** 破壞性操作 E2E；人工檢查焦點、文案、Esc、取消與回復路徑。

### R-11　完整鍵盤操作、可見焦點與可預測順序

- 所有功能都必須只用鍵盤完成，沒有鍵盤陷阱。
- DOM／閱讀／Tab 順序一致；不得用正值 `tabindex` 修補順序。
- 自訂複合元件遵循相對應 APG 鍵盤模式；不自創相反的方向鍵語意。
- 每個可聚焦元素都有持續可見的 `:focus-visible`。自訂焦點框至少 2 CSS px，並對
  相鄰顏色達 3:1；forced-colors 下改用系統色。
- sticky header、footer、toast、鍵盤與浮層不得完全遮住焦點；專案目標是**完全不遮**。
- 內容切換、送出失敗、彈窗開關、刪除列項後，焦點移到下一個合理工作點。
- 每頁第一個可操作入口提供 skip link；hash 深連結與工作區切換要把焦點移到內容標題。

**依據：** WCAG 2.1.1、2.1.2、2.4.3、2.4.7、2.4.11；WAI-ARIA APG keyboard。

**驗證：** `manual-accessibility-test.md`、Playwright 焦點斷言、Windows forced-colors。

### R-12　Dialog、popover 與浮層

- Modal 優先用原生 `<dialog>.showModal()`，並符合 APG dialog 的名稱、初始焦點、
  焦點圈、Esc、可見關閉控制與關閉後焦點回復。
- 高風險對話框初始焦點放最安全選項；長內容先聚焦標題或說明，不讓開頭滾出畫面。
- 非 modal popover 不得宣稱 `aria-modal="true"`；焦點離開、Esc 或明確關閉後收合，
  並把焦點合理還給觸發器。
- 點擊外部關閉不能是唯一關閉方式。
- 手機浮層要完整留在可視 viewport，標題、關閉鍵與目前焦點不可被裁切。
- 背景若標成 inert，就必須真的無法被任何輸入方式操作。

**依據：** WAI-ARIA APG dialog pattern、WCAG 2.4.11。

**驗證：** `mobile-layout.spec.ts`、對話框 E2E、VoiceOver／TalkBack 與鍵盤人工測試。

### R-13　響應式重排不是縮小桌機版

- 每頁必須有 `<meta name="viewport" content="width=device-width, initial-scale=1">`；
  不得設定 `user-scalable=no` 或限制最大縮放。
- 在 320 CSS px 寬度與相當於桌面 400% zoom 時，非例外內容不得有雙向捲動、重疊、
  裁切或功能遺失。
- 兩維關係必要的表格、週曆、地圖可在**自身容器**橫捲；不能把整頁推出去。
- breakpoint 由內容何時放不下決定，並檢查斷點前後 1px；不得只測幾個熱門機型。
- 主要資訊與功能不能因螢幕窄而 `display: none`。可以改位置、收進有名稱的 disclosure
  或分段呈現，但必須仍可發現、可操作。
- 響應式改排不能改變資訊含義、權限、選取狀態或閱讀順序。

**依據：** WCAG 1.4.4、1.4.10；web.dev accessible responsive design。

**驗證：** `responsive.spec.ts` 的寬度與斷點矩陣、`mobile-layout.spec.ts` 的有資料狀態。

### R-14　行動裝置 viewport、虛擬鍵盤、安全區與方向

- 同時支援直向與橫向；不得鎖定方向，除非方向對任務本質不可替代。
- 全螢幕或滿高元件不得只依賴裸 `100vh`。依目的使用 `svh`／`dvh`，並在瀏覽器工具列
  展開、收合時確認內容不被遮住或跳動。
- fixed／sticky 的頂底列、CTA、toast 與浮層要計入
  `env(safe-area-inset-*)`；內容末端要留出等量可捲空間。
- 軟鍵盤開啟時，目前欄位、label、錯誤與下一步仍要可見；不得被 sticky footer 擋住。
- 對話框與長表單在 320×568 及手機橫向的低高度仍可捲到所有控制項。
- 點擊目標不因 browser chrome、瀏海、圓角、系統手勢區或摺疊螢幕鉸鏈而落在不可用區。

**依據：** WCAG 1.3.4、2.4.11；MDN viewport units、`env()`；Apple HIG layout。

**驗證：** 行動實機矩陣；Playwright 補 320×568、375×667 橫向及 dialog／表單焦點可見性。

### R-15　不能有只能 hover、拖曳、滑動或複雜手勢完成的功能

- hover／focus 顯示的必要內容要可移入、可關閉、且不會自行消失。
- 拖曳排序、滑動刪除、長按、pinch、多指或裝置搖晃都必須有單指點擊與鍵盤替代。
- pointer down 不直接完成高風險動作；使用者移出目標或取消時不得誤觸。
- 手勢使用平台慣例；自訂手勢只作加速器，不能成為唯一入口。
- 觸控、滑鼠、觸控筆與鍵盤可以並存；不得因偵測到一種輸入而停用其他輸入。

**依據：** WCAG 1.4.13、2.5.1、2.5.2、2.5.4、2.5.6、2.5.7；Apple HIG gestures。

**驗證：** axe 可判定項目＋鍵盤、觸控筆與行動實機人工測試。

### R-16　色彩、對比、主題與高對比模式

- 一般文字至少 4.5:1；符合 WCAG 定義的大字至少 3:1。
- 控制項邊界、必要圖示、選取與焦點等非文字視覺資訊至少 3:1。
- placeholder、錯誤、提示、disabled 以外的可用狀態不得因「次要」而低於門檻。
- 所有主題、hover／focus／selected／error 狀態都要逐組驗對比，不只驗預設畫面。
- 成功、警告、錯誤、目前位置與可用性不只靠顏色。
- Windows forced-colors 下不得用背景圖、透明度或 box-shadow 作唯一狀態線索。
- 品牌香檳金只作裝飾，不承載狀態、焦點、互動、優先級或系統健康。

**依據：** WCAG 1.4.1、1.4.3、1.4.11。

**驗證：** axe、`theme.spec.ts`、`check:tokens`、forced-colors 人工測試。

### R-17　動效克制，並尊重使用者偏好

- 動效只用來解釋狀態與空間關係，不作持續裝飾或阻擋操作。
- `prefers-reduced-motion: reduce` 下關閉非必要動畫與 transition；功能不能依賴動畫。
- 不使用快速閃爍；任何閃光不得超過 WCAG 的三次閃爍門檻。
- 自動移動、閃爍、捲動或每 5 秒更新的非必要內容，要能暫停、停止或隱藏。
- 不用大幅 parallax、無控制自動輪播、反覆縮放或彈跳吸引注意。
- 動效時長與 easing 使用 design token；pending 不能靠旋轉圖示作唯一訊號。

**依據：** WCAG 2.2.2、2.3.1、2.3.3；Apple HIG accessibility／Reduce Motion。

**驗證：** `check:tokens`、CSS media emulation、前庭敏感度人工檢查。

### R-18　可及名稱、圖示與頁面結構

- 每頁有唯一、描述任務的 `<title>` 與 `<h1>`；標題層級反映結構，不用字級假裝標題。
- 主要 landmark 使用 `header`／`nav`／`main`／`footer`；多個同類 landmark 要有不同名稱。
- 可見文字優先作 accessible name；名稱要包含畫面上可見的標籤文字。
- icon-only 控制項必須有具體名稱；「X」「齒輪」「更多」要說出作用與對象。
- 純裝飾圖 `alt=""`；承載資訊的圖片有等價替代文字；品牌 logo 的替代文字說明品牌，
  不描述像素外觀。
- Tooltip 不能是控制項名稱或必要說明的唯一來源。
- 語言切換、英文品牌字與代碼片段在需要時標正確 `lang`。

**依據：** WCAG 1.1.1、1.3.1、2.4.2、2.4.6、2.5.3、3.1.1、4.1.2；
WAI-ARIA APG names。

**驗證：** axe、`check:ui`、報讀器 headings／landmarks／controls 清單。

### R-19　動態內容只公告必要摘要

- 清單、表格或卡片整批更新時，不把整個容器設成 live region。
- 以獨立、簡短、穩定的 `role="status"`／`aria-live="polite"` 公告結果數與完成狀態。
- `role="alert"`／assertive 只用於需要立即處理的重大錯誤，不濫用。
- 同一事件不得由多個 live region 重複播報；短時間連續更新要合併或節流。
- 視覺上在操作點旁也要有相同意思的狀態；不可只對報讀器或只對視覺使用者顯示。

**依據：** WCAG 4.1.3；WAI-ARIA APG live-region 實務。

**驗證：** `check:ui`、`workbench-lifecycle.spec.ts`、NVDA／VoiceOver／TalkBack 實聽。

### R-20　表格、清單、週曆與橫向捲動

- 真正的列欄資料使用 `<table>`、`caption`、`th` 與正確 scope；不用 div grid 假裝表格。
- 排序控制放在欄名內的 `<button>`；`aria-sort` 只掛目前排序欄。
- 手機可以把資料呈現為卡片，但每個值仍要有可見欄名，且不能破壞報讀器的表頭關聯。
- 保持二維關係才看得懂的表格／週曆放在具名稱的局部橫捲容器；要有「後面還有內容」
  的視覺提示，容器可用鍵盤捲動，頁面本身不橫捲。
- 高風險或患者關鍵資訊不能只存在 hover tooltip、截斷 cell 或顏色圖例。
- 複雜週曆應另有可線性閱讀的清單／議程檢視；手機不強迫使用者精準拖曳小事件。

**依據：** WCAG 1.3.1、1.4.10、2.1.1；WAI-ARIA APG table／grid／sortable table。

**驗證：** 週曆、排序與 mobile layout E2E；行動報讀器檢查欄名是否重複或遺失。

### R-21　多步驟預約要可理解、返回、修正與確認

- 步驟數、目前步驟與完成狀態持續可見，並以 `aria-current="step"` 表達。
- 前進後焦點移到新步驟標題；返回保留先前輸入與選擇。
- 不要求記住上一頁資訊；目前選擇在需要決策的位置附近重述。
- 最後提交前顯示診所、項目、日期、時間、時區與聯絡資料摘要，並可返回修正。
- 成功頁不能只寫「完成」；要顯示預約編號、狀態、台北時間、變更／取消方式與診所
  聯絡替代管道。
- 瀏覽器返回、重新整理、方向切換與短暫離線不得造成無說明的重複預約或資料遺失。

**依據：** WCAG 3.3.4、3.3.7；NN/g recognition rather than recall／user control。

**驗證：** `patient-booking.spec.ts`、手機返回／旋轉／重送人工測試。

### R-22　介面本身要遵守資料最小化與隱私

- 只詢問完成預約與核准流程所需資料；新增欄位先走隱私與決策 gate。
- 不把身分證、生日、電話、醫療項目等敏感資料放進 URL、頁面標題、analytics、
  console、toast、錯誤碼、Calendar、通知預覽或可分享的截圖文案。
- 清單與非必要檢視遮罩敏感資料；需要核對完整值時要有明確權限與操作目的。
- 共用裝置、瀏覽器儲存與 autofill 的風險要在輸入前用白話說明。
- session timeout、登出或權限失效要先保護未送出內容，再避免下一位使用者看到前一位
  資料。
- UI 隱藏不是授權。未授權動作要從 DOM 與可及樹移除，API／domain 仍各自拒絕。
- 暫時不可用但有權限的動作可以 disabled；必須在控制項附近說明何時或如何恢復。

**依據：** 專案隱私基線、最小權限與 NN/g recognition／error prevention。

**驗證：** `check:ui`、角色 E2E、隱私政策測試、人工檢查 URL／console／狀態訊息。

### R-23　效能與穩定度是 UX 門檻

- 公開頁面的實際使用者資料目標：LCP ≤2.5s、INP ≤200ms、CLS ≤0.1，以 mobile 與
  desktop 分開計算第 75 百分位。
- 沒有正式流量前，以 build budget 與 lab E2E 作回歸門檻；不得把本機單次數字寫成
  已通過 field Core Web Vitals。
- 互動在一個 frame 內呈現按下／pending 狀態；長任務不得凍結主執行緒。
- 圖片與嵌入內容預留尺寸，避免載入後推動按鈕；首屏關鍵內容不 lazy-load。
- 行動網路下先交付可讀 HTML 與主要任務；非必要字型、追蹤碼與裝飾資產不得阻塞。
- 性能預算調高必須留下理由與實測，不可只為了讓 CI 變綠。

**依據：** web.dev Core Web Vitals／INP；NN/g visibility of system status。

**驗證：** `check:perf`、`performance.spec.ts`；上線後若隱私／監測決策已核准，才可使用經審查且資料最小化的
RUM；否則只使用不需在產品植入追蹤碼的 CrUX。未核准前不得新增 analytics。兩者都應觀察 p75，並分別檢視行動與桌面。

### R-24　文案、日期與時間要符合使用者語言

- 用患者與櫃台熟悉的詞，不顯示內部 enum、技術縮寫或實作名詞。
- 按鈕以動詞＋對象命名；同一動作全站使用同一詞。
- 說明短、可掃描，先寫結論與下一步；必要資訊不藏在 FAQ 或 tooltip。
- 日期採清楚的西元年月日，避免 `07/08` 這類歧義；時間採 24 小時制。
- 預約、回診與營業時間明示「台北時間／Asia/Taipei」；跨日或相對日期同時顯示絕對
  日期。
- 狀態文案區分「尚未送出」「處理中」「已建立」「待診所確認」「失敗」，不能混用。

**依據：** WCAG 2.4.6、3.1、3.2.4；NN/g match with the real world／consistency。

**驗證：** 內容 review、關鍵狀態快照、患者與櫃台任務測試。

### R-25　登入與驗證不得製造不必要的認知障礙

- 允許密碼管理器與貼上，不要求記憶、轉錄或解謎作為唯一登入路徑。
- 不阻擋 OTP 貼上；單一 OTP 欄位優先於多格跳焦點設計。
- CAPTCHA 若必須存在，要有不依賴同類認知測驗的替代方式。
- 登入逾時前警告，允許延長；重新登入後保留可安全恢復的工作脈絡。
- 錯誤訊息避免洩漏帳號是否存在，同時要提供可行的復原入口。

**依據：** WCAG 2.2.1、2.2.5、3.3.8。

**驗證：** 登入 E2E、密碼管理器／paste／OTP／timeout 人工測試。

## 4. 新頁面與新元件的完成定義

### 4.1 新增對外頁面

新增頁面必須在同一個變更完成：

1. 加入可點擊性、短標籤、鍵盤與狀態掃描；
2. 加入 axe 掃描，並涵蓋初始、填寫、錯誤、成功、空白與 loading 中實際存在的狀態；
3. 加入響應式寬度／高度矩陣與 200% text、400% zoom；
4. 加入 `performance-budget.json` 與 Core Web Vitals lab 測試；
5. 在 `check-structure.mjs` 登記，並決定 CSP、robots、canonical、sitemap；
6. 檢查個資欄位、URL、錯誤、儲存、分享與 analytics；
7. 在 iOS Safari、Android Chrome、VoiceOver、TalkBack 至少各跑患者主流程一次；
8. 登記到 `docs/README.md` 與對應人工驗收紀錄。

**制度優化要求：** 對外頁面清單應收斂成單一 machine-readable inventory，讓 axe、
responsive、affordance、performance 與 SEO 測試共同讀取。完成前，上述逐檔登記仍是
必要的過渡程序；不得因「另一支測試已有這頁」假設所有掃描都涵蓋。

### 4.2 新增自訂互動元件

實作前依序確認：

1. 原生 HTML 是否已能完成；
2. 若需 ARIA，對應 APG pattern、keyboard interaction 與 accessible name 是什麼；
3. default／hover／focus／active／selected／disabled／pending／error 如何呈現；
4. 320px、200% text、400% zoom、直向／橫向、虛擬鍵盤與 safe area 如何重排；
5. 滑鼠、鍵盤、觸控、報讀器與 forced-colors 如何完成同一功能；
6. 空白、極長中文、最大資料量、慢速、斷線與權限拒絕時如何復原。

只做 happy path 的元件不算完成。

## 5. 強制驗收矩陣

### 5.1 自動化

| 面向                         | 最低 gate                                            |
| ---------------------------- | ---------------------------------------------------- |
| 結構／允許欄位／隱私邊界     | `corepack pnpm check:ui`                             |
| design token／主題           | `corepack pnpm check:tokens`、`theme.spec.ts`        |
| 語意／對比／名稱             | `accessibility.spec.ts`；axe serious／critical 擋 CI |
| 24px target size             | axe `target-size` 明確啟用並擋 CI                    |
| 44px 主要／手機控制項        | `typography.spec.ts`、`mobile-layout.spec.ts`        |
| 320px reflow／斷點邊界       | `responsive.spec.ts`                                 |
| affordance／短標籤／動作排列 | `affordance.spec.ts`                                 |
| 手機有資料與浮層狀態         | `mobile-layout.spec.ts`、`week-calendar.spec.ts`     |
| 完整流程與錯誤               | patient／workbench lifecycle E2E                     |
| 效能                         | `check:perf`、`performance.spec.ts`                  |

自動化必須跑打包後產物。只掃空白清單、登入前首頁或預設 tab，不能代表該頁已覆蓋。

### 5.2 桌面人工檢查

- Chrome／Edge 最新穩定版；Firefox；macOS 有條件時補 Safari。
- 只用鍵盤完成患者預約與櫃台主要流程。
- 200% text resize、400% zoom、Windows forced-colors。
- NVDA＋Chrome/Edge 或 VoiceOver＋Safari。
- 慢速、斷線、逾時、重試、重複點擊、上一頁與重新整理。

### 5.3 行動裝置人工檢查

模擬器只作初篩；上線證據至少包含一台實體 iPhone 與一台實體 Android：

| 情境                    | 必查                                                   |
| ----------------------- | ------------------------------------------------------ |
| iPhone／iOS Safari 直向 | 四步驟、鍵盤型態、聚焦縮放、safe area、返回、旋轉      |
| iPhone／iOS Safari 橫向 | 軟鍵盤後 label／錯誤／CTA 仍可見，浮層可完整捲動       |
| iOS VoiceOver           | rotor、標題、表單、錯誤、時段、成功與 dialog           |
| Android Chrome 直／橫向 | autofill、TalkBack、系統字級 200%、返回手勢            |
| TalkBack                | 線性閱讀、控制項名稱、選取、狀態更新、局部橫捲         |
| 320×568 低高度          | header、sticky、dialog、最後一個欄位與送出鍵不互相遮擋 |
| 弱網／離線              | 資料不丟失、不重複建立，錯誤有替代聯絡方式             |

### 5.4 每個流程都要有的資料狀態

- 0 筆、1 筆、多筆、最大合理筆數；
- 最短與最長合法中文、英文、數字、日期、電話與識別碼；
- 欄位空白、格式錯誤、衝突、過期、權限拒絕；
- loading、成功、部分成功、失敗、重試、逾時、離線、維護；
- 200% 字體、深色、護眼、forced-colors、reduced-motion。

## 6. 例外處理

任何例外必須同時具備：

1. 寫在本文件對應規則下，或連到具名 ADR／decision；
2. 說明為何該情境不適用、影響哪些人、替代路徑與風險；
3. 寫明 owner、到期／解除條件與驗證方式；
4. 掃描若會擋，加入**具名且最小範圍**的豁免，附同一理由；
5. 不得用「暫時」「設計如此」「第三方元件」或「axe 沒報」單獨當理由。

例外不得降低患者安全、資料隱私、基本鍵盤操作或完成預約的能力。

## 7. 2026-07-27 複核後修正

1. **修正 R-5：** 「有空間一律並排」改為按優先級、風險、標籤與容器空間決定；
   滿寬 CTA 與安全分隔不再被錯判。
2. **修正 R-4：** `nowrap` 只保護短標籤；長標籤、翻譯與文字放大必須能換行。
3. **修正 R-3：** WCAG AA 是 24px／spacing 規則；44px 明確標成專案觸控門檻。
4. **修正驗證敘述：** axe-core 4.12 的 `target-size` 預設停用，測試必須明確開啟。
5. **補上手機缺口：** 直／橫向、低高度、動態 viewport、safe area、虛擬鍵盤、
   VoiceOver、TalkBack、系統字級與弱網。
6. **補上完整 UX：** 表單、錯誤、等待、破壞性動作、焦點、dialog、live region、
   複雜表格、登入、隱私與 Core Web Vitals。
7. **校正合規說法：** WCAG 2.2 AA 工程基線、台灣標章與 WCAG 3.0 草案分開處理。

## 8. 參考資料

### 官方與標準

- [W3C — WCAG 2 Overview](https://www.w3.org/WAI/standards-guidelines/wcag/)
- [W3C — WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- [W3C — WCAG 2.2 Understanding documents](https://www.w3.org/WAI/WCAG22/Understanding/)
- [W3C — WCAG 3.0 Working Draft](https://www.w3.org/TR/wcag-3.0/)
- [WAI-ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/)
- [WAI-ARIA APG — Keyboard Interface](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/)
- [WAI-ARIA APG — Names and Descriptions](https://www.w3.org/WAI/ARIA/apg/practices/names-and-descriptions/)
- [WAI-ARIA APG — Dialog Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
- [數位發展部 — 115.11 網站無障礙規範實施公告](https://accessibility.moda.gov.tw/News/Detail/5608?Category=43)
- [Apple Human Interface Guidelines — Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)
- [Apple Human Interface Guidelines — Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons)
- [Android Developers — Make apps more accessible](https://developer.android.com/guide/topics/ui/accessibility/apps)
- [MDN — `inputmode`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/inputmode)
- [MDN — `autocomplete`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/autocomplete)
- [MDN — viewport-relative length units](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/length#relative_length_units_based_on_viewport)
- [MDN — `env()` and safe-area insets](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/env)
- [web.dev — Core Web Vitals](https://web.dev/articles/vitals)
- [web.dev — Optimize INP](https://web.dev/articles/optimize-inp)
- [web.dev — Accessible responsive design](https://web.dev/articles/accessible-responsive-design)
- [web.dev — Typography](https://web.dev/learn/design/typography)

### 權威實務與研究型設計系統

- [NN/g — 10 Usability Heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/)
- [NN/g — Error-Message Guidelines](https://www.nngroup.com/articles/error-message-guidelines/)
- [NN/g — Confirmation Dialogs](https://www.nngroup.com/articles/confirmation-dialog/)
- [NN/g — Beyond Blue Links](https://www.nngroup.com/articles/clickable-elements/)
- [NN/g — Buttons vs. Links](https://www.nngroup.com/videos/buttons-vs-links/)
- [GOV.UK Design System — Validation](https://design-system.service.gov.uk/patterns/validation/)
- [GOV.UK Design System — Error message](https://design-system.service.gov.uk/components/error-message/)
- [NHS Digital Service Manual — Error summary](https://service-manual.nhs.uk/design-system/components/error-summary)
- [Baymard — Mobile form label position](https://baymard.com/blog/mobile-form-usability-label-position)
- [Baymard — Inline form validation](https://baymard.com/blog/inline-form-validation)
- [CSS-Tricks — 16px input text and iOS focus zoom](https://css-tricks.com/16px-or-larger-text-prevents-ios-form-zoom/)

### 專案內

- [網頁品質把關](../architecture/web-quality-gates-2026-07-24.md)
- [人工無障礙測試 runbook](../runbooks/manual-accessibility-test.md)
- [工作臺與患者預約 UI／UX](test-only-operations-ui.md)
- [Boutique Clinical Command 設計文件](boutique-clinical-command-2026-07-25.md)
