import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';
import type { Plugin } from 'vite';

const PAGES = ['overlay', 'quiz', 'history', 'settings', 'menu', 'search'];

function contentSecurityPolicy(): Plugin {
  const production =
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
  const development =
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws://localhost:*; object-src 'none'";
  return {
    name: 'legendary-csp',
    transformIndexHtml: {
      order: 'pre',
      handler: (html, context) => html.replace('%CSP%', context.server ? development : production),
    },
  };
}

export default defineConfig({
  main: {
    build: {
      rollupOptions: { input: { index: resolve('src/main/index.ts') } },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        input: { index: resolve('src/preload/index.ts') },
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    root: 'src/renderer',
    plugins: [react(), tailwindcss(), contentSecurityPolicy()],
    build: {
      rollupOptions: {
        input: Object.fromEntries(
          PAGES.map((page) => [page, resolve(`src/renderer/${page}/index.html`)]),
        ),
      },
    },
  },
});
