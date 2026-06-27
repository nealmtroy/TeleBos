// Auto-detect secure WS protocol — wss:// when running over HTTPS, ws:// otherwise
const PROTOCOL = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss:" : "ws:";

function getDefaultWsAddress(): string {
  if (typeof window === "undefined") return "ws://localhost:8000";
  
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const hostname = window.location.hostname;
  
  // If running locally, connect directly to the FastAPI dev server on port 8000
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname.startsWith("192.168.") || hostname.startsWith("10.")) {
    return `${protocol}//${hostname}:8000`;
  }
  
  // In production, route WebSocket connections through the reverse proxy on the same host/port
  return `${protocol}//${window.location.host}`;
}

const DEFAULT_WS = getDefaultWsAddress();
const BASE_WS = process.env.NEXT_PUBLIC_WS_URL || DEFAULT_WS;

// Session token is written here by the auth store — we can't read httpOnly cookies from JS.
// See auth-store.ts's fetchMe() which calls setSocketSessionToken().
let sessionToken: string | null = null;

export function setSocketSessionToken(token: string | null) {
  sessionToken = token;
}

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

      // Send Better Auth session token as first message to authenticate
      if (sessionToken) {
        this.send({ type: "auth", token: sessionToken });
        this._authenticated = true;
      }

      // Start ping keepalive
      this.pingTimer = setInterval(() => {
        this.send({ type: "ping" });
      }, 25_000);
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        // If server asks for auth, send the token
        if (data.type === "auth_required" && sessionToken && !this._authenticated) {
          this.send({ type: "auth", token: sessionToken });
          this._authenticated = true;
          return;
        }
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
