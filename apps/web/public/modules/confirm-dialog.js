// 自製確認彈窗，取代瀏覽器原生確認框：<dialog>.showModal() 內建
// 焦點陷阱、Esc 關閉與 inert 背景（WAI-ARIA APG dialog pattern），
// 樣式與主題跟著頁面走。回傳 Promise<boolean>。
let dialog;
let messageNode;
let confirmButton;
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

  const actions = document.createElement('div');
  actions.className = 'confirm-dialog-actions';

  // 取消排在前面：showModal 預設聚焦第一個可聚焦元素，
  // 讓「安全的選項」拿到初始焦點，誤按 Enter 不會執行破壞性動作。
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'button button-secondary';
  cancel.textContent = '取消';
  cancel.addEventListener('click', () => {
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

  actions.append(cancel, confirmButton);
  dialog.append(title, messageNode, actions);
  document.body.append(dialog);
}

export function confirmDialog(message, { danger = false, confirmLabel } = {}) {
  ensureDialog();
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
  });
}
