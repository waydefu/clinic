# Booking MVP 最終 UI 合成預覽部署 — 2026-08-22

## 結果

**PASS — EXACT C3 DEPLOYED AND 474/474 ONLINE CHECKS GREEN.** 本文件是 C3 的新部署
證據，不改寫 2026-08-20 的 candidate C／C2 歷史部署紀錄。

| 欄位 | 結果 |
| --- | --- |
| Candidate C3 | `d9b6965c0e3ae62df33e89744f12c6d7fcc16480` |
| Candidate CI | [`32553136689`](https://github.com/waydefu/clinic/actions/runs/32553136689) — 11/11 `success` |
| Authority commit / CI | `9b0e9344f0cd0b552a149855258b6bfbc0852c40` / [`32553336099`](https://github.com/waydefu/clinic/actions/runs/32553336099) — 11/11 `success` |
| Firebase project | `beauessence-clinic-staging` (`781119800251`) |
| Hosting channel | `synthetic-review` |
| Requested expiry | `7d` |
| Preview URL | <https://beauessence-clinic-staging--synthetic-review-xvqa68cx.web.app> |
| Absolute expiry | `2026-08-29T05:08:05.084059718Z` (2026-08-29 13:08:05 Asia/Taipei) |
| Hosting release / version | `1787375393029000` / `58e6d865767e79cf` (`FINALIZED`) |
| Release time | `2026-08-22T05:09:53.029Z` (13:09:53 Asia/Taipei) |
| `verify:preview` | **PASS — 474/474**，generated `2026-08-22T05:10:28.095Z`，evidence commit 等於 C3 |

## Candidate 與授權證據

- C3 的 local、remote branch 與 PR candidate SHA 一致；remote main 在凍結與部署前仍為
  `3a3b7859e0a46c0549d3d1d4c7f32293c1cd9282`。PR #23 open／mergeable／未合併，
  PR #22 `CLOSED / NOT MERGED`。
- C3 run `32553136689` 通過 core verify、structure／docs／format／lint／types/build、
  architecture／UI／public pages、performance、clinic 30/30 freeze、unit、全部六組 E2E、
  accessibility、Firestore Emulator、supply-chain／secrets、Semgrep SAST 與
  commit-bound Verification evidence。
- exact-C3 authority 先以 docs-only commit `9b0e934` 記錄 owner 本輪一次性授權、
  project、channel、expiry、operator、Hosting-only／no-real-data 邊界；該 commit 的 run
  `32553336099` 亦 11/11 綠。authority commit 本身沒有被部署。
- Operator 為 `wayde.fu@gmail.com`；Firebase CLI `15.18.0` 確認 staging project active。

## Exact-C3 build 與部署

- 部署 worktree：`F:\診所專案\tmp\book-mvp-c3-deploy-d9b6965`，detached at exact C3；
  build、deploy、online verification 前後 `git status --porcelain` 均無 tracked change。
- Repository `pnpm-lock.yaml` 與 reused installed pnpm lock 的 SHA-256 均為
  `7B0721E132B0A54DB574A35CF4D2C23B49E728BB012075B66B018E1F2CBB6E36`。
- `firebase.json` 未改，`public` 仍是 `apps/web/dist`，canonical predeploy
  `corepack pnpm run build` 保持啟用。predeploy 依 frozen lock 對齊依賴、build workspace、
  同步 18 個 domain vendor files，產生 77 個 web files／53 個 content-hashed files。
- 只在 deployment process 設定 `CI=true`，執行：

  ```text
  firebase hosting:channel:deploy synthetic-review --expires 7d --project beauessence-clinic-staging
  ```

- Firebase Hosting 完成 upload、version finalize 與 release。CLI 仍回報無法把 channel domain
  加入／同步 Firebase Authentication；這與 C2 相同。Authentication 未啟用或修改，Hosting
  release 本身成功。

## Online 與 UI 驗證

同一 exact-C3 worktree 執行：

```text
corepack pnpm verify:preview -- https://beauessence-clinic-staging--synthetic-review-xvqa68cx.web.app
Preview evidence written to output/evidence (success; 474/474 checks passed).
Commit: d9b6965c0e3ae62df33e89744f12c6d7fcc16480
```

474 checks 驗證 workbench／`/booking` 路由、staging-host containment、exact C3 marker、
security／noindex headers、HTML no-cache、40 個唯一 content-hashed JS／CSS assets 及 immutable
cache policy。檢查沒有呼叫 Firestore、Calendar 或 production backend，也沒有 real data。

最終瀏覽器行為由同一 runtime 的 GitHub-hosted required E2E 與
[13 張 2026-08-22 視覺證據](ui-visual-baseline-2026-08-22.md)覆蓋：三步驟 flow、Step 1
clinic information、Step 2 full-width single-date slots、Step 3 desktop two-column／mobile
stack、privacy state preservation、雙欄位 lookup、21／20-minute cutoff、19-minute telephone
fallback、success result、warm default、Case UI 與 corrected weekly calendar。13 張均已逐張
人工檢視，console errors／warnings 為 0，沒有意外 overflow、clipping 或巨大空白。

## 安全與交付邊界

- 本次只更新 Firebase Hosting **preview channel**；沒有 live Hosting deployment。
- 沒有部署或啟用 Firestore、Functions、Storage、Cloud Run、Authentication、Calendar、
  LINE、Meta 或 NAS。
- 沒有使用真實患者、職員、薪資、醫療或 Calendar 資料；preview 公開但 `noindex`，資料
  只留在各瀏覽器 `localStorage`。
- vendor evaluation 只交付 `/booking`，未交付 staff workbench、Case、clinic 或 doctor pages。
- synthetic `>20 minutes` self-cancel 不核准 D-005 production policy；正式取消決策仍 pending。
- 30 個 frozen clinic files、Payroll frozen boundary、workflow、lockfile、performance budgets
  與 Firebase config 都未放寬。

## Rollback

Preview 會在上列時間自動到期。若業主要求提前下架，依
[synthetic preview runbook](../runbooks/synthetic-online-preview.md#下架)刪除
`synthetic-review` channel；這是唯一 cloud rollback。程式、測試與文件使用逐項
`git revert <sha>`，不 rebase／reset／force push。由於沒有 backend、schema 或真資料，
沒有 production data rollback。
