import { describe, expect, it } from 'vitest';

// @ts-expect-error — the build script is plain ESM with no type declarations.
import { planHashedBuild } from '../../../scripts/build-web.mjs';

type Files = Map<string, string>;

// 一個縮小但形狀完整的 public/：HTML 進入點、CSS、一條 leaf ← 中間 ← 進入點
// 的模組鏈，外加一張不雜湊的圖片。
function sampleFiles(): Files {
  return new Map<string, string>([
    [
      'index.html',
      '<link rel="stylesheet" href="/styles.css" />' +
        '<link rel="icon" href="/favicon.svg" />' +
        '<a href="/patient.html">x</a><a href="#top">y</a>' +
        '<script type="module" src="/app.js"></script>'
    ],
    ['styles.css', ':root{color:green}'],
    ['app.js', "import { greet } from './modules/greet.js';\ngreet();\n"],
    [
      'modules/greet.js',
      "import { NAME } from './name.js';\nexport const greet = () => NAME;\n"
    ],
    ['modules/name.js', "export const NAME = 'clinic';\n"],
    ['favicon.svg', '<svg></svg>']
  ]);
}

const HASH = /\.[0-9a-f]{10}\.(?:js|css)$/;

describe('planHashedBuild', () => {
  it('content-hashes every js and css asset and leaves html and images alone', () => {
    const { outputs, manifest } = planHashedBuild(sampleFiles());

    for (const source of [
      'styles.css',
      'app.js',
      'modules/greet.js',
      'modules/name.js'
    ])
      expect(manifest.get(source)).toMatch(HASH);
    // Entry points and non-hashable assets keep their stable path.
    expect(manifest.get('index.html')).toBe('index.html');
    expect(manifest.get('favicon.svg')).toBe('favicon.svg');
    expect([...outputs.keys()]).toContain('index.html');
  });

  it('rewrites each relative import to its dependency hashed name', () => {
    const { outputs, manifest } = planHashedBuild(sampleFiles());

    const appOut = manifest.get('app.js')!;
    const greetOut = manifest.get('modules/greet.js')!;
    const nameOut = manifest.get('modules/name.js')!;
    const greetBasename = greetOut.split('/').pop();
    const nameBasename = nameOut.split('/').pop();

    // Each rewritten specifier keeps the relative prefix and only the basename
    // gains the hash: app → ./modules/greet, greet → ./name (same directory).
    expect(outputs.get(appOut)).toContain(`from './modules/${greetBasename}'`);
    expect(outputs.get(greetOut)).toContain(`from './${nameBasename}'`);
    // And every rewritten target is a file the build actually emitted.
    expect(outputs.has(greetOut)).toBe(true);
    expect(outputs.has(nameOut)).toBe(true);
  });

  it('rewrites the html entry references and keeps other links untouched', () => {
    const { outputs, manifest } = planHashedBuild(sampleFiles());
    const html = outputs.get('index.html') as string;

    expect(html).toContain(`href="/${manifest.get('styles.css')}"`);
    expect(html).toContain(`src="/${manifest.get('app.js')}"`);
    // Image, internal html link and anchor are not touched.
    expect(html).toContain('href="/favicon.svg"');
    expect(html).toContain('href="/patient.html"');
    expect(html).toContain('href="#top"');
  });

  it('is deterministic across runs', () => {
    expect([...planHashedBuild(sampleFiles()).manifest]).toEqual([
      ...planHashedBuild(sampleFiles()).manifest
    ]);
  });

  // 快取正確性的核心：改一個 leaf，依賴它的每一層雜湊都要跟著變，否則舊快取
  // 會繼續回舊內容。
  it('cascades a leaf change up through every dependent hash', () => {
    const before = planHashedBuild(sampleFiles()).manifest;
    const changed = sampleFiles();
    changed.set('modules/name.js', "export const NAME = 'renamed';\n");
    const after = planHashedBuild(changed).manifest;

    for (const dependent of ['modules/name.js', 'modules/greet.js', 'app.js'])
      expect(after.get(dependent)).not.toBe(before.get(dependent));
    // An asset with no path to the change keeps its hash.
    expect(after.get('styles.css')).toBe(before.get('styles.css'));
  });

  // ES modules allow import cycles (the vendored domain has one). Cyclic files
  // cannot be hashed independently, so they share one hash and bust together —
  // correct, because changing either changes what the other resolves.
  it('hashes a cyclic pair as one unit that resolves to each other', () => {
    const cyclic = new Map<string, string>([
      ['a.js', "import './b.js';\nexport const A = 1;\n"],
      ['b.js', "import './a.js';\nexport const B = 2;\n"]
    ]);
    const { outputs, manifest } = planHashedBuild(cyclic);

    const aOut = manifest.get('a.js')!;
    const bOut = manifest.get('b.js')!;
    // Same shared hash suffix.
    expect(aOut.replace('a.', '')).toBe(bOut.replace('b.', ''));
    // Each rewritten import points at the other emitted file.
    expect(outputs.get(aOut)).toContain(`'./${bOut}'`);
    expect(outputs.get(bOut)).toContain(`'./${aOut}'`);
    expect(outputs.has(aOut)).toBe(true);
    expect(outputs.has(bOut)).toBe(true);

    // Changing one member re-hashes both, since the cycle busts as a unit.
    const changed = new Map(cyclic);
    changed.set('a.js', "import './b.js';\nexport const A = 99;\n");
    const after = planHashedBuild(changed).manifest;
    expect(after.get('a.js')).not.toBe(aOut);
    expect(after.get('b.js')).not.toBe(bOut);
  });
});
