# P1-09 Stage F 唯讀重建（2026-09-28）

**一句話：** 9/25～9/26 的 Stage F 原始產物已遺失（`HISTORICAL_ARTIFACTS_LOST`）。依業主決定 [`WP-B6B-2026-09-28`](../product/phase-1-decision-register.md#wp-b6b-p1-09-stage-f-readback-evidence--2026-09-28)，改用唯讀讀回的 C1 現存紀錄建立新證據組。以 `main` `f734bb5` 的 Stage F evaluator 評估，結果為 `ok=true`、11 個案例 PASS、結束代碼 0。**Gate 17：PASS（重建）。** `P1_09 = NOT_CLOSED`。

這份紀錄是帶日期的證據，不核准任何事。逐案的依據、綁定的 SHA 與限制都在私有證據組裡，依 `WP-B6A-2026-09-27` 由業主保管；repository 只保留下方清單。

## 私有證據清單

證據組 `P1-09-STAGE-F-READBACK-2026-09-28`，依 `WP-B6A-2026-09-27` 交由業主上傳，本紀錄提交時尚未上傳。這裡只記錄檔名、大小、SHA-256 與 UTC 時間。

| 檔案 | 大小（bytes） | SHA-256 | UTC |
| --- | --- | --- | --- |
| `browser/storage-after-reload-2026-09-27T170124Z.json` | 757 | `64522daeb07d3558f44a85249bc06324c256fa05237ef33555c38e50129575ea` | 2026-09-27T17:24:32Z |
| `firestore/appointments.json` | 4148 | `27afb5dae593a5f7d80a9371d370b9255168c2195c3d052bd02efbc888a00aef` | 2026-09-27T16:54:40Z |
| `firestore/audit_events.json` | 15047 | `836013da1b7792134096e81c32a91618e4c213d4c2b91d0a7eb6ed28ded28b38` | 2026-09-27T16:54:40Z |
| `firestore/authorization_denial_events.json` | 209658 | `585caf4e9cb73a1424ef090f7c2b7221b2840fdce6e43f6592e8db6588d67b83` | 2026-09-27T16:54:41Z |
| `firestore/calendar_pilot_appointments.json` | 607 | `d819bde58b65cc8841afcaf15907ab84d1f1359f1eb4c0a2055b5085dbed7920` | 2026-09-27T16:54:43Z |
| `firestore/calendar_pilot_audit_events.json` | 13485 | `f79548294a9332e657aafe8e58477127ce4eac311f3e3478012d2fbe63268725` | 2026-09-27T16:54:42Z |
| `firestore/calendar_pilot_candidates.json` | 28075 | `bb4bf2fab3bbc7eca81b3fbde5ae2577ee2dd1fe5db8ab0b4de4a6611421a0e1` | 2026-09-27T16:54:42Z |
| `firestore/calendar_pilot_idempotency.json` | 3569 | `1a73432413aee22c65b8b691b6743d23869d370a190f375d8859685ca1247355` | 2026-09-27T16:54:43Z |
| `firestore/calendar_pilot_mirrors.json` | 20004 | `089bdee307962e9ae0a5427beef4b2b4e0c169d7e5124003dee94a1465874fd2` | 2026-09-27T16:54:43Z |
| `firestore/calendar_pilot_outbox.json` | 1959 | `bae8a4b2b8845cb4c8d37efc86c6ec5cc2e1d99fe44848b75af91fa860b1de3a` | 2026-09-27T16:54:42Z |
| `firestore/follow_ups.json` | 931 | `fefb8c91619f3c175a6c26a5ee4d2e69c319edd3a83b322de6cf2988224073c5` | 2026-09-27T16:54:41Z |
| `firestore/idempotency_keys.json` | 9464 | `e3b94398fab11a12e03ec002fa8204422d0a9a9870c1186c7904029eef1749e1` | 2026-09-27T16:54:42Z |
| `firestore/outbox_jobs.json` | 17185 | `c8067897ac5daa1177cbb1c6eb56cc3dc42710e7a672b79ff96254e951dc6691` | 2026-09-27T16:54:41Z |
| `firestore/patient_follow_up_states.json` | 944 | `b8008259ef2c0a3b7bb5d535f048198aa159d5166cbc74ae3e19c77f19b5bf7d` | 2026-09-27T16:54:41Z |
| `firestore/patient_lookup_index.json` | 1235 | `63255c91a185bdd43205c15ff6c9f0425b8bb2dcfe9b975fe091240da3313657` | 2026-09-27T16:54:42Z |
| `firestore/patients.json` | 1505 | `a497e3224b8006beb8c322f5e5df31e4df7c16e348de5d5134f3c21bfa18812b` | 2026-09-27T16:54:42Z |
| `firestore/rate_limit_state.json` | 78535 | `851fb9c64836df0e24bc158fa3ce77917ee167386959dab37cec3fd1337f919b` | 2026-09-27T16:54:42Z |
| `firestore/return_sessions.json` | 3297 | `5a9ce0ffa19cb5cc2d27dd82250763513f65e624a1e0643776db5736ebfbdd9f` | 2026-09-27T16:54:42Z |
| `logging/cloud-run-app-2026-09-25_26.json` | 2992174 | `816769704153b60db16ffa910bc18e640cd979779be1948ca7f6d86f471927a2` | 2026-09-27T16:56:52Z |
| `logging/cloud-run-requests-2026-09-25_26.json` | 4294769 | `f98d00be17e2652b09c09413b46d62679b051ecfd4c5451c509afc076645e50b` | 2026-09-27T16:55:57Z |
| `monitoring/alert-policies.json` | 16418 | `7e852a22851c59ade58d3f7cba43397b9f1f967aa5bf6cf3b1ba282dc7834d33` | 2026-09-27T16:57:31Z |
| `monitoring/auth-failure-metric-2026-09-26.json` | 3453 | `81d8179dd9b301994f5b788eb0ef148d3f920bbae261f9494092e4e962197240` | 2026-09-27T16:57:33Z |
| `monitoring/notification-channels-redacted.json` | 536 | `f771b06e23c0082cc70c01e2ba020c33158654db4818b10279c4a9f3091359e0` | 2026-09-27T16:57:31Z |
| `owner/alert-email-recovered-2026-09-26T0825Z.png` | 15185 | `6d1f836bbf0a37cc61bd430f8cddcedeb5c870253c7f0a1ff3ed71ff4140d47a` | 2026-09-27T17:24:32Z |
| `record-full.md` | 5207 | `2e0fcfc02fab262b9553e549083fc9b9a809a5c0123ebc5bfe673ee863271d34` | 2026-09-27T17:34:20Z |
| `stage-f-evaluator-output.json` | 1963 | `8156022154ddfb1e2cb98e674ce58a74f44101b2c05159da1bbb3194f4187738` | 2026-09-27T17:26:03Z |
| `stage-f-receipts.json` | 10119 | `3e6101e839f1abe023722e90d2e2b30408c22affb386ed234db145d070830765` | 2026-09-27T17:26:03Z |

## 關帳狀態

`P1_09 = NOT_CLOSED`。還缺 E2（需要合成員工帳號）、F-06 各證據組的上傳，以及 H 關帳 PR。
