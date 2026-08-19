// Phase 1 Frozen Capability Boundary（BOOK-MVP-003-B）。
//
// 這不是產品設定頁：旗標是施工期的能力邊界，Phase 1 只提供「預設關閉」一種
// 狀態，且**沒有**任何執行期覆寫管道（不讀 query、localStorage、window 或
// 遠端 config）。重新啟用凍結能力必須是經審查的原始碼變更，而不是改資料。
// 輸出為具名常數並標記為凍結能力，讓架構守衛可靜態驗證其值。
const CASE_MANAGEMENT_ENABLED = false;
const PAYROLL_WORKLOAD_ENABLED = false;

export { CASE_MANAGEMENT_ENABLED, PAYROLL_WORKLOAD_ENABLED };