import { BrowserWindow, ipcMain, type WebContents } from 'electron';
import {
  eventChannels,
  invokeChannels,
  type EventChannel,
  type EventPayload,
  type InvokeChannel,
  type InvokeRequest,
  type InvokeResponse,
} from '@legendary/contracts';

type HandlerResult<C extends InvokeChannel> =
  InvokeResponse<C> extends undefined
    ? void | Promise<void>
    : InvokeResponse<C> | Promise<InvokeResponse<C>>;

export type InvokeHandlers = {
  [C in InvokeChannel]: (request: InvokeRequest<C>, sender: WebContents) => HandlerResult<C>;
};

export function registerHandlers(handlers: InvokeHandlers): void {
  for (const channel of Object.keys(invokeChannels) as InvokeChannel[]) {
    const { request } = invokeChannels[channel];
    const handler = handlers[channel] as (payload: unknown, sender: WebContents) => unknown;
    ipcMain.handle(channel, (event, payload: unknown) =>
      handler(request.parse(payload), event.sender),
    );
  }
}

export function broadcast<C extends EventChannel>(channel: C, payload: EventPayload<C>): void {
  const parsed = eventChannels[channel].parse(payload);
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(channel, parsed);
  }
}
