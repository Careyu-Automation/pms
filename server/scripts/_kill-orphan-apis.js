const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const net = require('net');

const pidFile = path.join(__dirname, '..', 'logs', 'dev-api.pid');

function killPid(pid) {
  const id = Number(pid);
  if (!Number.isInteger(id) || id <= 0) return;
  try {
    execSync(`taskkill /PID ${id} /F`, { stdio: 'ignore', windowsHide: true });
    console.log('killed', id);
  } catch {
    console.log('skip', id);
  }
}

if (fs.existsSync(pidFile)) {
  killPid(fs.readFileSync(pidFile, 'utf8').trim());
  try { fs.unlinkSync(pidFile); } catch { /* */ }
}

try {
  const raw = execSync(
    'powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name=\'node.exe\'\\" | Where-Object { $_.CommandLine -match \'server\\.js\' } | ForEach-Object { $_.ProcessId }"',
    { encoding: 'utf8', windowsHide: true },
  );
  for (const line of raw.split(/\r?\n/)) killPid(line.trim());
} catch (error) {
  console.log('process scan failed', error.message);
}

try {
  const listeners = execSync(
    'powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique"',
    { encoding: 'utf8', windowsHide: true },
  );
  for (const line of listeners.split(/\r?\n/)) killPid(line.trim());
} catch {
  /* ignore */
}

function healthy() {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port: 5000 }, () => {
      socket.end();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
    socket.setTimeout(500, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

(async () => {
  await new Promise((r) => setTimeout(r, 1200));
  console.log('port5000_healthy', await healthy());
})();
