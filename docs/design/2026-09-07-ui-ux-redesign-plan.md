# Clinic UI/UX 重設計實作計畫

**日期：** 2026-09-07。**性質：** 本次 UI 交付計畫，非營運、醫療政策或部署授權。

本次工作依使用者提供的全站重設計需求，以及同一工作階段「開新pr」指示執行。
起點為 `origin/main` 的 `df51b5ae32e74cbd0236f1367545c75205320adf`。
採獨立 worktree 與 `codex/ui-ux-redesign` 分支；提交 PR，保留 owner 審查，不自行合併。

## 執行範圍與檔案

1. 現況研究：實際路由、當前 CI、開放 PR、決策狀態、原有 tokens、效能預算與打包產物。
   以新的 dated evidence 目錄保存 before／after，舊版影像不覆寫。
2. 設計方向：每個介面提供兩組概念草圖，推薦「森林與紙感」品牌門面、聚焦步驟的預約、
   緊湊且可掃描的工作臺。保持系統字型與原生 HTML，不引入框架或動畫套件。
3. 實作 owning boundary：`apps/web/public/clinic-site.css`、`clinic-site.js`、
   `clinic-booking.css`、`patient.html`、`styles.css`、`workbench.css`、`index.html`。
   只在需要時改語意 markup，保留現有 ID、事件接線、焦點管理與狀態轉換。
4. 驗收：新增獨立的 redesign E2E；在 `scripts/e2e-groups.mjs` 登記，更新具名的外觀
   假設測試；`scripts/check-clinic-freeze.mjs` 及其測試仍強制保護全部凍結資產。
   本次外觀重設計的明示授權取代舊版的視覺凍結要求，只重算實際變更檔的基準，
   不刪 gate、不減少其資產清單、不放寬 performance budget。
5. 文件：本計畫、dated research／handoff、概念圖、tokens／元件／Figma 資產清單、
   截圖與 manifest，登記於 `docs/README.md`。視覺基準只在完成比對後更新其指向。

## 不變項與決策

- AGENTS Safety Floor 1–8 全部保留；僅合成資料、loopback、本機狀態；不啟用任何 API。
- 不改 `packages/domain`、`packages/contracts`、API、worker、RBAC、登入、儲存結構、
  時區、預約／取消／改期規則、idempotency、outbox 或未核准欄位。
- 無 D-series 決策授權正式營運；本次不新增營運行為，因此不推定任何 pending 決策為 approved。
  D-006／D-010 的既有批准不構成部署授權。
- [介面規則書](ui-ux-rules.md) R-1–R-26 與 §5 是驗收權威。
  100 分設計評分是補充的審查工具，不取代該矩陣或聲稱法規認證。
- 保留 public URL、瀏覽器返回／深連結、三段表單與成功結果、查詢／取消／改期、
  權限拒絕及隱私草稿入口。不存在的 `/booking/lookup`、`/staff/appointment` 不自行新增。

## 並行工作

發現 PR #78 修改 `accessibility.spec.ts`、`mobile-layout.spec.ts`、
`patient-booking.spec.ts` 與兩個 support helper。本次不改這五檔；新增獨立測試，
PR 描述交代 T3-Q-01 的整合依賴。PR #76 是 BOOK-PILOT plan-only，#77 是狀態文件，
不納入本次新功能。另一 worktree 的 WB-02 無未提交修改，已被 main 的後續提交包含。

## 驗證與回復

- 建立未修改應用程式的 before 產物，再以相同環境／合成 seed／時間／viewport 捕捉 after。
- 先執行 UI、tokens、pages、groups、docs、governance、format、lint、freeze 與 budget；
  再跑 UI／mobile／accessibility／patient-portal／appointments／auth-rbac E2E。
- 新測試量測 360、390、768、1280、1440px 重排；深／淺／護眼、200% text、
  reduced-motion、鍵盤、資料狀態沿用既有矩陣，加上新版版面需要的狀態。
- 維持 build budget 原值；lab LCP／CLS 與互動測量分開記錄，不宣稱 field INP／CWV。
- 最終以 exact-commit CI 的 `Verification evidence` 決定是否達 CI-VERIFIED。
  實機、VoiceOver／TalkBack 與正式 field 資料仍需外部驗收，不以截圖冒充。
- 回復為 revert 本 PR；沒有資料遷移、後端變更或外部副作用。
- **部署影響：none — local only。** 本次不具 exact commit／project／channel／expiry
  的新 preview authority，不部署，不合併主分支。
