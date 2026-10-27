import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../server');
const logDir = path.join(serverDir, 'logs');
const logFile = path.join(logDir, 'dev-api.log');

function healthy() {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const socket = net.connect({ host: '127.0.0.1', port: 5000 }, () => {
      socket.end();
      finish(true);
    });
    socket.on('error', () => finish(false));
    socket.setTimeout(800, () => {
      socket.destroy();
      finish(false);
    });
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntilReady() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await healthy()) return true;
    await wait(500);
  }
  return false;
}

let starting = null;

async function startApi() {
  fs.mkdirSync(logDir, { recursive: true });
  const log = fs.openSync(logFile, 'a');
  const child = spawn(process.execPath, ['server.js'], {
    cwd: serverDir,
    detached: true,
    stdio: ['ignore', log, log],
    windowsHide: true,
  });
  child.unref();

  const ready = await waitUntilReady();
  if (!ready) {
    const tail = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').split(/\r?\n/).slice(-20).join('\n') : '';
    console.error('CareYu API did not start. Recent server log:');
    console.error(tail || 'No server log was written.');
    return false;
  }
  console.log('CareYu API server running on:\nhttp://localhost:5000');
  console.log('Health:\nhttp://localhost:5000/api/health');
  return true;
}

export async function ensureApi() {
  if (await healthy()) return true;
  await wait(1200);
  if (await healthy()) return true;
  if (!starting) {
    starting = startApi().finally(() => {
      starting = null;
    });
  }
  return starting;
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  const ready = await ensureApi();
  if (!ready) process.exit(1);
  console.log('CareYu API server running on:\nhttp://localhost:5000');
  console.log('Health:\nhttp://localhost:5000/api/health');
}
