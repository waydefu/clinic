// CAL-PILOT 按鈕動作。按鈕本身就是單一進行中的鎖：處理中再按不會重送；任何失敗
// 都放開同一顆按鈕並公告錯誤，不會讓控制項停在停用狀態。

/** 候選變更的審核。成功才重新整理畫面；expectedVersion 原樣送出。 */
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

/** 取消合成預約。成功才重新整理畫面；version 原樣送出。 */
export function createAppointmentCancel({
  request,
  announce,
  renderApplication,
  idempotency
}) {
  return async function cancelAppointment(appointment, button) {
    if (button.disabled) return;
    button.disabled = true;
    try {
      await request(
        `/calendar/synthetic-appointments/${appointment.appointmentId}/cancel`,
        {
          method: 'POST',
          body: JSON.stringify({
            idempotencyKey: idempotency('cancel'),
            expectedVersion: appointment.version
          })
        }
      );
      announce('合成預約已取消，Google 刪除已排入同步。');
      await renderApplication();
    } catch (error) {
      announce(error.message, 'error');
    } finally {
      button.disabled = false;
    }
  };
}

/**
 * 把候選交給工作臺建立預約。交接成功後 Calendar 介面會離開畫面，按鈕留在停用；
 * 交接失敗（例如工作階段需重新驗證）時清掉等待中的候選、放開按鈕並公告，
 * 不送出預約建議。
 */
export function createBookingHandoff({
  handoffToStaffWorkbench,
  announce,
  setAwaitingCandidate,
  target
}) {
  return async function handOffCandidate(candidate, button) {
    if (button.disabled) return;
    button.disabled = true;
    setAwaitingCandidate(candidate.candidateId);
    try {
      await handoffToStaffWorkbench();
    } catch (error) {
      setAwaitingCandidate(undefined);
      button.disabled = false;
      announce(error.message, 'error');
      return;
    }
    target.dispatchEvent(
      new CustomEvent('beauessence:calendar-booking-suggestion', {
        detail: {
          candidateId: candidate.candidateId,
          patientId: candidate.suggestedPatientId,
          patientName: candidate.suggestedPatientName,
          startsAt: candidate.startsAt
        }
      })
    );
  };
}
