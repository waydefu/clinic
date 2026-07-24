// 自製確認彈窗，取代瀏覽器原生確認框：<dialog>.showModal() 內建
// 焦點陷阱、Esc 關閉與 inert 背景（WAI-ARIA APG dialog pattern），
// 樣式與主題跟著頁面走。回傳 Promise<boolean>。
let dialog;
let messageNode;
let confirmButton;
let cancelButton;
let reasonField;
let reasonSelect;
// 目前這次詢問的 resolve。按鈕點擊當下就 settle，不等 close 事件——
// close 事件在背景分頁可能被延後派發；Esc 關閉仍由 close 事件補接。
let settle;

function settleOnce(value) {
  const resolve = settle;
  settle = undefined;
  resolve?.(value);
}

function ensureDialog() {
  if (dialog !== undefined) return;
  dialog = document.createElement('dialog');
  dialog.className = 'confirm-dialog';
  dialog.setAttribute('aria-labelledby', 'confirm-dialog-title');

  const title = document.createElement('h2');
  title.className = 'confirm-dialog-title';
  title.id = 'confirm-dialog-title';
  title.textContent = '操作確認';

  messageNode = document.createElement('p');
  messageNode.className = 'confirm-dialog-message';

  // 需要理由的動作（目前只有刪除）在此挑選。理由是封閉清單，選項由呼叫端
  // 給——彈窗本身不認識任何領域詞彙。不需要理由時整組隱藏。
  reasonField = document.createElement('label');
  reasonField.className = 'confirm-dialog-reason';
  reasonSelect = document.createElement('select');
  reasonField.append(reasonSelect);
  reasonField.hidden = true;

  const actions = document.createElement('div');
  actions.className = 'confirm-dialog-actions';

  // 取消排在前面並在開啟後明確取得焦點：讓「安全的選項」拿到初始焦點，
  // 誤按 Enter 不會執行破壞性動作。理由欄位排在按鈕之前，若不明確指定，
  // showModal 會把焦點給那個 <select>。
  cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.className = 'button button-secondary';
  cancelButton.textContent = '取消';
  cancelButton.addEventListener('click', () => {
    dialog.close('cancel');
    settleOnce(false);
  });

  confirmButton = document.createElement('button');
  confirmButton.type = 'button';
  confirmButton.addEventListener('click', () => {
    dialog.close('confirm');
    settleOnce(true);
  });

  // Esc 或其他途徑關閉時由 close 事件收尾（按鈕路徑已先 settle，此處為 no-op）。
  dialog.addEventListener('close', () =>
    settleOnce(dialog.returnValue === 'confirm')
  );

  actions.append(cancelButton, confirmButton);
  dialog.append(title, messageNode, reasonField, actions);
  document.body.append(dialog);
}

function open(message, { danger, confirmLabel }) {
  messageNode.textContent = message;
  confirmButton.textContent = confirmLabel ?? (danger ? '確定執行' : '確定');
  confirmButton.className = danger
    ? 'button button-danger'
    : 'button button-primary';
  return new Promise((resolve) => {
    // 若前一次詢問尚未收尾（理論上不會發生），視為取消收掉。
    settleOnce(false);
    settle = resolve;
    dialog.returnValue = '';
    dialog.showModal();
    cancelButton.focus();
  });
}

export function confirmDialog(message, { danger = false, confirmLabel } = {}) {
  ensureDialog();
  reasonField.hidden = true;
  return open(message, { danger, confirmLabel });
}

/**
 * 需要記錄理由的確認。回傳所選理由代碼，取消則回傳 undefined。
 *
 * 為什麼理由必須在確認的同一步收集：它會寫進比資源本身活得更久的稽核事件。
 * 事後補問等於允許沒有理由的刪除先發生。
 */
export function confirmWithReason(
  message,
  { reasons, label = '理由', danger = true, confirmLabel } = {}
) {
  ensureDialog();
  reasonField.hidden = false;
  // <label> 的文字節點在 <select> 之前，重複開啟時只換文字、不重建節點。
  if (reasonField.firstChild === reasonSelect)
    reasonField.prepend(document.createTextNode(label));
  else reasonField.firstChild.textContent = label;
  reasonSelect.replaceChildren(
    ...reasons.map((reason) => {
      const option = document.createElement('option');
      option.value = reason.id;
      option.textContent = reason.label;
      return option;
    })
  );
  return open(message, { danger, confirmLabel }).then((confirmed) =>
    confirmed ? reasonSelect.value : undefined
  );
}
