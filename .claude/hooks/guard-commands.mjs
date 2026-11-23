#!/usr/bin/env node
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// PreToolUse guard for Bash and PowerShell.
//
// Two categories, and the difference matters:
//
//   deny     - nothing a session decides can authorise this. Deployment,
//              publication and history rewriting are governed by AGENTS.md and
//              need fresh, explicit, per-commit authority from the owner. The
//              guard hands the command back so a human can run it deliberately.
//   escalate - legitimate, but destroys work that may not be yours. This
//              repository is worked on by more than one agent at a time, so the
//              user gets to confirm rather than the model.
//
// It is deliberately small. A guard nobody can read is a guard nobody trusts,
// and one that misfires on ordinary work gets disabled. Everything it cannot
// decide, it lets through to the normal permission flow.
//
// Failure mode is open: a crashed guard must not block every shell command.
// Permissions and the deny rules in settings.json still apply underneath.

const SEPARATORS = /&&|\|\||;|\||&|\n|\r/;
const LEADING_ASSIGNMENT =
  /^(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S*)\s+)+/;
const WRAPPERS =
  /^(?:sudo|env|timeout(?:\s+\S+)?|time|nice(?:\s+-n\s+\S+)?|nohup|stdbuf(?:\s+\S+)?|command|builtin)\s+/;

const DENY = [
  [
    /^terraform\b(?:\s+-\S+)*\s+(?:apply|destroy)\b/i,
    'terraform apply/destroy changes live cloud state. AGENTS.md places this behind a reviewed Stage 2 change plan and separate deployment authority; a recorded D-006/D-010 approval is not deployment authority. Give the exact command to the user to run.'
  ],
  [
    /^firebase\b.*\bdeploy\b/i,
    'firebase deploy targets a real Firebase project. Only an expiring synthetic-review Hosting channel has ever been authorised, per commit, and that authority is not reusable. Hand the command to the user.'
  ],
  [
    /^firebase\b.*\b(?:firestore:delete|auth:import|auth:export)\b/i,
    'This mutates or exports cloud Firestore/Auth data. Phase 1 forbids connecting to Firebase cloud without an approved change record.'
  ],
  [
    /^gh\s+repo\s+(?:edit\b.*--visibility\s+public|create\b.*--public)/i,
    'Changing repository visibility or creating a public repository requires explicit owner authority. GC-001 records the current visibility boundary of waydefu/clinic, and remote settings remain UNVERIFIED offline. The curated public reference is exported separately through the allowlist.'
  ],
  [
    /^git\s+push\b(?=.*(?:\s|:)main(?:\s|$))/i,
    'Direct pushes to main bypass the PR review and Verification evidence workflow (D-013 requires enforce_admins=true; remote branch protection stays UNVERIFIED offline). Push an agent/* branch and open a pull request.'
  ],
  [
    /^git\s+push\b(?=.*(?:--force(?!-with-lease)|\s-f\b))/i,
    'Plain force-push discards commits without checking what is on the remote, and another agent may have pushed since you fetched. Use --force-with-lease, and only on your own branch.'
  ],
  [
    /^(?:git\s+filter-branch|git\s+filter-repo|bfg)\b/i,
    'History rewriting is forbidden here: the canonical history is the project record, and the publication boundary explicitly bars reusing it. Export through the allowlist instead.'
  ],
  [
    /^(?:npm|pnpm|yarn|corepack\s+pnpm)\s+publish\b/i,
    'This workspace is private and is never published to a registry.'
  ]
];

const ESCALATE = [
  [
    /^git\s+reset\b.*--hard\b/i,
    'reset --hard destroys uncommitted work. If the tree contains changes you did not make, they belong to the user or another agent.'
  ],
  [
    /^git\s+clean\b.*-\w*f/i,
    'git clean -f deletes untracked files, including another agent worktree scratch or an unstaged new file.'
  ],
  [
    /^git\s+(?:checkout|restore)\b(?!.*(?:^|\s)-b\b).*(?:\s--\s+\.|\s\.\s*$)/i,
    'This discards every uncommitted change in the tree, not only yours.'
  ],
  [
    /^git\s+stash\b/i,
    'Stashing hides changes that may belong to the user or another agent, and they are easy to lose track of.'
  ],
  [
    /^git\s+branch\s+-[dD]\b/i,
    'Deleting a branch can remove another agent unmerged work.'
  ],
  [
    /^git\s+worktree\s+(?:remove|prune)\b/i,
    'A worktree under .claude/worktrees/ is probably another session active checkout.'
  ],
  [
    /^git\s+config\s+--global\b/i,
    'This changes machine-wide Git configuration outside the repository.'
  ],
  [
    /^gh\s+pr\s+merge\b/i,
    'Merging a pull request is an outward-facing action; confirm the required checks passed on this exact commit first.'
  ],
  [
    /^rm\s+(?:-\w+\s+)*-\w*[rR]\w*f|^rm\s+(?:-\w+\s+)*-\w*f\w*[rR]/,
    'Recursive force delete. Never delete a shared pnpm store or a Playwright cache; repository-local node_modules only, and only when the user asked.'
  ],
  [
    /^Remove-Item\b.*-Recurse\b/i,
    'Recursive delete. Confirm the target is repository-local and that the user asked for it.'
  ]
];

function segments(command) {
  return command
    .split(SEPARATORS)
    .map((part) => part.trim().replace(/^[({\s]+/, ''))
    .map((part) => part.replace(LEADING_ASSIGNMENT, ''))
    .map((part) => {
      let current = part;
      for (let i = 0; i < 3 && WRAPPERS.test(current); i += 1)
        current = current.replace(WRAPPERS, '');
      return current.trim();
    })
    .filter(Boolean);
}

const GCLOUD_MUTATION_REASON =
  'Mutating gcloud commands change live cloud state. AGENTS.md requires fresh, explicit, per-commit owner authority before any cloud mutation. Hand the exact command to the owner.';

const GCLOUD_VALUE_FLAGS = new Set([
  '--project',
  '--region',
  '--location',
  '--zone',
  '--format',
  '--filter',
  '--configuration',
  '--account',
  '--impersonate-service-account',
  '--platform',
  '--limit',
  '--sort-by',
  '--member',
  '--role',
  '--image',
  '--service-account',
  '--tag',
  '--to-revisions',
  '--remove-tags',
  '--set-env-vars',
  '--set-secrets',
  '--data-file',
  '--key-file',
  '--config',
  '--substitutions',
  '--uri',
  '--http-method',
  '--attempt-deadline',
  '--audiences',
  '--oidc-service-account-email',
  '--oidc-token-audience'
]);

const GCLOUD_MUTATION_VERBS = new Set([
  'deploy',
  'delete',
  'destroy',
  'create',
  'update',
  'update-traffic',
  'set-iam-policy',
  'add-iam-policy-binding',
  'remove-iam-policy-binding',
  'enable',
  'disable',
  'pause',
  'resume',
  'submit',
  'apply',
  'import',
  'export',
  'restore',
  'patch',
  'revoke',
  'activate-service-account'
]);

function isMutatingGcloud(part) {
  const tokens = part.trim().split(/\s+/);
  if (tokens[0]?.toLowerCase() !== 'gcloud') return false;
  const positional = [];
  for (let i = 1; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token.startsWith('-')) {
      const flag = token.toLowerCase();
      if (!token.includes('=') && GCLOUD_VALUE_FLAGS.has(flag)) {
        i += 1;
      }
      continue;
    }
    positional.push(token.toLowerCase());
  }
  if (positional.some((token) => GCLOUD_MUTATION_VERBS.has(token))) {
    return true;
  }
  if (
    positional.includes('secrets') &&
    positional.includes('versions') &&
    positional.includes('add')
  ) {
    return true;
  }
  return false;
}

// Rules that need to know which branch HEAD is on. `git push origin main` is
// caught by the pattern above; these catch the forms that never name the branch
// because it is implied — which is how work lands on main by accident.
const ON_MAIN = [
  [
    /^git\s+push\b/i,
    'deny',
    'HEAD is on main, so this pushes main directly instead of opening a PR through the Verification evidence gate (D-013 requires enforce_admins=true; remote settings stay UNVERIFIED offline). Move the work to an agent/* branch.'
  ],
  [
    /^git\s+commit\b/i,
    'escalate',
    'HEAD is on main. Work belongs on an agent/* branch and reaches main through a reviewed pull request.'
  ]
];

// `branchOf` is a function, not a value, so the subprocess only runs for the
// handful of commands that actually depend on the answer.
export function classify(command, branchOf = () => null) {
  if (typeof command !== 'string' || command.trim() === '') return null;
  for (const part of segments(command)) {
    for (const [pattern, reason] of DENY)
      if (pattern.test(part)) return { decision: 'deny', reason, part };
    if (isMutatingGcloud(part)) {
      return { decision: 'deny', reason: GCLOUD_MUTATION_REASON, part };
    }
    for (const [pattern, reason] of ESCALATE)
      if (pattern.test(part)) return { decision: 'escalate', reason, part };
    for (const [pattern, decision, reason] of ON_MAIN)
      if (pattern.test(part) && branchOf() === 'main')
        return { decision, reason, part };
  }
  return null;
}

function currentBranch(cwd) {
  try {
    return execFileSync('git', ['branch', '--show-current'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch {
    return null;
  }
}

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));

  let branch;
  const branchOf = () => {
    if (branch === undefined)
      branch = currentBranch(payload?.cwd ?? process.cwd());
    return branch;
  };

  const verdict = classify(payload?.tool_input?.command, branchOf);
  if (!verdict) return;

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: verdict.decision,
        permissionDecisionReason: `[${verdict.decision === 'deny' ? 'blocked' : 'confirm'}] ${verdict.part}\n${verdict.reason}`
      }
    })
  );
}

// Same entry guard the repository's own gate scripts use, so the rule table can
// be imported and tested without touching stdin.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch {
    // Fail open: a broken guard must not block every shell command.
  }
}
