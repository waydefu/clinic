# CP-02 C1 新預約驗收紀錄（2026-09-28）

**結果：** `CP-02 = RUNTIME_PROVEN`（BKG-06 經業主決定不適用；BKG-08 的「兩位候選」沿用
Emulator 證據）。依[核准文件](../plans/2026-09-28-cp-02-c1-runtime-approval.md)
執行，部署版本 `1e0b84f`，全程合成資料，預約開關已於收尾關閉。

操作方式：業主核准後指示自主執行；Claude Code session 以業主在場登入的身分操作。
員工工作臺的 Google＋TOTP 登入由業主本人完成，其餘由 session 操作。

## 驗收列

| 列 | 結果 | 摘要 |
| --- | --- | --- |
| BKG-01 | RUNTIME_PROVEN | 表單只有月、日；伺服器只收 `--MM-DD` |
| BKG-02 | RUNTIME_PROVEN | 國籍恰本國／外國兩個單選；舊「外籍人士」標籤不再出現；預約記下 `intakeNationality` |
| BKG-03 | RUNTIME_PROVEN | 表單無證件、健保卡、來源、介紹人欄；夾帶身分證或來源的請求 400，資料庫各集合筆數不變 |
| BKG-04 | RUNTIME_PROVEN | 新版網頁建立的預約在伺服器可讀回，工作臺清單讀自伺服器 |
| BKG-05 | RUNTIME_PROVEN | 電話＋月日查詢給回診 session；錯誤月日為通用查無，未建 session |
| BKG-06 | 不適用（業主決定） | `LEGACY-PATIENT-NO-ALIAS-2026-09-28`：伺服器沒有可合法建立對應的原值 |
| BKG-07 | RUNTIME_PROVEN | 舊索引全程筆數不變，未產生別名、未清除 |
| BKG-08 | RUNTIME_PROVEN（並發）／CI_PROVEN（兩位候選） | 同電話＋月日、不同姓名並發：一筆 201、一筆 409，拒絕訊息不透露他人；不直接寫入資料庫 |
| BKG-09 | RUNTIME_PROVEN | 完成看診＋需要回診（未排期）後才給 session；回診預約沿用同一病患 |
| BKG-10 | RUNTIME_PROVEN | 同冪等 key 重送回同一預約、無第二筆或第二個事件；回診自助改期、取消都釋出時段；員工取消 |
| BKG-11 | RUNTIME_PROVEN | 舊資料保留可讀，無批次改寫；網頁不保存表單草稿，無舊欄位重送路徑 |
| BKG-12 | RUNTIME_PROVEN | 三筆測試預約的稽核與 outbox 全部無國籍、生日、電話的鍵或值；日曆事件只含診所、掛號別、時間與預約編號，狀態變更原地更新同一事件 |

最小回歸：登出後重新開啟工作臺回到登入畫面，清單請求 401；收尾後預約相關路徑
全部 503。

## 偏差（照實記錄）

1. **部署範圍縮小。** 完整 plan 多出日曆同步排程的已知永久差異（無實際效果），不在核准
   範圍，因此只針對 API 服務套用。
2. **Hosting 一度指向舊版本。** 網頁發布時自動釘到的 API 版本是先前 E2 留下、仍開著預約
   開關的舊程式。當時只有 2 個不寫入的探測請求；改指到新版本並由日誌確認後才開始任何寫入。
3. **舊病患查詢改用結構證據。** 找不到先前合成病患的原始輸入，因此以舊索引筆數不變、新索引
   只含本次鍵證明，而非逐人查詢。
4. **逐步確認改為事後回報。** 業主於執行中指示自主執行。

## 額度

預約 3／4、日曆事件 3／4、請求約 40。只取消，未刪除任何預約、稽核或 outbox。

## 待決（不阻擋本包）

- C1 工作臺清單只顯示病患代碼，不顯示姓名或國籍（伺服器清單原本就只回最少欄位）。
  櫃台要在 C1 看到國籍，需要另開程式變更，待業主決定。
- 業主可自行再看一次表單（本次由 session 讀網頁結構代做）。

## 私有證據（WP-B6A）

證據組 `CP-02-2026-09-28` 由業主上傳到私有 Drive；repo 只留清單。清單產生時間
2026-09-28T11:50:18Z。

| 檔案 | 位元組 | SHA-256 |
| --- | ---: | --- |
| `cp02-apply.txt` | 1330 | `03bd53c4fa1dc6f2f49065751987d481024f3a4b958fe259af68e3b4fca4f1d7` |
| `cp02-build.log` | 1353 | `56a230fcea897a2f18e94c55ebc7b1105a1079cd533407f0b390e69a8bc26693` |
| `cp02-close.txt` | 2542 | `fd1dff482f7dca9aec37d6dac803e727344ee54ab45122b5cf7a9812ef69e92a` |
| `cp02-closed-probe.txt` | 412 | `2964b7d0007d0bd7031f9e1678bad94f2245e78e9af305ca1ad1aa753ec36374` |
| `CP-02-execution-ledger.md` | 4723 | `c27973cdf3f16b805633730404e4ea30b15357c1c9819aed81ea9364a52d27c4` |
| `cp02-hosting.txt` | 3172 | `ca3163ecfa52dcd7711527bc65f10e3e241356b5643f6dce7bc533c0c80e83c6` |
| `cp02-init.txt` | 905 | `631409c2b4f75f19a81f115e854deab2293b64046b7af2bca2f42a63aebbfecd` |
| `cp02-inject.json` | 570 | `c77b04a6e9b1b6bb0ea115d5d6a7bdf7c6877741c5ad24d5d66d03933ebe1c5c` |
| `cp02-plan.txt` | 4732 | `2475eb03d8c3722348f6b8464da628b6f634ae7004802393ef4e42eb32b788a0` |
| `cp02-private.tfvars` | 1851 | `4114577a597f99617aed16178af2d68afe8fe6d2c3d041f2761d204abde2b120` |
| `cp02-race.json` | 819 | `0d5e9e735539779cfba32a9f40c7f9481771b4840428647cdb7cc26b6c04dee5` |
| `cp02-retag.txt` | 2715 | `16fda0f6da852c4b484cd63fe14e212a71eebd65e9a7866495fb5173f45effdd` |
| `cp02-run.tfplan` | 33358 | `d83f7b192c1f0b62ad8bb09745ef5270705f0b8c5657497b73f52be7e326a62a` |
