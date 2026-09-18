import { PERMISSIONS } from './constants.js';
import { hydrateStaff } from './hydrate-staff.js';
import { requirePermission } from './permissions.js';
import {
  cloneSchedule,
  schedulesEqual,
  validateSchedule
} from './schedule-engine.js';

import { saveState } from './state-schema.js';

export function editDraft(state, path, body, snapshotState) {
  // Bootstrap identity is for local edits only, never persisted as a login.
  // Publication remains separately authorized by the API.
  requirePermission(hydrateStaff(state), PERMISSIONS.MANAGE_SCHEDULE);
  if (path === '/schedule/draft') {
    validateSchedule(body);
    state.scheduleDraft = cloneSchedule(body);
    state.scheduleMeta.draftDirty = !schedulesEqual(
      state.schedule,
      state.scheduleDraft
    );
  } else {
    state.scheduleDraft = cloneSchedule(state.schedule);
    state.scheduleMeta.draftDirty = false;
  }
  saveState(state);
  return hydrateStaff(snapshotState(state));
}
