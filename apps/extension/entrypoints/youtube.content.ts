import { defineContentScript } from 'wxt/utils/define-content-script';
import { startCapture } from '../lib/content';
import selectors from '../selectors.json';

export default defineContentScript({
  matches: ['*://*.youtube.com/*'],
  main() {
    startCapture({ source: 'youtube', ...selectors.youtube });
  },
});
