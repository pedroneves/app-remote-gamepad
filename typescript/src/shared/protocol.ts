/**
 * Connection protocol between the components and the relay server.
 *
 * Clients connect to `ws://<server>/ws?role=<role>&session=<code>`.
 * The server forwards every message from the controller to the host of the
 * same session, unchanged. Messages sent while the other side isn't connected are dropped.
 */

/** Port the relay server listens on by default. */
export const DEFAULT_SERVER_PORT = 7001;

/** Path of the relay server's WebSocket endpoint. */
export const RELAY_PATH = "/ws";

/**
 * - `controller`: the phone web app. Sends input.
 * - `host`: the Chrome extension. Receives input.
 */
export type Role = "controller" | "host";

export function isRole(value: unknown): value is Role {
  return value === "controller" || value === "host";
}

export function otherRole(role: Role): Role {
  return role === "controller" ? "host" : "controller";
}

/** A session code is 6 digits, easy to type on a phone. */
export function isSessionCode(value: unknown): value is string {
  return typeof value === "string" && /^[0-9]{6}$/.test(value);
}

/**
 * Sent by the server to a client when it joins a session, and again whenever
 * the other side of the session connects or disconnects.
 */
export interface PeerMessage {
  t: "peer";
  /** Whether the other side of the session is connected. */
  connected: boolean;
}

/** WebSocket close codes the server uses. */
export const CloseCode = {
  /** The session already has a client with this role. */
  RoleTaken: 4001,
} as const;
