# Unresolved governance conflicts

**Type:** live state / unresolved pointer. Not Canon. Not
[GOVERNANCE.md](../../GOVERNANCE.md).
**Resolution rule:** [GOVERNANCE.md](../../GOVERNANCE.md) § Conflict resolution.
An owner decision is required to close each item. Do not retire an item from
`AGENTS.md` Safety Floor or CONTRIBUTING merely because this file records a
newer visibility snapshot.

## GC-001 — repository visibility vs unretired Rule 1

**Status:** unresolved
**Owner:** clinic owner / technical owner
**Approver:** not recorded as a named decision

**Recorded visibility (dated evidence, 2026-08-17):** GitHub API returned
`visibility: public` for `waydefu/clinic`. The owner stated the change was
deliberate and should stand, on the assessment that what was then in the
repository was publishable. That snapshot is **not** standing authority to
weaken export discipline, invent a licence, or treat public visibility as
deployment or real-data permission.

**Unretired Rule 1 (still binding until an owner retires it):** the publication
boundary historically required that the canonical repository must not be made
public, and that its `.git`, commits, branches, tags, pull-request metadata
and other history must not be copied into the public mirror. Retiring that
boundary is an owner decision that has **not** been recorded as such.

**Still-binding export discipline** (see `CONTRIBUTING.md` and
[2026-07-29 sanitized public mirror publication](../reviews/2026-07-29-sanitized-public-mirror-publication.md)):
allowlist export only; exclude clinic/people content, brand, portraits,
screenshots, UI, internal governance/review/delivery documents, deployment
identifiers, private URLs, logs, credentials, personal data and realistic
identity fields; scan the candidate and the full public Git object/ref set;
public availability grants no licence, production readiness, deployment
authority or permission to use real data.

**CONTRIBUTING.md** still describes `waydefu/clinic` as private and the unique
canonical source. Do not silently rewrite that sentence here.

**Publication-safety invariant** (stable, in `AGENTS.md`): every committed
file MUST be safe for publication. Repository visibility is dynamic state and
must not be inferred from `AGENTS.md`.

**PII already in tree as of the 2026-08-17 note (do not add more silently):**
clinic identity and address, clinic phone, one personal mobile and one
personal email in the D-010 incident-contact record, two named individuals in
the decision register, two real staff photographs, and the complete governance
record including `enforce_admins=false`. Raise anything that would add
personal data rather than committing it.

**What would close this:** a named owner decision that either (a) retires
Rule 1 with scope, date and exclusions, and updates CONTRIBUTING.md, or
(b) restores a non-public canonical repository, with evidence.
