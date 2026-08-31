# CAL-PILOT 30 天 synthetic-only 部署紀錄（2026-08-30）

## 1. 結論

CAL-PILOT 已在 `beauessence-clinic-staging`／`asia-east1` 啟用。這是 30 天、
登入後才能使用、只允許 A01～A30 與兩本專用 CAL-PILOT 日曆的 synthetic-only
測試，不是 production，也不允許真實姓名、電話、病歷、麻醉資訊或正式日曆。

測試頁：
<https://beauessence-clinic-staging--cal-pilot-pk9yyofq.web.app/>

應用程式 kill switch 於 `2026-09-29T04:51:37Z`（台北時間 2026-09-29
12:51:37）停止同步與寫入。登入 CSP hotfix 發布時保留剩餘整數小時，Hosting
channel 到期時間現在是 `2026-09-29T05:18:46.938568327Z`；兩者不一致時，
仍以較早的應用程式停止時間為準，沒有延長測試。

## 2. 核准與 immutable candidate

- 最後套用確認：`確認啟用 4d47c987（30 元告警）`。
- 核准 commit：`4d47c9877536c5d20de5445b36cfefe616cdea4a`。
- PR：[#31](https://github.com/waydefu/clinic/pull/31)。
- Cloud Build：`d2e91aef-6323-41e9-afa5-797ce2d8eeb2`。
- API image：
  `asia-east1-docker.pkg.dev/beauessence-clinic-staging/cal-pilot/api@sha256:a0f1012a5dbafbdaf9a872399701c9a18feecde94a60e1b27f9245d94e0f79c6`。
- Worker image：
  `asia-east1-docker.pkg.dev/beauessence-clinic-staging/cal-pilot/worker@sha256:1aefde5706718c7bec54cd9c4844e451b0d6da54e1206d25691cbf43bd49f67c`。
- 部署中發現的首次發布、Identity 與 lazy stylesheet 缺陷由
  `8ad46286d6c40710cd30ba9219b69802f43db1b8` 修正；API／Worker 程式內容未變，
  因此 Cloud Run 仍固定在上列核准 digest。修正後的靜態網站已重新建置並發布。

## 3. 線上資源證據

| 項目 | 線上結果 |
| --- | --- |
| API | `cal-pilot-api-00001-xiv`，核准 API digest，100% traffic |
| Worker | `cal-pilot-worker-00001-gow`，核准 Worker digest，100% traffic，未公開 |
| Scheduler | `cal-pilot-five-minute-sync`，`ENABLED`，`*/5 * * * *`；目標與 OIDC audience 都等於私人 Worker service |
| Hosting | 登入 CSP hotfix release `1788088766253000`、version `29a02d4e51c819c1`、83 files、371,776 bytes |
| Firestore | rules／indexes 已發布；瀏覽器直接讀寫全面拒絕 |
| Identity | Google provider 已啟用，preview domain 已加入 allowlist，TOTP 已啟用 |
| Secrets | reader、writer、source map、manager allowlist、web API key、pseudonym key 均由 Secret Manager 版本管理；內容未輸出、未提交、未進入 Hosting |

Hosting `/v1/**` 使用同來源 Cloud Run rewrite。瀏覽器取得的投影不含 Calendar ID、
原始 Google event ID、sync token、etag 或服務帳號資訊。

## 4. 套用差異與啟用順序

- Terraform reviewed apply：`0 added, 1 changed, 0 destroyed`；唯一差異是把 Scheduler
  placeholder URL／OIDC audience 固定到實際私人 Worker。
- 全新 Cloud Run service 不接受 0% 首次建立，因此首版先以私人 100% revision 建立，
  加入短期具身分 invoker 做 smoke；smoke 成功後才公開 API，Worker 全程私人。
- 短期 smoke IAM binding、隔離的 CLI 設定與登入均在驗證後撤銷。
- config seed 完成後才依序開啟 inbound／outbound，最後 resume Scheduler。
- Terraform foundation 固定目標 URL；active window 的 pause／resume 由 release 流程控制。
  測試期間不可套用仍含 `paused = true` 的預設 plan。

## 5. 驗證結果

### 5.1 候選與本機驗證

- 核准候選在部署前的同 SHA CI：11／11 成功，run `33293121249`。
- 登入 CSP hotfix `f2c2ad058f3c6e3d4f635d0dd2c49171d63476a4`：同 SHA CI
  11／11 成功，run `33308433138`。
- 部署後 hardening：結構、clinic freeze、架構、頁面、design token、文件連結、
  E2E 分組、秘密掃描、Prettier、型別、build、ESLint、vendor sync 與效能預算通過。
- 單元測試：73 files、1128 tests，全數通過。
- Firestore emulator：6 files、67 tests，全數通過；包含 direct-client deny-by-default、
  transaction、outbox、重試與 runbook 演練。
- PowerShell release script AST：0 parse errors。

### 5.2 線上 smoke 與瀏覽器

- 私人 Worker smoke HTTP 200；API `/v1/health` HTTP 200；未登入存取
  `/v1/calendar/status` 回 HTTP 401。
- 首次 Scheduler 呼叫成功，後續狀態為 enabled。
- 內建瀏覽器只顯示一個登入主畫面：`CAL-PILOT 安全登入`；登入 CSP hotfix 後
  實際按下 Google 登入可依序到達 Firebase Auth handler 與 Google 帳戶選擇頁。
  帳號選擇、TOTP enrollment 與登入後工作臺保留給業主親自驗收。
- lazy stylesheet 已改為 hashed asset，載入完成後才啟動 client；console error／warning
  為 0。
- DOM 未出現 private key、service-account email、Calendar ID、原始 Google event ID
  或 Google Calendar address 的特徵字串。

### 5.3 第一次增量同步

第一次同步建立 30 個候選：

- 1 個符合 `[忙碌] 其他` 的 synthetic 事件成為 `pending create_block`，時間為
  台北時間 2026-09-02 12:00～12:30；在人工核准前不擋位。
- 29 個舊標題為 `invalid_format`／「格式需修正」；沒有自動猜測，也沒有自動擋位。
- 候選投影欄位檢查沒有 Calendar ID、外部／Google／raw event ID 欄位。

## 6. 2026-08-30 補充的舊格式觀察

業主回報既有操作標題有時包含「小編姓名 `(LINE)[來源]`／姓名、電話／服務／
全麻或局麻」。這個格式**沒有**加入本次 parser：姓名與電話超出 synthetic-only
核准，麻醉方式屬臨床欄位。正式遷移至少要先完成以下轉換與新核准：

1. 小編與來源改為封閉代碼，不保留自由文字姓名。
2. 患者只使用系統識別碼；電話不得出現在 Calendar。
3. 服務使用受控目錄。
4. 全麻／局麻由核准的臨床資料模型承接，不由本 pilot 猜測或保存。

在此之前，這類事件只會進「需修正」候選，不會影響患者可用時段。

## 7. 費用與 30 天邊界

- Billing budget：NT$30；50%／80%／100% 通知約為 NT$15／24／30。
- 預算通知不是硬上限，不會在 NT$30 自動停用服務。
- 低流量可能接近免費，但 Cloud Run、Scheduler、Firestore、Secret Manager、
  Artifact Registry、日誌與流量仍可能計費；正式環境不得假設免費。
- 延長時間、增加帳號、改白名單、讀取真實資料或接 production 都需要新核准。

## 8. 部署中發現並修正的問題

1. Firebase Auth 預設 redirect URI 重複：移除手動重複值，Auth 發布成功。
2. Cloud Run 首次建立不支援 `--no-traffic`：改為先私人建立並做具身分 smoke。
3. Identity Platform 已啟用時回傳精確 idempotent 訊息；只接受該精確結果，
   `authorizedDomains`／MFA 改走官方 config GET／PATCH 並保留其他 provider。
4. esbuild 壓縮變數名稱後，lazy CSS 未被換成 hashed filename：build 改為只重寫
   manifest 內的相對 CSS，新增 minified identifier regression，並等待 stylesheet load。
5. 首次發布沒有可回切的舊 revision／version：runbook 改為首版安全停止流程，不再
   聲稱可回到不存在的版本。
6. 初次瀏覽器 smoke 只驗證「登入按鈕可見」，沒有點擊登入，因此漏掉 Hosting CSP
   將 Firebase Auth 擋在 `identitytoolkit.googleapis.com` 的缺陷。後續操作驗收重現
   `auth/network-request-failed`。修正只在 `connect-src` 放行 Identity Toolkit／
   Secure Token、在 `script-src` 放行 Google API iframe loader、在 `frame-src`
   放行本 staging authDomain；所有來源都採精確 host，沒有 wildcard。Trusted Types
   的 `createScriptURL` 再把 loader 限縮到 `/js/api.js` 與 SDK 的 callback 形狀。
   修正版已線上實際點擊並到達 Google 帳戶選擇頁。`redirectionChainSiteScript.js`
   的 `Cannot redefine property: location` 來自瀏覽器擴充功能注入，與本站修正無關。

## 9. 首版安全停止／後續回復

首版若需立即停止：pause Scheduler → 關閉 inbound／outbound → 移除 API 公開呼叫
權限 → 讓 `cal-pilot` preview 到期或刪除。保留 Cloud Run revision、合成預約、
mirror、候選與匿名 audit 供查核。因為這是首版，沒有前一版可回切；下一次發布前
必須先記錄現行 API／Worker revision 與 Hosting version，才可執行真正的版本回復。

## 10. 未被本次部署改變的邊界

- Production D-009／D-016 仍為 pending。
- 正式 Calendar、真實患者、姓名、電話、病歷、臨床／麻醉欄位與金流仍未核准。
- 本次沒有建立 production 專案、production secrets 或 production cursor。
- 使用者第一次登入仍需親自完成 Google 登入與 TOTP enrollment；這是人工驗收，
  不由部署者代替。

## 11. 2026-08-31 延期核准（尚未套用）

業主已核准把 synthetic-only 測試延長至 `2026-11-28T04:51:37Z`，費用告警改為
2026-08-30～2026-11-28 整段合計 NT$30，並允許一版只移除「30 天」字樣的
Hosting 文案。API／Worker、Scheduler、兩本 Calendar、Secrets、帳號與資料邊界
全部凍結；功能增補只進獨立 PR／CI，不部署。

這一節只記錄方向，**不是已套用證據**。精確 extension commit、Terraform diff、
Hosting file diff 與線上驗證完成前，上方既有 expiry／version 仍是現況。候選見
[2026-08-31 延期 change plan](2026-08-31-cal-pilot-extension-change-plan.md)。
