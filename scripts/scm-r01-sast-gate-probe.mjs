// **這個檔案是 `SCM-R01` 的驗收用具，不是產品程式碼，而且絕不合併進 `main`。**
//
// 它唯一的用途，是證明 required 的 `Verification evidence` 會因為 SAST 變紅而變紅。
// 觸發的是既有的 repository-owned 規則 `clinic.javascript.weak-cryptography`
// （定義在 `security/semgrep/clinic-javascript.yml`），所以不必為了製造失敗去改動
// 或弱化任何規則——「弱化掃描器來取得想要的結果」正是這道 gate 存在的理由。
//
// 這裡沒有真實資料、沒有憑證、沒有任何對外副作用：只是對一個常數字串取雜湊，
// 而且沒有任何地方匯入它。
import { createHash } from 'node:crypto';

export function scmR01SastGateProbe() {
  // 故意使用 SHA-1。clinic.javascript.weak-cryptography 應該在這一行變紅。
  return createHash('sha1').update('scm-r01-sast-gate-probe').digest('hex');
}
