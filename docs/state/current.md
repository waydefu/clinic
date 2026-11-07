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
| `security/audit-exceptions.json` | `5ed5304f1892ce3a8590e7fa2495cb3cb3a606f5d879ae4302c7290d099e710c` |

**sourceSnapshotSha256:** `786bc2b1cf28c0c12ec6f0f849ec5a7c3e3fc83034f1c33cf894fde247cbd447`

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
- released: 2

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
