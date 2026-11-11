/**
 * Connection protocol between the components and the relay server.
 *
 * Clients connect to `ws://<server>/ws?role=<role>&session=<code>`.
 * The server forwards every message from the controller to the host of the
 * same session, unchanged. Messages sent while the other side isn't connected are dropped.
 */

import { AXIS_COUNT, BUTTON_COUNT, type GamepadState } from "./gamepad.ts";

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

/** Type guard for a server `peer` message, already parsed from JSON. */
export function isPeerMessage(data: unknown): data is PeerMessage {
  return isRecord(data) && data.t === "peer" && typeof data.connected === "boolean";
}

/**
 * The controller's full state. The controller sends it whenever the state
 * changes. Field names are short to keep the message small.
 */
export interface StateMessage {
  t: "state";
  /** Increases with every message. The host drops a message older than the last one it used. */
  seq: number;
  /** Button bitmask. Bit n is standard-mapping button n. */
  b: number;
  /** Left trigger, 0 to 1. */
  lt: number;
  /** Right trigger, 0 to 1. */
  rt: number;
  /** `[leftX, leftY, rightX, rightY]`, -1 to 1. */
  ax: [number, number, number, number];
}

/** A controller message without state. The host only takes it as a sign that the controller is still there. */
export interface SignalMessage {
  t: "hello" | "ping";
}

export type ControllerMessage = StateMessage | SignalMessage;

export function stateMessage(seq: number, state: GamepadState): StateMessage {
  return {
    t: "state",
    seq,
    b: state.buttons,
    lt: state.leftTrigger,
    rt: state.rightTrigger,
    ax: [...state.axes],
  };
}

/** The gamepad state in a state message, with every value clamped to its range. */
export function stateFromMessage(message: StateMessage): GamepadState {
  const [lx, ly, rx, ry] = message.ax.map((v) => clamp(v, -1, 1));
  return {
    buttons: message.b,
    leftTrigger: clamp(message.lt, 0, 1),
    rightTrigger: clamp(message.rt, 0, 1),
    axes: [lx, ly, rx, ry],
  };
}

/** Checks a controller message already parsed from JSON. Returns `null` if it isn't one. */
export function parseControllerMessage(data: unknown): ControllerMessage | null {
  if (!isRecord(data)) return null;
  if (data.t === "hello" || data.t === "ping") return { t: data.t };
  if (data.t !== "state") return null;

  const { seq, b, lt, rt, ax } = data;
  const valid = isFiniteNumber(seq) &&
    Number.isInteger(b) && typeof b === "number" && b >= 0 && b < 2 ** BUTTON_COUNT &&
    isFiniteNumber(lt) && isFiniteNumber(rt) &&
    Array.isArray(ax) && ax.length === AXIS_COUNT && ax.every(isFiniteNumber);
  if (!valid) return null;
  return { t: "state", seq, b, lt, rt, ax: [ax[0], ax[1], ax[2], ax[3]] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
