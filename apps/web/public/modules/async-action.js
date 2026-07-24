import { ApiClientError, asApiClientError } from './api-client.js';

/**
 * Runs one UI action at a time, exposing both visual and accessibility state.
 * Retry is returned only for errors explicitly marked retryable by the client.
 *
 * 這裡**刻意不在按鈕上設 `aria-busy`**。先前設過，但那是錯的屬性：MDN 說明
 * `aria-busy` 是給 live region、複合元件與 feed 用的——它的作用是「這一塊正在
 * 改，先別唸」，因此會**把該元素的子內容對輔助技術隱藏**。設在按鈕上等於在忙碌
 * 期間把按鈕自己的名稱藏起來，而且螢幕閱讀器不會立即播報，只有重新聚焦時才會
 * 帶到「busy」。
 *
 * 忙碌狀態改由兩件事表達，兩件都有效：按鈕文字換成 pendingLabel（視覺），以及
 * 呼叫端寫進 `role="status" aria-live="polite"` 的狀態列（輔助技術）。那個 live
 * region 才是公告變化的正確機制。
 *
 * `disabled`（而不是 `aria-disabled`）是有意識的取捨。`aria-disabled` 能保住焦點，
 * 但按鈕仍可點擊，重複送出得靠程式擋（下面的 dataset.busy 確實有擋，只是會回一個
 * 使用者看得到的錯誤）。本專案的等待時間很短——都是本機動作——業界做法也分歧
 * （Atlassian 用 aria-disabled、Material UI 用 disabled），因此維持較單純的
 * `disabled`，並把公告責任放在 live region 上。
 */
export async function runPendingAction({
  control,
  pendingLabel = '處理中…',
  action
}) {
  if (control?.dataset.busy === 'true') {
    return {
      ok: false,
      error: new ApiClientError('這項操作仍在處理中。', {
        code: 'REQUEST_ALREADY_PENDING'
      })
    };
  }

  const originalLabel = control?.textContent;
  if (control !== undefined) {
    control.disabled = true;
    control.dataset.busy = 'true';
    control.textContent = pendingLabel;
  }

  try {
    return { ok: true, value: await action() };
  } catch (error) {
    const clientError = asApiClientError(error);
    return {
      ok: false,
      error: clientError,
      ...(clientError.retryable
        ? {
            retry: () => runPendingAction({ control, pendingLabel, action })
          }
        : {})
    };
  } finally {
    if (control !== undefined) {
      control.disabled = false;
      delete control.dataset.busy;
      control.textContent = originalLabel;
    }
  }
}
