# 合成資料線上預覽操作手冊

## 用途

本預覽只供診所負責人以手機與不同電腦測試 UI/UX。它不是正式預約網站，且不得
輸入、貼上、截圖上傳或以任何方式處理真實病患、職員、薪資、行事曆或醫療資料。

Firebase Hosting preview URL 雖含隨機字串，仍是知道網址的人都能存取的公開頁面。
預覽使用瀏覽器 `localStorage` 保存固定合成資料，不使用 Firebase Database、
Firestore、Functions、Cloud Run、Google Calendar、LINE、Meta 或 NAS。不同瀏覽器
不共享資料，清除網站資料即可清空；預覽頻道到期後網址失效。

## 部署前檢查

```powershell
corepack pnpm verify
firebase login:list
firebase projects:list
```

只能部署到名稱明確含 `staging` 的一森渼診所專用 Firebase 專案。不得部署到其他
既有專案，也不得將 `.firebaserc` 的本機假 project ID 當作雲端目標。

## 建立／更新七天預覽

```powershell
firebase hosting:channel:deploy synthetic-review --expires 7d --project [clinic-staging-project-id]
```

部署命令只允許 Hosting preview channel；不得改用 `firebase deploy` 發布 live，亦
不得包含 Firestore、Functions、Storage 或其他服務。

## 驗收

1. 首頁顯示 `ONLINE SYNTHETIC PREVIEW`，並說明網址持有人皆可存取。
2. 回診頁只顯示 `patient_test_001`，沒有姓名、電話、email、病情或自由文字欄位。
3. 排班、回診狀態、預約、取消、完成與重設均只影響目前瀏覽器。
4. 回應包含 CSP、`X-Robots-Tag: noindex`、`Referrer-Policy: no-referrer` 與
   `Cache-Control: no-store`。
5. 不存在對 API、Firestore、Calendar 或其他外部服務的網路要求。

## 下架

頻道預設七天到期；若需提前下架：

```powershell
firebase hosting:channel:delete synthetic-review --project [clinic-staging-project-id] --force
```

下架不會刪除使用者瀏覽器的 `localStorage`；測試者仍應自行清除網站資料。本預覽
沒有可匯入正式環境的資料。
