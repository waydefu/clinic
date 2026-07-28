# Phase 0 Local Development

## What is implemented

- Pure TypeScript appointment and payroll domain rules in `packages/domain`.
- Zod v4 request, response and error contracts in `packages/contracts`.
- A NestJS + Fastify API skeleton with `GET /v1/health` only.
- A Firebase Local Emulator Suite baseline that denies all direct Firestore
  client access and tests that denial.

No appointment route, authentication provider, Firebase production project,
Google Calendar credential, service account, patient record, email delivery or
NAS connector exists in this phase.

## Safe local start

```powershell
pnpm install --frozen-lockfile
pnpm verify
pnpm --filter @beauessence/api dev
```

Then request `http://127.0.0.1:3000/v1/health`.  The endpoint returns a static
health envelope and does not touch Firebase.

To run the Firestore rules integration test:

```powershell
pnpm test:rules
```

## Moving between computers

The repository is designed to be used from different computers. Switch
machines only at a Git boundary:

1. On the current computer, review `git status`, commit the intended source and
   documentation changes, record `git branch --show-current`, and push that
   exact branch with `git push -u origin <branch>`.
2. On the next computer, install Git 2.x, Node `>=24.14.0 <25`, pnpm `11.9.0`
   and JDK 21 before running any repository command. JDK 21 matches CI and is
   needed by the local Firestore Emulator. Close and reopen PowerShell after
   installation so the updated `PATH` and `JAVA_HOME` are loaded.
3. Clone the branch pushed in step 1 into a folder owned by the next computer's
   current user:

   ```powershell
   $branch = 'main' # Replace this with the exact branch pushed in step 1.
   git clone --branch $branch https://github.com/waydefu/clinic.git
   Set-Location .\clinic
   ```

   This repository requires authorized GitHub access. Git Credential Manager
   may open a browser sign-in during the first HTTPS operation. HTTPS avoids
   SSH host-key configuration, but it does not bypass repository permissions;
   an unauthenticated request can appear as `404`.
4. Recreate dependencies from `pnpm-lock.yaml`, download the Playwright
   Chromium for that computer and rerun the local gates:

   ```powershell
   corepack pnpm install --frozen-lockfile
   corepack pnpm exec playwright install chromium
   corepack pnpm verify
   corepack pnpm test:rules
   corepack pnpm test:e2e
   ```

If that computer already has a clean clone, update it instead of cloning over
the working tree:

```powershell
$branch = 'main' # Use the same branch as the other computer.
git remote set-branches origin '*'
git fetch --prune
git switch $branch
git pull --ff-only
```

The `set-branches` line is safe to repeat and repairs a clone created by the
older `--single-branch` instruction. For a remote-only branch, create its local
tracking branch once with `git switch --track "origin/$branch"`. Stop if
`git status` shows unexpected local changes; do not overwrite them.

Do **not** copy `.git`, `node_modules` or a pnpm store between computers,
drives or workspace locations. Do not copy the Playwright browser cache either;
it is version-specific and can be downloaded again. Windows filesystem
ownership and Git's safe-directory check can retain the old computer's security
identifier. pnpm uses hardlinks and Windows junctions that can retain the old
absolute drive path; a copied dependency tree can therefore still point to a
path such as `F:\...` after the repository moves to `D:\...`.

If a repository was copied already, preserve source changes separately, then
replace it with a fresh clone. Delete only that copied repository's disposable
`node_modules` after confirming its exact absolute path. Do not take ownership
of or delete a drive-wide store such as `D:\.pnpm-store`, because other projects
may share it.

Git does not transfer local-only state. Provision `.env` values and approved
test credentials separately on each computer; never commit or copy secrets,
service-account files, real patient data, payroll data or Calendar content into
the repository. Browser `localStorage`, Firestore Emulator data and other
synthetic local state are also machine-specific and should be treated as
disposable unless an approved synthetic-only runbook explicitly exports them.

## Phase 0 completion conditions

1. `pnpm verify` passes.
2. `pnpm test:rules` passes locally.
3. `pnpm test:e2e` passes against the packaged site.
4. The product owner resolves the applicable Phase 1 blocking decisions in
   `docs/product/phase-1-decision-register.md` before any real booking route is
   built.
5. A formal privacy-policy text and the clinic's approved cancellation rule
   are reviewed before accepting actual patient reservations.
