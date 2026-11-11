/**
 * Connection to the relay server as the session's controller.
 *
 * Sends the full gamepad state whenever it changes, and again every 100 ms as
 * a heartbeat. The heartbeat tells the host the phone is still there, and lets
 * the host recover a held input after it reset to neutral on a network hiccup.
 * Reconnects with backoff.
 */

import type { GamepadState } from "../shared/gamepad.ts";
import { CloseCode, isPeerMessage, RELAY_PATH, stateMessage } from "../shared/protocol.ts";

const HEARTBEAT_MS = 100;
/** First reconnect delay. It doubles on each failure, up to `RETRY_MAX_MS`. */
const RETRY_MIN_MS = 250;
const RETRY_MAX_MS = 5000;
/** Sends are skipped while this many bytes are still unsent, so a slow network doesn't queue up stale states. */
const MAX_BUFFERED_BYTES = 1024;

/**
 * - `connecting`: opening the WebSocket.
 * - `waiting`: joined the session, but the host (Chrome extension) isn't connected.
 * - `connected`: the host is connected and receives input.
 * - `unreachable`: the connection failed or dropped. Retrying.
 * - `taken`: another controller is using this session code. Retrying.
 */
export type ConnectionStatus = "connecting" | "waiting" | "connected" | "unreachable" | "taken";

/**
 * The relay server's WebSocket URL for a session. The server is the one that
 * served this page, unless `server` (`host:port`) names another one.
 */
export function relayUrl(session: string, server?: string | null): URL {
  const url = server ? new URL(RELAY_PATH, `ws://${server}`) : new URL(RELAY_PATH, location.href);
  if (!server) url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
  url.search = new URLSearchParams({ role: "controller", session }).toString();
  return url;
}

export class Connection {
  #socket: WebSocket | null = null;
  #hostConnected = false;
  #seq = 0;
  #failures = 0;
  #retryTimer: number | undefined;
  #heartbeatTimer: number | undefined;
  #closed = false;

  constructor(
    readonly url: URL,
    readonly getState: () => GamepadState,
    readonly onStatus: (status: ConnectionStatus) => void,
  ) {
    this.#open();
  }

  /** Sends the current state, if the host is there to receive it. */
  send(): void {
    const socket = this.#socket;
    if (!socket || socket.readyState !== WebSocket.OPEN || !this.#hostConnected) return;
    if (socket.bufferedAmount > MAX_BUFFERED_BYTES) return;
    socket.send(JSON.stringify(stateMessage(++this.#seq, this.getState())));
  }

  /** Reconnects right away if not connected. For when the page becomes visible again. */
  wake(): void {
    if (this.#socket || this.#closed) return;
    clearTimeout(this.#retryTimer);
    this.#retryTimer = undefined;
    this.#failures = 0;
    this.#open();
  }

  close(): void {
    this.#closed = true;
    clearTimeout(this.#retryTimer);
    clearInterval(this.#heartbeatTimer);
    if (this.#socket) {
      this.#socket.onclose = null;
      this.#socket.close();
      this.#socket = null;
    }
  }

  #open(): void {
    const socket = new WebSocket(this.url);
    this.#socket = socket;
    this.onStatus("connecting");

    socket.onopen = () => {
      this.#failures = 0;
      this.#heartbeatTimer = setInterval(() => this.send(), HEARTBEAT_MS);
    };
    socket.onmessage = (e) => {
      let message: unknown;
      try {
        message = JSON.parse(e.data);
      } catch {
        return;
      }
      if (!isPeerMessage(message)) return;
      this.#hostConnected = message.connected;
      this.onStatus(message.connected ? "connected" : "waiting");
      this.send();
    };
    socket.onclose = (e) => {
      clearInterval(this.#heartbeatTimer);
      this.#socket = null;
      this.#hostConnected = false;
      const delay = Math.min(RETRY_MIN_MS * 2 ** this.#failures, RETRY_MAX_MS);
      this.#failures++;
      this.#retryTimer = setTimeout(() => {
        this.#retryTimer = undefined;
        this.#open();
      }, delay);
      this.onStatus(e.code === CloseCode.RoleTaken ? "taken" : "unreachable");
    };
  }
}
