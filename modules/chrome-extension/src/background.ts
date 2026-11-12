/**
 * Service worker.
 *
 * While at least one Xbox tab is open, it holds the WebSocket to the relay
 * server as the session's host, and passes the controller's input to the
 * bridge script of every Xbox tab over a runtime port. It also reports its
 * status to the popup.
 *
 * The WebSocket lives here, not in a content script, because Chrome makes a
 * content script's requests on behalf of the page it runs in, and xbox.com's
 * Content-Security-Policy (`connect-src`) doesn't allow the relay server.
 */

import {
  CloseCode,
  isPeerMessage,
  parseControllerMessage,
  stateFromMessage,
} from "@remote-gamepad/shared/protocol";
import { type InputEvent, PortName, type ServerStatus, type Status } from "./messages.ts";
import { loadSettings, relayUrl, type Settings, StorageKey } from "./settings.ts";

/** First reconnect delay. It doubles on each failure, up to `RETRY_MAX_MS`. */
const RETRY_MIN_MS = 250;
const RETRY_MAX_MS = 5000;
/**
 * Chrome stops an idle extension service worker after 30 s. Sending on a
 * WebSocket counts as activity (Chrome 116+), so the host sends a message
 * this often. The relay server ignores messages from the host.
 * See https://developer.chrome.com/docs/extensions/how-to/web-platform/websockets
 */
const KEEPALIVE_MS = 20_000;
const KEEPALIVE_MESSAGE = JSON.stringify({ t: "ping" });

/** Bridge ports, one per Xbox tab. */
const bridges = new Set<chrome.runtime.Port>();
/** Popup ports. At most one in practice. */
const popups = new Set<chrome.runtime.Port>();

let settings: Settings | null = null;
const settingsLoaded = loadSettings().then((loaded) => {
  settings = loaded;
});

let socket: WebSocket | null = null;
let server: ServerStatus = "idle";
let controller = false;
/** Sequence number of the last state passed on. Older states are dropped. */
let lastSeq = -Infinity;
let failures = 0;
let retryTimer: number | undefined;
let keepaliveTimer: number | undefined;

function status(): Status {
  return {
    server,
    controller,
    address: settings?.address ?? "",
    session: settings?.session ?? "",
  };
}

function setServer(next: ServerStatus): void {
  server = next;
  for (const port of popups) port.postMessage(status());
}

function sendInput(event: InputEvent): void {
  for (const port of bridges) port.postMessage(event);
}

function setController(connected: boolean): void {
  // The phone may have restarted, so its sequence numbers start over.
  lastSeq = -Infinity;
  if (connected === controller) return;
  controller = connected;
  sendInput({ kind: "controller", connected });
  for (const port of popups) port.postMessage(status());
}

function handleMessage(data: unknown): void {
  if (typeof data !== "string") return;
  let message: unknown;
  try {
    message = JSON.parse(data);
  } catch {
    return;
  }

  if (isPeerMessage(message)) {
    setController(message.connected);
    return;
  }
  const input = parseControllerMessage(message);
  if (!input) return;
  if (input.t !== "state") {
    sendInput({ kind: "alive" });
    return;
  }
  if (input.seq <= lastSeq) return;
  lastSeq = input.seq;
  sendInput({ kind: "state", state: stateFromMessage(input) });
}

/** Opens the WebSocket if an Xbox tab needs it and it isn't open or scheduled. */
function connect(): void {
  if (socket || retryTimer !== undefined || bridges.size === 0) return;
  if (!settings) {
    settingsLoaded.then(connect);
    return;
  }
  const url = relayUrl(settings.address, settings.session);
  if (!url) {
    setServer("bad-address");
    return;
  }

  const ws = new WebSocket(url);
  socket = ws;
  setServer("connecting");

  ws.onopen = () => {
    failures = 0;
    keepaliveTimer = setInterval(() => ws.send(KEEPALIVE_MESSAGE), KEEPALIVE_MS);
    setServer("connected");
  };
  ws.onmessage = (e) => handleMessage(e.data);
  ws.onclose = (e) => {
    clearInterval(keepaliveTimer);
    socket = null;
    setController(false);
    retry(e.code === CloseCode.RoleTaken ? "taken" : "unreachable");
  };
}

/** Schedules a reconnect with backoff, unless no Xbox tab is open. */
function retry(reason: ServerStatus): void {
  if (bridges.size === 0) {
    setServer("idle");
    return;
  }
  const delay = Math.min(RETRY_MIN_MS * 2 ** failures, RETRY_MAX_MS);
  failures++;
  retryTimer = setTimeout(() => {
    retryTimer = undefined;
    connect();
  }, delay);
  setServer(reason);
}

/** Closes the WebSocket and cancels any reconnect. */
function disconnect(): void {
  clearTimeout(retryTimer);
  retryTimer = undefined;
  clearInterval(keepaliveTimer);
  if (socket) {
    socket.onclose = null;
    socket.close();
    socket = null;
  }
  failures = 0;
  setController(false);
  setServer("idle");
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === PortName.Bridge && port.sender?.tab) {
    bridges.add(port);
    port.onDisconnect.addListener(() => {
      bridges.delete(port);
      if (bridges.size === 0) disconnect();
    });
    if (controller) port.postMessage({ kind: "controller", connected: true } satisfies InputEvent);
    connect();
  } else if (port.name === PortName.Popup) {
    popups.add(port);
    port.onDisconnect.addListener(() => popups.delete(port));
    settingsLoaded.then(() => port.postMessage(status()));
  } else {
    port.disconnect();
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !settings) return;
  const address = changes[StorageKey.Address]?.newValue;
  const session = changes[StorageKey.Session]?.newValue;
  if (typeof address !== "string" && typeof session !== "string") return;

  settings = {
    address: typeof address === "string" ? address : settings.address,
    session: typeof session === "string" ? session : settings.session,
  };
  // Reconnect right away with the new settings.
  disconnect();
  connect();
});
