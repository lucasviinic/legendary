import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const noCsp = (): Plugin => ({
  name: 'legendary-preview-csp',
  transformIndexHtml: {
    order: 'pre',
    handler: (html) => html.replace(/\s*<meta http-equiv="Content-Security-Policy"[^>]*>/, ''),
  },
});

/** Serve só a página de comparação com o mockup. */
export default defineConfig({
  root: resolve(import.meta.dirname, '../src/renderer'),
  plugins: [react(), tailwindcss(), noCsp()],
  server: { port: 5199, strictPort: true },
});
