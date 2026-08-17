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
    'waydefu/clinic must never become public. The public mirror is a separately curated, allowlist-exported repository with its own history — see the publication boundary in AGENTS.md.'
  ],
  [
    /^git\s+push\b(?=.*(?:\s|:)main(?:\s|$))/i,
    'Direct pushes to main bypass the Verification evidence gate — branch protection here keeps the administrator bypass enabled, so it will succeed. Push an agent/* branch and open a pull request.'
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

// Rules that need to know which branch HEAD is on. `git push origin main` is
// caught by the pattern above; these catch the forms that never name the branch
// because it is implied — which is how work lands on main by accident.
const ON_MAIN = [
  [
    /^git\s+push\b/i,
    'deny',
    'HEAD is on main, so this pushes main. That bypasses the Verification evidence gate, and the administrator bypass means branch protection will let it through. Move the work to an agent/* branch.'
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
