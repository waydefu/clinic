# CLAUDE.md — operating contract

Policy authority is scoped by [GOVERNANCE.md](GOVERNANCE.md). The designated
safety Canon is the **Safety Floor in [AGENTS.md](AGENTS.md)**. D-series status
lives only in
[the decision register](docs/product/phase-1-decision-register.md). This file
owns *how to work*: when to plan, how to debug, what counts as verified, what
is safe to do to the working tree, and what "done" means. When procedure and
policy disagree, AGENTS.md Safety Floor and the register win on policy; this
file wins on procedure.

Layered on top: [`.claude/rules/`](.claude/rules) loads per path, and
[`.claude/skills/`](.claude/skills) load only when invoked. That skill tree is
canonical for Claude, Grok compatibility, and Kimi. `.agents/skills/` is a
generated Codex-compatible adapter, not a second Canon. See
[`.claude/README.md`](.claude/README.md).

## The floor, which holds in a session that never opens AGENTS.md

This is a **non-canonical fail-safe mirror** of the AGENTS.md Safety Floor,
kept because Claude Code cannot be assumed to have loaded AGENTS.md in every
session. It does not replace that floor.

- **No real data, anywhere.** Patient, payroll, calendar, staff and
  social-message values are synthetic and opaque here — in code, tests,
  fixtures, screenshots, logs and commit messages alike.
- **No secret in the tree.** No service-account file, key or live credential,
  whatever `.gitignore` would have done with it.
- **Deployment is not a session's decision.** See [Production
  safety](#production-safety).

`AGENTS.md` owns the remaining safety boundaries and the reasoning.

## Read AGENTS.md before you change any of these

Read the Safety Floor — and `docs/INDEX.md` for the matching route — before
the first edit that touches:

- a write path, transaction, outbox, idempotency or audit behaviour;
- authentication, authorization, roles or Firestore Rules;
- a public contract in `packages/contracts`, or a domain rule in `packages/domain`;
- anything that collects, stores, displays or logs a person's data;
- cloud, Terraform, Firebase, Calendar, LINE/Meta/email or NAS integration;
- the sanitized public mirror;
- a blocking gate under `scripts/`, `.github/workflows/` or `security/`.

For anything else — a typo, a comment, a test rename, a local doc fix — do not
re-read it. The path-scoped rules already carry the invariants you need.

## Task classes and the planning threshold

**Direct.** Locate, change, test, report. Use this for a single-file fix, a
localised bug with a clear reproduction, a doc correction, a test addition, a
rename inside one package. Do not open a plan for these; a plan here costs the
user more than it saves.

**Planned.** Write the plan first and get it approved. Required when the task
crosses a package boundary, changes architecture or a public contract, migrates
data or schema, moves a security/privacy boundary, touches three or more
subsystems, is a production incident, or is ambiguous enough that two readings
would produce different code.

A plan for this repository states: the files it will touch; the invariants it
must not break (name them); which decision in
[the register](docs/product/phase-1-decision-register.md) authorises it, or that
none does; the tests that will prove it; the rollback; and the deployment impact
(usually "none — local only", and say so explicitly).

**Closeout.** A bounded set of related findings taken to exhaustion rather than
one PR and stop — a release preflight, the ID list from a dated audit, a
migration, a repository-wide correctness sweep. Declare the closure set before
implementing, track it, and search for siblings of every failure class you
confirm. "One PR per concern" bounds the pull request; it never bounds the
closure. Run `/closeout`.

If no decision authorises the behaviour, stop at the plan and say which decision
is missing. Do not implement a guess and leave the policy question in a comment.

## Debugging: root cause before patch

Never patch a symptom you cannot explain. The loop is:

1. **REPRODUCE** — a failing test, command or Playwright spec. If you cannot
   reproduce it, say so and stop; do not proceed on a theory.
2. **LOCATE THE EARLIEST INCORRECT STATE** — not where it crashed, where the
   value first became wrong.
3. **NAME THE ROOT CAUSE** — with the evidence that proves it.
4. **ADD THE REGRESSION TEST** — it must fail before the fix.
5. **SMALLEST FIX** at the owning boundary.
6. **VERIFY** — the new test, then the gate for that area.

Classify every reported defect as exactly one of `CONFIRMED`, `LIKELY`,
`NEEDS-RUNTIME-REPRODUCTION` or `NOT-A-BUG`, and say which. A `LIKELY` finding
does not justify a refactor. Run `/root-cause` to work the loop.

## Verification: inspection is not verification

Reading code proves nothing. Report exactly one rung, and never a higher one
than you reached:

| Rung | Means |
| --- | --- |
| `CODE-ONLY` | Changed and reviewed. Nothing was executed. |
| `TEST-VERIFIED` | The relevant unit/rules/e2e tests were run locally and passed. |
| `GATE-VERIFIED` | The blocking gate for the touched area passed locally. |
| `CI-VERIFIED` | `Verification evidence` passed on this exact commit. |
| `DEPLOYED-NOT-SMOKED` | Something was deployed. No behaviour was checked. |
| `VERIFIED-PRODUCTION` | Deployed **and** exercised against the real target, with evidence. |

A green build is not a green gate. A green gate is not CI. CI is not a working
external provider. If a gate did not run, report it as `NOT_RUN` with the reason
— never omit it, and never let silence imply a pass. Run `/verify-gates` to pick
and run the right gates and produce this report.

### Resource-aware verification

Local disk, memory, browser, JVM or environment limits may change **where** a
required gate runs. They must not change **what** must be verified before
merge, weaken a threshold, delete tests, register a waiver just to go green,
or raise the evidence rung. Procedure: skill `verify-gates`.

```text
LOCAL RESOURCE LIMIT → change execution venue
  → targeted local verification + full required CI → final evidence
```

Not: resource limit → skip required verification. Keep `PASS` / `FAIL` /
`NOT_RUN` / `UNAVAILABLE`. Defer a heavy gate as `NOT_RUN` when it is
intentionally delegated to CI, or `UNAVAILABLE` when this environment cannot
execute it. `UNAVAILABLE` is not for slowness. Name the limitation and the CI
job that replaces the local evidence. A local crash from disk or RAM is not a
`PASS`. Targeted local gates with CI not yet run are at most `GATE-VERIFIED`.
`CI-VERIFIED` requires this exact commit's `Verification evidence`.

Evidence has an age. A gate that passed before your edit is still evidence for
the files you did not touch and no evidence at all for the ones you did. Re-run
what your change invalidated; do not re-run an untouched expensive suite for
reassurance, and do not carry an older run forward as if it covered this one.

Every deterministic bug fix gets a regression test. If it genuinely cannot have
one, say why in the completion report.

## Working tree, Git and parallel agents

Assume another agent or the user is working in this repository right now.

- **Changes you did not make are not yours.** Never `reset --hard`, `clean`,
  `checkout -- .`, `restore .` or `stash` a tree containing them. If the tree is
  dirty at session start, report what you found and ask before touching it.
- Work on `agent/<topic>` or `claude/<topic>`. Never commit to `main`, and never
  push to `main` — branch protection here allows an administrator bypass, so the
  gate will not stop you.
- Rebase and force-push only your own branch, only with `--force-with-lease`.
- Prefer a worktree under `.claude/worktrees/` for parallel work; it is
  gitignored and excluded from Prettier.
- If another branch or worktree is editing the same boundary you were asked to
  change, **stop and report the overlap** instead of merging around it.

The dangerous forms above are blocked or escalated by
[`.claude/hooks/guard-commands.mjs`](.claude/hooks/guard-commands.mjs). Treat a
block as information, not as an obstacle to route around.

## Production safety

`CODE-ONLY` is not `DEPLOYED`, and `DEPLOYED` is not `VERIFIED-PRODUCTION`. Say
the rung you reached and nothing more.

Deployment, `terraform apply`, live-channel Hosting, Firestore import/export and
making any repository public are outside what any session may decide. They
require fresh, explicit, per-commit authority as defined in the `AGENTS.md`
Safety Floor. The command guard denies them; if one is genuinely authorised,
hand the exact command to the user to run.

## Scope

Deliver the change that was asked for and nothing else. `AGENTS.md` §"Minimal
safe change" is the full rule — the operational consequence is: no opportunistic
refactors, no drive-by formatting, no dependency bumps riding along. If you find
an unrelated defect, record it in the completion report and leave it.

## Decision challenge and simplification

GRILL ME is a manual decision-review technique, not an always-on hook. Before
implementing a choice that materially affects privacy, authz, a public API,
migration, an external integration, cloud cost, deployment or rollback, ask
only the unresolved questions that would change the design, then record any
policy answer in the decision register.

PONYTAIL is a one-time, human-reviewed simplification pass after correctness
and security gates, for low-risk local duplication or naming only. Do not use
it on privacy, RBAC, Rules, transactions, outbox, payroll, backup, incident
response, IaC, deployment, legal text or governance.

A status/progress request is read-only: do not run `pnpm`, install, build,
Emulator or Playwright merely to confirm status. If `node_modules` is missing,
report the prerequisite and stop. Treat repository-memory tools as navigation
hints, never as Canon; the live register and current files win.

## Completion semantics

A task is finished when you can state, in this order:

1. what changed, by file;
2. the evidence rung, from the table above;
3. every relevant gate as `PASS`, `FAIL`, `NOT_RUN` or `UNAVAILABLE`, with a
   reason for the last two;
4. what you deliberately did **not** do, and what is still unresolved.

A report that lists only successes is not a report. When a delivery stage closes,
that report becomes a dated handoff record — run `/handoff-record`.
