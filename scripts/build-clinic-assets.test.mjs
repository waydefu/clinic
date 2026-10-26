import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  failure: undefined,
  closeCount: 0,
  sources: new Map(),
  writes: new Map(),
  outputs: [],
  marker: new Error('Synthetic source read failure')
}));

vi.mock('node:fs', () => ({
  mkdirSync: vi.fn(),
  readFileSync: vi.fn((path) => {
    if (state.failure === 'read') throw state.marker;
    const normalized = String(path).replaceAll('\\', '/');
    if (!normalized.includes('/apps/web/clinic-source/')) {
      throw new Error(`Unexpected filesystem read: ${normalized}`);
    }
    const filename = normalized.split('/').at(-1);
    const bytes = Buffer.from(`synthetic source: ${filename}`);
    state.sources.set(filename, bytes);
    return bytes;
  }),
  writeFileSync: vi.fn((path, value) => {
    state.writes.set(String(path).replaceAll('\\', '/'), Buffer.from(value));
  })
}));

vi.mock('@playwright/test', () => ({
  chromium: {
    launch: vi.fn(async () => ({
      newPage: vi.fn(async () => ({
        goto: vi.fn(async () => {}),
        evaluate: vi.fn(async (_callback, args) => {
          const bytes = Buffer.from(`synthetic output ${state.outputs.length}`);
          state.outputs.push(bytes);
          const mime = state.failure === 'format' ? 'image/png' : 'image/webp';
          return {
            dataUrl: `data:${mime};base64,${bytes.toString('base64')}`,
            width: args.targetWidth,
            height: args.targetAspect
              ? Math.round(args.targetWidth / args.targetAspect)
              : args.targetWidth,
            discardRatio: 0,
            trimmed: { width: 100, height: 100 },
            box: { x: 0, y: 0, width: 100, height: 100 }
          };
        })
      })),
      close: vi.fn(async () => {
        state.closeCount += 1;
      })
    }))
  }
}));

import { main } from './build-clinic-assets.mjs';

// The checked-in manifest and generator preserve the same licence records in different orders.
const sortLicences = (licences) =>
  [...licences].sort((left, right) =>
    left.files.join('|').localeCompare(right.files.join('|'))
  );

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

beforeEach(() => {
  state.failure = undefined;
  state.closeCount = 0;
  state.sources.clear();
  state.writes.clear();
  state.outputs.length = 0;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('clinic asset generator with synthetic I/O', () => {
  it('records source/output bytes and hashes while preserving existing licence declarations', async () => {
    await main();

    const manifestPath = [...state.writes.keys()].find((path) =>
      path.endsWith('/apps/web/clinic-assets.manifest.json')
    );
    expect(manifestPath).toBeDefined();
    const manifest = JSON.parse(state.writes.get(manifestPath).toString());
    const { readFileSync } = await vi.importActual('node:fs');
    const original = JSON.parse(
      readFileSync(
        new URL('../apps/web/clinic-assets.manifest.json', import.meta.url),
        'utf8'
      )
    );

    expect(manifest.origin).toBe(original.origin);
    expect(manifest.licenceStatus).toBe(original.licenceStatus);
    expect(manifest.licence).toEqual(original.licence);
    expect(sortLicences(manifest.additionalLicences)).toEqual(
      sortLicences(original.additionalLicences)
    );
    expect(state.closeCount).toBe(1);
    expect(manifest.assets).toHaveLength(state.sources.size);
    expect(state.writes.size).toBe(manifest.assets.length + 1);

    for (const [index, asset] of manifest.assets.entries()) {
      const sourceName = asset.source.file.split('/').at(-1);
      const source = state.sources.get(sourceName);
      const outputPath = [...state.writes.keys()].find((path) =>
        path.endsWith(asset.output)
      );
      const output = state.writes.get(outputPath);

      expect(source).toBeDefined();
      expect(asset.source.bytes).toBe(source.length);
      expect(asset.source.sha256).toBe(sha256(source));
      expect(output).toEqual(state.outputs[index]);
      expect(asset.bytes).toBe(output.length);
      expect(asset.sha256).toBe(sha256(output));
    }

    expect(manifest.totals).toEqual({
      sourceBytes: manifest.assets.reduce(
        (total, asset) => total + asset.source.bytes,
        0
      ),
      outputBytes: manifest.assets.reduce(
        (total, asset) => total + asset.bytes,
        0
      )
    });
  });

  it('rejects a non-WebP result before writing and still closes the browser', async () => {
    state.failure = 'format';

    await expect(main()).rejects.toThrow(/瀏覽器沒有輸出 WebP/);

    expect(state.closeCount).toBe(1);
    expect(state.writes.size).toBe(0);
  });

  it('rejects source read errors without writing a manifest and still closes', async () => {
    state.failure = 'read';

    await expect(main()).rejects.toBe(state.marker);

    expect(state.closeCount).toBe(1);
    expect(state.writes.size).toBe(0);
  });
});
