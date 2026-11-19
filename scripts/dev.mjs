#!/usr/bin/env node
/**
 * One-command launcher for EchoHealth:  npm run dev   (from the project root)
 *
 *   1. Reuses an EchoHealth backend already running on 127.0.0.1:8000, or starts one
 *      (.venv Python, `-m echohealth.server`) and waits until GET /api/health answers.
 *   2. Then starts the React/Vite frontend, which proxies /api, the WebSocket and /static
 *      to the backend (frontend/vite.config.ts).
 *   3. If either process exits unexpectedly, prints a clear error and stops the other.
 *      Ctrl+C stops everything this script started.
 *
 * Zero dependencies; works in Windows PowerShell, cmd and POSIX shells.
 * Extra arguments are passed to Vite, e.g.  npm run dev -- --open false
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FRONTEND = path.join(ROOT, 'frontend');
const BACKEND_HOST = '127.0.0.1';
const BACKEND_PORT = 8000;
const BACKEND_URL = `http://${BACKEND_HOST}:${BACKEND_PORT}`;
const STARTUP_TIMEOUT_MS = Number(process.env.ECHOHEALTH_STARTUP_TIMEOUT || 120) * 1000;
const IS_WINDOWS = process.platform === 'win32';

const color = (code) => (s) => (process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s);
const red = color('31;1');
const green = color('32');
const yellow = color('33');
const cyan = color('36');
const magenta = color('35');

const log = (msg) => console.log(`${cyan('[echohealth]')} ${msg}`);
const fail = (msg) => console.error(`${red('[echohealth] ERROR:')} ${msg}`);

const children = new Map(); // name -> ChildProcess
let shuttingDown = false;

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function pipeWithPrefix(stream, prefix, sink, tail) {
  let buffer = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop();
    for (const line of lines) {
      sink.write(`${prefix} ${line}\n`);
      tail.push(line);
      if (tail.length > 20) tail.shift();
    }
  });
  stream.on('end', () => buffer && sink.write(`${prefix} ${buffer}\n`));
}

function portInUse(port, host) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
    socket.setTimeout(1500, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

/** Returns the health JSON if an EchoHealth backend answers, otherwise null. */
async function probeBackend() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/health`, { signal: AbortSignal.timeout(3000) });
    const body = await res.json();
    return body && typeof body === 'object' && 'status' in body && 'model' in body ? body : null;
  } catch {
    return null;
  }
}

function killTree(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  if (IS_WINDOWS) {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
  }
}

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children.values()) killTree(child);
  setTimeout(() => process.exit(code), 300);
}

function describeExit(code, signal) {
  return signal ? `signal ${signal}` : `exit code ${code}`;
}

function supervise(name, child, tail, hint) {
  children.set(name, child);
  child.on('error', (err) => {
    if (shuttingDown) return;
    fail(`Could not start the ${name}: ${err.message}`);
    shutdown(1);
  });
  child.on('exit', (code, signal) => {
    children.delete(name);
    // On Ctrl+C every process in the console gets the signal; give our own handler a moment.
    setTimeout(() => {
      if (shuttingDown) return;
      fail(`The ${name} stopped unexpectedly (${describeExit(code, signal)}).`);
      if (tail.length) {
        console.error(red(`Last ${name} output:`));
        for (const line of tail.slice(-10)) console.error(`  ${line}`);
      }
      if (hint) console.error(yellow(hint));
      console.error(red(`Stopping the remaining server${children.size === 1 ? '' : 's'}.`));
      shutdown(1);
    }, 400);
  });
}

// ---------------------------------------------------------------------------
// backend
// ---------------------------------------------------------------------------

async function ensureBackend() {
  const existing = await probeBackend();
  if (existing) {
    log(green(`Reusing the EchoHealth backend already running at ${BACKEND_URL} (not starting a duplicate).`));
    return existing;
  }
  if (await portInUse(BACKEND_PORT, BACKEND_HOST)) {
    throw new Error(
      `Port ${BACKEND_PORT} is in use by another program that is not the EchoHealth backend.\n` +
        `  Find it with:  Get-NetTCPConnection -LocalPort ${BACKEND_PORT} | Select-Object OwningProcess\n` +
        `  then close that program and run "npm run dev" again.`,
    );
  }

  const python = IS_WINDOWS ? path.join(ROOT, '.venv', 'Scripts', 'python.exe') : path.join(ROOT, '.venv', 'bin', 'python');
  if (!existsSync(python)) {
    throw new Error(
      `Python virtual environment not found at ${path.relative(ROOT, python)}.\n` +
        '  Create it once from the project root:\n' +
        '    py -3.11 -m venv .venv\n' +
        '    .\\.venv\\Scripts\\python.exe -m pip install -r requirements-dev.txt\n' +
        '    .\\.venv\\Scripts\\python.exe -m echohealth download',
    );
  }

  log(`Starting backend: ${path.relative(ROOT, python)} -m echohealth.server`);
  const tail = [];
  const child = spawn(python, ['-m', 'echohealth.server'], {
    cwd: ROOT,
    env: { ...process.env, PYTHONUNBUFFERED: '1', TF_CPP_MIN_LOG_LEVEL: process.env.TF_CPP_MIN_LOG_LEVEL ?? '2' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  pipeWithPrefix(child.stdout, magenta('[backend] '), process.stdout, tail);
  pipeWithPrefix(child.stderr, magenta('[backend] '), process.stdout, tail);
  supervise('backend', child, tail, 'Check the backend output above. Tests: .\\.venv\\Scripts\\python.exe -m unittest discover -s tests');

  log(`Waiting for the backend to load the AI model (up to ${STARTUP_TIMEOUT_MS / 1000}s)…`);
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (shuttingDown || child.exitCode !== null) throw new Error('The backend exited during startup (see output above).');
    const health = await probeBackend();
    if (health) return health;
    await new Promise((r) => setTimeout(r, 750));
  }
  throw new Error(`The backend did not answer ${BACKEND_URL}/api/health within ${STARTUP_TIMEOUT_MS / 1000}s.`);
}

// ---------------------------------------------------------------------------
// frontend
// ---------------------------------------------------------------------------

function startFrontend() {
  const vite = path.join(FRONTEND, 'node_modules', 'vite', 'bin', 'vite.js');
  if (!existsSync(vite)) {
    throw new Error('Frontend dependencies are not installed. Run once from the project root:\n    npm run setup');
  }
  log('Starting frontend (Vite)…');
  const tail = [];
  // Run Vite's JS entry with this Node binary: no shell, no npm.cmd quirks on Windows.
  const child = spawn(process.execPath, [vite, ...process.argv.slice(2)], {
    cwd: FRONTEND,
    env: { ...process.env, FORCE_COLOR: process.stdout.isTTY ? '1' : '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  pipeWithPrefix(child.stdout, green('[frontend]'), process.stdout, tail);
  pipeWithPrefix(child.stderr, green('[frontend]'), process.stdout, tail);
  supervise('frontend', child, tail, 'Check the frontend output above. Try: npm run setup');
}

// ---------------------------------------------------------------------------

process.on('SIGINT', () => {
  if (!shuttingDown) log('Stopping EchoHealth…');
  shutdown(0);
});
process.on('SIGTERM', () => shutdown(0));
process.on('exit', () => {
  for (const child of children.values()) killTree(child);
});

try {
  const health = await ensureBackend();
  if (health.status === 'ready') log(green(`Backend ready at ${BACKEND_URL} · model ${health.model} loaded`));
  else log(yellow(`Backend is running, but the AI model is unavailable: ${health.detail ?? 'unknown reason'}\n  Fix: .\\.venv\\Scripts\\python.exe -m echohealth download`));
  startFrontend();
  log(`Open the ${green('Local:')} address Vite prints below (normally http://127.0.0.1:5173) · press Ctrl+C to stop`);
} catch (err) {
  fail(err.message);
  shutdown(1);
}
