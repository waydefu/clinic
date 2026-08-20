// Phase 1 workbench scope is fixed in source. This module intentionally has no
// imports and reads no URL, browser storage, window state, or remote config.
// Re-enabling a frozen capability therefore requires a reviewed source change
// together with its UI, route, mutation, tests, and authority evidence.

export const WORKBENCH_CAPABILITIES = Object.freeze({
  CASE_MANAGEMENT: false,
  PAYROLL_WORKLOAD: false
});

const DEFAULT_PANEL = 'overview';
const PANEL_CAPABILITIES = Object.freeze({
  'case-section': 'CASE_MANAGEMENT'
});
const TASK_CAPABILITIES = Object.freeze({
  pendingCaseAssignments: 'CASE_MANAGEMENT'
});

export function isWorkbenchCapabilityEnabled(capability) {
  return WORKBENCH_CAPABILITIES[capability] === true;
}

export function activeOperationalTasks(tasks) {
  return tasks.filter((task) => {
    const capability = TASK_CAPABILITIES[task.key];
    return (
      capability === undefined || isWorkbenchCapabilityEnabled(capability)
    );
  });
}

export function resolveScopedWorkbenchPanel(requestedId, availablePanelIds) {
  const capability = PANEL_CAPABILITIES[requestedId];
  if (
    capability !== undefined &&
    !isWorkbenchCapabilityEnabled(capability)
  ) {
    return { panelId: DEFAULT_PANEL, scopeRedirected: true };
  }
  return {
    panelId: availablePanelIds.includes(requestedId)
      ? requestedId
      : DEFAULT_PANEL,
    scopeRedirected: false
  };
}
