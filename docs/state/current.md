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
| `docs/architecture/stage-2-gate-status.json` | `9829c73307ddad50e397328e0c1e9e6d7472b0ba8a1130c4d6f442e6cfab63d2` |
| `security/audit-exceptions.json` | `16e6921c9cd6f5421ae26aa5ee773810a22d9ffc5e7b74e78c8b42e9f6c0bfde` |

**sourceSnapshotSha256:** `f197043326c8920f4dcaf558c50845923c42da0d8944e2ab900a8e10773749e8`

## Stage 2 (from stage-2-gate-status.json)

| Slice | Status |
| --- | --- |
| C0 | `revise` |
| C1 | `pending` |
| C2 | `pending` |
| C3 | `pending` |
| C4 | `pending` |
| C5 | `pending` |
| C6 | `pending` |

| Slice | Deployment authority |
| --- | --- |
| C1 | `not_granted` |
| C2 | `not_granted` |
| C3 | `not_granted` |
| C4 | `not_granted` |
| C5 | `not_granted` |
| C6 | `not_granted` |

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
- unresolved conflicts: `docs/state/conflicts.md`
- AI index: `docs/INDEX.md`

## UNVERIFIED

- `githubProtection`
- `previewAvailability`
- `dependabotAlerts`
- `remoteCloud`
