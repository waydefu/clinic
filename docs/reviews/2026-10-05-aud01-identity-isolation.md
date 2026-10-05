# AUD-01 身分上下文隔離：本機修復交接（2026-10-05）

**狀態：** `TEST-VERIFIED / REVIEW-PASS / EXACT-CI-PENDING`。AUD-01 保持 OPEN；本紀錄不授權合併、部署或資料操作。

## 權威與 source

業主透過本次核准表單選擇完整修復，規則已記於[決策登記](../product/phase-1-decision-register.md)及 [ADR-0007](../adr/0007-minimized-booking-intake-and-identity-resolution.md)：隔離初診、回診與員工請求；重啟清除舊上下文；拒絕混合身分；新 intake 不被既有 verified patient 忽略。沒有另行提供 approval ID，不另造。

- 修復起點：`1e26d3b257cd542ea4e3aee76f64a7a9ba87ecf3`，隔離分支 `agent/audit-01-07-closeout-20261005`。
- API 本機整合 commit：`47227d3d722941e25e01582536917242692521c5`；後續 scheme 修正：`270b02f`。Web／文件／測試變動尚未提交；這不是最終 release SHA。
- 已 fresh-fetch `origin/main` 至 `2b3dd25582bab2b0e6a583005ccb027a57cff463`；與起點的差異為 C1 packet／其文件契約測試及 UI harness／索引，沒有改本次 `apps/api`、`apps/web`、`tests/e2e`、`packages` owning source。沒有本機合併或改寫歷史。
- 本紀錄不能引用自己的 commit；交付後使用 `git log -- docs/reviews/2026-10-05-aud01-identity-isolation.md` 定位。新 PR、merge commit、exact-head CI 尚未取得，不填假值、不借用其他 SHA 綠燈。

## 缺陷與修改

AUD-01 為 `CONFIRMED`：父代理以純記憶體／mock-fetch 合成重現確認舊上下文跨入新初診及員工請求。原始私有稽核材料已核對，但不把原始 payload、identity、私有路徑或敏感重現腳本放入本 PR。

- `internal-test-booking-transport.js`：按患者頁面及操作白名單附加回診憑證；新 intake／新 lookup 清除舊值；generation 拒絕已失效流程的延遲 lookup 回傳。
- `patient-app.js`／`api-client.js`：重啟同步清除身分、查詢驗證與管理列。Callback 由原有 opt-in 動態 loader 提供，不增加預設患者頁靜態載入成本。
- `internal-test-booking.authenticator.ts`：混合回診／員工或其他 bearer 身分拒絕；無效回診／缺少患者目錄不退回另一身分。
- `appointment.application-service.ts`：verified patient 與 intake 共存時，在身分解析／授權／保留前拒絕。
- 回歸覆蓋合法回診、患者 bearer、員工／匿名新 intake、拒絕案例、重啟與同分頁 staff 導航。保留 cookie／CSRF／roles／MFA，不新增 OTP、wire/schema、dependency 或 CI waiver。

第一輪獨立審閱為 FAIL，指出 scheme 大小寫缺口。父代理補測實際重現 6 FAIL／9 PASS；第三情境修正單一解析器後，四個相關 suite 119／119 PASS。只轉換 ASCII scheme，不轉 token，測試另斷言 mixed-case 合成 token 與原有 padding/trim。第二輪獨立 API 靜態複核為 PASS，security concerns／logic errors 均為空；父代理讀回解析器及 guard 順序確認。這是推論證據，不取代測試或 CI。

## 驗證與未涵蓋

本機使用官方 checksum 核對的 Node `v24.20.0`，依現有 lockfile 安裝，沒有改 manifest／lockfile。有效證據是實際執行，審閱只屬推論證據。

| Gate | 狀態／實際結果 |
| --- | --- |
| 最終相關 Unit | PASS：4 files、119／119；Web transport／API client／認證器／application service |
| 型別與 workspace build | PASS：scheme 修正與最終測試變動後 `check:types`，含 domain sync／web build |
| 相關 lint／完整 format／diff check | PASS：與最終相關 Unit 同批，producer chain exit 0 |
| Chromium booking E2E | PASS：31／31、retries=0，含兩條新增身分切換路徑；此次後續 API scheme 修改未改瀏覽器 source。測試為本機合成／mock provider，不是 live API／Firebase／Calendar 驗收 |
| 效能預算 | PASS：5 個入口。曾因靜態 import 失敗，改回 owning dynamic loader 後通過；門檻未修改 |
| 完整 Unit（上一個 snapshot） | FAIL：199 files，2497 PASS／1 FAIL／1 既有 skipped，2499 total；scheme 回歸擴充後此全套計數為 STALE，不帶成最終全套 PASS |
| 乾淨基線 FTP 相容性核對 | FAIL：同一測試 1 PASS／1 FAIL，`ECONNRESET`；fixture／manifest／lockfile 與基線相同，沒有趁本次放寬、skip 或修補 |
| 完整 verify | 先前 timeout／FAIL；效能回歸已修正，FTP 基線失敗仍保留。最終完整 matrix 由新 PR required exact-head CI 執行，不聲稱本機全綠 |
| docs／tracked secrets | PASS：本紀錄及 index 加入後已 fresh 跑本機腳本；歷史 Gitleaks／supply-chain 為 required CI，不宣稱本機完成 |
| 其他 UI／mobile／accessibility／patient-portal(WebKit)／auth-rbac／appointments groups | NOT_RUN locally：本機只跑上述 Chromium booking spec；由相應 required exact-head CI jobs 補 automated evidence，不把單一 spec 當全部 group |
| Firestore Emulator／SAST／supply-chain／Verification evidence | NOT_RUN locally：由完整 required CI matrix 補證，無 waiver／弱化 |
| 真實裝置、screen reader／硬體對比與完整手動 UI matrix | NOT_RUN／External manual verification required；本次非視覺設計變更，沒有重錄或手改 baseline manifest |
| 最終獨立審閱 | PASS：API 差異的第二輪靜態複核；沒有執行測試或替父代理關帳 |
| exact-head CI／核准 merge | NOT_RUN／待取得；AUD-01 尚未在 main 關帳 |
| AUD-07／final source freeze／cloud mutation | NOT_RUN；不得從本紀錄推論完成 |

## 接手、回退與下一步

Windows Corepack wrapper 可能綁到另一個 `node.exe` 或傳入未轉換的 MSYS 路徑；使用明確 native Node 路徑，對需子程序的執行在同一 call 設定 scoped PATH，不假設先前 export 仍存在。工具鏈 helper 僅在受控本機 scratch，不入 repo。中途逾時與修正前紅燈都有保留，不把成功訊息當完整命令 PASS。

final reviewer result 已核實為 PASS，下一步提交去識別化修復 PR；必須取得 exact-head required CI，不能借用 C1 文件 PR 的 CI。AUD-01 source 交付完成後再查 AUD-07 的原始證據及 siblings；必要修正分別經核准合併、final main CI 後才另行 freeze SHA。

未合併的本機修正可只回退本次自己寫的檔案／分支；若已交付，另走核准 revert PR，不覆蓋其他人的變動、不改寫歷史。沒有部署、GCloud build／apply／Hosting 修改、真實資料／Calendar 操作、DB migration 或資料刪除；C1 時窗、費用與 exact plans 仍按各自核准邊界。
