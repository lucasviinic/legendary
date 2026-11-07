import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // O better-sqlite3 é compilado para o Electron, então os testes rodam com o Node do Electron.
    pool: 'forks',
  },
});
