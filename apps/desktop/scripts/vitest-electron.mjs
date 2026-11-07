// Roda o Vitest com o Node embutido no Electron, porque o better-sqlite3 é compilado para ele.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const electron = require('electron');
const vitest = join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs');

const child = spawn(electron, [vitest, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
});
child.on('exit', (code) => process.exit(code ?? 1));
