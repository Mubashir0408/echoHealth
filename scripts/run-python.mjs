#!/usr/bin/env node
// Runs the project's .venv Python with the given arguments (Windows and POSIX).
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const python = process.platform === 'win32' ? path.join(root, '.venv', 'Scripts', 'python.exe') : path.join(root, '.venv', 'bin', 'python');
if (!existsSync(python)) {
  console.error(`Python virtual environment not found at ${python}. See README "Run the integrated application".`);
  process.exit(1);
}
const result = spawnSync(python, process.argv.slice(2), { cwd: root, stdio: 'inherit' });
process.exit(result.status ?? 1);
