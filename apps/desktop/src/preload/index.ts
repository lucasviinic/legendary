import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { eventChannels, invokeChannels, type LegendaryApi } from '@legendary/contracts';

const api: LegendaryApi = {
  invoke(channel, ...payload) {
    if (!(channel in invokeChannels)) throw new Error(`Canal IPC desconhecido: ${channel}`);
    return ipcRenderer.invoke(channel, payload[0]);
  },
  on(channel, listener) {
    if (!(channel in eventChannels)) throw new Error(`Evento IPC desconhecido: ${channel}`);
    const wrapped = (_event: IpcRendererEvent, payload: Parameters<typeof listener>[0]) =>
      listener(payload);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
};

contextBridge.exposeInMainWorld('legendary', api);
