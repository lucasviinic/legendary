import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: '.',
  outDir: '.output',
  imports: false,
  manifest: {
    name: 'Legendary',
    description: 'Lê as legendas da Netflix e do YouTube para o app Legendary, no seu Mac.',
    permissions: ['storage', 'alarms', 'scripting'],
    host_permissions: ['*://*.netflix.com/*', '*://*.youtube.com/*'],
  },
});
