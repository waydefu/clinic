# Agent harness

Configuration for Claude Code in this repository. It is deliberately thin: the
project's policy already lives in `AGENTS.md` (Safety Floor), `GOVERNANCE.md`,
`CONTRIBUTING.md` and `docs/`, and duplicating any of it here would create a
second source of truth that drifts.

## Layers, and what each costs

| Layer | Loads | Cost | Holds |
| --- | --- | --- | --- |
| [`../CLAUDE.md`](../CLAUDE.md) | Every session | Always paid | How to work, plus a non-canonical three-line fail-safe mirror of the AGENTS Safety Floor |
| [`rules/`](rules) | When a file matching its `paths:` is read | Near zero until relevant | Domain invariants per area, and the gates that fail for non-obvious reasons |
| [`skills/`](skills) | Only when invoked | Zero until used | Repeated procedures. Canonical for Claude, Grok compatibility, and Kimi |
| [`hooks/`](hooks) + [`settings.json`](settings.json) | Every matching tool call | Zero context | What must not depend on the model deciding correctly |
| `AGENTS.md` Safety Floor | On demand | Paid per read | Designated safety Canon |
| [`../GOVERNANCE.md`](../GOVERNANCE.md), [`../docs/INDEX.md`](../docs/INDEX.md) | On demand | Paid per read | Authority scopes and retrieval routes. Not product policy |

## Where a new instruction goes

Before adding anything, classify it. Most candidates belong in the first row.

| It is | Put it in |
| --- | --- |
| A one-off mistake, already corrected | Nothing. Do not add a rule for a single miss |
| An invariant true in every session | `CLAUDE.md`, in one line |
| True only for one area of the tree | A `rules/` file with `paths:` |
| A procedure with steps and a completion test | A skill |
| Something that must never happen, whatever the model concludes | `hooks/guard-commands.mjs` or `permissions.deny` |
| A behaviour that could silently regress | A test, not an instruction |

Rules and skills that exist to restate `AGENTS.md` should be deleted, not
maintained. Each rule file states why it exists so a future reader can retire it.

## Hooks

Three, all Node so they run identically under Git Bash, PowerShell and CI, with
no `jq` dependency and no shell quoting to get wrong. All fail open: a broken
hook must never block ordinary work.

| Hook | Event | Does |
| --- | --- | --- |
| [`guard-commands.mjs`](hooks/guard-commands.mjs) | `PreToolUse` on Bash/PowerShell | Denies deployment, publication, history rewriting and anything that lands on `main`; asks before commands that destroy work another agent may own |
| [`session-context.mjs`](hooks/session-context.mjs) | `SessionStart` | Reports branch, uncommitted changes, live worktrees and whether gates can run at all |
| [`docs-index-check.mjs`](hooks/docs-index-check.mjs) | `PostToolUse` on Write/Edit | Warns when a new `docs/` file is not yet in the index, at the moment it is written |

`guard-commands.mjs` is covered by
[`guard-commands.test.mjs`](hooks/guard-commands.test.mjs) inside `test:unit` —
both directions, so it cannot quietly start blocking ordinary work.

## Checking it still works

```powershell
corepack pnpm exec vitest run .claude/hooks/guard-commands.test.mjs
node .claude/hooks/session-context.mjs
corepack pnpm run check:docs
```

`check:docs` scans this directory as well as `docs/`, so a rule or skill linking
to a document that has been renamed fails the gate. It has to ask for `.claude/`
by name — `**/*.md` does not match a dot-directory — and it skips
`worktrees/`, which is another session's checkout rather than this tree. Only
`docs/` needs an index entry; nothing here does.

Inside a session: `/context` shows what loaded, `/hooks` lists active hooks,
`/permissions` shows the resolved rules, and `claude doctor` validates the
settings files. To find out why a path-scoped rule did or did not load, the
`InstructionsLoaded` hook logs which instruction files loaded and when.

`worktrees/` holds Claude Code worktrees. It is gitignored and excluded from
Prettier, and it is not part of the harness.
