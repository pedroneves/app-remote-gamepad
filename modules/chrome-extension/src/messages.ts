/**
 * Messages between the parts of the extension:
 *
 * ```
 * service worker --runtime port--> bridge script --window.postMessage--> page script
 * service worker --runtime port--> popup
 * ```
 */

import type { GamepadState } from "@remote-gamepad/shared/gamepad";

/** Names of the runtime ports that connect to the service worker. */
export const PortName = {
  Bridge: "bridge",
  Popup: "popup",
} as const;

/** Controller input, from the service worker to the page script. */
export type InputEvent =
  /** The controller (phone) connected or disconnected. */
  | { kind: "controller"; connected: boolean }
  /** New controller state. */
  | { kind: "state"; state: GamepadState }
  /** The controller is still there but its state hasn't changed. */
  | { kind: "alive" };

/** Tags the bridge's `window.postMessage` messages, which the page's own scripts can also see. */
export const PAGE_CHANNEL = "remote-gamepad";

export interface PageMessage {
  channel: typeof PAGE_CHANNEL;
  event: InputEvent;
}

export function isPageMessage(data: unknown): data is PageMessage {
  return typeof data === "object" && data !== null &&
    (data as Partial<PageMessage>).channel === PAGE_CHANNEL &&
    typeof (data as Partial<PageMessage>).event === "object";
}

/**
 * The service worker's link to the relay server.
 * - `idle`: no Xbox tab is open, so there's no connection.
 * - `connecting`: opening the WebSocket.
 * - `connected`: joined the session.
 * - `unreachable`: the connection failed or dropped. Retrying.
 * - `taken`: the session already has a host, maybe another browser. Retrying.
 * - `bad-address`: the server address setting isn't valid.
 */
export type ServerStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "unreachable"
  | "taken"
  | "bad-address";

/** Sent from the service worker to the popup when it connects and on every change. */
export interface Status {
  server: ServerStatus;
  /** Whether the controller (phone) is connected to the session. */
  controller: boolean;
  /** Server address setting. */
  address: string;
  /** Session code to enter on the phone. */
  session: string;
}
