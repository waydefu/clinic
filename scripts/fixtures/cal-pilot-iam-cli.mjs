// Synthetic native CLI fixture. It never imports or invokes a cloud SDK.
import { readFileSync, writeFileSync } from 'node:fs';

const [path, ...args] = process.argv.slice(2);
const state = JSON.parse(readFileSync(path, 'utf8'));
if (state.synthetic !== true) throw new Error('Synthetic IAM state required.');
const service = args[3];
if (args[0] !== 'run' || args[1] !== 'services' || !state.policies[service]) {
  throw new Error('Unexpected synthetic IAM operation.');
}
const policy = state.policies[service];
const save = () => writeFileSync(path, JSON.stringify(state));
const fail = () => {
  save();
  console.error('Synthetic native IAM failure.');
  process.exitCode = 1;
};
const hasMember = (value) =>
  value.bindings.some(
    (binding) =>
      binding.role === 'roles/run.invoker' &&
      !binding.condition &&
      binding.members.includes(state.member)
  );
if (args[2] === 'get-iam-policy') {
  state.calls.push({ service, kind: 'get' });
  if (state.fail === `${service}:get`) fail();
  else {
    save();
    console.log(JSON.stringify(policy));
  }
} else if (args[2] === 'set-iam-policy') {
  const proposed = JSON.parse(readFileSync(args[4], 'utf8'));
  const kind = hasMember(proposed) ? 'grant' : 'restore';
  state.calls.push({ service, kind });
  if (state.race === service && kind === 'grant') {
    policy.bindings[0].members.push(state.member);
    policy.etag = `synthetic-${++state.revision}`;
  }
  if (state.drift === service && kind === 'restore') {
    policy.bindings.push({
      role: 'roles/run.invoker',
      members: ['serviceAccount:synthetic-concurrent@example.invalid']
    });
    policy.etag = `synthetic-${++state.revision}`;
  }
  if (proposed.etag !== policy.etag || state.fail === `${service}:${kind}`) {
    fail();
  } else {
    proposed.etag = `synthetic-${++state.revision}`;
    state.policies[service] = proposed;
    if (state.lostReply === service && kind === 'grant') fail();
    else {
      save();
      console.log(JSON.stringify(proposed));
    }
  }
} else {
  throw new Error('Unexpected synthetic IAM command.');
}
