# GOVERNANCE.md — meta-governance

This file defines **how authority is scoped and how conflicts are resolved**.
It does not define product, medical, privacy, security, architecture, RBAC,
Calendar, data, deployment, or D-series policy. Those live in the documents
named below.

Hooks, tests, CI, and other Enforcement Plane mechanisms **cannot create or
override Canon**. They only detect drift from it.

## Authority by scope

| Question | Canonical source | Not authority |
| --- | --- | --- |
| D-series / approval state | `docs/product/phase-1-decision-register.md` | Implementation, runtime, generated state, reviews, a green CI job |
| Architecture decisions | accepted ADRs under `docs/adr/` | Plan-only architecture docs, adapters, gate scripts |
| Current execution scope / stage | `docs/roadmap.md` and `docs/phase-1-execution-plan.md` | Dated reviews, generated state |
| Document / evidence semantics | `docs/document-lifecycle.md` | CI job implementation details |
| Contribution procedure | `CONTRIBUTING.md` | Skill bodies |
| Immutable safety boundaries | `AGENTS.md` **Safety Floor** | The CLAUDE.md three-line fail-safe mirror; hooks; tests |
| Machine enforcement | tests, policy checks, CI, `.claude/hooks` | Not Canon |
| Generated current state | `docs/state/current.json` and `docs/state/current.md` | Projection only |
| Dated evidence | `docs/reviews/` | Must not override live Canon |

## Conflict resolution

1. Identify the **scope** of the disagreement using the table above.
2. The named canonical source for that scope wins.
3. A generated projection never wins against the decision register, an ADR,
   the roadmap/execution plan, document-lifecycle, CONTRIBUTING, or the
   AGENTS.md Safety Floor.
4. Dated evidence answers only what was true at that date and commit. It never
   becomes standing permission.
5. Enforcement results never rewrite policy. A red gate blocks a merge; it does
   not invent a decision. A green gate does not approve one.
6. Unresolved dated or current governance conflicts are recorded in
   `docs/state/conflicts.md` (live state, not this file). Do not copy those
   facts into this kernel. Owner resolution is required to retire them.
7. Vendor adapters (`.claude/`, `.agents/`) are not Canon. `.claude/skills/` is
   the canonical skill body; `.agents/skills/` is a generated Codex-compatible
   adapter.

## Generated state

Committed `docs/state/current.*` files are deterministic projections of
machine-readable sources they actually materialize. They must not embed
wall-clock time or a self-referential containing-commit SHA. Discover the
containing revision with `git log -1 -- <path>`.

A projection must not infer an approval from implementation or runtime.
Fields that cannot be derived reliably are omitted or marked `UNVERIFIED`.

## Waivers

Mechanical governance exceptions live in `docs/governance/waivers.json` and
fail closed (expired, unknown rule, missing scope/owner/approval, malformed).
Supply-chain audit ignores remain solely in
`security/audit-exceptions.json`. Do not convert those records here.

## Ownership and change control

`.github/CODEOWNERS` is an **ownership declaration; non-blocking approval**.
It may affect GitHub reviewer routing. It does not itself enable required
code-owner approval. Remote branch protection, rulesets, and required reviews
are out of scope for a documentation edit.

## Retrieval

Agents load `AGENTS.md`, then `docs/INDEX.md` for the task scope. The complete
human catalogue remains `docs/README.md`.
