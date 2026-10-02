import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { describe, expect, it } from 'vitest';

function firebaseFtpDependencies() {
  let requireFromParent = createRequire(import.meta.url);
  const packages = [];
  for (const name of [
    'firebase-tools',
    'proxy-agent',
    'pac-proxy-agent',
    'get-uri',
    'basic-ftp'
  ]) {
    const manifestPath = requireFromParent.resolve(`${name}/package.json`);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    packages.push({ name, version: manifest.version, manifestPath });
    requireFromParent = createRequire(manifestPath);
  }
  const firebaseRequire = createRequire(packages[0].manifestPath);
  const getUriRequire = createRequire(packages[3].manifestPath);
  return {
    packages,
    semver: firebaseRequire('semver'),
    getUri: getUriRequire('get-uri').getUri
  };
}

async function syntheticFtpServer() {
  const content = 'function FindProxyForURL() { return "DIRECT"; }\n';
  const modifiedAt = '2020-01-01T00:00:00.000Z';
  const commands = [];
  const errors = [];
  const sockets = new Set();
  const servers = new Set();

  function trackSocket(socket) {
    sockets.add(socket);
    socket.on('error', (error) => errors.push(error));
    socket.once('close', () => sockets.delete(socket));
    return socket;
  }

  async function listen(server) {
    servers.add(server);
    const listening = once(server, 'listening');
    server.listen(0, '127.0.0.1');
    await listening;
    return server.address().port;
  }

  const controlServer = createServer((connected) => {
    const control = trackSocket(connected);
    control.setEncoding('utf8');
    control.write('220 Synthetic FTP fixture\r\n');
    let buffer = '';
    let pending = Promise.resolve();
    let passiveConnection;

    async function respond(line) {
      const [command] = line.split(' ');
      commands.push(command);
      if (command === 'USER') control.write('331 Password required\r\n');
      else if (command === 'PASS') control.write('230 Logged in\r\n');
      else if (command === 'FEAT') {
        control.write(
          '211-Features\r\n MLST type*;size*;modify*;\r\n211 End\r\n'
        );
      } else if (command === 'MDTM') {
        // Exercise get-uri's directory-listing fallback as well as retrieval.
        control.write('502 MDTM unavailable\r\n');
      } else if (command === 'EPSV') {
        let connected;
        passiveConnection = new Promise((resolve) => {
          connected = resolve;
        });
        const passiveServer = createServer((socket) => {
          connected(trackSocket(socket));
        });
        const port = await listen(passiveServer);
        control.write(`229 Entering Extended Passive Mode (|||${port}|)\r\n`);
      } else if (command === 'MLSD' || command === 'RETR') {
        control.write('150 Opening data connection\r\n');
        const data = await passiveConnection;
        const body =
          command === 'MLSD'
            ? `type=file;size=${Buffer.byteLength(content)};modify=20200101000000; synthetic.pac\r\n`
            : content;
        data.end(body, () => {
          if (!control.destroyed) control.write('226 Transfer complete\r\n');
        });
      } else if (
        command === 'TYPE' ||
        command === 'STRU' ||
        command === 'OPTS'
      ) {
        control.write('200 Command accepted\r\n');
      } else if (command === 'QUIT') {
        control.end('221 Goodbye\r\n');
      } else {
        control.write('502 Command unsupported\r\n');
      }
    }

    control.on('data', (chunk) => {
      buffer += chunk;
      let end;
      while ((end = buffer.indexOf('\r\n')) !== -1) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        pending = pending
          .then(() => respond(line))
          .catch((error) => {
            errors.push(error);
            control.destroy();
          });
      }
    });
  });

  const port = await listen(controlServer);
  return {
    url: `ftp://127.0.0.1:${port}/synthetic.pac`,
    content,
    modifiedAt,
    commands,
    errors,
    async close() {
      for (const socket of sockets) socket.destroy();
      await Promise.all(
        [...servers].map(
          (server) =>
            new Promise((resolve, reject) => {
              server.close((error) => (error ? reject(error) : resolve()));
            })
        )
      );
    }
  };
}

describe('Firebase CLI FTP dependency compatibility', () => {
  it('resolves a version patched for GHSA-c475-qrg2-pj4r through the real CLI chain', () => {
    const { packages, semver } = firebaseFtpDependencies();
    const basicFtp = packages.at(-1);
    expect(
      semver.gte(basicFtp.version, '6.2.1'),
      packages.map(({ name, version }) => `${name}@${version}`).join(' > ')
    ).toBe(true);
  });

  it('retrieves a loopback PAC file through get-uri listing fallback and honours cache', async () => {
    const { getUri } = firebaseFtpDependencies();
    const fixture = await syntheticFtpServer();
    let stream;
    try {
      stream = await getUri(fixture.url);
      const chunks = [];
      for await (const chunk of stream) chunks.push(Buffer.from(chunk));
      expect(Buffer.concat(chunks).toString('utf8')).toBe(fixture.content);
      expect(stream.lastModified.toISOString()).toBe(fixture.modifiedAt);
      expect(fixture.commands).toEqual(
        expect.arrayContaining(['MDTM', 'MLSD', 'RETR'])
      );

      const downloads = fixture.commands.filter(
        (command) => command === 'RETR'
      );
      await expect(
        getUri(fixture.url, { cache: stream })
      ).rejects.toMatchObject({
        code: 'ENOTMODIFIED'
      });
      expect(fixture.commands.filter((command) => command === 'RETR')).toEqual(
        downloads
      );
      expect(fixture.errors).toEqual([]);
    } finally {
      stream?.destroy();
      await fixture.close();
    }
  });
});
