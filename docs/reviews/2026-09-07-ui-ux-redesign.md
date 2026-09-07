# 2026-09-07 Clinic UI/UX 重設計交接

本次將官網改為醫師肖像與平面閱讀層次、預約改為聚焦步驟、工作臺桌面改為固定側欄，
並修正此 ARM64 Chromium 可重現的兩個表單溢出狀態。此為設計候選 PR，不是發布批准。

## 修訂、範圍與授權

- 分支：`codex/ui-ux-redesign`。原始 before 為 `df51b5ae32e74cbd0236f1367545c75205320adf`。
- 本文件及 manifest 不能先寫自己的 commit SHA；使用 `git log -- docs/reviews/2026-09-07-ui-ux-redesign.md` 取得交付 commit。
- 使用者提供全站重設計需求並確認「開新pr」，允許本次實作、提交與建立 PR。未合併，merge commit：none。
- [實作計畫](../design/2026-09-07-ui-ux-redesign-plan.md)、[研究／方案／tokens／Figma](../design/2026-09-07-ui-ux-redesign-research.md)。
- 不改 domain、contracts、API、worker、auth、RBAC、預約或取消／改期規則、資料結構、隱私與部署 gate。
- 凍結 guard 仍列 30 檔；只按這次明示重設計授權更新實際修改的兩份 clinic CSS 與 renderer hash。
  既有影像與公開內容 manifest 不變；不得把此次重新建立基準當成日後任意修改授權。

## 修改檔案

| 檔案 | 原因與結果 |
| --- | --- |
| `apps/web/public/clinic-site.css` | 紙色／森林色、左對齊區段、較方形 CTA、完整肖像版型、取消主內容淡入 |
| `apps/web/public/clinic-site.js` | 使用既有 DOCTORS 的肖像、alt 及姓名；說明置於圖片下方 |
| `apps/web/public/clinic-booking.css` | 以共用 theme token 建立品牌橋接；較精簡手機頁首、平面表單與選取卡片 |
| `apps/web/public/styles.css` | 共用 light palette／radius、平面背景、手機三步名稱全可見、原生 input 最小寬度修正 |
| `apps/web/public/workbench.css` | 桌面 rail、明確 current、較低表面深度；手機仍是原有導覽 |
| `tests/e2e/ui-redesign.spec.ts` | 新版有資料工作臺五寬度、axe target-size／focus、患者返回保留、完整肖像、首屏透明度、320／375 表單溢出回歸 |
| `tests/e2e/theme.spec.ts` | 將兩個舊漸層假設改為實際底色、透明祖先與對比測量，保留主題差異／4.5:1 要求 |
| `tests/e2e/performance.spec.ts` | 加入 clinic 的既有 timing budget，附可下載 lab 數據；不改門檻 |
| `scripts/e2e-groups.mjs` | 新 spec 登記至 ui group，避免 CI 漏跑 |
| `scripts/check-clinic-freeze.mjs` | 三檔新 hash、保留全部 30 個被保護檔案與拒絕行為 |
| `scripts/check-design-tokens.mjs` | clinic 間距 clamp 技術債上限 13 收緊至 11 |
| `tests/ui-screenshots/redesign-capture.mjs` | loopback-only 合成 before／after 擷取，固定時間與 seed，紀錄瀏覽器／theme／SHA／錯誤 |
| `docs/design/2026-09-07-ui-ux-redesign-plan.md`、`2026-09-07-ui-ux-redesign-research.md` | 範圍、研究、六方案、設計系統、元件、Figma 整合、補充評分 |
| 本文件、`docs/README.md`、`docs/reviews/assets/ui-ux-redesign-2026-09-07/` | dated evidence、索引、42 張 PNG、manifest、概念 SVG、位元組報告 |

## 截圖與差異

before／after 各 21 張：320×568、360×844、375×812、390×844、768×900、1280×900、1440×900，
每個尺寸涵蓋 clinic、booking initial、staff populated。影像是 viewport reference，並非 full-page 或 pixel gate。
完整清單與 SHA-256 由工具產生，見 [before manifest](assets/ui-ux-redesign-2026-09-07/before/manifest.json)、
[after manifest](assets/ui-ux-redesign-2026-09-07/after/manifest.json)。兩者亦列出全部 dist 檔案 SHA，供核對打包版本。

| 入口 | Desktop before → after | Mobile before → after |
| --- | --- | --- |
| 官網 | [before](assets/ui-ux-redesign-2026-09-07/before/clinic-1280.png) → [after](assets/ui-ux-redesign-2026-09-07/after/clinic-1280.png) | [before](assets/ui-ux-redesign-2026-09-07/before/clinic-390.png) → [after](assets/ui-ux-redesign-2026-09-07/after/clinic-390.png) |
| 預約 | [before](assets/ui-ux-redesign-2026-09-07/before/booking-1280.png) → [after](assets/ui-ux-redesign-2026-09-07/after/booking-1280.png) | [before](assets/ui-ux-redesign-2026-09-07/before/booking-390.png) → [after](assets/ui-ux-redesign-2026-09-07/after/booking-390.png) |
| 工作臺 | [before](assets/ui-ux-redesign-2026-09-07/before/staff-1280.png) → [after](assets/ui-ux-redesign-2026-09-07/after/staff-1280.png) | [before](assets/ui-ux-redesign-2026-09-07/before/staff-390.png) → [after](assets/ui-ux-redesign-2026-09-07/after/staff-390.png) |

390px 的第一個預約選擇頂緣由 754.09px 提前至 712.09px，增加 42px 首屏空間。
官網醫師說明不再遮住影像；工作臺 desktop 導覽從頂部移至左側。
手機三個步驟都顯示名稱；focus、選取與確認契約由測試另驗，不從 PNG 推論。
主色與字型差異是預期變更；兩批均為同一作業系統，不能推論跨 OS 換行相同。

這是新的候選 evidence id，舊 C6 與更早影像沒有覆寫。
`capture:ui` 目前仍指向 C6，所以本次使用獨立擷取程式。
待 owner 審查後才將正式 reference 的四個位置一起更新；本 PR 不把自己生成的圖片稱為 owner-approved baseline。
`ui-ux-rules.md` 尚稱 C4，但 structure／capture／索引已指 C6 的既有差異也不在此冒充新批准修正。

## 可重現環境

- 使用者環境：POCO F8 Ultra（ARM64），Termux＋Ubuntu PRoot＋XFCE；Node 24.20.0、pnpm 11.9.0。
- 合成時間固定 `2026-07-29T01:00:00.000Z`，真正 captureDate 另存 manifest。
  locale zh-TW、Asia/Taipei、DPR 1、reduced-motion reduce；clinic light、booking／staff warm。
- 每個情境全新 browser context，staff 僅用 TEST_UI_001 與既有合成測試身份。
- 執行同 `.claude/launch.json` 的 `web-dist` server／旗標，另用未占用 loopback port，避免干擾既有 3100。
  after 前先 `node scripts/build-web.mjs`；before 使用未改版 dist 的隔離副本。
- `CLINIC_CAPTURE_SOFTWARE_ONLY=true` 僅對本機 Chromium 啟用 `--use-gl=disabled`、`--disable-gpu-compositing`。
  CI project／瀏覽器配置不改。

```bash
CLINIC_CAPTURE_BASE_URL=http://127.0.0.1:3314 \
CLINIC_CAPTURE_SOFTWARE_ONLY=true \
node tests/ui-screenshots/redesign-capture.mjs after
```

擷取程式不啟動 server；須先依 web-dist 配置啟動對應 port。before 額外以 `CLINIC_CAPTURE_DIST`
指定原版 dist 以生成正確資產清單；不得拿 after server 截圖卻標成 before。

## 效能與無障礙

[位元組明細](assets/ui-ux-redesign-2026-09-07/performance-bytes.json) 使用正式 budget 核心計算，未放寬任何上限：

| 入口 | before bytes | after bytes | 原 total budget | 結果 |
| --- | ---: | ---: | ---: | --- |
| clinic | 120931 | 120769 | 200 KiB | PASS |
| booking | 71756 | 71559 | 71 KiB | PASS |
| staff | 93464 | 93507 | 92 KiB | PASS |
| privacy | 8022 | 8022 | 8 KiB | PASS |
| 404 | 2019 | 2019 | 4 KiB | PASS |

staff 增加 43 bytes，CSS 16372 bytes／16384 bytes，僅剩 12 bytes，這是真實的維護限制。
下次修改需重新量測，不能提高上限。所有入口零字型下載，資源 request 數不增加。
lab FCP／LCP／CLS 沿用 1800ms／2500ms／0.1；clinic 新增進既有測試，JSON 附在 Playwright result。
這不是 field p75；INP 需要具代表性的真實互動資料，本 PR 沒有聲稱已取得。

42 張初始／有資料截圖均為 0 文件層水平溢出。
before／after 各 6 次 axe 取樣為 0 violation；動態與其他狀態另由完整 E2E 覆蓋。
兩批 booking／staff 每張皆有一個相同的 `/v1/calendar-session/client-config` 404 console error，
代表本機 server 沒有 pilot config 路由、正常保留 synthetic fallback；不是「console 全零」。
沒有為了截圖偽造 200 回應或改變登入分支。clinic console 為 0；沒有觀察到 JavaScript pageerror。

## Gate 狀態

本文件初稿為 **GATE-VERIFIED**；最終 exact-commit CI 結果依 PR `Verification evidence`。
下表的暫存執行結果會在交付前更新，不以 main 的成功冒充本 PR。

| Gate | 狀態 | 證據／限制 |
| --- | --- | --- |
| build／types | PASS | 6 workspace packages／apps 建置；20 domain vendor 同步無 diff；web 83 files、59 content-hashed |
| check:ui | PASS | test-only 邊界、權限、published schedule、case flow、a11y 靜態 gate |
| check:tokens | PASS | 未定義 token、寫死色／字重／圓角／陰影／斷點 0；clamp 上限收緊至 11 |
| check:pages | PASS | 5 入口、8 條資料驅動官網路由 |
| check:perf | PASS | 5 入口，各分類與總量均在原 budget |
| check:clinic-freeze | PASS | 30 檔，修改拒絕與缺檔拒絕的既有單元測試保留 |
| check:e2e-groups | PASS | 21 specs、6 groups |
| test:unit | PASS | 88 files、1282 tests；ratchet／freeze／group 另 3 files、50 tests PASS |
| check:structure | PASS | 236 required files、17 份歷史 C6 reference；此數字不表示新圖已成正式基準 |
| check:governance | PASS | 0 blocking finding；既有 AGENTS／CLAUDE advisory size warnings 留存 |
| check:format／lint／docs／secrets | NOT_RUN | 待最終候選樹與所有新證據生成後重跑 |
| Chromium E2E 六組 | PASS | 更新 main 前的完整候選：266 tests、0 failure、0 skipped、0 flaky；先前四組 199 PASS／4 FAIL 的 input 溢出已修正。整合新 main 後以 exact-commit CI 重驗 |
| mobile-device／WebKit | NOT_RUN | 待最後本機引擎執行；標準 runner 矩陣仍為 CI 必須項 |
| Firestore Emulator／supply-chain／SAST | NOT_RUN | 本機資源優先 UI，交由 unchanged required PR CI；不啟用雲端取得證據 |
| exact-commit Verification evidence | NOT_RUN | 尚未建立 PR 時無此 commit 的 CI |
| §5.2／§5.3 實體裝置與讀屏 | UNAVAILABLE | External manual verification required；owner／真人 QA 環境執行 |
| field INP／p75 CWV | UNAVAILABLE | 沒有正式 field 資料或營運／分析部署授權；lab 不替代 |

## 真缺陷與處理

| 分類 | 證據與根因 | 處理 |
| --- | --- | --- |
| CONFIRMED | 中間版本 staff CSS 16.1 KiB >16 KiB | 移除不必要的大型漸層／裝飾環與陰影，回到 budget；沒有改上限 |
| CONFIRMED | clinic normal-motion axe 7 個低對比節點；主內容 `clinic-rise` 從 opacity 0 開始 | 新透明度回歸先 FAIL，移除 hero 主內容淡入後 PASS；reduced-motion 與次要 reveal 保留 |
| CONFIRMED | main 原版在本機 375px：schedule 35px、patient step3 68px 溢出；重設計初版 35px／64px | 原生文字 input 的 auto min-width 撐開 grid；共用 input 加 min-width:0，兩個 failing-first 回歸 PASS，再補 320px |
| NOT-A-BUG | 兩項 theme tests 強制要求 linear-gradient／多個色停 | 保留主題必須不同與 AA 對比，改量實際純色及不透明祖先；不刪除驗證 |

## 本機陷阱、未覆蓋與下一步

獨立 worktree 只有 root node_modules link 不足；contracts／API／worker 的 package link 也需要，
否則 build 會找不到 zod、lint 產生大量衍生錯誤。重用既有安裝的 link 後 build 成功；
沒有重新安裝、更新依賴或 purge 使用者 node_modules。pnpm verification 的隱式 install 必須避免，
本次用 `pnpm_config_verify_deps_before_run=warn` 或直接執行已安裝工具，明確保留 warning。
PRoot 的標準 Chromium GPU subprocess 曾崩潰，單程序模式又會在 context 關閉後退出；最終只用上述兩個軟體繪圖旗標。
預覽 server 若生命週期先結束會得到 ERR_CONNECTION_REFUSED，不能算 UI 功能失敗；最終測試由 Playwright 管理 server。

剩餘 owner 項目：

1. **T3-Q-01**：合併其最新 coverage 後在此 PR exact commit 跑完整矩陣；先處理任何 CI FAIL。
2. 逐張複核候選 before／after 與六方案，獨立確認 ≥92／各項 ≥4 的設計評分；此自評不取代產品整體稽核分數或發布 gate。
3. §5.2／§5.3：Chrome／Edge／Firefox／Safari、真實 200% 系統字體／400% zoom、NVDA／VoiceOver／TalkBack、iPhone／Android 軟鍵盤、橫向／safe-area、真實弱網。
4. 確認候選後再以新的 evidence id 同步正式 capture／structure／文件四個基準指向；Figma 僅做資產與審查同步。
5. 不合併、不部署、不開 `/v1/bookings`；下一步只做已批准範圍的 review。正式營運仍依決策登錄與另外的部署授權。

回復方式：revert 本 PR 的 coherent UI／測試／證據變更；無資料遷移、外部訊息或雲端寫入。
