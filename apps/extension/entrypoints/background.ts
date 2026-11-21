import {
  DEFAULT_WS_PORT,
  type CaptionEvent,
  type Source,
  type WindowBounds,
} from '@legendary/contracts';
import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { AppConnection, type SocketLike } from '../lib/connection';
import type { RuntimeMessage, StatusReply, TabMessage } from '../lib/messages';
import { rewindPlayer } from '../lib/rewind';

const WAKE_ALARM = 'legendary-wake';

async function boundsOf(windowId: number | undefined): Promise<WindowBounds | undefined> {
  if (windowId === undefined) return undefined;
  try {
    const { left, top, width, height } = await browser.windows.get(windowId);
    if (left === undefined || top === undefined || !width || !height) return undefined;
    return { x: left, y: top, width, height };
  } catch {
    return undefined;
  }
}

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
      const { caption } = message;
      void boundsOf(sender.tab?.windowId).then((bounds) =>
        connection.sendCaption(bounds ? { ...caption, bounds } : caption),
      );
      return undefined;
    }
    if (message.type === 'track') {
      connection.sendTrack(message.track);
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
