// Comandos do drizzle-kit que abrem o banco, como migrate e studio.
import { join, resolve } from 'node:path';
import { runWithElectronNode } from './electron-node.mjs';

const packageDir = resolve(import.meta.dirname, '../../../packages/db');
const drizzleKit = join(packageDir, 'node_modules/drizzle-kit/bin.cjs');

runWithElectronNode(drizzleKit, process.argv.slice(2), { cwd: packageDir });
