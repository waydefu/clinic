export const STAGE_F_ACCEPTANCE_CASES = Object.freeze([
  {
    id: 'general_booking_page_create_reload',
    group: 'general_booking',
    steps: [
      'Booking Page',
      'choose service/date/time',
      'intake',
      'create',
      'reload',
      'still exists'
    ]
  },
  {
    id: 'workbench_arrived_completed',
    group: 'workbench',
    steps: ['staff login', 'booking visible', 'arrived', 'completed']
  },
  {
    id: 'calendar_outbound_same_event',
    group: 'calendar_outbound',
    steps: [
      'create → Calendar event',
      'arrived → same event patch',
      'completed → same event patch'
    ]
  },
  {
    id: 'return_lookup_existing',
    group: 'return_patient',
    steps: ['phone + DOB', 'existing']
  },
  {
    id: 'return_required_unscheduled_follow_up',
    group: 'return_patient',
    steps: ['required + unscheduled', 'schedule', 'follow_up create']
  },
  {
    id: 'candidate_review_synthetic_manual_change',
    group: 'candidate_review',
    steps: ['synthetic Calendar manual change', 'pending', 'approve/reject']
  },
  {
    id: 'security_rate_limit',
    group: 'security',
    steps: ['rate limit']
  },
  {
    id: 'security_anti_enumeration',
    group: 'security',
    steps: ['anti-enumeration']
  },
  {
    id: 'security_denial_audit',
    group: 'security',
    steps: ['denial audit']
  },
  {
    id: 'security_one_real_human_alert',
    group: 'security',
    steps: ['one real human alert']
  },
  {
    id: 'persistence_reload_server_readback',
    group: 'persistence',
    steps: ['reload', 'server readback', 'no localStorage SoT']
  }
]);

export const STAGE_F_BLOCKERS = Object.freeze([
  'cloud exact-SHA authority',
  'isolated Cloud Run/API deployment',
  'Hosting rewrite',
  'monitoring apply',
  'human alert delivery proof',
  'deployed Booking Page E2E',
  'Workbench E2E',
  'Calendar synthetic E2E',
  'backup inspect',
  'final completeness inspect'
]);

export function evaluateStageFAcceptanceMatrix(snapshot = {}) {
  const deployed = snapshot.deployed === true;
  const results = STAGE_F_ACCEPTANCE_CASES.map((item) => {
    const evidence = snapshot.cases?.[item.id];
    if (!deployed || evidence === undefined) {
      return {
        id: item.id,
        group: item.group,
        status: 'NOT_DEPLOYED',
        pass: false
      };
    }
    if (evidence.pass === true) {
      if (
        item.id === 'security_one_real_human_alert' &&
        evidence.humanInboxProof !== true
      ) {
        return {
          id: item.id,
          group: item.group,
          status: 'HUMAN_NOTIFICATION_PATH_IMPLEMENTED_NOT_DEPLOYED',
          pass: false
        };
      }
      return { id: item.id, group: item.group, status: 'PASS', pass: true };
    }
    return { id: item.id, group: item.group, status: 'FAIL', pass: false };
  });
  const issues = [];
  if (!deployed) {
    issues.push(
      'Stage F deployed acceptance is spec-only until isolated deployment evidence exists.'
    );
  }
  if (
    snapshot.humanNotificationProven === true &&
    snapshot.humanInboxProof !== true
  ) {
    issues.push(
      'HUMAN_NOTIFICATION_PROVEN is forbidden without cloud inbox evidence.'
    );
  }
  return {
    kind: 'stage_f_acceptance_matrix',
    deployed,
    blockers: [...STAGE_F_BLOCKERS],
    results,
    ok: deployed && results.every((item) => item.pass) && issues.length === 0,
    issues
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = evaluateStageFAcceptanceMatrix();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}
