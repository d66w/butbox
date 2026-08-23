import { CONFIG } from "../config.js";
import { getAccessToken } from "./auth.js";
import { HEARTBEAT_INTERVAL_MS, RECONNECT_BASE_MS, RECONNECT_MAX_MS } from "./constants.js";

const STATUS = {
  idle: "idle",
  connecting: "connecting",
  live: "live",
  retrying: "retrying"
};

export class BoxRealtime {
  constructor({ onChange, onStatus }) {
    this.onChange = onChange ?? (() => {});
    this.onStatus = onStatus ?? (() => {});
    this.socket = null;
    this.spaceId = null;
    this.topic = null;
    this.ref = 0;
    this.attempts = 0;
    this.heartbeatTimer = null;
    this.reconnectTimer = null;
    this.closedByUs = false;
    this.status = STATUS.idle;
  }

  setStatus(next) {
    if (this.status === next) {
      return;
    }
    this.status = next;
    this.onStatus(next);
  }

  nextRef() {
    this.ref += 1;
    return String(this.ref);
  }

  socketUrl() {
    const base = String(CONFIG.supabaseUrl).replace(/^https:/, "wss:").replace(/\/$/, "");
    const params = new URLSearchParams({
      apikey: CONFIG.supabaseAnonKey,
      vsn: "1.0.0"
    });
    return `${base}/realtime/v1/websocket?${params.toString()}`;
  }

  async watch(spaceId) {
    if (this.spaceId === spaceId && this.socket && this.socket.readyState === WebSocket.OPEN) {
      return;
    }
    this.stop();
    this.spaceId = spaceId;
    if (!spaceId) {
      return;
    }
    await this.connect();
  }

  async connect() {
    if (!this.spaceId) {
      return;
    }
    this.closedByUs = false;
    this.setStatus(STATUS.connecting);

    let token;
    try {
      token = await getAccessToken();
    } catch (error) {
      console.warn("실시간 토큰을 얻지 못했습니다", error);
      this.scheduleReconnect();
      return;
    }
    if (!token || !this.spaceId) {
      this.scheduleReconnect();
      return;
    }

    const socket = new WebSocket(this.socketUrl());
    this.socket = socket;
    this.topic = `realtime:butbox:${this.spaceId}`;

    socket.addEventListener("open", () => {
      if (this.socket !== socket) {
        return;
      }
      this.attempts = 0;
      socket.send(
        JSON.stringify({
          topic: this.topic,
          event: "phx_join",
          ref: this.nextRef(),
          payload: {
            access_token: token,
            config: {
              broadcast: { ack: false, self: false },
              presence: { key: "" },
              private: false,
              postgres_changes: [
                {
                  event: "*",
                  schema: "public",
                  table: "boxes",
                  filter: `space_id=eq.${this.spaceId}`
                }
              ]
            }
          }
        })
      );
      this.startHeartbeat();
    });

    socket.addEventListener("message", (event) => {
      if (this.socket !== socket) {
        return;
      }
      this.handleMessage(event.data);
    });

    socket.addEventListener("error", () => {
      if (this.socket !== socket) {
        return;
      }
      socket.close();
    });

    socket.addEventListener("close", () => {
      if (this.socket !== socket) {
        return;
      }
      this.stopHeartbeat();
      this.socket = null;
      if (!this.closedByUs) {
        this.scheduleReconnect();
      } else {
        this.setStatus(STATUS.idle);
      }
    });
  }

  handleMessage(raw) {
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }

    if (message.event === "phx_reply" && message.topic === this.topic) {
      if (message.payload?.status === "ok") {
        this.setStatus(STATUS.live);
      } else if (message.payload?.status === "error") {
        console.warn("실시간 구독 거부", message.payload?.response);
        this.closeSocket();
        this.scheduleReconnect();
      }
      return;
    }

    if (message.event === "phx_error" || message.event === "phx_close") {
      this.closeSocket();
      this.scheduleReconnect();
      return;
    }

    if (message.event === "system") {
      if (message.payload?.status === "error") {
        this.closeSocket();
        this.scheduleReconnect();
      }
      return;
    }

    if (message.event === "postgres_changes") {
      const data = message.payload?.data ?? message.payload ?? {};
      const type = data.eventType ?? data.type;
      const record = data.new ?? data.record ?? null;
      const previous = data.old ?? data.old_record ?? null;
      if (!type) {
        return;
      }
      this.onChange({ type, record, previous });
    }
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        return;
      }
      this.socket.send(
        JSON.stringify({ topic: "phoenix", event: "heartbeat", payload: {}, ref: this.nextRef() })
      );
      this.refreshToken();
    }, HEARTBEAT_INTERVAL_MS);
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  async refreshToken() {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN || !this.topic) {
      return;
    }
    try {
      const token = await getAccessToken();
      if (!token || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
        return;
      }
      this.socket.send(
        JSON.stringify({
          topic: this.topic,
          event: "access_token",
          payload: { access_token: token },
          ref: this.nextRef()
        })
      );
    } catch (error) {
      console.warn("실시간 토큰 갱신 실패", error);
    }
  }

  scheduleReconnect() {
    if (this.closedByUs || !this.spaceId || this.reconnectTimer) {
      return;
    }
    this.setStatus(STATUS.retrying);
    this.attempts += 1;
    const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** (this.attempts - 1));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch((error) => console.warn("실시간 재연결 실패", error));
    }, delay);
  }

  closeSocket() {
    this.stopHeartbeat();
    if (this.socket) {
      const socket = this.socket;
      this.socket = null;
      try {
        socket.close();
      } catch {
        return;
      }
    }
  }

  stop() {
    this.closedByUs = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.closeSocket();
    this.attempts = 0;
    this.setStatus(STATUS.idle);
  }

  suspend() {
    const spaceId = this.spaceId;
    this.stop();
    this.spaceId = spaceId;
  }

  async resume() {
    if (!this.spaceId || this.socket) {
      return;
    }
    await this.connect();
  }
}

export const REALTIME_STATUS = STATUS;
