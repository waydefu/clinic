# Booking MVP 最終 UI 業主驗收 — 2026-08-22

## 現行交付

本文件取代先前驗收文件的「現行連結」角色，但不改寫 2026-08-20 的 C／C2 歷史證據。

| 欄位 | 現行結果 |
| --- | --- |
| Exact deployed C3 | `d9b6965c0e3ae62df33e89744f12c6d7fcc16480` |
| Candidate CI | [`32553136689`](https://github.com/waydefu/clinic/actions/runs/32553136689) — 11/11 `success` |
| Preview URL | <https://beauessence-clinic-staging--synthetic-review-xvqa68cx.web.app> |
| Preview expiry | 2026-08-29 13:08:05 Asia/Taipei (`2026-08-29T05:08:05.084059718Z`) |
| Online verification | **PASS — 474/474**；evidence commit 等於 C3 |
| Visual evidence | [2026-08-22 的 13 個情境](ui-visual-baseline-2026-08-22.md)，逐張人工檢視完成 |
| PR | [#23](https://github.com/waydefu/clinic/pull/23) open、未合併；等待業主 final acceptance |

> **這是公開但會到期的合成測試連結。請勿輸入真實姓名、電話、生日、證件、病歷、
> 薪資或行事曆資料。** 資料只留在目前瀏覽器的 `localStorage`，清除網站資料即可重置；
> 診所、其他瀏覽器與任何 production backend 都收不到這些值。

## 本輪應驗收的最終 UI

### 工作臺 Case／follow-up

- 完診預約的回診欄位在桌機採緊湊兩列，不再留下巨大空白；手機依閱讀順序單欄堆疊。
- 病歷號碼、醫師指示、目標日期、目標時間、個管師、回診項目、診斷書份數與備註仍可用。
- Case 只在 synthetic workbench 啟用；授權檢查仍先於 mutation，無 production Case backend。
- Payroll 維持 frozen／unreachable，沒有重新啟用。

### 工作臺週曆

- 一週顯示七個日期欄；週三至週五為 12:00–20:00，週六為 10:00–18:00，休診只在
  日期 header 標示，不用條紋填滿空欄。
- 事件卡只來自實際存在的 synthetic appointments；空日保持乾淨，不產生假卡片。
- 桌機顯示完整週，窄螢幕只在 calendar component 內水平移動，整頁不水平 overflow。

### 患者三步驟預約

1. **類型與項目：** 左欄顯示一森渼診所、臺北市松山區光復北路112號2樓、
   `02-2577-1314` 與週三至週六門診時間；右側只做初診／回診及服務選擇。
2. **日期時段：** 沒有左 sidebar；full-width 日期 selector 只展開一個 active date 的 slots，
   slots 結束後沒有 QA card 或巨大空白。
3. **基本資料：** 沒有 booking summary sidebar；桌機分「本人身分資料」與「本次門診補充」
   兩欄，手機依同順序堆疊。privacy dialog 關閉後欄位、勾選、read-status 與焦點均保留。

送出後仍只有三個 step indicators；「預約已建立」是結果畫面，沒有 Step 4。

## 查詢與自助取消

- 查詢與建立預約是兩個獨立流程，無需登入。
- 必須使用「聯絡電話＋生日」或「身分證／居留證／護照號碼＋生日」；單欄位不能查詢。
- 無結果只顯示一致訊息，不指出是哪一項不符；結果只顯示最小必要預約資訊與遮罩編號。
- **嚴格大於 20 分鐘**才可開啟取消確認：21 分鐘可取消；正好 20 分鐘、19 分鐘、
  已開始或時間不能確定時都不可自助取消。
- 不可自助取消時顯示「請來電 `02-2577-1314`」的點擊撥號；不顯示可繞過的取消按鈕。
- 成功確認只呼叫既有 canonical `cancelled` transition 一次並釋放 synthetic slot；拒絕、
  重複或 stale 操作不能改 appointment、slot、audit、outbox 或 persisted state。

這個 20 分鐘規則只屬 synthetic MVP 的業主驗收條件，**不是正式政策核准**。D-005 仍為
pending，決策登錄中的「當日 10:00 前」仍只是 production input；正式系統必須另取得
核准範圍、server-time 與 API／audit 控制。

## 建議驗收順序

1. 桌機與約 375px 手機各開啟 `/booking`，確認暖色預設、booking-only header 與警語。
2. 完成 Step 1→2→3；Step 2 切換日期後只看見一日 slots，Step 3 桌機雙欄、手機堆疊。
3. 在 Step 3 填入合成資料並開關隱私對話框，確認內容與勾選未重置、焦點回到開啟按鈕。
4. 建立合成預約，確認成功結果沒有第四步；用電話＋生日查回該筆。
5. 依固定合成情境檢查 21 分鐘取消確認、20／19 分鐘電話 fallback，勿輸入真實資料。
6. 工作臺檢查 Case follow-up 與七欄週曆；確認只有 actual synthetic event cards，Payroll
   無法到達。

## 不在本次交付內

- 沒有 production API、Firestore、Functions、Storage、Cloud Run、Authentication 或 live
  Hosting deployment。
- Google Calendar 沒有連線；週曆是內部 synthetic operational view，不是 Google Calendar。
- vendor handoff 只有 `/booking`；staff workbench、Case、clinic／doctor pages 都不交付廠商。
- 30 個 frozen clinic files 未變，PR #23 不在本任務內合併。

技術、部署與 rollback 證據見
[C3 部署紀錄](2026-08-22-booking-mvp-final-ui-synthetic-preview-deployment.md)及
[Booking MVP execution log](../implementation/phase-1-booking-mvp-execution-log.md)。
