/**
 * SCM-R02: Node 安全 floor。`engines.node` 必須拒絕已知未修補的 24.14.0，
 * CI 必須釘 exact patch，不得只寫 major `24` 讓 GitHub 給當下任意 24.x。
 */

export const NODE_FLOOR = '24.20.0';
export const NODE_RANGE = `>=${NODE_FLOOR} <25`;
export const REJECTED_OLD_PATCH = '24.14.0';

function parseTriple(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (match === null) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareTriple(left, right) {
  for (const index of [0, 1, 2]) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

export function rangeAllows(range, version) {
  const match = /^>=(\d+\.\d+\.\d+) <(\d+)$/.exec(range.trim());
  const parsed = parseTriple(version);
  if (match === null || parsed === null) return false;
  if (parsed[0] >= Number(match[2])) return false;
  const min = parseTriple(match[1]);
  return min !== null && compareTriple(parsed, min) >= 0;
}

export function reviewNodeEngine({ enginesNode, workflowText }) {
  const errors = [];
  if (enginesNode !== NODE_RANGE)
    errors.push(`package.json engines.node must be exactly "${NODE_RANGE}"`);
  if (rangeAllows(enginesNode ?? '', REJECTED_OLD_PATCH))
    errors.push(
      `${REJECTED_OLD_PATCH} must stay outside engines.node (unpatched floor)`
    );
  if (!rangeAllows(enginesNode ?? '', NODE_FLOOR))
    errors.push(`${NODE_FLOOR} must stay inside engines.node`);

  const pins = [...workflowText.matchAll(/^\s+node-version:\s*(.+)$/gm)].map(
    (entry) => entry[1].trim().replace(/['"]/g, '')
  );
  if (pins.length === 0)
    errors.push('verify.yml has no node-version pins to review');
  for (const pin of pins) {
    if (pin !== NODE_FLOOR)
      errors.push(
        `verify.yml node-version "${pin}" must be exact ${NODE_FLOOR}, not a floating major`
      );
  }
  return errors;
}
