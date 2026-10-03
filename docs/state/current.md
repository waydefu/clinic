# Current state projection

**generated:** true
**generator:** `scripts/generate-governance-state.mjs` version `1`
**schemaVersion:** 1

This file is a deterministic projection, not Canon. Decision status lives in
the [decision register](../product/phase-1-decision-register.md). Architecture
decisions live in accepted ADRs. Execution scope lives in the roadmap and
Phase 1 execution plan. Containing Git revision:
`git log -1 -- docs/state/current.json`.

## Hashed sources

| Path | sha256 |
| --- | --- |
| `docs/architecture/stage-2-gate-status.json` | `f00fd064a62094dc4850ffa990829e63c03b01030cba6e50f35811771c7d06b5` |
| `security/audit-exceptions.json` | `3c7ff1e30e212147c55c3c043734dbbdae85243f5afa0420ae70d7b5e5db12b3` |

**sourceSnapshotSha256:** `bc5d1e6c3d04aded719a090965b96018a11111f64b8625840169e71b9219961c`

## Stage 2 (from stage-2-gate-status.json)

| Slice | Status |
| --- | --- |
| C0 | `completed` |
| C1 | `completed` |
| C2 | `completed` |
| C3 | `completed` |
| C4 | `completed` |
| C5 | `completed` |
| C6 | `completed` |

| Slice | Deployment authority |
| --- | --- |
| C1 | `granted` |
| C2 | `granted` |
| C3 | `granted` |
| C4 | `granted` |
| C5 | `granted` |
| C6 | `granted` |

Changing these values records status only. It never grants deployment
authority or enables a route.

## Audit exceptions (counts only)

- active: 1
- released: 1

## Pointers (paths only; not hashed)

- decision register: `docs/product/phase-1-decision-register.md`
- roadmap: `docs/roadmap.md`
- document lifecycle: `docs/document-lifecycle.md`
- ADRs: `docs/adr`
- governance conflicts: `docs/state/conflicts.md`
- AI index: `docs/INDEX.md`

## UNVERIFIED

- `githubProtection`
- `previewAvailability`
- `dependabotAlerts`
- `remoteCloud`
