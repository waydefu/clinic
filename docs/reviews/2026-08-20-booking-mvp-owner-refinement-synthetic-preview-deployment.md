# Booking MVP 業主 refinement 合成預覽部署 — 2026-08-20

## 現行狀態

**PENDING EXACT-C2 DEPLOYMENT.** 本文件是 owner refinement 的新部署紀錄，
不改寫
[candidate C 的歷史部署證據](2026-08-20-booking-mvp-synthetic-preview-deployment.md)。

| 欄位 | 部署前狀態 |
| --- | --- |
| Candidate C2 | PENDING — 待 pre-deployment docs commit 全部 GitHub CI 通過後凍結 |
| Candidate CI run | PENDING |
| Firebase project | `beauessence-clinic-staging` |
| Hosting channel | `synthetic-review` |
| Requested expiry | `7d` |
| Preview URL / absolute expiry | PENDING DEPLOYMENT |
| Hosting release / version | PENDING DEPLOYMENT |
| `verify:preview` | NOT RUN — exact-C2 URL 尚未建立 |
| Browser verification | NOT RUN — exact-C2 URL 尚未建立 |

## 核准的執行方式

- 業主本輪只授權一次 expiring synthetic Firebase Hosting preview channel
  部署，不是 live Hosting 或 production deployment。
- 必須從上表最終記錄的 **exact C2** build／deploy；不得部署較後的
  PR documentation HEAD。
- 只在 deployment process 設定 `CI=true`，並保留 `firebase.json` 的
  canonical predeploy `corepack pnpm run build`。
- Canonical command：
  `firebase hosting:channel:deploy synthetic-review --expires 7d --project beauessence-clinic-staging`
- 部署後必須執行
  `corepack pnpm verify:preview -- <exact-C2-preview-url>`，並另做線上 browser
  檢視。

## 驗收邊界

部署後證據必須同時證明：

- warm theme 與 `/booking` true-top flow 正確。
- synthetic workbench Case workflow 可達，Payroll 仍 frozen。
- 週曆只呈現 schedule-derived sessions 與 actual synthetic appointments。
- privacy dialog 返回 Step 3 時 state／read-status／focus 保留。
- vendor-facing exposure 只交付 `/booking`，目標官網路徑是 `/reservations/`。
- embedded commit marker 等於 exact C2；security headers、noindex、cache 與
  synthetic/no-backend boundaries 通過 repository online checks。

## 絕對禁止

- 不得部署 live Hosting、Firestore、Functions、Storage、Cloud Run 或 Authentication。
- 不得使用真實病患、薪資、醫療或 Calendar 資料。
- 不得新增 production credential，或連接 Calendar、LINE、Meta、NAS。
- 不得為了部署改動 workflow、lockfile、Firebase config、performance budget
  或跳過 canonical predeploy。
- 不得修改 `/clinic` frozen files，不得 merge PR #23 或 PR #22。

## Rollback

預覽會自動到期；若需提前下架，依
[synthetic preview runbook](../runbooks/synthetic-online-preview.md#下架)刪除
`synthetic-review` channel。Git 程式與文件只能使用 `git revert`，不改寫
shared history。
