import { EventEmitter, once } from 'node:events';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

function dependencyChain(names) {
  let requireFromParent = createRequire(import.meta.url);
  const packages = [];
  for (const name of names) {
    const manifestPath = requireFromParent.resolve(`${name}/package.json`);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    packages.push({ name, version: manifest.version });
    requireFromParent = createRequire(manifestPath);
  }
  return { packages, module: requireFromParent(names.at(-1)) };
}

const firebaseRequire = createRequire(
  createRequire(import.meta.url).resolve('firebase-tools/package.json')
);
const semver = firebaseRequire('semver');
const proxyChain = ['firebase-tools', 'express', 'proxy-addr'];
const mapChain = ['vitest', 'vite', 'postcss', 'source-map-js'];
const compressionChain = ['firebase-tools', 'superstatic', 'compression'];

// A bounded response seam uses the installed middleware and real native zlib;
// it neither starts Firebase nor reads credentials or actual application data.
function syntheticResponse() {
  const response = new EventEmitter();
  const headers = new Map([['content-type', 'text/plain']]);
  response.statusCode = 200;
  response.headersSent = false;
  response.chunks = [];
  response.getHeader = (name) => headers.get(name.toLowerCase());
  response.setHeader = (name, value) => headers.set(name.toLowerCase(), value);
  response.removeHeader = (name) => headers.delete(name.toLowerCase());
  response.writeHead = () => {
    response.headersSent = true;
    return response;
  };
  response.write = (chunk) => {
    response.chunks.push(Buffer.from(chunk));
    return true;
  };
  response.end = (chunk) => {
    if (chunk) response.chunks.push(Buffer.from(chunk));
    response.emit('finish');
    return response;
  };
  return response;
}

function compressionFixture() {
  const { module: compression } = dependencyChain(compressionChain);
  const zlib = firebaseRequire('node:zlib');
  const createGzip = zlib.createGzip;
  const streams = [];
  vi.spyOn(zlib, 'createGzip').mockImplementation((...args) => {
    const stream = createGzip(...args);
    streams.push(stream);
    return stream;
  });
  const response = syntheticResponse();
  compression({ threshold: 0 })(
    { method: 'GET', headers: { 'accept-encoding': 'gzip' } },
    response,
    () => {}
  );
  return {
    response,
    streams,
    zlib,
    close() {
      for (const stream of streams) stream.destroy();
    }
  };
}

afterEach(() => vi.restoreAllMocks());

describe('development-tool advisory patches', () => {
  it.each([
    [proxyChain, '2.0.8'],
    [mapChain, '1.2.2'],
    [compressionChain, '1.8.2']
  ])('resolves patched %j through its real parent chain', (chain, floor) => {
    const { packages } = dependencyChain(chain);
    const resolved = packages.at(-1).version;
    expect(
      semver.satisfies(
        resolved,
        `>=${floor} <${Number(floor.split('.')[0]) + 1}.0.0`
      ),
      packages.map(({ name, version }) => `${name}@${version}`).join(' > ')
    ).toBe(true);
  });

  it.each(['::ffff:192.0.2.0/24', '::/1'])(
    'does not trust IPv4 peers through unsafe IPv6 subnet %s',
    (subnet) => {
      const { module: proxyaddr } = dependencyChain(proxyChain);
      // Cover both the single-subnet and multi-subnet upstream paths.
      for (const subnets of [[subnet], [subnet, '127.0.0.1/8']]) {
        const trust = proxyaddr.compile(subnets);
        expect(trust('198.51.100.42')).toBe(false);
        expect(trust('::ffff:198.51.100.42')).toBe(false);
        expect(
          proxyaddr(
            {
              socket: { remoteAddress: '198.51.100.42' },
              headers: { 'x-forwarded-for': '192.0.2.99' }
            },
            trust
          )
        ).toBe('198.51.100.42');
      }
    }
  );

  it('preserves valid IPv4, mapped IPv6 and native IPv6 trust ranges', () => {
    const { module: proxyaddr } = dependencyChain(proxyChain);
    for (const subnet of ['192.0.2.0/24', '::ffff:192.0.2.0/120']) {
      const trust = proxyaddr.compile(subnet);
      expect(trust('192.0.2.42')).toBe(true);
      expect(trust('::ffff:192.0.2.42')).toBe(true);
      expect(trust('198.51.100.42')).toBe(false);
      expect(trust('2001:db8::42')).toBe(false);
    }
    const native = proxyaddr.compile('2001:db8::/32');
    expect(native('2001:db8::42')).toBe(true);
    expect(native('2001:db9::42')).toBe(false);
    expect(native('192.0.2.42')).toBe(false);
  });

  it.each([
    { line: 10_000_001, column: 0 },
    { line: 0.5, column: 0 },
    { line: Number.POSITIVE_INFINITY, column: 0 },
    { line: Number.NaN, column: 0 },
    { line: 0, column: -1 },
    { line: 0, column: 0.5 },
    { line: 0, column: Number.MAX_SAFE_INTEGER + 1 }
  ])(
    'rejects invalid indexed map offset %j before generating mappings',
    (offset) => {
      const { module: sourceMap } = dependencyChain(mapChain);
      // Constructor only: never serialize a giant map or run the blocking loop.
      expect(
        () =>
          new sourceMap.SourceMapConsumer({
            version: 3,
            sections: [
              {
                offset,
                map: { version: 3, sources: [], names: [], mappings: '' }
              }
            ]
          })
      ).toThrow(/Section offset/);
    }
  );

  it('bounds the sum of nested indexed offsets', () => {
    const { module: sourceMap } = dependencyChain(mapChain);
    expect(
      () =>
        new sourceMap.SourceMapConsumer({
          version: 3,
          sections: [
            {
              offset: { line: 6_000_000, column: 0 },
              map: {
                version: 3,
                sections: [
                  {
                    offset: { line: 5_000_000, column: 0 },
                    map: { version: 3, sources: [], names: [], mappings: '' }
                  }
                ]
              }
            }
          ]
        })
    ).toThrow(/including offsets of nested sections/);
  });

  it('round-trips a bounded source map and accepts a normal indexed section', () => {
    const { module: sourceMap } = dependencyChain(mapChain);
    const generator = new sourceMap.SourceMapGenerator({
      file: 'synthetic.js'
    });
    generator.addMapping({
      generated: { line: 1, column: 0 },
      original: { line: 1, column: 0 },
      source: 'synthetic.ts'
    });
    const consumer = new sourceMap.SourceMapConsumer(generator.toJSON());
    expect(consumer.originalPositionFor({ line: 1, column: 0 })).toMatchObject({
      source: 'synthetic.ts',
      line: 1,
      column: 0
    });
    const indexed = new sourceMap.SourceMapConsumer({
      version: 3,
      sections: [{ offset: { line: 2, column: 0 }, map: generator.toJSON() }]
    });
    const mappings = [];
    indexed.eachMapping((mapping) => mappings.push(mapping));
    expect(mappings).toHaveLength(1);
    expect(mappings[0]).toMatchObject({
      generatedLine: 3,
      source: 'synthetic.ts'
    });
  });

  it('destroys a live compression stream when the response aborts', async () => {
    const fixture = compressionFixture();
    try {
      fixture.response.write('bounded synthetic response');
      expect(fixture.streams).toHaveLength(1);
      const [stream] = fixture.streams;
      expect(stream.destroyed).toBe(false);
      const closed = once(stream, 'close');
      fixture.response.emit('close');
      expect(stream.destroyed).toBe(true);
      await closed;
      expect(stream.closed).toBe(true);
    } finally {
      fixture.close();
    }
  });

  it('destroys a stream created after the response already closed', () => {
    const fixture = compressionFixture();
    try {
      fixture.response.emit('close');
      fixture.response.write('bounded synthetic response');
      expect(fixture.streams).toHaveLength(1);
      expect(fixture.streams[0].destroyed).toBe(true);
    } finally {
      fixture.close();
    }
  });

  it('still completes and decompresses a normal gzip response', async () => {
    const fixture = compressionFixture();
    try {
      const finished = once(fixture.response, 'finish');
      fixture.response.end('bounded synthetic response');
      await finished;
      expect(fixture.response.getHeader('Content-Encoding')).toBe('gzip');
      expect(
        fixture.zlib
          .gunzipSync(Buffer.concat(fixture.response.chunks))
          .toString('utf8')
      ).toBe('bounded synthetic response');
    } finally {
      fixture.close();
    }
  });
});
