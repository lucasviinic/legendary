import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { runWithElectronNode } from './electron-node.mjs';

const require = createRequire(import.meta.url);
const vitest = join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs');

runWithElectronNode(vitest, process.argv.slice(2));
