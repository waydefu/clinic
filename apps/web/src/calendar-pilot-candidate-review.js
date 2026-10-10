/**
 * 候選變更的審核動作。按鈕本身就是單一進行中的鎖：處理中再按不會重送；失敗時
 * 放開同一顆按鈕並公告錯誤，成功才重新整理畫面。expectedVersion 原樣送出。
 */
export function createCandidateReview({
  request,
  announce,
  renderApplication,
  idempotency
}) {
  return async function reviewCandidate(candidate, action, extra, button) {
    if (button.disabled) return;
    button.disabled = true;
    try {
      await request(`/calendar/candidates/${candidate.candidateId}/${action}`, {
        method: 'POST',
        body: JSON.stringify({
          idempotencyKey: idempotency(`candidate_${action}`),
          expectedVersion: candidate.expectedVersion,
          ...extra
        })
      });
      announce('候選變更已處理；可用時段已重新檢查。');
      await renderApplication();
    } catch (error) {
      announce(error.message, 'error');
    } finally {
      button.disabled = false;
    }
  };
}
