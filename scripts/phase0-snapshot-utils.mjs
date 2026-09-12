export function parseFirebaseLoginAccount(output) {
  const match = output.match(/^\s*Logged in as\s+([^\s]+@[^\s]+)\s*$/m);
  return match ? match[1] : '';
}

export function redactAccount(value) {
  const at = value.indexOf('@');
  return at === -1 ? value : `domain=${value.slice(at + 1)}`;
}
