import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** Roda um script com o Node embutido no Electron, porque o better-sqlite3 é compilado para ele. */
export function runWithElectronNode(script, args, options = {}) {
  const child = spawn(require('electron'), [script, ...args], {
    stdio: 'inherit',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    ...options,
  });
  child.on('exit', (code) => process.exit(code ?? 1));
}
