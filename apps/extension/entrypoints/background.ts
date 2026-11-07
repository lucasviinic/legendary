import { DEFAULT_WS_PORT, type CaptionEvent, type Source } from '@legendary/contracts';
import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { AppConnection, type SocketLike } from '../lib/connection';
import type { RuntimeMessage, StatusReply, TabMessage } from '../lib/messages';
import { rewindPlayer } from '../lib/rewind';

const WAKE_ALARM = 'legendary-wake';

export default defineBackground(() => {
  /** A aba que mandou a última legenda é a que recebe o destaque e volta o vídeo. */
  let captionTab: number | undefined;
  let captionSource: Source = 'netflix';

  const connection = new AppConnection({
    createSocket: (url) => new WebSocket(url) as unknown as SocketLike,
    onStatus: () => undefined,
    saveOutbox: (outbox) => void browser.storage.session.set({ outbox }),
    onHighlight: (message: TabMessage) => {
      if (captionTab !== undefined) {
        browser.tabs.sendMessage(captionTab, message).catch(() => undefined);
      }
    },
    onRewind: ({ seconds }) => {
      if (captionTab === undefined) return;
      browser.scripting
        .executeScript({
          target: { tabId: captionTab },
          world: 'MAIN',
          func: rewindPlayer,
          args: [captionSource, seconds],
        })
        .catch(() => undefined);
    },
  });

  const loadConfig = async () => {
    const { token, port } = await browser.storage.local.get(['token', 'port']);
    connection.configure(
      typeof token === 'string' && token
        ? { token, port: typeof port === 'number' ? port : DEFAULT_WS_PORT }
        : null,
    );
  };

  void browser.storage.session.get('outbox').then(({ outbox }) => {
    if (Array.isArray(outbox)) connection.restore(outbox as CaptionEvent[]);
  });
  void loadConfig();

  browser.storage.onChanged.addListener((_changes, area) => {
    if (area === 'local') void loadConfig();
  });

  browser.runtime.onMessage.addListener((raw: unknown, sender, sendResponse) => {
    const message = raw as RuntimeMessage;
    if (message.type === 'caption') {
      captionTab = sender.tab?.id;
      captionSource = message.caption.source;
      connection.sendCaption(message.caption);
      return undefined;
    }
    if (message.type === 'open-search') {
      connection.sendOpenSearch();
      return undefined;
    }
    if (message.type === 'status') {
      const reply: StatusReply = { connected: connection.connected, queued: connection.queued };
      sendResponse(reply);
    }
    return undefined;
  });

  // O service worker pode dormir com o app fechado: o alarme o acorda para tentar de novo.
  void browser.alarms.create(WAKE_ALARM, { periodInMinutes: 1 });
  browser.alarms.onAlarm.addListener(() => connection.wake());
});
