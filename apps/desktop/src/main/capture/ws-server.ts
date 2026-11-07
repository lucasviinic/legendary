import { timingSafeEqual } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { AddressInfo } from 'node:net';
import { WebSocket, WebSocketServer } from 'ws';
import { ClientMessageSchema, type ServerMessage } from '@legendary/contracts';
import type { CaptionSource } from './caption-source';

const LOOPBACK = '127.0.0.1';
const MAX_PAYLOAD_BYTES = 64 * 1024;

function sameToken(given: string | null, expected: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Servidor local que recebe as legendas da extensão. Aceita só 127.0.0.1 e com o token certo. */
export class ExtensionSource extends EventEmitter implements CaptionSource {
  private server: WebSocketServer | null = null;

  constructor(private readonly options: { token: string; port: number }) {
    super();
  }

  get address(): string {
    return (this.server?.address() as AddressInfo | undefined)?.address ?? '';
  }

  get port(): number {
    return (this.server?.address() as AddressInfo | undefined)?.port ?? this.options.port;
  }

  get connected(): boolean {
    return (this.server?.clients.size ?? 0) > 0;
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = new WebSocketServer({
        host: LOOPBACK,
        port: this.options.port,
        maxPayload: MAX_PAYLOAD_BYTES,
        verifyClient: ({ origin, req }: { origin?: string; req: { url?: string } }) => {
          // Navegadores sempre mandam Origin: assim um site comum não consegue conectar.
          if (origin && !origin.startsWith('chrome-extension://')) return false;
          const url = new URL(req.url ?? '/', `http://${LOOPBACK}`);
          return sameToken(url.searchParams.get('token'), this.options.token);
        },
      });
      server.once('error', reject);
      server.once('listening', () => {
        server.off('error', reject);
        this.server = server;
        resolve();
      });
      server.on('connection', (socket) => {
        this.emit('connection-change');
        socket.on('close', () => this.emit('connection-change'));
        socket.on('error', () => socket.terminate());
        socket.on('message', (data) => this.handleMessage(socket, String(data)));
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) return resolve();
      this.server.clients.forEach((client) => client.terminate());
      this.server.close(() => resolve());
      this.server = null;
    });
  }

  sendHighlight(text: string, surfaces: string[]): void {
    this.broadcast({ type: 'highlight', text, surfaces });
  }

  private handleMessage(socket: WebSocket, raw: string) {
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return;
    }
    const message = ClientMessageSchema.safeParse(json);
    if (!message.success) return;

    if (message.data.type === 'ping') {
      const reply: ServerMessage = { type: 'pong' };
      socket.send(JSON.stringify(reply));
    } else {
      this.emit('caption', message.data.caption);
    }
  }

  private broadcast(message: ServerMessage) {
    const payload = JSON.stringify(message);
    this.server?.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    });
  }
}
