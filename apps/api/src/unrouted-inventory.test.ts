import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// prettier-ignore
// @ts-expect-error — the architecture helper is plain ESM without declarations.
import { parseDecisionRegister, parsePermissionActionReferences, parseStageGateStatus, validateRbacPermissionCoverage, validateReachableCapabilityBlockers, validateUnroutedInventory } from '../../../scripts/unrouted-inventory.mjs';

const DECISION_REGISTER = `
| ID | Decision | Owner | Status | Needed before |
| --- | --- | --- | --- | --- |
| D-004 | Scheduling rules | Operations | pending (details recorded) | Slot reservation |
| D-006 | Identity controls | Security | approved (2026-07-28) | Authenticated write |
| D-010 | Cloud target | Security | approved (2026-07-28) | Cloud deployment |
`;

const STAGE_GATE_STATUS = {
  $comment: ['Test fixture.'],
  stageSlices: {
    C0: 'revise',
    C1: 'pending',
    C2: 'pending',
    C3: 'pending',
    C4: 'pending',
    C5: 'pending',
    C6: 'pending'
  },
  deploymentAuthorities: {
    C1: 'not_granted',
    C2: 'not_granted',
    C3: 'not_granted',
    C4: 'not_granted',
    C5: 'not_granted',
    C6: 'not_granted'
  }
};

const RBAC_SOURCE = `
export type Permission =
  | 'create_appointment'
  | 'publish_schedule';
`;

function validInventory() {
  return {
    $comment: ['Test fixture.'],
    capabilityGates: {
      scheduling: {
        permissions: ['create_appointment', 'publish_schedule'],
        approvedPolicyDependencies: ['D-006'],
        remainingBlockers: [
          {
            kind: 'decision',
            id: 'D-004',
            description: 'Scheduling semantics remain pending.'
          },
          {
            kind: 'stage_slice',
            id: 'C0',
            description: 'Technical review remains open.'
          },
          {
            kind: 'deployment_authority',
            id: 'C1',
            description: 'Deployment approval has not been granted.'
          },
          {
            kind: 'stage_slice',
            id: 'C1',
            description: 'Foundation execution and evidence remain pending.'
          }
        ],
        note: 'The capability remains gated independently from file reachability.'
      }
    },
    unrouted: {
      'src/example.ts': {
        approvedPolicyDependencies: ['D-006'],
        remainingBlockers: [
          {
            kind: 'decision',
            id: 'D-004',
            description: 'Scheduling semantics remain pending.'
          },
          {
            kind: 'stage_slice',
            id: 'C0',
            description: 'Technical review remains open.'
          },
          {
            kind: 'deployment_authority',
            id: 'C1',
            description: 'Deployment approval has not been granted.'
          },
          {
            kind: 'stage_slice',
            id: 'C1',
            description: 'Foundation execution and evidence remain pending.'
          }
        ],
        note: 'The file remains intentionally unrouted.'
      }
    }
  };
}

describe('unrouted inventory validation', () => {
  it('reads canonical decision and Stage statuses', () => {
    const parsedDecisions = parseDecisionRegister(DECISION_REGISTER);
    const parsedStages = parseStageGateStatus(STAGE_GATE_STATUS);

    expect(parsedDecisions.issues).toEqual([]);
    expect(Object.fromEntries(parsedDecisions.decisions)).toEqual({
      'D-004': 'pending',
      'D-006': 'approved',
      'D-010': 'approved'
    });
    expect(parsedStages.issues).toEqual([]);
    expect(Object.fromEntries(parsedStages.stageSlices)).toEqual(
      STAGE_GATE_STATUS.stageSlices
    );
    expect(Object.fromEntries(parsedStages.deploymentAuthorities)).toEqual(
      STAGE_GATE_STATUS.deploymentAuthorities
    );
    expect(
      validateUnroutedInventory(
        validInventory(),
        DECISION_REGISTER,
        STAGE_GATE_STATUS
      )
    ).toEqual([]);
  });

  it('allows an explicitly empty approved-policy dependency list', () => {
    const inventory = validInventory();
    inventory.capabilityGates.scheduling.approvedPolicyDependencies = [];
    inventory.unrouted['src/example.ts'].approvedPolicyDependencies = [];

    expect(
      validateUnroutedInventory(inventory, DECISION_REGISTER, STAGE_GATE_STATUS)
    ).toEqual([]);
  });

  it('allows a capability to become unblocked while unrouted files still require blockers', () => {
    const inventory = validInventory();
    inventory.capabilityGates.scheduling.remainingBlockers = [];

    expect(
      validateUnroutedInventory(inventory, DECISION_REGISTER, STAGE_GATE_STATUS)
    ).toEqual([]);

    inventory.unrouted['src/example.ts'].remainingBlockers = [];
    expect(
      validateUnroutedInventory(inventory, DECISION_REGISTER, STAGE_GATE_STATUS)
    ).toEqual([
      expect.stringContaining(
        'src/example.ts remainingBlockers must be a non-empty array'
      )
    ]);
  });

  it('fails when any referenced decision is missing or not approved policy', () => {
    const inventory = validInventory();
    inventory.unrouted['src/example.ts'].approvedPolicyDependencies = [
      'D-004',
      'D-099'
    ];

    const issues = validateUnroutedInventory(
      inventory,
      DECISION_REGISTER,
      STAGE_GATE_STATUS
    );

    expect(issues).toEqual([
      expect.stringContaining(
        'lists D-004 as approved policy, but the register status is pending'
      ),
      expect.stringContaining(
        'references D-099, which is absent from the decision register'
      )
    ]);
  });

  it('never accepts an approved decision as the remaining blocker', () => {
    const inventory = validInventory();
    inventory.unrouted['src/example.ts'].remainingBlockers = [
      {
        kind: 'decision',
        id: 'D-006',
        description: 'Incorrectly claims the approved decision is still open.'
      }
    ];

    expect(
      validateUnroutedInventory(inventory, DECISION_REGISTER, STAGE_GATE_STATUS)
    ).toEqual([
      expect.stringContaining(
        'uses approved decision D-006 as a remaining blocker'
      )
    ]);
  });

  it('rejects Stage blockers after their canonical status is complete or granted', () => {
    const stages = structuredClone(STAGE_GATE_STATUS);
    stages.stageSlices.C0 = 'completed';
    stages.stageSlices.C1 = 'completed';
    stages.deploymentAuthorities.C1 = 'granted';

    const issues = validateUnroutedInventory(
      validInventory(),
      DECISION_REGISTER,
      stages
    );

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'uses completed stage slice C0 as a remaining blocker'
        ),
        expect.stringContaining(
          'uses completed stage slice C1 as a remaining blocker'
        ),
        expect.stringContaining(
          'uses granted deployment authority C1 as a remaining blocker'
        )
      ])
    );
  });

  it('fails closed when a canonical Stage status is missing or unknown', () => {
    const stages = structuredClone(STAGE_GATE_STATUS) as Record<
      string,
      unknown
    >;
    const stageSlices = stages.stageSlices as Record<string, string>;
    const deploymentAuthorities = stages.deploymentAuthorities as Record<
      string,
      string
    >;
    delete stageSlices.C4;
    stageSlices.C5 = 'approved';
    delete deploymentAuthorities.C4;
    deploymentAuthorities.C5 = 'approved';

    expect(
      validateUnroutedInventory(validInventory(), DECISION_REGISTER, stages)
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'stageSlices.C4 must be pending, revise or completed'
        ),
        expect.stringContaining(
          'stageSlices.C5 must be pending, revise or completed'
        ),
        expect.stringContaining(
          'deploymentAuthorities.C4 must be not_granted or granted'
        ),
        expect.stringContaining(
          'deploymentAuthorities.C5 must be not_granted or granted'
        )
      ])
    );
  });

  it.each(['C1', 'C2', 'C3', 'C4', 'C5', 'C6'] as const)(
    'never accepts completed %s execution without that slice authority',
    (slice) => {
      const stages = structuredClone(STAGE_GATE_STATUS);
      stages.stageSlices[slice] = 'completed';

      expect(parseStageGateStatus(stages).issues).toEqual([
        expect.stringContaining(
          `cannot mark stageSlices.${slice} completed before deploymentAuthorities.${slice} is granted`
        )
      ]);
    }
  );

  it('requires a note, blockers and the exact fail-closed entry fields', () => {
    const inventory = validInventory();
    const entry = inventory.unrouted['src/example.ts'] as Record<
      string,
      unknown
    >;
    entry.note = '   ';
    entry.remainingBlockers = [];
    entry.blockedBy = 'D-006';

    const issues = validateUnroutedInventory(
      inventory,
      DECISION_REGISTER,
      STAGE_GATE_STATUS
    );

    expect(issues).toEqual([
      expect.stringContaining('unknown inventory field blockedBy'),
      expect.stringContaining('note must be a non-empty string'),
      expect.stringContaining('remainingBlockers must be a non-empty array')
    ]);
  });

  it('requires structured blockers and tracks C1 authority plus execution separately', () => {
    const inventory = validInventory();
    const blocker = {
      kind: 'stage_slice',
      id: 'C1',
      description: '',
      trigger: 'Legacy free-form field'
    };
    inventory.unrouted['src/example.ts'].remainingBlockers = [blocker];

    const issues = validateUnroutedInventory(
      inventory,
      DECISION_REGISTER,
      STAGE_GATE_STATUS
    );

    expect(issues).toEqual([
      expect.stringContaining('has unknown field trigger'),
      expect.stringContaining('description must be a non-empty string'),
      expect.stringContaining(
        'must track both deployment_authority:C1 and stage_slice:C1'
      )
    ]);
  });

  it('keeps permission gates independent from whether a source file is unrouted', () => {
    const inventory = validInventory();
    inventory.unrouted = {};

    expect(validateRbacPermissionCoverage(inventory, RBAC_SOURCE)).toEqual([]);

    inventory.capabilityGates.scheduling.permissions = ['create_appointment'];
    expect(validateRbacPermissionCoverage(inventory, RBAC_SOURCE)).toEqual([
      expect.stringContaining(
        'RBAC permission publish_schedule has no capability-level gate'
      )
    ]);
  });

  it('rejects stale or multiply-gated RBAC permission mappings', () => {
    const inventory = validInventory();
    inventory.capabilityGates.duplicate = {
      ...inventory.capabilityGates.scheduling,
      permissions: ['create_appointment', 'unknown_action']
    };

    expect(validateRbacPermissionCoverage(inventory, RBAC_SOURCE)).toEqual([
      expect.stringContaining(
        'RBAC permission create_appointment has multiple capability-level gates'
      ),
      expect.stringContaining(
        'references unknown RBAC permission unknown_action'
      )
    ]);
  });

  it('fails when a blocked capability action becomes reachable from the API entry graph', () => {
    const inventory = validInventory();
    const reachableSources = new Map([
      [
        'src/appointments/appointment.controller.ts',
        `
          evaluateAccess(context, {
            permission: 'create_appointment',
            scope: { kind: 'any' }
          });
        `
      ]
    ]);

    expect(
      validateReachableCapabilityBlockers(inventory, reachableSources)
    ).toEqual([
      expect.stringContaining(
        'create_appointment reachable, but capability scheduling still has'
      )
    ]);

    inventory.capabilityGates.scheduling.remainingBlockers = [];
    expect(
      validateReachableCapabilityBlockers(inventory, reachableSources)
    ).toEqual([]);
  });

  it('uses executable permission properties, not comments or prose, as action reachability', () => {
    expect(
      parsePermissionActionReferences(`
        // permission: 'create_appointment'
        const explanation = "permission: 'publish_schedule'";
      `)
    ).toEqual({ permissions: [], issues: [] });

    expect(
      parsePermissionActionReferences(
        'evaluateAccess(context, { permission: requestedPermission });'
      ).issues
    ).toEqual([expect.stringContaining('non-literal permission property')]);

    expect(
      parsePermissionActionReferences(
        'const permission = requestedPermission; evaluateAccess(context, { permission });'
      ).issues
    ).toEqual([expect.stringContaining('shorthand permission property')]);
  });

  it('validates the checked-in inventory against all canonical sources', () => {
    const inventory = JSON.parse(
      readFileSync(
        new URL('../unrouted-inventory.json', import.meta.url),
        'utf8'
      )
    );
    const register = readFileSync(
      new URL(
        '../../../docs/product/phase-1-decision-register.md',
        import.meta.url
      ),
      'utf8'
    );
    const stageStatus = JSON.parse(
      readFileSync(
        new URL(
          '../../../docs/architecture/stage-2-gate-status.json',
          import.meta.url
        ),
        'utf8'
      )
    );
    const rbacSource = readFileSync(
      new URL('./platform/authorization/rbac.ts', import.meta.url),
      'utf8'
    );

    expect(validateUnroutedInventory(inventory, register, stageStatus)).toEqual(
      []
    );
    expect(validateRbacPermissionCoverage(inventory, rbacSource)).toEqual([]);
  });
});
