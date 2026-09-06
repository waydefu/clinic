// CAL-PILOT 啟動時的登入狀態裁決（A-D2-03／T1-AUTH-01）。
//
// 規則：在 getRedirectResult 完成「或」第一次 onAuthStateChanged 觸發之前，
// 不得做登入／未登入的路由決定。Firebase 的已持久化使用者是非同步還原的：
// 若只讀當下的 auth.currentUser，帶著有效登入回來的訪客會先看到登入頁，
// 形成「登入後又退回登入頁」的外觀。
//
// 這個模組是純裁決邏輯：Firebase 物件由呼叫端注入，因此單元測試可以用
// fake 後端驗證時序，不需要真的 Firebase 或 DOM。

/**
 * 等待第一次 auth state 觸發（無論使用者或 null），然後只取那一次。
 * Firebase 訂閱後會立即以當前狀態觸發一次，所以不會空等。
 */
export function firstAuthStateChanged(subscribe) {
  return new Promise((resolve) => {
    let settled = false;
    // Firebase may fire synchronously inside subscribe(), before it returns
    // the unsubscribe handle: defer the unsubscribe call past this tick and
    // ignore every firing after the first.
    let unsubscribe = () => {};
    unsubscribe = subscribe((user) => {
      if (settled) return;
      settled = true;
      queueMicrotask(() => unsubscribe());
      resolve(user ?? null);
    });
  });
}

/**
 * backend: {
 *   redirectResult: { user } | null,
 *   onAuthStateChanged(callback): () => void,
 *   currentUser(): unknown
 * }
 * redirect 已帶使用者直接採用；否則等第一次 state 觸發後再讀 currentUser。
 * 在這兩者完成前，呼叫端不得做登入／未登入的路由決定。
 */
export async function resolveBootUser(backend) {
  if (
    backend.redirectResult?.user !== undefined &&
    backend.redirectResult?.user !== null
  )
    return backend.redirectResult.user;
  await firstAuthStateChanged(backend.onAuthStateChanged);
  return backend.currentUser() ?? null;
}
