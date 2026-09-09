import { describe, expect, it } from 'vitest';
import {
  NODE_FLOOR,
  NODE_IMAGE_TAG,
  NODE_RANGE,
  REJECTED_CURSOR_PATCH,
  REJECTED_OLD_PATCH,
  rangeAllows,
  reviewNodeEngine
} from './check-node-engine.mjs';

const pinnedWorkflow = `          node-version: ${NODE_FLOOR}\n`;
const pinnedDockerfiles = {
  'containers/api.Dockerfile': `FROM node:${NODE_IMAGE_TAG} AS build\nFROM node:${NODE_IMAGE_TAG}\n`,
  'containers/worker.Dockerfile': `FROM node:${NODE_IMAGE_TAG} AS build\nFROM node:${NODE_IMAGE_TAG}\n`
};
const pinnedInstall = `NODE_VERSION="${NODE_FLOOR}"\n# Node ${NODE_RANGE}\n`;
const pinnedEnvironment = `export PATH="$HOME/.nvm/versions/node/v${NODE_FLOOR}/bin:$PATH"\n`;

describe('Node engine floor', () => {
  it('rejects the unpatched 24.14.0 floor and accepts the current patch', () => {
    expect(rangeAllows(NODE_RANGE, REJECTED_OLD_PATCH)).toBe(false);
    expect(rangeAllows(NODE_RANGE, NODE_FLOOR)).toBe(true);
    expect(rangeAllows(NODE_RANGE, '25.0.0')).toBe(false);
  });

  it('fails a floating CI major and an engines range that still admits 24.14.0', () => {
    expect(
      reviewNodeEngine({
        enginesNode: '>=24.14.0 <25',
        workflowText: '          node-version: 24\n'
      })
    ).toEqual(
      expect.arrayContaining([
        `package.json engines.node must be exactly "${NODE_RANGE}"`,
        `${REJECTED_OLD_PATCH} must stay outside engines.node (unpatched floor)`,
        `verify.yml node-version "24" must be exact ${NODE_FLOOR}, not a floating major`
      ])
    );
  });

  it('accepts the pinned floor', () => {
    expect(
      reviewNodeEngine({
        enginesNode: NODE_RANGE,
        workflowText: pinnedWorkflow
      })
    ).toEqual([]);
  });

  it('fails Dockerfiles and .cursor recipes below the floor', () => {
    expect(
      reviewNodeEngine({
        enginesNode: NODE_RANGE,
        workflowText: pinnedWorkflow,
        dockerfileTexts: {
          'containers/api.Dockerfile': `FROM node:${REJECTED_OLD_PATCH}-bookworm-slim\n`,
          'containers/worker.Dockerfile': `FROM node:${REJECTED_OLD_PATCH}-bookworm-slim AS build\nFROM node:${REJECTED_OLD_PATCH}-bookworm-slim\n`
        },
        cursorInstallText: `NODE_VERSION="${REJECTED_CURSOR_PATCH}"\n# >=${REJECTED_OLD_PATCH} <25\n`,
        cursorEnvironmentText: `export PATH="$HOME/.nvm/versions/node/v${REJECTED_CURSOR_PATCH}/bin:$PATH"\n`
      })
    ).toEqual(
      expect.arrayContaining([
        `containers/api.Dockerfile FROM node:${REJECTED_OLD_PATCH}-bookworm-slim must be node:${NODE_IMAGE_TAG}`,
        `containers/worker.Dockerfile FROM node:${REJECTED_OLD_PATCH}-bookworm-slim must be node:${NODE_IMAGE_TAG}`,
        `.cursor/install.sh NODE_VERSION must be "${NODE_FLOOR}"`,
        `.cursor/install.sh must not document the unpatched >=${REJECTED_OLD_PATCH} floor`,
        `.cursor/environment.json PATH node v${REJECTED_CURSOR_PATCH} must be v${NODE_FLOOR}`
      ])
    );
  });

  it('accepts Dockerfiles and .cursor recipes pinned to the floor', () => {
    expect(
      reviewNodeEngine({
        enginesNode: NODE_RANGE,
        workflowText: pinnedWorkflow,
        dockerfileTexts: pinnedDockerfiles,
        cursorInstallText: pinnedInstall,
        cursorEnvironmentText: pinnedEnvironment
      })
    ).toEqual([]);
  });
});
