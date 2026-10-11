# 一森渼官網：本機 editorial 設計原型

預覽：<http://127.0.0.1:3216/clinic>。六個主要頁面在此原型重新設計；兩個個人醫師頁沿用正式來源，只做 regression。`/booking` 連到原有的獨立預約專案，沒有新增預約表單、醫師指定預約或資料模型。

2026-10-06 最新素材規則：業主指定的完整圖文保留整張構圖、文字、標示、器械及比較關係。只做整張等比縮放與壓縮；手機使用原比例顯示、完整圖片放大閱讀及 HTML 文字說明。8 份附件中兩份直式比較圖是同一版本，對應 7 個保留素材。

## 維護入口

- `index.source.html`：可讀的首頁原生 HTML，也是共用 header 的來源；`index.html` 是產物。
- `build-pages.mjs`：五個各自構圖的頁面 renderer；文字來自既有 `clinic-content.js`，來源與審閱狀態寫入 ledger。
- `site.css`、`article.css`：共用品牌與各頁構圖；`home-site.css`、`article-site.css` 是產物，一頁只載入一份 CSS。
- `client-source/`：首頁、內頁互動的 canonical source。
- `whole-image-reader.js`：一份共用的原生完整圖片 reader。
- `build-client.mjs`：產生兩份 page controller，不增加 client module request。
- `shell.mjs`、`footer-client.js`：一份共用頁尾與社群入口；靜態聯絡／隱私 fallback 保留，完整頁尾用 native nodes 呈現，不使用 HTML injection。
- `map-social-sources.json`：OSM 交通示意與品牌圖示的來源、座標、授權；browser 只讀本機 SVG，不請求地圖服務。
- `preserved-art.json`、`build-preserved-art.mjs`：業主指定完整素材的鎖定清單及整張製圖流程。
- `build-assets.mjs`、`build-inner-assets.mjs`：其餘素材 derivative。
- `record-sources.mjs`、`record-whole-layout.mjs`：来源、素材安排與醫療審閱記錄。
- `multi-source-review.json`：各項首頁決策的多來源依據、相同／相異做法、採用理由與實際驗證；不把來源數量當成視覺驗收。

直接預覽：`node server.mjs`。重新製圖與產生頁面：`node build-prototype.mjs`。這是本機製圖流程，使用已配置的 Sharp 工具庫及原素材 archive，沒有新的 browser dependency。

可用 `CLINIC_SOURCE_ROOT`、`CLINIC_ASSET_ARCHIVE`、`CLINIC_LEGACY_ARTWORK` 指向來源。原始付費素材及兩張重畫的 master 都保留，master 不提供給 browser。

## 檢查與來源

- `verify-prototype.mjs`：首頁五種寬度、200% 文字 proxy、CSP、鍵盤、44px、輪播及完整 gallery allocation。
- `verify-articles.mjs`：五頁 1440／375、文字 proxy、accessible tree、完整 closure（包括 srcset）、兩個既有個人頁 regression。
- `verify-whole-art.mjs`：原檔 SHA、原比例、無 mask／clip／cover、放大操作、Escape 與 focus return。
- 證據位於 `F:/診所專案/output/playwright/clinic-editorial-home-20261006/`。
- `medical-content-ledger.json`：文字與完整圖片內所有醫療 claim 的來源及待審狀態。
- `asset-use.json`、各素材 manifest：原圖、用途、比率與 derivative 的安排。
- `source/sleep-editorial-v1.prompt.txt`、`source/daytime-editorial-v1.prompt.txt`：經允許重畫的弱人物插畫提示；兩張 PNG master 同目錄保留。

原型 allocation 使用正式數字作上限，沒有提高 200 KiB／180 KiB／14 images／0 KiB fonts。兩種比較圖均計入 closure。首頁接近 image 上限，後續加入素材必須重新分配。

2026-10-08 最新候選只更新首頁。原本分開的照片／標題／說明合併成一個主視覺，
品牌標誌保留在文字右側；兩位醫師改成等高肖像與緊湊摘要。業主後續否定亮綠按鈕及
太明顯的圓點，因此 v9 移除首頁照護入口的色塊、預約改暖灰、移除圖示方框；未選圓點
4px、選中 6px，44px 點選範圍保留。電話只保留一個原生 SVG。歷史 self-review 不作為
向其他五頁擴張的 authority，當前視覺審閱在 `visual-review.json` 的 `currentReview`。

實際開啟 IAB 發現中間寬度會裁掉牆上品牌字，v10 增加中間寬度的照片構圖。
最新 1440／375／769／944／1100 畫面：`owner-actions-v10-20261008/`；機械檢查
`owner-actions-v10-verify-20261008/results.json` 為 19/19 PASS，完整 gzip closure
202594 bytes、14 images、字體 0。動效 controller 已有實際雙層照片淡入與中斷清理，
Chrome／WebKit 1440／375 的 v8 狀態檢查 4/4 PASS；完整錄影未逐段審閱，不能宣稱
國際比賽級動效驗收。v9／v10 僅改 CSS，沒有更動播放邏輯或增加套件。

只重建首頁可執行 `node build-pages.mjs --home-only` 及
`node build-client.mjs --home-only`，避免在首頁 benchmark 未成立前重產五個內頁。

2026-10-08 v14：手機選單直接通往四項照護；修正 375 展開時左邊被裁掉與 320
頁首換行問題，保留 Escape、外部點選關閉與 reduced-motion 即時停止。環境照片旁
重整為既有四段看診說明，手機使用緊湊連續閱讀；環境選擇不再用綠色塊，頁尾共用
首頁 SVG 方向語彙。醫療文字保留原文、原來源及待審狀態。

畫面 `multi-source-v14-20261008/` 已檢視 1440／375／320；本機檢查 19/19 PASS，
Chrome／WebKit 的導覽檢查 4/4 PASS。完整 gzip closure 203121 bytes、14 images、
字體 0。這是功能與設計迭代證據，沒有宣稱整體已達國際比賽水準。

第二輪修改將大面積深綠改成淺綠，以既有霧林分開照護、環境、交通與頁尾的閱讀節奏；桌面標題接上正文左緣。照護入口以篇名、說明與方向按鈕形成單一可點選區域，移除重複「閱讀介紹」。地圖保留完整 canvas，手機可放大。三個社群品牌圖示共用一個 SVG request。獨立評審與修正證據：`independent-review-round2/`、`independent-review-round2-after/`、`round2-final/`；頁尾日期與時間分開排，完整時間區間不拆行。

這些是本機 source prototype 的證據，不能替代正式 content-hashed build、CI、實機、screen reader 或診所醫療審閱。正式 clinic freeze 保留，沒有部署。

## 正式 integration handoff

重用資料來源、shell、tokens、reader 與各頁 renderer；保留各頁的構圖。正式整合前需對照所有 8 條 clinic route，維持 `/booking` 邊界、Trusted Types、native semantics、44px、200% 文字與 reduced motion。

目前正式站是共用 entry；將所有 route 素材塞回同一個共用資料 module 會擴大 transitive union。需明確評審 route-specific build／measurement 的方式，或重新分配實際 union，不能透過 collector 盲點假裝通過，更不能預設提高預算。解除 freeze、正式 source 整合與部署仍需其原有 authority。

原圖醫療效果、時間、比較、排名與照護文字皆待診所審閱；原官網已刊登不代表這次的醫療 signoff。一張診桌照片仍含舊促銷物，發布前需業主確認。
