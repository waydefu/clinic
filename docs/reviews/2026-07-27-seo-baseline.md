# 預約頁 SEO 基準與證據（2026-07-27）

這份文件記錄預約頁在搜尋引擎面前的實際狀態、由什麼機制保證、以及**還沒做的
部分**。所有數字都來自當天實跑，可以重跑複核。

## 1. 先講最重要的判斷

**預約頁不該自己拚排名。** 診所已經有 `beauessence.com.tw`（首頁、醫師團隊等
內容頁），那才是 SEO 的主體。預約頁只有一頁，先天很難靠內容排名；它的價值是
**轉換**——有人從官網或廣告點進來，要約得成。

因此這裡的目標定成三件事，而不是「衝關鍵字」：

1. 搜尋引擎能正確理解「這是一間診所，這是它的門診時間，這頁可以預約」；
2. 權重集中在**一個**正規網址，不因子網域或重複網址被拆散；
3. 上線那天不要因為技術細節（noindex、canonical、sitemap）整個消失。

第 3 點是實務上最常出事、也最貴的一項，所以它被做成機制而不是檢查清單。

## 2. 現況：已具備的項目

| 項目 | 狀態 | 由什麼保證 |
| --- | --- | --- |
| 結構化資料 `MedicalClinic` | 名稱、地址、電話、門診時間、`ReserveAction` 齊全 | `check:ui` 比對門診時間 |
| 門診時間正確性 | 週三–五 12:00–20:00、週六 10:00–18:00，與官網一致 | `check:ui` 四份來源雙向比對 |
| 服務項目 | `availableService`：止鼾治療、醫學美容 | — |
| 正規網址 | `rel="canonical"` 指向 `https://beauessence.com.tw/booking` | `check:ui` 與 sitemap 比對 |
| sitemap | `sitemap.xml` 只列正規網址 | 同上 |
| robots.txt | 允許檢索、指向 sitemap、擋掉工作臺 | `check:ui` 要求 `Sitemap:` |
| 社群分享預覽 | og:title/description/image（1200×630）、Twitter card | — |
| 語言標示 | `<html lang="zh-Hant">` | — |
| 網址結構 | `/booking`、`/privacy`；`.html` 版本一律 301 導向 | `verify:preview`＋e2e |
| 隱私權政策頁 | `/privacy`，含個資法第 8 條要求的告知事項 | `privacy-policy.spec.ts` |
| 行動裝置 | 9 種寬度無水平捲軸、觸控目標 ≥44px | `responsive.spec.ts` |
| 核心網頁指標 | CLS 0.048、整頁 gzip 58 KB、零字型下載 | `check:perf`＋`performance.spec.ts` |
| 無障礙 | axe serious/critical = 0 | `accessibility.spec.ts` |

效能與無障礙列在這裡不是湊數：兩者都是 Google 公開的排名與體驗訊號，而且是
多數診所網站真正落後的地方。

## 3. 上線開關（這次新增的核心機制）

預覽站必須**不被索引**，正式站必須**被索引**。中間那一步——上線時把 `noindex`
拿掉——是典型的「靠記得」，而漏掉時**沒有任何錯誤訊息**：網站就是不出現在
Google，通常幾個月後才有人發現。

所以改成：

- 原始碼**永遠**保留 `<meta name="robots" content="noindex, nofollow">`（預設安全）；
- 發正式站時設 `WEB_PUBLIC_INDEXABLE=true`，由 `scripts/build-web.mjs` 移除；
- **只有患者預約頁會被放行**，工作臺與 404 永遠 noindex；
- 放行前會檢查該頁有絕對 `rel="canonical"`，沒有就**讓建置失敗**；
- 若 `noindex` 那一行被手動刪掉，建置也失敗——避免「以為已經放行」。

同一個開關也負責**測試版本的標示**：預覽建置會把 `<title>` 標成
`【測試用】…`，正式建置則移除。業主看到的往往是分頁標題、書籤與截圖，不是頁面
上的徽章；而綁在同一個開關上，就不可能發生「拿掉了 noindex 卻忘了拿掉測試字樣」
或反過來的情況。

八項行為都有單元測試釘住，包含「只有字串 `true` 算數」（`1`／`yes`／`TRUE`
都不放行），以免近似值意外把測試站送進索引。

## 4. 還沒做的（誠實清單）

| 項目 | 為什麼還沒做 |
| --- | --- |
| 實際送交 Search Console | 需要正式網域上線與網域驗證 |
| `sameAs` 連到官方社群 | 搜尋結果顯示 Facebook／Threads 帳號可強化實體識別，但**必須由負責人確認哪些帳號是官方的**，猜錯會把別人的帳號綁到診所身上 |
| 官網與預約頁互連 | 官網不在這個專案裡；需要在官網加一個指向 `/booking` 的連結，SEO 效益比這裡任何一項都大 |
| 多語言 `hreflang` | 英文版（Beau Essence Clinic）已列為需求但尚未實作 |
| 地圖／`hasMap`、評論結構化資料 | 需要 Google Business Profile 的資料，屬於官網範疇 |

## 5. 一個必須說清楚的限制

`rel="canonical"` 目前指向 `https://beauessence.com.tw/booking`，也就是**未來
的**正式網址；現在的測試網址是另一個。這是刻意的：canonical 應該指向最終要被
收錄的位址。但這代表**在併進官網之前，這頁本來就不該被索引**，而預覽站的
`X-Robots-Tag: noindex` 正好保證了這件事。

換句話說，目前「搜不到」是**設計如此**，不是沒做。真正的檢驗要等併進
`beauessence.com.tw` 之後。

## 6. 怎麼複核

```
corepack pnpm run check:ui      # 門診時間、canonical 與 sitemap 一致性
corepack pnpm verify            # 含效能預算與全部單元測試
corepack pnpm test:e2e          # 含 axe 無障礙與版面重排
corepack pnpm verify:preview -- <預覽網址>   # 打線上站，逐項驗回應標頭
```
