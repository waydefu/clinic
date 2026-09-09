/**
 * SCM-R02 / RUNTIME-001: Node 安全 floor。`engines.node` 必須拒絕已知未修補的
 * 24.14.0，CI 必須釘 exact patch，repository 內的 api/worker 映像與 .cursor
 * 安裝配方也不得低於該 floor。
 */

export const NODE_FLOOR = '24.20.0';
export const NODE_RANGE = `>=${NODE_FLOOR} <25`;
export const NODE_IMAGE_TAG = `${NODE_FLOOR}-bookworm-slim`;
export const REJECTED_OLD_PATCH = '24.14.0';
export const REJECTED_CURSOR_PATCH = '24.18.0';

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

function reviewDockerfileImages(dockerfileTexts, errors) {
  for (const [path, text] of Object.entries(dockerfileTexts)) {
    const tags = [...text.matchAll(/^FROM\s+node:(\S+)/gm)].map(
      (entry) => entry[1]
    );
    if (tags.length === 0)
      errors.push(`${path} has no FROM node: image to review`);
    for (const tag of tags) {
      if (tag !== NODE_IMAGE_TAG)
        errors.push(`${path} FROM node:${tag} must be node:${NODE_IMAGE_TAG}`);
    }
  }
}

function reviewCursorRecipes(cursorInstallText, cursorEnvironmentText, errors) {
  if (cursorInstallText.length > 0) {
    const installMatch = /NODE_VERSION="([^"]+)"/.exec(cursorInstallText);
    if (installMatch?.[1] !== NODE_FLOOR)
      errors.push(`.cursor/install.sh NODE_VERSION must be "${NODE_FLOOR}"`);
    if (cursorInstallText.includes(`>=${REJECTED_OLD_PATCH}`))
      errors.push(
        `.cursor/install.sh must not document the unpatched >=${REJECTED_OLD_PATCH} floor`
      );
  }

  if (cursorEnvironmentText.length > 0) {
    const pathPins = [
      ...cursorEnvironmentText.matchAll(/node\/v(\d+\.\d+\.\d+)\//g)
    ].map((entry) => entry[1]);
    if (pathPins.length === 0)
      errors.push('.cursor/environment.json has no Node PATH pin to review');
    for (const pin of pathPins) {
      if (pin !== NODE_FLOOR)
        errors.push(
          `.cursor/environment.json PATH node v${pin} must be v${NODE_FLOOR}`
        );
    }
  }
}

export function reviewNodeEngine({
  enginesNode,
  workflowText,
  dockerfileTexts = {},
  cursorInstallText = '',
  cursorEnvironmentText = ''
}) {
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

  reviewDockerfileImages(dockerfileTexts, errors);
  reviewCursorRecipes(cursorInstallText, cursorEnvironmentText, errors);
  return errors;
}
