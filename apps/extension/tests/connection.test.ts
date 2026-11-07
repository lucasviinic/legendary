import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaptionEvent } from '@legendary/contracts';
import { AppConnection, type SocketLike } from '../lib/connection';

class FakeSocket implements SocketLike {
  static instances: FakeSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  drop() {
    this.readyState = 3;
    this.onclose?.();
  }
  captions() {
    return this.sent
      .map((data) => JSON.parse(data))
      .filter((message) => message.type === 'caption');
  }
}

const caption = (text: string): CaptionEvent => ({ text, startedAt: 1, source: 'netflix' });
const latest = () => FakeSocket.instances.at(-1)!;

function setup(config: { token: string; port: number } | null = { token: 'tok', port: 47615 }) {
  const onHighlight = vi.fn();
  const onRewind = vi.fn();
  const onStatus = vi.fn();
  const saveOutbox = vi.fn();
  const connection = new AppConnection({
    createSocket: (url) => new FakeSocket(url),
    onHighlight,
    onRewind,
    onStatus,
    saveOutbox,
  });
  connection.configure(config);
  return { connection, onHighlight, onRewind, onStatus, saveOutbox };
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeSocket.instances = [];
});
afterEach(() => vi.useRealTimers());

describe('AppConnection', () => {
  it('connects to the local app with the token', () => {
    setup();
    expect(latest().url).toBe('ws://127.0.0.1:47615/?token=tok');
  });

  it('does not connect without a token', () => {
    setup(null);
    expect(FakeSocket.instances).toEqual([]);
  });

  it('escapes the token in the address', () => {
    setup({ token: 'a b&c', port: 47615 });
    expect(latest().url).toBe('ws://127.0.0.1:47615/?token=a%20b%26c');
  });

  it('sends a caption when connected', () => {
    const { connection } = setup();
    latest().open();
    connection.sendCaption(caption('hi'));
    expect(latest().captions()).toHaveLength(1);
  });

  it('queues captions while the app is closed and sends them in order on connect', () => {
    const { connection } = setup();
    connection.sendCaption(caption('one'));
    connection.sendCaption(caption('two'));
    expect(latest().captions()).toEqual([]);
    latest().open();
    expect(
      latest()
        .captions()
        .map((message) => message.caption.text),
    ).toEqual(['one', 'two']);
    expect(connection.queued).toBe(0);
  });

  it('keeps at most 50 captions, dropping the oldest', () => {
    const { connection } = setup();
    for (let i = 0; i < 60; i++) connection.sendCaption(caption(`c${i}`));
    expect(connection.queued).toBe(50);
    latest().open();
    expect(latest().captions()[0].caption.text).toBe('c10');
  });

  it('saves the queue so it survives the service worker stopping', () => {
    const { connection, saveOutbox } = setup();
    connection.sendCaption(caption('one'));
    expect(saveOutbox).toHaveBeenLastCalledWith([caption('one')]);
  });

  it('restores a saved queue', () => {
    const { connection } = setup();
    connection.restore([caption('saved')]);
    latest().open();
    expect(latest().captions()[0].caption.text).toBe('saved');
  });

  it('reconnects by itself after losing the connection', async () => {
    setup();
    latest().open();
    latest().drop();
    expect(FakeSocket.instances).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(FakeSocket.instances).toHaveLength(2);
  });

  it('waits longer after each failed attempt, up to a limit', async () => {
    setup();
    latest().drop();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(FakeSocket.instances).toHaveLength(2);
    latest().drop();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(FakeSocket.instances).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(FakeSocket.instances).toHaveLength(3);
  });

  it('reports the connection status', () => {
    const { connection, onStatus } = setup();
    expect(connection.connected).toBe(false);
    latest().open();
    expect(connection.connected).toBe(true);
    expect(onStatus).toHaveBeenLastCalledWith(true);
    latest().drop();
    expect(onStatus).toHaveBeenLastCalledWith(false);
  });

  it('sends pings so the service worker stays alive', async () => {
    setup();
    latest().open();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(latest().sent.map((data) => JSON.parse(data).type)).toContain('ping');
  });

  it('delivers highlights from the app', () => {
    const { onHighlight } = setup();
    latest().open();
    latest().onmessage?.({
      data: JSON.stringify({ type: 'highlight', text: 'I reckon', surfaces: ['reckon'] }),
    });
    expect(onHighlight).toHaveBeenCalledWith({
      type: 'highlight',
      text: 'I reckon',
      surfaces: ['reckon'],
    });
  });

  it('delivers rewind requests from the app', () => {
    const { onRewind, onHighlight } = setup();
    latest().open();
    latest().onmessage?.({ data: JSON.stringify({ type: 'rewind', seconds: 10 }) });
    expect(onRewind).toHaveBeenCalledWith({ type: 'rewind', seconds: 10 });
    expect(onHighlight).not.toHaveBeenCalled();
  });

  it('ignores an invalid message from the socket', () => {
    const { onHighlight } = setup();
    latest().open();
    latest().onmessage?.({ data: 'not json' });
    latest().onmessage?.({ data: JSON.stringify({ type: 'highlight' }) });
    expect(onHighlight).not.toHaveBeenCalled();
  });

  it('reconnects with the new settings when they change', () => {
    const { connection } = setup();
    latest().open();
    connection.configure({ token: 'new', port: 50000 });
    expect(latest().url).toBe('ws://127.0.0.1:50000/?token=new');
  });

  it('stops trying when the token is removed', async () => {
    const { connection } = setup();
    connection.configure(null);
    const count = FakeSocket.instances.length;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(FakeSocket.instances).toHaveLength(count);
  });
});
