# 官網視覺、UI/UX、技能與 CI 詳細交接

**查證日期：2026-10-10，Asia/Taipei。** 本紀錄交接 PR #243 與本機設計原型；
沒有宣告官網完成、國際設計水準達標、醫療內容核准、正式整合或部署。

## 1. 接手先讀的結論

已完成兩條不同工作：repository 內的設計／動效／文案／檢查技能與 CI 修復，
以及 repository 外的六頁本機原型與多次首頁修改。PR 的 CI 驗證前者；本機原型
有自己的畫面與操作證據，不能借用 PR 綠燈宣稱網站已正式交付。

業主要求的「國際比賽等級」仍是視覺目標，**目前未達成最終視覺驗收**。
之前弱的教學範例已撤掉，舊官網、未接受原型與 maker 自評都不能作為成功基準。
接手應先把首頁構圖、字體、圖片、閱讀節奏與動效做成熟，再延伸五個不同構圖的內頁。
不要以文件完整、六頁存在或機械檢查 PASS 代替畫面完成。

## 2. 位置、版本及交付邊界

| 項目 | 2026-10-10 核對結果 |
| --- | --- |
| Repository／PR | [waydefu/clinic #243](https://github.com/waydefu/clinic/pull/243)，OPEN，未合併 |
| Canonical checkout | `F:/診所專案/tmp/ui-check-refresh-20261005`；`F:/診所專案` 本身不是 Git checkout |
| 分支／已交付 source head | `agent/clinic-visual-direction-20261006`；`b0c32789ce241c83c59b33123f0b7beccc8a6899` |
| 實際 remote main | `ede751bd64d1ba213e5584908033aa51d8ee5ec9`；以 remote ref 核對，不只相信 PR API 的 base SHA |
| 本機原型 | `F:/診所專案/tmp/clinic-editorial-home-20261006`；此目錄的 source、產物與圖片沒有納入本 PR diff |
| 本機預覽 | `http://127.0.0.1:3216/clinic`；本日 HEAD probe 200，listener 為 `127.0.0.1:3216` |
| 預約邊界 | 原型 `/booking` 302 到既有 `http://127.0.0.1:3100/booking`；沒有新增表單、資料模型或個別醫師預約 |
| 本交接的提交 | 本文不寫自身 commit hash；從 PR 的交接留言或 `git log -- docs/reviews/2026-10-10-clinic-ui-design-implementation-handoff.md` 取得 |

已交付主要修訂：

- `365476b766c11c0536b9be13a51b7de076269a5f`：技能及獲獎研究版本，曾被 runner 的 Ubuntu 索引下載阻擋。
- `94206a750c3a774f30126cdc82910f99a92f9368`：優先既有 Ubuntu HTTPS mirrors、驗證有效 APT bounds、獨立安裝 timeout。
- `73b13ba5f758b454c906def3dcfd62203ce81a19`：真實 APT parser 測試用 `APT_CONFIG` 隔離 host 設定。
- `b0c32789ce241c83c59b33123f0b7beccc8a6899`：多來源、來源獨立性、衝突及實際頁面驗證規則。

**可攜性缺口：** GitHub 可讀本 Markdown 與下列 snapshot，但不能由本 PR 直接執行
本機網站樣稿。跨機器接手必須取得原型資料夾、原素材 archive 與既有工具 runtime；
不能把 Windows 絕對路徑寫成已上傳的 artifact，也不能假稱原型 source 已正式整合。
本次沒有上傳付費原圖、第三方參考媒體或本機錄影。

## 3. 已確定的品牌與業主要求

方向為「精品醫療品牌 × editorial medical publishing × 安靜自然的日系空間感」。
保留霧林、淺綠、深色閱讀文字、自有插畫、診所照片與醫師肖像；可重新構圖，
不要求沿用舊 layout。以字體、圖片及空間承擔視覺表現，不靠大量 UI chrome。

- 原官網付費素材優先利用，不能先做無關模板再把素材塞進去。
- 原入口標誌牆作首頁輪播第一張，品牌不可被標題或裁切遮住。
- 大面積深綠已要求改淺綠。業主否定亮綠按鈕、明顯的大圓點、低品質箭頭及單純文字連結。
- 文案使用白話自然繁體中文，所有醫療陳述、比較、數值、器械、效果、適應性及照護要有來源與審閱狀態。
- 一張弱的睡眠人物插畫家族獲准重畫；這不是全面重畫所有原創素材的授權。
- 後續指定的完整醫療圖不能任意裁切、拆圖、mask 或 `object-fit:cover`；整張等比呈現，可提供放大及 HTML 說明。
- 醫師是介紹與照護角色，不提供個別醫師預約 CTA。預約屬另一個既有專案。
- Cards default to no；不量產相同圓角卡片、左文右圖 hero、相同 section padding、裝飾編號、pills、blobs 或 glassmorphism。
- 六頁使用同一視覺語言，各自保留內容節奏；375px 重新構圖，不能只把 desktop stack 成一欄。

## 4. PR 內已交付的技能與 CI

| 技能／檔案 | 責任與已補內容 |
| --- | --- |
| `.claude/skills/ui-design/SKILL.md` | 圖片、字體、構圖、留白、mobile、獲獎研究與 screenshot → critique → structural revision；首頁 benchmark gate |
| `ui-design/reference/` | 五份 canonical reference：`visual-direction.md`、`visual-review.md`、`sources-and-rights.md`、`visual-foundations.md`、`award-benchmarks.md` |
| `.claude/skills/ui-motion/` | 時間構圖、輪播／選單回饋、取消與中斷、reduced motion、Anime.js 的 module cost／CSP／lifecycle 評估；兩份 reference |
| `.claude/skills/ui-content/` | 新增白話文案、資訊順序、保留來源意義、真正比較軸及完整圖的可讀文字說明 |
| `.claude/skills/ui-check/` | 工程矩陣、viewport、鍵盤、44px、200% 文字、CSP／Trusted Types、下載預算；既有 captures 是 regression，不是美感標準 |
| `.agents/skills/` | 現有 generator 產生八份 adapters；只複製 SKILL.md，reference 連回 `.claude`，不要為此改 generator 或複製 reference 目錄 |
| `scripts/prepare-ci-apt.mjs` | 只在 GitHub Actions Linux x64 Ubuntu 執行；來源集合 fail closed、既有 HTTPS sources 優先、確認有效 retry／timeout 值 |
| `scripts/prepare-ci-apt.test.mjs` | 來源集合、排序、無效／重複／缺失來源、namespace／override、local CLI 拒絕及真實 Linux parser 正反例 |
| `.github/workflows/verify.yml` | 六組 E2E 共用 APT 準備；瀏覽器及系統依賴安裝 5 分鐘 timeout，整體 20 分鐘、coverage、安全掃描與 required evidence 維持 |

不能把上述技能存在解讀成網站已有優秀設計或動效。已移除業主評為 0 分的教學頁與
副本；本機歷史 rejected branch／腳本不是可恢復成公開範例的 authority。

## 5. 本機網站實際已改內容

最新首頁候選是 **`multi-source-v14-20261008`**。這是實作，不只是技能文件；
但是 source prototype，沒有送進正式 `apps/web` 或 content-hashed dist。

| 區域 | 已實作與已修問題 |
| --- | --- |
| 頁首／第一屏 | 縮薄頁首，將原本分開的照片、標題、說明合成一個主視覺；入口標誌牆第一張，桌面文字左緣對齊；375 自己的照片／文字位置 |
| 中間寬度 | 真實 IAB 約 944px 發現品牌字被裁掉，增加 769／944／1100 的 camera framing；保留不同的手機 framing |
| 按鈕／方向 | 移除亮綠 hero 色塊、圖示方框；預約暖灰且方角；同頁／內頁／外連／放大／電話使用一份 native SVG vocabulary |
| 輪播圓點 | 未選中 4px、選中 6px，無外框；每顆獨立 44px 點選範圍，保留可存取名稱及選中狀態 |
| 六張照片 | 入口、看診空間、櫃台、候診、處置、診桌；既有 allocation 中安排，沒有因六張輪播新增六個 requests |
| 照護入口 | 四項內頁入口保留整張鼻甲圖與睡眠插畫的不同角色；完整圖有 native reader，沒有拆掉嵌入的醫療標示 |
| 醫師 | 等高、放大有效肖像面積；姓名／角色／專長形成緊湊 profile，mobile 肖像旁放身份、摘要回全寬；詳細學經歷在醫師路由，無個別預約 |
| 環境 | 原候診實景為預設；照片選擇與看診說明分清楚，恢復既有 `HOME_PROCESS_ITEMS[0..3]` 原文；mobile 四段改緊湊連續閱讀，不再四張格子 |
| 手機選單 | native details，新增從現有四項照護抽出的直接入口；Escape 回 summary，外部點選關閉；修正展開後 x=-97 被裁掉、320 頁首不必要換行 |
| 地圖／社群／頁尾 | 有 OSM 來源交通示意、完整圖放大與導航；LINE／Instagram／Facebook 一個 SVG resource；完整網站頁尾，方向圖示與首頁一致 |
| 電話 | 移除舊電話 pseudo-element，避免字型圖示與 SVG 重複／換到下一行 |

動效使用原生 CSS／WAAPI，**目前沒有安裝 Anime.js**。照片採真正的前後雙層
560ms dissolve，decode 後一起提交 picture／label；generation guard 處理快速連選，
清理舊圖層與 animation handles。普通模式 7 秒輪播，hover／focus 暫停、明確操作再播放；
reduce 為手動切換，變更偏好時取消正在動的效果，回普通模式仍 paused。
選單有 220ms 的操作回饋，reduce 即時停止。圖片失敗保留有效畫面及重試訊息。

Anime.js 已研究；框架名稱不是設計目標，沒有因研究就增加 dependency、放寬 CSP 或
提高預算。既有 Anime.js WAAPI cleanup 與 WebKit CSP 相容性疑慮在 skill reference
有記錄；若再選用，必須測量具體 import、build、lifecycle 與全部相關 browsers。
不得寫「已用 Anime.js」或把以上狀態測試當作完整動效美感驗收。

## 6. 六頁與兩個 regression 路由

| 路由 | 本機狀態／下一個設計核心 |
| --- | --- |
| `/clinic` | 最新 v14；反覆改過，仍需國際等級整體視覺 benchmark，不是已驗收首頁 |
| `/clinic/nasal/snoring-five-in-one` | 初版及完整原圖存在；最新首頁語言尚未全面延伸；五類原因＋白天／夜晚體驗，不做五張相同卡片 |
| `/clinic/nasal/inferior-turbinate-surgery` | 完整圖、橫／直九欄比較及器械存在；以真正 information design 延伸，不用九張 cards 逃避比較 |
| `/clinic/nasal/septoplasty` | 完整五種型態與伴侶插畫存在；結構與 narrative progression，不能拆掉型態圖 |
| `/clinic/nasal/snore-relief-mouthguard` | 完整牙套實物圖文存在；實物主角，評估→製作→調整→配戴→照護才是合理 sequence |
| `/clinic/doctors` | 完整 profile 初版；portrait／姓名／專長／學經歷共同構圖，無個別預約 CTA |
| `/clinic/doctors/yan-cheng-an` | 沿用正式來源；shared shell／CSS 整合時列入 regression |
| `/clinic/doctors/yang-sheng-feng` | 同上；六個主要頁面不等於全部八條 clinic route |

v8～v14 使用 `--home-only`，沒有順手重產五個內頁。不要把 10/06 的內頁檢查或
10/08 的 baseline captures 說成全站已完成最新設計。

## 7. 多來源：做法、證據及限制

每個重要決策比較不同創作者的實際作品，再用相關 primary UX／type／motion 資料
及本診所的 rendered candidate 驗證。兩個 ESE 專案相關；同一作品的獎項頁和作者
案例是 provenance corroboration，仍只是一個作品。Gallery 轉述、多個 AI 意見及
平均不同獎項分數不能作為獨立驗證、使用者測試或視覺驗收。

| 來源 | 使用關係／不能推論的事 |
| --- | --- |
| [Praxis Leandra Isler](https://www.cssdesignawards.com/sites/praxis-leandra-isler/47203/)／ESE | CSSDA WOTD 2025-03-18，8.27；研究圖片／文字場域一致性；不學長 loading、copy blur、自訂 scroll 或 cards。歷史版本與 2026 live 不一定相同 |
| [Clinic Beethovenstrasse](https://www.cssdesignawards.com/sites/clinic-beethovenstrasse/46193/)／ESE | WOTD 2024-09-05，8.14；1440／375 typography／service index 看過，hero video loading 未完成，不能宣稱其完整動效看過 |
| [Hyoumankind](https://www.cssdesignawards.com/sites/hyoumankind/46167/)／Studio Almond | WOTD 2024-09-04，8.21，另有 [AGDA Digital Distinction](https://agda.com.au/awards/results/?studio=534)；看過作者發布 stills 的實物／情境延續，2026 live opening 已不同；3D 動效未驗證 |
| [Halo Dental](https://www.awwwards.com/sites/halo-dental) | Awwwards 個別紀錄 SOTD 2024-09-10，7.41，現行 credit REF Digital；1440／375 opening、1280 product passage 看過。實物與手持使用畫面可比較；不帶入黑橘、WebGL、commerce 或其醫療 claims |
| [太田耳鼻喉科](https://www.ota-jibika.jp/) | 1440／375 的任務入口及 native navigation 看過；作醫療網站使用流程對照，沒有宣稱設計獎。其 bitmap 小字、圓形／mascot、blue/orange 及預約模型不是本診所的模板 |
| [NN/G visual hierarchy](https://www.nngroup.com/articles/visual-hierarchy-ux-definition/) | relative contrast／scale／proximity／grouping 的 authored guidance；例示尺寸與字級數不是 CJK tokens 或國際美感證明 |
| [W3C CLReq](https://www.w3.org/TR/clreq/)／[WAI carousel](https://www.w3.org/WAI/ARIA/apg/patterns/carousel/) | 中文斷行／標點及輪播 focus／pause；CLReq 是 work in progress，正確操作不是美感 success |

上述檢視日期為 2026-10-08，本次交接沒有重新逛第三方網站或補稱完整播放。
詳細 agreement／conflict／採用與拒絕項在原型 `multi-source-review.json`；canon 在
[award-benchmarks](../../.claude/skills/ui-design/reference/award-benchmarks.md)。
沒有複製外部 images、fonts、code 或醫療效果文案進網站／repo。

## 8. 素材與醫療來源

原圖 archive：`F:/診所專案/tmp/official-site-images-2026-10-05`，搭配 `manifest.json`。
`preserved-art.json` 與 `whole-art.manifest.json` 鎖定以下七份完整素材；兩份直式比較
附件是同一版本，不當作兩個不同素材。

| 保留素材 | 原圖 locator／用途 |
| --- | --- |
| 五類原因 | `2024/11/止鼾五合一1-1.png` → `whole-snoring-causes` |
| 牙套實物與圖文 | `2025/04/2025止鼾好眠牙套圖1.jpg` → `whole-mouthguard` |
| 兩種器械比較 | `2025/04/下鼻甲手術圖1.jpg` → `whole-instruments` |
| 九欄橫式比較 | `2025/05/0506.png` → `whole-comparison-wide` |
| 下鼻甲完整介紹 | `2025/04/11.jpg` → `whole-turbinate` |
| 直式比較 | `2025/05/05000006.png` → `whole-comparison-tall` |
| 五種鼻中隔型態 | `2025/06/鼻中隔手術2025.webp` → `whole-septum-types` |

只 resize/compress 整張；保留比率、所有文字、器械與比較關係。手機整張＋放大 reader
與來源保留的 HTML 說明，不把解剖圖內部做動畫來暗示未審治療效果。
`medical-content-ledger.json` 記錄 source、source SHA、pointer、review；原官網刊登不
等於此次醫療 signoff。流程文字仍為 canonical `HOME_PROCESS_ITEMS[0..3]`，沒有新
推論效果或預約政策。兩張獲准重畫人物的 master／prompt 在 `source/`，未刪掉舊圖。

其他素材查看 `asset-use.json`、各 manifest 及原 archive；仍未安排的原圖不應因版面
重做就淘汰，也不能為了全部使用而把它們塞進 14-image 首頁。診桌照含舊促銷物，發布
前需業主確認，不能自行當成現行品牌事實。

## 9. 維護入口與安全重建

以下路徑均相對於本機原型根目錄；只改 source，不以手改產物作為唯一修復。

| Source | 角色／產物 |
| --- | --- |
| `index.source.html` | 首頁 native markup／共用 header 來源 → `index.html` |
| `site.css`／`article.css` | 品牌與各頁構圖 → `home-site.css`／`article-site.css`，每 route 一份 CSS |
| `client-source/site.js`／`client-source/article.js` | page controllers；`build-client.mjs` 合入 shared reader／footer → `site.js`／`article.js` |
| `shell.mjs`／`footer-client.js` | 一份 build-time footer／social markup 與 native enhancement，無 HTML injection |
| `whole-image-reader.js` | 完整圖 reader、keyboard enlargement、Escape／focus return；不是圖像裁切工具 |
| `build-pages.mjs` | 五個各自構圖的 renderer；讀 canonical `clinic-content.js` |
| `build-assets.mjs`／`build-inner-assets.mjs`／`build-preserved-art.mjs` | derivative allocation；原 master 不提供給 browser |
| `record-sources.mjs`／`record-whole-layout.mjs` | 來源／醫療 review／整張圖 provenance；不得手改 hash 假裝通過 |
| `verify-prototype.mjs`／`verify-navigation.mjs` | 首頁 closure、reflow、CSP、44px、keyboard、carousel、mobile menu 操作 |
| `verify-articles.mjs`／`verify-whole-art.mjs` | 內頁與兩個 personal-route regression；整張圖 hash／比率／reader |

同一台機器的最小接手流程：

```powershell
Set-Location -LiteralPath 'F:\診所專案\tmp\clinic-editorial-home-20261006'
# 如果 3216 已存在，不要重開第二個 listener，也不要終止不屬於此原型的 process。
Get-NetTCPConnection -LocalPort 3216 -State Listen -ErrorAction SilentlyContinue
# 沒有 listener 才執行：node server.mjs
node build-client.mjs --home-only
node build-pages.mjs --home-only
node capture.mjs next-home-review 1440,375,320
node verify-prototype.mjs next-home-verification
node verify-navigation.mjs next-navigation-verification
```

先看 screenshot，再看 mechanical reports。證據 version 用新名字，不能覆寫 v14 或
正式 baseline。`build-prototype.mjs` 會製圖、產生全部六頁及 records；首頁未成立前
不要直接跑它。`verify-articles.mjs`、`verify-whole-art.mjs` 仍有固定輸出目錄，重跑前
先保存既有證據或調整輸出 destination，不要讓歷史結果看似一直正確。

## 10. 已有證據及本輪未跑範圍

**本次 10/10 為交接，不重新跑網站矩陣來補數字。** 下列 source prototype 證據均標
原日期；當代碼有新變更，需新的 rendered／interaction evidence。

證據根目錄：`F:/診所專案/output/playwright/clinic-editorial-home-20261006/`。

| Gate／觀察 | 狀態／日期 | 實際數字與範圍 |
| --- | --- | --- |
| b0c3278 exact-head CI | PASS，10/08執行；10/10讀回 | [run 37787545633](https://github.com/waydefu/clinic/actions/runs/37787545633)，12/12 jobs |
| CI verify unit | PASS，同 run | 202 files、2546 tests PASS、1 skip；APT 新增測試 15/15，包括 Linux parser |
| Firestore Emulator | PASS，同 run | 31 files、316 tests |
| 六組 E2E | PASS，同 run | auth 29、appointments 44、patient-portal 106、mobile 176、UI 84、accessibility 25，合計 464 |
| SAST／Gitleaks／supply-chain／evidence | PASS，同 run | required aggregates 全部 success；不是 production／runtime 或設計驗收 |
| v14 首頁矩陣 | PASS，10/08 | `multi-source-v14-verify-20261008/results.json`，19/19；320／375／768／1280／1440，CSP／Trusted Types、44px、axe、200% proxy、六張照片完整 closure、keyboard、booking boundary |
| v14 mobile navigation | PASS，10/08 | `multi-source-v14-navigation-20261008/results.json`，Chrome／WebKit × 320／375，4/4 runs；展開 bounds、四入口、Escape／focus、outside dismissal、reduce、實際 route navigation |
| v14 screenshots | 已檢視，10/08 | `multi-source-v14-20261008/` 的 1440／375／320 首屏／全頁／section；獨立 mobile menu screenshots 在 navigation evidence |
| v8 gallery lifecycle | PASS，10/08 | `award-v8-motion-20261008/results.json`，Chrome／WebKit × 1440／375，4/4；快速選擇、preference change、animation／舊圖層清理、console／CSP；錄影未逐段審閱 |
| 五個內頁 baseline | 日期證據，10/08 | `award-baseline-articles-20261008/observations.json`，五頁 × 1440／375，10 筆無 page errors／overflow；不是最新語言已延伸 |
| 舊內頁完整 checks | PASS，10/06 | `final-verification/results.json`，25/25、兩個 personal routes × 兩寬度 4 regression；舊 allocation 不作 v14 或正式 shared union 的當前通過證明 |
| 原整張圖／reader | PASS，10/06 | `whole-art-proof/results.json`，7 originals／14 rendered-reader views，原 hash、比率、無 clipping／mask、Escape／focus |
| 10/10 重新瀏覽／正常完整播放／全站重跑 | NOT_RUN | 此輪只交接；沒有新代碼或美感驗收要驗證，不為了表格數字補跑 |
| 圖片 error／retry／offline／timeout 與完整 theme／forced-colors 矩陣 | NOT_RUN | v14 的 19 項集中在列出的 happy path／中斷／reflow；沒有完整演練所有 §5 狀態，也不宣稱 source 的 error handler 等於已驗收 |
| Physical device／screen reader／真正 browser 200% zoom | NOT_RUN | CSSOM 16→32 是 proxy，WebKit desktop 不等於 iPhone，待實機／assistive reviewer |
| 國際等級整體視覺／醫療 signoff | NOT_RUN | 業主／診所尚未接受；多來源與 maker 自評不能代簽 |
| 正式 content-hashed integration／deployment | NOT_RUN | freeze／既有租約與正式 authority 邊界保留 |

本機套件全 verify 沒跑：既有 canonical checkout 缺 `node_modules`，當時 Node 24.15
低於專案 floor 24.20；精準的新增 APT local regression 曾 14 PASS／1 Linux skip，
完整 supported environment 由上述 CI 提供。不能說「本機 full suite 都綠」。

7 秒輪播／六張 wrap 的首頁測試使用 Playwright virtual clock 與真實本機圖片 decode，
不是看完完整 42 秒正常播放的節奏評審。v8 的時間分隔 frame／lifecycle checks 也
不能替代尚未逐段觀看的錄影。

### 可追溯的 CI artifact

- Artifact ID `11555380558`，`verification-evidence`；產生時間 `2026-10-08T13:54:14.430Z`。
- Candidate 與 SAST 都是 `3c2cce950de0934308cde8790d59ff7f5722324f`，parents 為 main `ede751bd64d1ba213e5584908033aa51d8ee5ec9` 與 head `b0c32789ce241c83c59b33123f0b7beccc8a6899`。
- ZIP SHA-256：`cba289627361fd39472794b56024a680b96a0452ad44ceaca6c0365a47e8ab6d`；10/10 本機再讀 hash 相同。
- 可由 `gh api repos/waydefu/clinic/actions/artifacts/11555380558/zip` 取回；artifact 有保存期限，不是假稱永久附件。
- 本文提交會形成新 head；舊 b0c3278 綠燈不可代替新 head。新 run 與實際 head 另附 PR 交接留言，未完成時維持待核。

### 本機 snapshot 與可恢復性

[snapshot JSON](2026-10-10-clinic-ui-handoff.snapshot.json) 記錄 90 份 source／產物／
served assets／重要證據／canonical inputs 的相對檔名、bytes 與 SHA-256，無缺檔。
這是 10/10 identity snapshot，**不是 source payload**。10/08 prototype reports 沒有
commit-bound source manifest；今天算的 hashes 不能回頭捏造那個 binding，也不代表
今天重新跑過 browser。原檔與圖片要從本機取回後核對，不要從截圖重新刻一份。

## 11. 預算與尚未解決的正式 integration

正式 `/clinic.html` 預算不提高：total 200 KiB、JS 20 KiB、CSS 14 KiB、images
180 KiB／14 resources、fonts 0；document 3 KiB。v14 完整 prototype gzip closure：

| 類別 | bytes／count | 上限 |
| --- | --- | --- |
| Images | 183244／14 | 184320／14 |
| Document | 3067／1 | 3072 |
| CSS | 6911／1 | 14336 |
| JS | 9899／2 | 20480 |
| Fonts | 0 | 0 |
| Total | 203121／18 resources | 204800 |

image 尚餘 1076 bytes、document 僅餘 5 bytes、total 尚餘 1679 bytes。這些是
10/08 source prototype 的量測；不是正式 dist/CI。六張照片全部算在 closure，不能
用 lazy／hidden／srcset／module collector 盲點規避。為主照片清晰度曾提升至 1600px／
27 KiB allocation，將背景 atlas 降到 6 KiB；master 原檔沒更動。

正式站共用 entry，所有 route 的 transitive asset union 可能超額。整合前需明確評審
route-specific build／measurement，或重分配真實 union；不能直接把六頁資料一起塞回
共用 module，再以 prototype budget 宣稱正式通過。不得默默提高上限。

## 12. 找到的問題與修復狀態

| 問題 | 狀態／要保留的證據 |
| --- | --- |
| Hero 照片／標題／說明分散成橫帶 | 本機已重新構圖；v3→v8；不等於業主視覺接受 |
| Photo ID specificity 使新 framing 不生效／clone 不一致 | 修正到 image layers selectors 與 data-photo；不是只改 CSS 數字 |
| 深色門框壓到標題／中間寬度裁掉品牌 | 加 reading veil 及中間 camera framing，保留 owned photo 色調 |
| 320／375 在 200% 醫師姓名窄列 overflow | v6 兩項 FAIL 保留；欄寬改 `min(9rem,42%)`，後續 proxy PASS |
| reduced-motion 與 asynchronous decode race | commit／playback 再讀 media preference，timer 自身 guard；沒有靠輪詢或自動恢復播放掩蓋 |
| WebKit screenshot 本身注入 style 被 CSP 拒絕 | separate harness control 確認；正式操作錯誤仍不可忽略，不削弱 CSP；WebKit lifecycle run 沒做 screenshot |
| 重複 telephone 字型圖示＋SVG | 本機已移除 pseudo-element，保持單一 inline flex icon |
| 綠色按鈕／大圓點／方框被否定 | v9／v10 修改；不能將否定項留作教學 benchmark |
| v11 手機四段說明太長 | v12 run-in narrative；既有來源文字未刪減／改強 |
| 375 選單 x=-97，左側被裁掉 | v12 FAIL 2/4；v13／v14 對齊頁首，4/4 PASS；320 booking width 同時修正 |
| Azure Ubuntu 索引下載卡至 20 分鐘 | 安裝準備與 5 分鐘 bound 已修；保留舊 attempts；Linux actual bounds 原本已存在，不能把原因全說成 wrong key |
| Linux negative parser fixture 被 host config 掩蓋 | `APT_CONFIG` 先隔離，而非 command-line `-o` 太晚；15/15 新 CI PASS，不 skip 反例 |

舊失敗結果保留在 `award-v6-verify-20261008/`、`award-v7-motion-20261008/`、
`multi-source-v12-navigation-before-20261008/`，及 run `37666936641`／`37768627459`。
不要刪掉失敗紀錄再宣稱首次就完成。

## 13. 環境陷阱與維護債

- PowerShell／Windows；UTF-8 中文文件與 CLI body-file 保留 actual newlines。Python schema 工具用 `-X utf8` 避免 CP950。
- Prototype builders／verification scripts 有固定 F 路徑與既有 Sharp、Playwright、axe runtime。跨機器不是只設三個 env 就全可用；`build-assets.mjs` 的 legacy 路徑仍寫死。
- `CLINIC_SOURCE_ROOT`／`CLINIC_ASSET_ARCHIVE` 支援範圍依各 script；`CLINIC_LEGACY_ARTWORK` 在 inner builder，不能假設 home builder 也支援。
- Legacy asset root：`F:/診所專案/tmp/visual-proof-2026-10-05/design-round-1`；Sharp 位於 bundled runtime 的 node_modules；browser scripts 使用 `cal-pilot/.claude/worktrees/shots` 的 Playwright 1.61.1／axe 4.12.1。
- 不為交接隱式安裝 dependency、建立 Linux／Docker 或切換 framework。必要 runtime 找不到先記明缺口。
- 兩位醫師部分專科／portrait key 仍按 index 0/1；未來增人應改成明確 slug／metadata mapping，不能硬加第三個條件。
- Shared CSS 有歷史規則／retired crops。只改目前真正生效的 owner selector，整合時整理 reusable boundaries；未使用 rule 不是裁切 protected graphics 的授權。
- 產物、原圖、重畫 master、舊失敗 iteration 分開。`revisions/retired-medical-crops` 不可當成現行素材；歷史 v5 maker benchmark 已標 historical。
- GitHub workflow scope 已由業主在官方流程補授權，修復已 push；不要把 expired device codes、tokens 或私鑰寫進交接。
- 原型未 versioned 到此 PR，所以新接手要先核 snapshot identity，再改；不要相信任意舊目錄是現在的 source。

## 14. 未關閉項、負責者與下一步

| 未關閉事項 | 負責者／第一步 |
| --- | --- |
| 首頁整體視覺與國際等級 craft | 接手設計／實作 agent 自己負責判斷；先打開 v14 1440／375，指出最弱三個 structural decisions，再實際重構與重看，不能把主觀責任丟回業主 |
| 正常完整動效、首屏到 interaction settlement | 接手 motion／UI agent；實際看完整正常播放、手動選圖、快速選擇、偏好切換；時間 count 與零 console 不代表美感完成 |
| 五個內頁最新語言 | 首頁 benchmark 成立後的實作 agent；依第 6 節五個不同內容核心延伸，不量產同一 template |
| 醫療 copy、數值、比較、器械及圖內 claims | 診所醫療 reviewer；從 ledger 原來源逐項審閱，沒有 signoff 就保留 pending，不自行補完或強化療效 |
| 實機、screen reader、真實 text zoom、physical performance | 實機／accessibility reviewer；依既有 R-1～R-26／§5，不能用 headless 或 CSSOM 代替 |
| 促銷物及品牌事實 | 業主；確認診桌照片的舊內容可否發布，沒有確認不假定仍有效 |
| Prototype source／素材跨機器移交 | 本機 workspace 管理者＋接手 agent；取得原型／archive／runtime，核 snapshot；本 PR 只有交接文字與 identity metadata |
| Formal route union／build integration | 專案 frontend 維護者＋原有 authority owner；取得 freeze／正式整合 scope 後，以全八 routes 的真正 closure／CSP／accessibility 驗證 |
| PR 合併／部署 | 業主；本請求只寫交接，不授權合併或部署。合併需核當時 exact head 的 required checks；部署另需原有 exact authority |

下一個可執行工作是既有授權內的 **homepage visual benchmark refinement**。
本輪未新增 roadmap ID，也沒有將任何正式官網 work package 改成 READY/DONE；
[roadmap](../roadmap.md) 與既有 vendor lease／freeze／acceptance 邊界仍有效。
正式下一個可核准 work-package ID 尚未在此 prototype scope 指派，不能自行命名後
當作權限。接手第一步是核實本機 v14 source 與 90-file snapshot、看實際畫面，
不是先生成大型規劃文件或宣稱六頁完成。

保留 HTML／CSS／ES Modules、native semantics、Trusted Types、鍵盤／focus、44px、
200% text、reduced motion、local fonts 0 KiB；不做 React migration、不安裝 animation
framework、不新增 booking model、不改 freeze、不部署。以上記錄是 dated evidence，
不會新增 production、真實資料、雲端或網站接管 authority。
