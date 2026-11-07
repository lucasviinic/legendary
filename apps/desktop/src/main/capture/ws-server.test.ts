import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import type { CaptionEvent } from '@legendary/contracts';
import { ExtensionSource } from './ws-server';

const TOKEN = 'secret-token';
let source: ExtensionSource;
let port: number;
const open: WebSocket[] = [];

function connect(token: string | null, origin?: string): WebSocket {
  const query = token === null ? '' : `?token=${token}`;
  const socket = new WebSocket(`ws://127.0.0.1:${port}/${query}`, origin ? { origin } : {});
  open.push(socket);
  return socket;
}

const opened = (socket: WebSocket) =>
  new Promise<void>((resolve, reject) => {
    socket.once('open', () => resolve());
    socket.once('error', reject);
  });

const rejected = (socket: WebSocket) =>
  new Promise<boolean>((resolve) => {
    socket.once('open', () => resolve(false));
    socket.once('error', () => resolve(true));
  });

const nextCaption = () =>
  new Promise<CaptionEvent>((resolve) => source.on('caption', (caption) => resolve(caption)));

const caption: CaptionEvent = { text: 'I reckon so', startedAt: 5, source: 'netflix' };

beforeEach(async () => {
  source = new ExtensionSource({ token: TOKEN, port: 0 });
  await source.start();
  port = source.port;
});

afterEach(async () => {
  open.splice(0).forEach((socket) => socket.terminate());
  await source.stop();
});

describe('ExtensionSource', () => {
  it('listens only on the loopback address', () => {
    expect(source.address).toBe('127.0.0.1');
  });

  it('accepts a connection with the right token', async () => {
    await expect(opened(connect(TOKEN))).resolves.toBeUndefined();
  });

  it('rejects a connection with a wrong token', async () => {
    expect(await rejected(connect('wrong'))).toBe(true);
  });

  it('rejects a connection without a token', async () => {
    expect(await rejected(connect(null))).toBe(true);
  });

  it('rejects a connection from a website', async () => {
    expect(await rejected(connect(TOKEN, 'https://evil.example'))).toBe(true);
  });

  it('accepts a connection from the extension', async () => {
    await expect(opened(connect(TOKEN, 'chrome-extension://abc'))).resolves.toBeUndefined();
  });

  it('emits a valid caption', async () => {
    const socket = connect(TOKEN);
    await opened(socket);
    const received = nextCaption();
    socket.send(JSON.stringify({ type: 'caption', caption }));
    await expect(received).resolves.toEqual(caption);
  });

  it('ignores an invalid message and keeps the connection', async () => {
    const socket = connect(TOKEN);
    await opened(socket);
    const received = nextCaption();
    socket.send('not json');
    socket.send(JSON.stringify({ type: 'caption', caption: { text: '' } }));
    socket.send(JSON.stringify({ type: 'caption', caption }));
    await expect(received).resolves.toEqual(caption);
  });

  it('answers a ping', async () => {
    const socket = connect(TOKEN);
    await opened(socket);
    const reply = new Promise<string>((resolve) =>
      socket.once('message', (data) => resolve(String(data))),
    );
    socket.send(JSON.stringify({ type: 'ping' }));
    expect(JSON.parse(await reply)).toEqual({ type: 'pong' });
  });

  it('sends highlights to connected extensions', async () => {
    const socket = connect(TOKEN);
    await opened(socket);
    const reply = new Promise<string>((resolve) =>
      socket.once('message', (data) => resolve(String(data))),
    );
    source.sendHighlight('I reckon so', ['reckon']);
    expect(JSON.parse(await reply)).toEqual({
      type: 'highlight',
      text: 'I reckon so',
      surfaces: ['reckon'],
    });
  });

  it('tells the app when the shortcut was pressed in the player', async () => {
    const socket = connect(TOKEN);
    await opened(socket);
    const pressed = new Promise<void>((resolve) => source.once('open-search', () => resolve()));
    socket.send(JSON.stringify({ type: 'open-search' }));
    await expect(pressed).resolves.toBeUndefined();
  });

  it('asks connected extensions to rewind the video', async () => {
    const socket = connect(TOKEN);
    await opened(socket);
    const reply = new Promise<string>((resolve) =>
      socket.once('message', (data) => resolve(String(data))),
    );
    source.sendRewind(10);
    expect(JSON.parse(await reply)).toEqual({ type: 'rewind', seconds: 10 });
  });

  it('reports whether an extension is connected', async () => {
    expect(source.connected).toBe(false);
    const socket = connect(TOKEN);
    await opened(socket);
    expect(source.connected).toBe(true);
  });
});
