# Booking MVP 業主 refinement 合成預覽部署 — 2026-08-20

## 現行狀態

**PASS — EXACT C2 DEPLOYED AND REPOSITORY ONLINE VERIFICATION GREEN.** 本文件是
owner refinement 的新部署紀錄，
不改寫
[candidate C 的歷史部署證據](2026-08-20-booking-mvp-synthetic-preview-deployment.md)。

| 欄位 | 結果 |
| --- | --- |
| Candidate C2 | `091ce0f732b32ad064d3694a26a219cc6e3687fe` |
| Candidate CI run | [`32362982753`](https://github.com/waydefu/clinic/actions/runs/32362982753) — 11/11 jobs `success` |
| Firebase project | `beauessence-clinic-staging` |
| Hosting channel | `synthetic-review` |
| Requested expiry | `7d` |
| Preview URL | <https://beauessence-clinic-staging--synthetic-review-xvqa68cx.web.app> |
| Absolute expiry | `2026-08-27T11:20:16.755922478Z` (2026-08-27 19:20:16 Asia/Taipei) |
| Hosting release / version | `1787224877406000` / `5690ed4534b5a567` (`FINALIZED`) |
| Release time | `2026-08-20T11:21:17.406Z` (19:21:17 Asia/Taipei) |
| `verify:preview` | **PASS — 463/463**, generated `2026-08-20T11:22:14.397Z`, evidence commit equals C2 |
| Interactive browser verification | **NOT RUN — TOOL ENVIRONMENT**; details below |

## Candidate and deployment proof

- Remote main remained `3a3b7859e0a46c0549d3d1d4c7f32293c1cd9282`; C2 was not rebased or
  rebuilt from PR #22.
- C2 run `32362982753` passed core verify, 30-file clinic freeze, performance,
  64 unit files / 1047 tests, all six E2E groups, Firestore Emulator,
  supply-chain/secrets, Semgrep SAST and Verification evidence.
- Deployment ran from clean detached worktree
  `F:\診所專案\tmp\book-mvp-c2-deploy-091ce0f`; its HEAD was exact C2 before and
  after build/deploy/verification. Repository lockfile and installed pnpm lock
  both had SHA-256
  `7B0721E132B0A54DB574A35CF4D2C23B49E728BB012075B66B018E1F2CBB6E36`.
- Operator was `wayde.fu@gmail.com`; Firebase CLI `15.18.0` confirmed project
  number `781119800251`. Only process-scoped `CI=true` was set.
- Canonical predeploy remained enabled, reconciled dependencies, built the
  workspaces, synchronized 18 domain vendor files and created 76 web files / 52
  content-hashed files before Hosting uploaded and released them.
- Firebase reported that it could not add/sync the channel domain to Firebase
  Authentication. Authentication was not enabled or changed and was outside
  authority; Hosting version finalization and release both succeeded.

## Online verification

From the same clean exact-C2 worktree:

```text
Preview evidence written to output/evidence (success; 463/463 checks passed).
Commit: 091ce0f732b32ad064d3694a26a219cc6e3687fe
```

The 463 checks cover the deployed workbench and booking HTML, staging-host
containment, security/noindex headers, no-cache HTML, content-hashed assets and
immutable asset caching. Release/version audit binds this result to the new
Hosting release made from exact C2.

The requested in-app interactive browser pass could not start: browser-control
setup failed three times before navigation with `failed to write kernel assets:
path not found`, including after opening an explicit Codex browser tab. Direct
web opening was also rejected by that service's URL safety layer. This is a
browser-tool environment limitation, not a preview failure. No local Playwright
or prohibited heavy local test was substituted. Interactive/visual behavior is
instead evidenced by exact-C2 required E2E and the ten manually inspected
GitHub-hosted captures from the same unchanged runtime; this limitation remains
explicit for owner final acceptance.

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
