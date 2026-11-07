import { ServerMessageSchema, type CaptionEvent, type ServerMessage } from '@legendary/contracts';

const MAX_OUTBOX = 50;
const BASE_RETRY_MS = 2_000;
const MAX_RETRY_MS = 30_000;
/** Uma mensagem a cada 20 s mantém vivo o service worker do Manifest V3. */
const PING_MS = 20_000;
const OPEN = 1;

export interface SocketLike {
  readyState: number;
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: (() => void) | null;
}

export interface ConnectionConfig {
  token: string;
  port: number;
}

export type HighlightMessage = Extract<ServerMessage, { type: 'highlight' }>;
export type RewindMessage = Extract<ServerMessage, { type: 'rewind' }>;

export interface AppConnectionOptions {
  createSocket: (url: string) => SocketLike;
  onHighlight: (message: HighlightMessage) => void;
  onRewind: (message: RewindMessage) => void;
  onStatus: (connected: boolean) => void;
  saveOutbox: (outbox: CaptionEvent[]) => void;
}

/** Mantém o WebSocket com o app, reconecta sozinho e guarda as frases enquanto ele está fechado. */
export class AppConnection {
  private config: ConnectionConfig | null = null;
  private socket: SocketLike | null = null;
  private outbox: CaptionEvent[] = [];
  private retryMs = BASE_RETRY_MS;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private pingTimer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly options: AppConnectionOptions) {}

  get connected(): boolean {
    return this.socket?.readyState === OPEN;
  }

  get queued(): number {
    return this.outbox.length;
  }

  configure(config: ConnectionConfig | null): void {
    this.disconnect();
    this.config = config;
    this.retryMs = BASE_RETRY_MS;
    if (config) this.connect();
  }

  restore(saved: CaptionEvent[]): void {
    this.outbox = [...saved, ...this.outbox].slice(-MAX_OUTBOX);
    if (this.connected) this.flush();
  }

  sendCaption(caption: CaptionEvent): void {
    if (this.connected) {
      this.socket?.send(JSON.stringify({ type: 'caption', caption }));
      return;
    }
    this.outbox = [...this.outbox, caption].slice(-MAX_OUTBOX);
    this.options.saveOutbox(this.outbox);
  }

  /** Tenta conectar agora, se estiver esperando. Chamado quando o service worker acorda. */
  wake(): void {
    if (!this.config || this.socket) return;
    clearTimeout(this.retryTimer);
    this.connect();
  }

  private connect() {
    const { token, port } = this.config!;
    const socket = this.options.createSocket(
      `ws://127.0.0.1:${port}/?token=${encodeURIComponent(token)}`,
    );
    this.socket = socket;

    socket.onopen = () => {
      this.retryMs = BASE_RETRY_MS;
      this.options.onStatus(true);
      this.flush();
      this.pingTimer = setInterval(() => socket.send(JSON.stringify({ type: 'ping' })), PING_MS);
    };
    socket.onmessage = (event) => this.handleMessage(event.data);
    socket.onerror = () => undefined;
    socket.onclose = () => {
      this.clearSocket();
      this.options.onStatus(false);
      this.scheduleRetry();
    };
  }

  private flush() {
    const pending = this.outbox;
    this.outbox = [];
    pending.forEach((caption) => this.socket?.send(JSON.stringify({ type: 'caption', caption })));
    this.options.saveOutbox(this.outbox);
  }

  private handleMessage(data: unknown) {
    let json: unknown;
    try {
      json = JSON.parse(String(data));
    } catch {
      return;
    }
    const message = ServerMessageSchema.safeParse(json);
    if (!message.success) return;
    if (message.data.type === 'highlight') this.options.onHighlight(message.data);
    if (message.data.type === 'rewind') this.options.onRewind(message.data);
  }

  private scheduleRetry() {
    if (!this.config) return;
    this.retryTimer = setTimeout(() => this.connect(), this.retryMs);
    this.retryMs = Math.min(this.retryMs * 2, MAX_RETRY_MS);
  }

  private clearSocket() {
    clearInterval(this.pingTimer);
    this.socket = null;
  }

  private disconnect() {
    clearTimeout(this.retryTimer);
    const socket = this.socket;
    if (!socket) return;
    socket.onclose = null;
    socket.onopen = null;
    socket.onmessage = null;
    socket.close();
    this.clearSocket();
    this.options.onStatus(false);
  }
}
