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
| `security/audit-exceptions.json` | `16e6921c9cd6f5421ae26aa5ee773810a22d9ffc5e7b74e78c8b42e9f6c0bfde` |

**sourceSnapshotSha256:** `f1b3a73fec06ae068e70a9a66a8267a1fc24924b0f17e3d95bac040c944203ac`

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

- active: 0
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
