// 保留預約頁既有入口；彈窗實作只在明確閱讀時載入。
export async function openPolicyDialog(options) {
  const policy = await import('./policy-dialog-content.js');
  return policy.openPolicyDialog(options);
}
