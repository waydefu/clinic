import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectId = 'beauessence-appointment-local';
const cleanupScript = fileURLToPath(
  new URL('./cleanup-local-firestore-emulator.ps1', import.meta.url)
);
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

function cleanupWindowsEmulator() {
  if (process.platform !== 'win32') return;

  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', cleanupScript],
    { stdio: 'inherit' }
  );

  if (result.status !== 0) {
    throw new Error('Unable to clean up the local Firestore Emulator.');
  }
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.once('error', reject);
    child.once('close', (code) => resolve(code ?? 1));
  });
}

function runPnpm(args) {
  const npmExecPath = process.env['npm_execpath'];
  if (npmExecPath !== undefined) {
    return run(process.execPath, [npmExecPath, ...args]);
  }

  // A .cmd file cannot be spawned directly by Node on Windows. The fallback is
  // for developers invoking this script outside a package-manager lifecycle.
  return new Promise((resolve, reject) => {
    const child = spawn(pnpmCommand, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32'
    });
    child.once('error', reject);
    child.once('close', (code) => resolve(code ?? 1));
  });
}

// 預設為失敗。這不是多餘的賦值：這個腳本是 CI 的閘門，任何未預期的路徑都
// 必須以非零結束，絕不能因為漏掉賦值而被誤判為通過。
// eslint-disable-next-line no-useless-assignment
let exitCode = 1;
try {
  // Firebase CLI can leave its Java child behind on Windows after a failed
  // emulator command. The cleanup script only targets this fake project ID.
  cleanupWindowsEmulator();
  exitCode = await runPnpm([
    'exec',
    'firebase',
    'emulators:exec',
    '--project',
    projectId,
    '--only',
    'firestore',
    'node scripts/run-firestore-vitest.mjs'
  ]);
} finally {
  cleanupWindowsEmulator();
}

process.exitCode = exitCode;
