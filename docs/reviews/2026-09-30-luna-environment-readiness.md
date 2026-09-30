# Luna 環境修復交接（2026-09-30）

## 一句話與交付版本

已修正使用者環境的 Node 版本、pnpm 隱性重裝與本專案 CI 的依賴／日期 fixture 障礙；
下載主機與官方模型文件仍被網路政策封鎖，環境尚未全數就緒。

- 工作範圍：Luna 後續工作包的環境前置；對應執行書 §10.4。
- 原始碼基準：`origin/main` `73c7afdfc38dd509904172eb6bd1159bc250f858`。
- 分支：`agent/luna-environment-readiness`，獨立於 CP-05；PR 建立後由 GitHub 查詢。
- 本記錄不填自己的 commit hash；用
  `git log -- docs/reviews/2026-09-30-luna-environment-readiness.md` 查實際交付版本。
- Merge commit：`NOT_RUN`，尚未合併。
- CP-05 PR：[#208](https://github.com/waydefu/clinic/pull/208)，日期斷言修正
  `b1c6c3922b541dc84fce0841758fefcfea0a7004` 已推送。

## 稽核範圍

查證時間：2026-09-30 12:30 UTC，Ubuntu 雲端工作目錄；本次分支未提交 diff。
核對 Node／Corepack／pnpm／Java、依賴安裝、proxy 允許清單、CLI／cache、
全依賴與出貨依賴審計、CP-05 exact-SHA CI、日期相依 E2E 的失敗紀錄與程式路徑。
沒有查證雲端部署、帳號權限、真實資料、production 或業主 arm64 筆電的執行狀態。

## 根因與修復清單

| ID | 分類與證據 | 本次處理／剩餘問題 |
| --- | --- | --- |
| ENV-1 | CONFIRMED：預設 Node 24.19.0 不滿足 >=24.20.0 <25 | 使用者目錄安裝 24.20.0；新 login shell 的 `node` 已是正確版本 |
| ENV-2 | CONFIRMED：pnpm 11 global virtual store 預設與既有 project-local 安裝不同；run 前會安裝，非 TTY purge 隨之失敗 | workspace 明確關閉 global virtual store，verifyDepsBeforeRun 設 error；明確 frozen install 完成，普通 exec 可用 |
| ENV-3 | CONFIRMED：代理拒絕 `storage.googleapis.com`／官方 OpenAI 主機；CONNECT 回應 403 | 沒有設定修改工具；環境擁有者需套用 Network allowlist；不繞過代理 |
| ENV-4 | CONFIRMED：Firestore／Playwright cache 尚未備妥 | Firebase 15.25.0 的 Firestore 1.22.0 metadata 與 browser dry-run 已核對；等待 ENV-3 後下載 |
| ENV-5 | CONFIRMED：git push 可用，GitHub connector 可讀／寫 PR，`gh` API／auth 管道不可用 | 使用 native git＋connector；保留注入憑證；不自行登入 |
| ENV-6 | CONFIRMED：`gcloud`／`terraform` 尚未安裝 | 需要這兩者的後續包仍未就緒；手冊列出工具與下載主機前置，不執行雲端登入／變更 |
| GATE-1 | CONFIRMED：prod audit 2 high／4 moderate；修補 prod 後 all audit 仍有 6 high | 六項 selector 同 major 更新：brace-expansion 1.1.20／2.1.7／5.0.11、fast-uri 3.1.8／4.1.5、undici 8.10.2；沒有 audit ignore／門檻變更 |
| GATE-2 | CONFIRMED：CI run 769 patient-portal 97 pass／1 fail，>=2 月份 tab 實際為 1；單月視窗在月末可只有下個月時段 | 既有 layout fixture 固定為臺北 2030-10-15 09:00，再清合成狀態重載；保留所有原斷言，尚無本次執行證據 |
| CP05-1 | CONFIRMED：2030-10-20 +30 days 是 2030-11-19，原 expected 是 11-20 | CP-05 分支兩項日期斷言已修正；run 769 Firestore 24 files／186 tests 全過 |
| MODEL-1 | UNAVAILABLE：官方模型目錄 CONNECT 403 | 未完成 gpt-6-luna 官網評估；沒有派子代理、沒有宣稱價格／benchmark |

分支切換後第一次 `check:sync` 因舊 domain dist 失敗；重新從當前分支 build 後
恢復。這是生成產物來自前一分支的環境陷阱，不是 vendor 原始碼缺陷；
本次不提交 vendor 變更。

## 執行證據

以下本機結果綁定上述基準＋本分支 diff；不得當作尚未出現的 exact-SHA CI 綠燈。
證據層級：原始碼改動仍為 `CODE-ONLY`；工具準備／靜態檢查與 audit 分別列出。

| 項目 | 結果 | 實際證據／限制 |
| --- | --- | --- |
| Node／Corepack／pnpm | PASS | 24.20.0／0.34.6／11.9.0；`corepack pnpm exec node --version` 無隱性 install |
| Explicit frozen install | PASS | 7 workspace projects；lockfile 905 entries；依賴準備另行執行 |
| Java／Firebase CLI | PASS | Java 21.0.12.1；Firebase 15.25.0 |
| audit:prod | PASS | 275 dependencies；0 vulnerabilities |
| audit:all | PASS | 905 dependencies；0 critical／0 high／9 moderate／0 low；既定門檻為 high，moderate 未消失 |
| check:types | PASS | 5 TypeScript packages；web 107 files／83 content-hashed；同步 40 domain files |
| Changed-file ESLint | PASS | patient-booking.spec.ts，0 findings |
| Docs／format／sync／tracked secrets | PASS | 262 docs；2 matched format files；40 domain files；1155 tracked files（包含新增 docs） |
| 本機 unit／Firestore／E2E | NOT_RUN | 本次沒有使用者要求執行實作測試；emulator／browser 下載亦受阻 |
| 本分支 full verify／CI | NOT_RUN | 不將其他 commit 的 CI 計入本分支；PR 後讀取自動 CI |
| CP-05 Firestore（獨立 SHA） | PASS | [run 769](https://github.com/waydefu/clinic/actions/runs/36713386746)，24 files／186 tests |
| CP-05 required evidence（獨立 SHA） | FAIL | run 769 dependency audit 與 patient-portal 仍失敗；不是 CP-05 可合併的綠燈 |
| 雲端／production／runtime | NOT_RUN | 本次只有開發環境授權 |

## Artifact 與環境變更

主要可交接 artifact 是版控內的 [操作手冊](../runbooks/luna-development-environment.md)、
workspace／lockfile 與既有 E2E fixture。暫存 audit JSON 可供本環境查閱；
換環境後不能依賴暫存檔，這份紀錄已保留結果與 SHA-256。

| Artifact | SHA-256 |
| --- | --- |
| `/tmp/luna-audit-prod-fixed.json` | `e09850a57313aa3f90d947b360581f45a48bac4aadece672429f118f174137b0` |
| `/tmp/luna-audit-all-fixed.json` | `57d73a4d4b7efe968368281534bf0bb228d69ac64cfa1947320b7cb5a54149a5` |
| 使用者 Node 24.20.0 binary | `89af8424dd53e560b1933f87ba650d8bf57c83ca5a04600eefb31f416aabbae7` |

Node 實際在 `~/.local/share/clinic-tools/node-v24.20.0/bin/node`，
`~/.local/bin/node` 為 symlink；既有 `.profile` 已加 PATH，未修改 host runtime。
這項使用者環境安裝不在 git 中；換機請照手冊重新準備。

## 未處理事項與下一步

1. **環境擁有者／ENV-3、ENV-4、MODEL-1：** 套用手冊 Network allowlist，
   下載 pinned emulator／browser 並核對；官方模型資料可讀後再評估 Luna 分工。
2. **主代理／GATE-2：** 讀取環境 PR 自動 CI，確認 fixture 與依賴修補在同一 SHA 的結果；
   如果失敗，依真實 logs 繼續處理。保持 gate／安全邊界。
3. **審查者與業主：** 審查／合併獨立環境 PR；主代理再從 main 更新 CP-05 #208，
   確認其 exact-SHA required evidence。此記錄不代表業主已合併。
4. **Luna 後續包執行者：** 需要 gcloud／Terraform 時先處理 ENV-6；
   CP-05 source 合併後才依 L2／CP-06 工作包開新分支。雲端變更另依工作包授權。

本次業主要求修復環境，並以節省額度為指標允許有條件的 Luna 子代理分工；
沒有新增產品政策、部署／production／真實資料授權。Stage 位置與 D-series 決策不變。
尚無官方能力／定價評估或可量測的額度節省數字；9 moderate 開發依賴風險仍須保留於交接。
