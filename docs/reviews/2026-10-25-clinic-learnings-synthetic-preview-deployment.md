# 官網改進候選（#302）synthetic-review 預覽部署 — 2026-10-25

## 現行狀態

**目前頻道上是 `a0409c2`（見文末〈追加部署：`a0409c2`〉）。下面的表與實測是同日稍早
`36f182c` 的部署，保留不改；`b681e59` 的追加部署也保留在文末。**

**DEPLOYED AND SMOKED — PR #302 head `36f182c` 靜態預覽；四項實測通過。**
本次只更新 Hosting preview channel，沒有動 live、CAL-PILOT、Cloud Run 或任何後端。
這是 PR 候選版本，不是 main；它取代同頻道上午部署的 main `aee87f5`
（見 [上一筆紀錄](2026-10-25-clinic-booking-synthetic-preview-deployment.md)）。

| 欄位 | 結果 |
| --- | --- |
| 部署版本 | [#302](https://github.com/waydefu/clinic/pull/302) head `36f182c`（每頁獨立標題、玻璃卡片、卡片到內頁轉場、官方社群配色） |
| 該版本 CI | `verify` on `36f182c` — 12/12 checks `success`，含 `Verification evidence` |
| Firebase project | `beauessence-clinic-staging` |
| Hosting channel | `synthetic-review`（網址不變） |
| 期限 | `30d`，到期 `2026-11-24T07:35:55Z`（2026-11-24 15:35 Asia/Taipei） |
| Release／version | `1792913812100000`／`f8d113d20b569196`，131 files |
| Release time | `2026-10-25T07:36:52Z`（15:36 Asia/Taipei） |
| live channel | 未變：仍是 2026-08-22 的 release `1787409828279000` |
| 執行者／核准者 | Claude Code（本機 session）執行；負責人（工程師）於對話中核准 |

## 核准

負責人先核准「#302 的 CI 全綠後，把 bfc2b08 發到 beauessence-clinic-staging 的
synthetic-review 預覽頻道（30 天，只發 preview、不動 live），並實測 /clinic、
/clinic/doctors、/clinic/不存在 與卡片轉場」。`bfc2b08` 的 CI 有 3 項失敗，修正後的
`36f182c` 全綠；因核准要綁確切版本，再問一次後，負責人選擇「核准發 36f182c」。
此核准只涵蓋這一次部署，不可重用。

## 部署方式

- 乾淨的 detached worktree `F:\診所專案\tmp\preview-36f182c`，HEAD 為 `36f182c`；
  `pnpm install --frozen-lockfile` 後由 `hosting.predeploy` 重新建置。
- 與上一筆相同，`firebase.json` 的 CAL-PILOT `/v1/**` Cloud Run rewrite（`pinTag: true`）
  超出靜態預覽範圍，所以用一次性設定檔：內容與該版本 `firebase.json` 的 `hosting`
  相同，只移除 `/v1/**`。`clinic-route` 的 7 條精確 rewrite 保留。該檔沒有提交。

## 實測

| 項目 | 結果 |
| --- | --- |
| `/clinic` | PASS：HTTP 200，無轉址；原始 HTML 標題「【測試用】鼻功能與睡眠呼吸照護｜一森渼診所」 |
| `/clinic/doctors` | PASS：HTTP 200，無 301；JS 執行前 HTML 已是「【測試用】醫師團隊｜一森渼診所」並帶 og:title |
| `/clinic/doctors/yan-cheng-an`、`/clinic/nasal/septoplasty` | PASS：HTTP 200，各自的標題與 og:title；CSP、`X-Robots-Tag: noindex`、`X-Frame-Options: DENY` 都在 |
| `/clinic/不存在`、`/clinic/nasal/nope` | PASS：由 `/clinic/**` 後備回 `clinic.html`，畫面顯示「找不到這個診所頁面」，標題「【測試用】找不到頁面｜一森渼診所」（既有的軟 404 行為不變） |
| `/v1/health` | PASS：HTTP 404，預覽沒有 backend rewrite |
| 卡片到內頁轉場 | PASS：首頁 6 張卡片圖各有唯一轉場名稱；點「鼻中隔手術」時舊頁 `pageswap` 事件帶有 view transition，舊頁卡片圖與新頁主圖同名 `clinic-service-septoplasty` |
| 執行 JS 後的 meta | PASS：og:title、description 各只有 1 個，沒有重複 |
| 社群配色 | PASS：LINE `rgb(6,199,85)`、Facebook／Messenger `rgb(8,102,255)`、Instagram 漸層（底色 `rgb(221,48,193)`） |
| 玻璃卡片 | PASS：背景 80% 白、`backdrop-filter: blur(12px) saturate(1.2)` |
| 卡片圖片淡入 | PASS：載入完成後 class 變成 `is-loaded`，並播放 `clinic-image-in` |

**限制：** 內建瀏覽器面板裡，`loading="lazy"` 的圖片（包含本次沒改的環境照與頁尾 logo）
一律沒有開始載入，直接抓檔案回 200。這是測試環境的問題，所以截圖前把圖片改成立即載入。
實體手機與一般瀏覽器上的延遲載入是 `External manual verification required`。

## 沒有做的事

- 沒有發布 live，也沒有動 CAL-PILOT、Cloud Run、Firestore、Functions、Storage、Calendar 或任何真實資料。
- 本機沒有跑 `pnpm verify`；以同一 SHA 的 GitHub CI 結果為準（依執行電腦限制）。
- 這次沒有跑 `verify:preview`；上一筆紀錄已記下它與現行標頭設定不一致的既有問題。

## 下架

到期自動失效；提前下架：`firebase hosting:channel:delete synthetic-review --project beauessence-clinic-staging --force`。

## 追加部署：`b681e59`

同日負責人看了預覽上的底線連結後要求「盡量不要文字連結，不太美觀」，#302 加上
`b681e59`（獨立連結改成淡色按鈕）。負責人核准：「#302 的 CI 全綠後，把 b681e59 發到
beauessence-clinic-staging 的 synthetic-review 預覽頻道（30 天，只發 preview、不動
live），並實測官網與預約頁的連結」。此核准只涵蓋這一次部署。

| 欄位 | 結果 |
| --- | --- |
| 部署版本 | #302 head `b681e59` |
| 該版本 CI | `verify` run `40174466891` on `b681e59` — 12/12 checks `success`，含 `Verification evidence` |
| 期限 | `30d`，到期 `2026-11-24T07:58:14Z`（2026-11-24 15:58 Asia/Taipei） |
| Release／version | `1792915140973000`／`2d7fbc78bd0bef72` |
| Release time | `2026-10-25T07:59:00Z`（15:59 Asia/Taipei） |
| live channel | 未變：仍是 2026-08-22 的 release `1787409828279000` |
| 部署方式 | 同上：同一個 detached worktree 切到 `b681e59`（lockfile 與 `firebase.json` 與 `36f182c` 相同），一次性設定檔只移除 `/v1/**` |

| 實測 | 結果 |
| --- | --- |
| 官網首屏資訊卡的電話、地址 | PASS：無底線、淡底色（alpha 0.07）、1px 細框，高 44px（地址折行 66px） |
| 官網頁尾 7 個連結（電話、預約、社群、隱私權說明） | PASS：同上，高 44–54px |
| 官網文字型行動連結（醫師介紹等） | PASS：同上，高 44px |
| 句子裡的連結 | 照舊保留底線（地圖出處「地圖資料 © OpenStreetMap」） |
| 預約頁「回官網」與頁尾 3 個連結 | PASS：無底線、淡底色、1px 細框、膠囊圓角，高 44px |
| 預約頁深色主題 | 本機預覽（同一來源）實測：按鈕顏色隨主題變成淡綠；預覽頻道上沒有另外切主題 |

## 追加部署：`a0409c2`

同日負責人指示「素材不要用真實診所圖」並選「只換鼾聲區」，另要求「預約頁社群圖補上顏色」，
#302 加上 `a0409c2`。負責人核准：「#302 的 CI 全綠後，把 a0409c2 發到
beauessence-clinic-staging 的 synthetic-review 預覽頻道（30 天，只發 preview、不動
live），並實測鼾聲區背景、門診卡電話與預約頁社群圖示」。此核准只涵蓋這一次部署。

| 欄位 | 結果 |
| --- | --- |
| 部署版本 | #302 head `a0409c2` |
| 該版本 CI | `verify` run `40176306531` on `a0409c2` — 12/12 checks `success`，含 `Verification evidence` |
| 期限 | `30d`，到期 `2026-11-24T08:26:30Z`（2026-11-24 16:26 Asia/Taipei） |
| Release／version | `1792916833307000`／`cab4858634568296` |
| Release time | `2026-10-25T08:27:13Z`（16:27 Asia/Taipei） |
| live channel | 未變：仍是 2026-08-22 的 release `1787409828279000` |
| 部署方式 | 同上：detached worktree 切到 `a0409c2`（lockfile 與 `firebase.json` 與 `b681e59` 相同），一次性設定檔只移除 `/v1/**` |

| 實測 | 結果 |
| --- | --- |
| 鼾聲區背景 | PASS：`soft-green-bg.webp` HTTP 200，`background-position: 50% 0%`，底色 `rgb(196,216,195)` 作載入前後備；畫面看得到左上葉影 |
| 門診時間與交通卡的兩支電話 | PASS：無底線、淡底色（alpha 0.07）、1px 細框，高 44px，`tel:` 連結正確 |
| 預約頁「其他聯絡方式」社群圖示（電腦版圓形） | PASS：LINE `rgb(6,199,85)`、Instagram 漸層（底色 `rgb(221,48,193)`）、Messenger／Facebook `rgb(8,102,255)`，圖示皆白色 |
| 預約頁「需要其他協助？」電話按鈕 | PASS：無底線 |
| 手機版帶文字的社群按鈕 | NOT_RUN：只測電腦版（`data-contact-layout="compact"`）；手機版同一組 CSS 由 CI 的 e2e-mobile 覆蓋版面，顏色未在實機確認 |
