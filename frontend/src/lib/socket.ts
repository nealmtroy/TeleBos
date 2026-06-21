import { getAccessToken } from "./api";

// Auto-detect secure WS protocol — wss:// when running over HTTPS, ws:// otherwise
const PROTOCOL = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss:" : "ws:";
const DEFAULT_WS = `${PROTOCOL}//localhost:8000`;
const BASE_WS = process.env.NEXT_PUBLIC_WS_URL || DEFAULT_WS;

type MessageHandler = (data: any) => void;

class ReconnectingWebSocket {
  private ws: WebSocket | null = null;
  private url: string;
  private handlers: Map<string, Set<MessageHandler>> = new Map();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private _connected = false;
  private _intentionalClose = false;
  private _authenticated = false;

  constructor(url: string) {
    this.url = url;
  }

  get connected() {
    return this._connected;
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this._intentionalClose = false;
    this._authenticated = false;

    // Connect WITHOUT token in URL — auth is sent as first message
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this._connected = true;

      // Send JWT as first message to authenticate
      const token = getAccessToken();
      if (token) {
        this.send({ type: "auth", token });
      }

      // Start ping keepalive
      this.pingTimer = setInterval(() => {
        this.send({ type: "ping" });
      }, 25_000);
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        // Emit by type
        const eventType = data.type || "raw";
        this._emit(eventType, data);
        // Also emit to "all" channel
        this._emit("all", data);
      } catch {
        // Ignore non-JSON messages
      }
    };

    this.ws.onclose = (event) => {
      this._connected = false;
      this._authenticated = false;
      if (this.pingTimer) {
        clearInterval(this.pingTimer);
        this.pingTimer = null;
      }
      if (!this._intentionalClose) {
        this._scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      // onclose will fire after this
    };
  }

  disconnect() {
    this._intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._connected = false;
    this._authenticated = false;
  }

  on(event: string, handler: MessageHandler) {
    const set = this.handlers.get(event) || new Set();
    set.add(handler);
    this.handlers.set(event, set);
  }

  off(event: string, handler: MessageHandler) {
    const set = this.handlers.get(event);
    if (set) {
      set.delete(handler);
    }
  }

  send(data: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private _emit(event: string, data: any) {
    const set = this.handlers.get(event);
    if (set) {
      set.forEach((fn) => {
        try {
          fn(data);
        } catch (e) {
          console.error("[WS] Handler error:", e);
        }
      });
    }
  }

  private _scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 3_000);
  }
}

// ── Singleton connections ──────────────────────────────────────────────────

const sockets: Map<string, ReconnectingWebSocket> = new Map();

export function connectChatSocket(accountId: string): ReconnectingWebSocket {
  const key = `chats:${accountId}`;
  const existing = sockets.get(key);
  if (existing) return existing;

  const ws = new ReconnectingWebSocket(`${BASE_WS}/ws/chats/${accountId}`);
  ws.connect();
  sockets.set(key, ws);
  return ws;
}

export function connectBroadcastSocket(jobId: string): ReconnectingWebSocket {
  const key = `broadcast:${jobId}`;
  const existing = sockets.get(key);
  if (existing) return existing;

  const ws = new ReconnectingWebSocket(`${BASE_WS}/ws/broadcast/${jobId}`);
  ws.connect();
  sockets.set(key, ws);
  return ws;
}

export function connectInviteSocket(jobId: string): ReconnectingWebSocket {
  const key = `invite:${jobId}`;
  const existing = sockets.get(key);
  if (existing) return existing;

  const ws = new ReconnectingWebSocket(`${BASE_WS}/ws/invite/${jobId}`);
  ws.connect();
  sockets.set(key, ws);
  return ws;
}

export function disconnectSocket(key: string) {
  const ws = sockets.get(key);
  if (ws) {
    ws.disconnect();
    sockets.delete(key);
  }
}

export function disconnectAll() {
  sockets.forEach((ws) => ws.disconnect());
  sockets.clear();
}
