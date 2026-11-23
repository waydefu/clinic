import { describe, expect, it } from 'vitest';

import { classify } from './guard-commands.mjs';

// A guard that misfires on ordinary work gets switched off, and a guard that
// misses the command it exists for is worse than none. Both directions are
// asserted here, and this file runs inside `test:unit` like every other
// blocking check in this repository.

const denied = (command) => {
  const verdict = classify(command);
  expect(verdict, `expected a verdict for: ${command}`).not.toBeNull();
  return verdict.decision;
};

describe('commands that no session may decide', () => {
  it.each([
    'terraform apply',
    'terraform -chdir=infra/terraform apply -auto-approve',
    'terraform destroy',
    'firebase deploy --only hosting',
    'firebase firestore:delete --all-collections',
    'gh repo edit waydefu/clinic --visibility public',
    'gh repo create clinic --public',
    'git push origin main',
    'git push --force origin agent/topic',
    'git push -f origin agent/topic',
    'git filter-repo --path secrets',
    'pnpm publish'
  ])('denies %s', (command) => {
    expect(denied(command)).toBe('deny');
  });

  it('still denies when hidden behind a separator or a wrapper', () => {
    expect(denied('pnpm run check:docs && terraform apply')).toBe('deny');
    expect(denied('sudo terraform destroy')).toBe('deny');
    expect(denied('TF_LOG=debug terraform apply')).toBe('deny');
  });

  it('allows the lease-checked force push, which is the safe form', () => {
    expect(
      classify('git push --force-with-lease origin agent/topic')
    ).toBeNull();
  });
});

describe('commands that destroy work someone else may own', () => {
  it.each([
    'git reset --hard HEAD~1',
    'git clean -fd',
    'git checkout -- .',
    'git restore .',
    'git stash',
    'git branch -D agent/topic',
    'git worktree remove .claude/worktrees/other',
    'git config --global user.email a@b.c',
    'gh pr merge 14 --squash',
    'rm -rf node_modules',
    'Remove-Item -Recurse -Force dist'
  ])('escalates %s', (command) => {
    expect(denied(command)).toBe('escalate');
  });
});

describe('the branch-aware rules, which catch the forms that never say "main"', () => {
  const onMain = () => 'main';
  const onAgentBranch = () => 'agent/topic';

  it('denies a bare push while HEAD is on main', () => {
    expect(classify('git push', onMain).decision).toBe('deny');
    expect(
      classify('git push --set-upstream origin HEAD', onMain).decision
    ).toBe('deny');
  });

  it('asks before committing while HEAD is on main', () => {
    expect(classify('git commit -m "fix"', onMain).decision).toBe('escalate');
  });

  it('leaves both alone on an agent branch', () => {
    expect(classify('git push', onAgentBranch)).toBeNull();
    expect(classify('git commit -m "fix"', onAgentBranch)).toBeNull();
  });

  it('does not consult the branch for commands that do not need it', () => {
    let calls = 0;
    const counting = () => {
      calls += 1;
      return 'main';
    };
    expect(classify('corepack pnpm run check:docs', counting)).toBeNull();
    expect(calls).toBe(0);
  });

  it('still works when the branch cannot be determined', () => {
    expect(classify('git push', () => null)).toBeNull();
  });
});

describe('ordinary work is not obstructed', () => {
  it.each([
    'git status --short',
    'git log --oneline -5',
    'git diff main...HEAD',
    'git add -A',
    'git commit -m "Record the harness"',
    'git push origin agent/clinic-homepage-seo',
    'git checkout -b agent/topic',
    'git checkout agent/topic',
    'git switch main',
    'git worktree list',
    'corepack pnpm run check:docs',
    'corepack pnpm verify',
    'corepack pnpm run test:rules',
    'node scripts/e2e-groups.mjs --files ui',
    'firebase emulators:start --only firestore',
    'gh pr view 14',
    'rm tmp/scratch.txt',
    'terraform plan',
    'terraform fmt -check'
  ])('lets %s through', (command) => {
    expect(classify(command)).toBeNull();
  });

  it('returns nothing for an empty or absent command', () => {
    expect(classify('')).toBeNull();
    expect(classify(undefined)).toBeNull();
  });
});

describe('gcloud mutation guard (B-18)', () => {
  it.each([
    'gcloud run deploy cal-pilot-api --project synthetic-proj --region asia-east1',
    'gcloud run services update-traffic cal-pilot-api --to-revisions r1=100',
    'gcloud projects add-iam-policy-binding synthetic-proj --member user:a --role roles/viewer',
    'gcloud run services set-iam-policy cal-pilot-api policy.json',
    'gcloud secrets versions add c1-secret --project synthetic-proj --data-file=-',
    'gcloud scheduler jobs pause cal-pilot-five-minute-sync',
    'gcloud scheduler jobs resume cal-pilot-five-minute-sync',
    'gcloud builds submit . --project synthetic-proj',
    'gcloud services enable run.googleapis.com --project synthetic-proj',
    'gcloud auth activate-service-account --key-file key.json',
    'sudo gcloud firestore export gs://synthetic-bucket'
  ])('denies mutating gcloud command %s', (command) => {
    expect(denied(command)).toBe('deny');
  });

  it.each([
    'gcloud version',
    'gcloud auth list --filter=status:ACTIVE',
    'gcloud config get-value project',
    'gcloud projects describe synthetic-proj',
    'gcloud services list --project synthetic-proj --enabled',
    'gcloud run services list --project synthetic-proj --region asia-east1',
    'gcloud run services describe cal-pilot-api --project synthetic-proj',
    'gcloud run services get-iam-policy cal-pilot-api --project synthetic-proj',
    'gcloud secrets versions list c1-secret --project synthetic-proj --filter state=ENABLED',
    'gcloud logging read "resource.type=cloud_run_revision" --limit 5'
  ])('lets read-only gcloud command %s through', (command) => {
    expect(classify(command)).toBeNull();
  });

  it('aligns visibility and branch-push reasons with GC-001 and D-013', () => {
    const vis = classify('gh repo edit waydefu/clinic --visibility public');
    expect(vis?.reason).not.toContain('must never become public');
    expect(vis?.reason).toContain('GC-001');
    expect(vis?.reason).toContain('UNVERIFIED');

    const pushMain = classify('git push origin main');
    const pushHead = classify('git push', () => 'main');
    for (const verdict of [pushMain, pushHead]) {
      expect(verdict?.reason).not.toContain('keeps the administrator bypass');
      expect(verdict?.reason).toContain('D-013');
      expect(verdict?.reason).toContain('enforce_admins=true');
      expect(verdict?.reason).toContain('UNVERIFIED');
    }
  });
});
