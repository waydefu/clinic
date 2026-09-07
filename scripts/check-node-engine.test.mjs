import { describe, expect, it } from 'vitest';
import {
  NODE_FLOOR,
  NODE_RANGE,
  REJECTED_OLD_PATCH,
  rangeAllows,
  reviewNodeEngine
} from './check-node-engine.mjs';

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
        workflowText: `          node-version: ${NODE_FLOOR}\n`
      })
    ).toEqual([]);
  });
});
