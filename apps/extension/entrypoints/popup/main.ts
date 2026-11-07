import { DEFAULT_WS_PORT } from '@legendary/contracts';
import { browser } from 'wxt/browser';
import type { RuntimeMessage, StatusReply } from '../../lib/messages';

const REFRESH_MS = 1_000;

const form = document.querySelector<HTMLFormElement>('#form')!;
const tokenInput = document.querySelector<HTMLInputElement>('#token')!;
const portInput = document.querySelector<HTMLInputElement>('#port')!;
const statusText = document.querySelector<HTMLElement>('#status')!;
const dot = document.querySelector<HTMLElement>('#dot')!;

async function refreshStatus() {
  const message: RuntimeMessage = { type: 'status' };
  const reply = (await browser.runtime
    .sendMessage(message)
    .catch(() => null)) as StatusReply | null;
  const connected = reply?.connected ?? false;
  dot.classList.toggle('on', connected);
  statusText.textContent = connected
    ? 'Conectada ao app'
    : reply?.queued
      ? `App fechado · ${reply.queued} na fila`
      : 'App fechado';
}

void browser.storage.local.get(['token', 'port']).then(({ token, port }) => {
  tokenInput.value = typeof token === 'string' ? token : '';
  portInput.value = String(typeof port === 'number' ? port : DEFAULT_WS_PORT);
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  void browser.storage.local.set({
    token: tokenInput.value.trim(),
    port: Number(portInput.value) || DEFAULT_WS_PORT,
  });
});

void refreshStatus();
setInterval(() => void refreshStatus(), REFRESH_MS);
