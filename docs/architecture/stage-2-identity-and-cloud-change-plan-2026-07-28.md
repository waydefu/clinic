# Stage 2 身分與 Cloud Staging 變更規劃（2026-07-28）

**狀態：Proposed／plan-only／尚未授權執行。** D-006 與 D-010 的目標值已由業主於
2026-07-28 核准，但本文件只把核准內容轉成可審查、可驗收、可回滾的 Stage 2
change plan。它不建立 Firebase／Google Cloud project、不啟用 Identity Platform、
不建立帳號、不寫入真實病患資料，也不修改任何 route 或程式碼。

Stage 2 只允許隔離環境中的合成資料。正式預約、真實員工／病患資料、production
Calendar 與公開寫入仍須各自通過 D-001～D-005、D-009、D-011 及部署核准。

## 1. 已核准的不變條件

### 1.1 身分與角色

- 員工登入支援 Google federated sign-in 與診所自管帳號；應由核准的 IdP 管理
  credential，應用程式與 Firestore 不自行保存可還原密碼。
- 第一批正式 staff role 為 `administrator`、`front_desk`、`physician`。未明示
  的 action 預設拒絕；個管、薪資、會計與 Expansion S 角色另受 D-007、D-008、
  D-014、D-015 約束。
- `front_desk` 與 `administrator` 可完成到診；患者、醫師與 service account
  不因此取得完成到診權限。
- `administrator` 可依封閉理由碼刪除符合條件的預約，或以多組、可個別撤銷的
  授權碼委派 `front_desk` 執行同一 command。委派不會永久提高櫃檯角色權限。
- audit 永久、append-only；任何人、任何應用程式角色與一般維運 service account
  都沒有更新或刪除 audit 的能力。

### 1.2 MFA、session 與停權

- 全體員工強制 MFA。診所自管帳號以 TOTP 為第二因子。
- Google sign-in 必須能提出受管理帳號已強制 MFA 的證據；若沒有可驗證的
  Workspace／Cloud Identity 政策，該登入也須在應用層完成 TOTP，不能只假設
  個人 Google 帳號已開啟兩步驟驗證。
- 閒置滿 30 分鐘後要求重新登入；每次登入的絕對上限為 8 小時。滑動活動時間
  不能延長 8 小時上限。
- 帳號停用後，下一個受保護 request 必須被拒絕。只撤銷 refresh token 不足：
  Firebase ID token 可存活約一小時，因此停權流程與每次 server-side 驗證必須能
  偵測 disabled／revoked session。

### 1.3 授權碼

- 每組授權碼有 opaque ID、建立者、建立時間、用途、啟用狀態、撤銷人／時間與
  最後使用時間；不保存或回顯明碼。
- 只保存每組隨機 salt 的 memory-hard KDF 結果；優先 Argon2id，環境無法提供時
  使用 scrypt。選用 pepper 時只放 Secret Manager，不與 hash 同庫。
- 比對採 constant-time；log、audit、錯誤訊息、trace、分析事件與匯出不得包含
  明碼、hash、salt 或 pepper。
- 錯誤嘗試必須受限制。精確計數鍵、等待、上限與解鎖方式是下方 Stage 2
  security parameter proposal，不把尚未由業主指定的數字誤記為 D-006 核准值。
- 不回覆「某組碼存在但已停用」等可枚舉資訊；錯誤、鎖定、解鎖、使用、撤銷都
  append audit。

### 1.4 Cloud 所有權、區域與復原目標

- 診所是 Firebase／Google Cloud project 的法定與帳務擁有者；管理者與開發者只持
  經審查、可撤銷、最小必要的 IAM，不以共用帳號或提交到 repository 的長期金鑰
  取代治理。
- `dev`、`staging`、`production` 必須是資料、帳務、service identity 與秘密互相隔離
  的環境；本階段只規劃 synthetic-only staging，不建立 production。
- primary region 是 `asia-east1`。RPO 1 小時／RTO 4 小時是已核准 target，且同時
  適用 database loss、whole-project failure 與 regional failure。
- 這些是目標，不是目前能力。C0 必須分別提出三種 failure class 的備份／複寫、
  替代 project／location、DNS／routing、IAM 與秘密恢復路徑，並說明如何量測資料
  復原點及服務恢復時間；沒有可演練的設計就不得宣稱達標。
- regional-failure 路徑若需要把資料放到 `asia-east1` 以外，必須先完成
  D-001～D-003 的跨境／處理者審查；在那以前只能用合成資料演練。

## 2. 技術前提與官方限制

- Identity Platform 支援 TOTP MFA，MFA enrollment 前必須完成 email verification；
  啟用前須把 Identity Platform 升級／設定、支援的 provider 與計費影響納入 C0
  變更審查並附證據：
  [Enable TOTP MFA](https://cloud.google.com/identity-platform/docs/admin/enabling-totp-mfa)。
- Firebase ID token 約一小時，refresh token 可由 Admin SDK 撤銷；server 必須
  額外檢查 revocation 才能在 token 自然到期前拒絕：
  [Manage user sessions](https://firebase.google.com/docs/auth/admin/manage-sessions)。
- Firebase server-side session cookie 可設定 5 分鐘至 2 週；本系統選 8 小時，
  並另以 server-side activity state 實作 30 分鐘 idle timeout：
  [Manage session cookies](https://firebase.google.com/docs/auth/admin/manage-cookies)。
- NIST SP 800-63B 要求 TOTP／短秘密具 rate limiting，並要求 activation secret
  連續錯誤上限不超過 10 次。本規劃把 10 次當上限，不當成鼓勵使用者嘗試滿 10
  次的目標：
  [NIST SP 800-63B](https://pages.nist.gov/800-63-4/sp800-63b.html)。
- 授權碼使用 password-style secret KDF，不使用一般快速 hash：
  [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)。

## 3. 待審查的安全參數提案

以下不是新增的業主核准值，而是 Stage 2 security review 的初始提案：

- 授權碼錯誤以「操作者帳號＋用途」為主要計數，不依 IP 單獨判斷，避免換 IP
  繞過；
- 採漸增等待，連續錯誤上限提議為 10 次；達上限後鎖住該操作者的委派驗證；
- 解鎖提議只允許另一位具權限管理者重新啟用，或撤銷／換發授權碼；成功驗證後
  才重設連續錯誤計數；
- TOTP clock-skew／`adjacentIntervals` 不沿用未審查的 provider default，須以
  合成測試選出最小可用窗口；
- MFA 遺失、recovery、重新綁定與 emergency access 另做具名流程。流程未核准前
  fail closed，沒有隱藏 bypass。

這些參數必須由技術／資安負責人審查後才可進 C4；修改參數不會推翻「必須限流」
這項 D-006 已核准原則。

## 4. 建議變更切片

| 切片 | 只做什麼 | 明確不做什麼 | 進入條件 |
| --- | --- | --- | --- |
| C0 review | project、Identity Platform、成本、IAM、三種 failure class、rollback 與證據清單 | 不 apply | 本文件獲技術／資安審查 |
| C1 isolated foundation | 建立獨立 staging project、Terraform state、最小 IAM、Secret Manager | 不建 production、不放真資料 | 單獨 deployment approval |
| C2 staff identity | 合成 staff、Google＋local provider、email verification、MFA enrollment/recovery | 不接公開患者登入 | C1、IdP 成本與 recovery 核准 |
| C3 server session | `httpOnly`／`Secure` cookie、CSRF、8 小時 absolute、30 分鐘 idle、logout | 不信任瀏覽器 role／timer | C2、threat model review |
| C4 authorization | server-side RBAC、active account check、revocation、授權碼 KDF／限流 | 不以 UI 隱藏代替 403 | C3、角色/action fixture 核准 |
| C5 audit | 同 transaction append、查閱投影、永久 deletion deny、容量告警 | 不允許一般 admin delete | C4、D-002 access/export 對齊 |
| C6 routed synthetic API | 只開 staff-only staging route 與合成資料 E2E | 不開 public route | C1～C5 證據通過 |

每個切片使用獨立 commit／change review。C1 之後若任一核准或成本條件不成立，
停止後續切片；不得用暫時關掉 MFA、revocation check 或 audit 來讓測試通過。

## 5. Session 與停權驗收語意

```text
登入成功
  -> server 建立最長 8 小時 session
  -> 每個 protected request 驗證簽章、aud/iss/exp、revocation、account active、
     role/action/resource scope，以及 server-side last activity
  -> 閒置 >= 30 分鐘：拒絕並清 cookie
  -> 建立時間 >= 8 小時：拒絕並要求完整 MFA
  -> 帳號停用：disable + revoke + session-version/active-state 失效
  -> 停用後下一個 protected request：拒絕
```

「立即撤銷」的驗收定義是**停用完成後不得再成功執行下一個受保護 request**，不是
「等現有一小時 ID token 自然到期」。若 revocation check 使用 cache，cache 必須
由停用 transaction 主動失效；不能只依短 TTL 宣稱立即。

## 6. 最小角色／動作基線

| 動作 | `administrator` | `front_desk` | `physician` |
| --- | --- | --- | --- |
| 建立／改期預約 | 允許，仍受 D-004/D-005 | 允許，仍受 D-004/D-005 | 拒絕 |
| 完成到診 | 允許 | 允許 | 拒絕 |
| 標記未到 | 依 D-005，未由本次推定 | 依 D-005，未由本次推定 | 拒絕 |
| 直接刪符合條件的預約 | 允許；必填理由 | 拒絕 | 拒絕 |
| 持有效授權碼刪預約 | 不需要委派 | 允許；記 delegation ID | 拒絕 |
| 建立／撤銷授權碼 | 允許 | 拒絕 | 拒絕 |
| 刪除／修改 audit | 拒絕 | 拒絕 | 拒絕 |

未列動作全部拒絕。回診醫囑、臨床欄位、個管、薪資、付款與 Calendar inbound
reviewer 不從此表推定，依其各自 decision gate。

## 7. 必須留下的驗證證據

- Google 與 local 帳號未完成 MFA 都不能建立 session；
- local TOTP enrollment、recovery、遺失因子與重新綁定都有雙人或具名核准紀錄；
- 29:59 仍可使用、30:00 idle 被拒；7:59:59 可用、8:00:00 absolute expiry
  被拒，且不能靠前端改時間繞過；
- disable／revoke 完成後，既有 cookie 與 ID token 的下一個 protected request
  均為 401；角色移除後下一個 action 為 403；
- 授權碼明碼不進 database、log、audit、trace、error 或 snapshot；單組撤銷不影響
  其他組；
- 依審查後參數驗證漸增等待、上限與解鎖；不同 IP 不能繞過帳號計數；
- 櫃檯不持 code 時刪除為 403；持有效 code 時只走限定 delete command；
- appointment 可依政策刪除，但對應 audit 仍存在且所有 application role 都無
  update/delete path；
- direct Firestore client read/write 仍 deny；server Admin SDK 每次先做 authz；
- deployment、rollback、backup/restore smoke 與秘密輪替演練都有時間、actor、
  結果與 artifact reference。
- database loss、whole-project failure、regional failure 分別有演練案例；每次記錄
  實際 recovery point、開始／恢復時間與缺口，不以「已開備份」代替 RPO／RTO
  證據。

## 8. 回滾與停止條件

- IdP、session 或授權判斷出現 fail-open：立即停用 routed staging API，保留
  audit，不切回 browser role switch 當替代安全邊界。
- MFA provider、TOTP recovery 或停權無法通過驗收：回滾 C2～C4 設定並停止 C6。
- Terraform plan 出現 production、非 `asia-east1` primary、過寬 IAM、公開
  Firestore 或未列資源：不得 apply。
- 任一 failure class 沒有可審查的復原路徑，或合成演練已超過 RPO 1 小時／RTO
  4 小時：不得宣稱 D-010 target 已實現，也不得把 Stage 2 推進 production。
- audit 可被 application administrator 更新／刪除：停止整個 Stage 2。

完成本計畫審查只代表可以另外提出 C1 deployment approval；不代表自動獲准建立
雲端資源或改碼。
