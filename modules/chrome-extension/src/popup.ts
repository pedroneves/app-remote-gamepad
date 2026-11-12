/**
 * Popup. Shows the connection status and the session code, and sets the
 * relay server address. The status comes from the service worker over a
 * runtime port, live while the popup is open.
 */

import { PortName, type ServerStatus, type Status } from "./messages.ts";
import { DEFAULT_ADDRESS, relayUrl, StorageKey } from "./settings.ts";

type Tone = "idle" | "ok" | "wait" | "error";

function required<E extends Element>(selector: string): E {
  const el = document.querySelector<E>(selector);
  if (!el) throw new Error(`Missing element: ${selector}`);
  return el;
}

const statusEl = required<HTMLElement>("#status");
const sessionEl = required<HTMLElement>("#session");
const form = required<HTMLFormElement>("#address-form");
const addressInput = required<HTMLInputElement>("#address");
const addressError = required<HTMLElement>("#address-error");

const SERVER_TEXT: Record<Exclude<ServerStatus, "connected">, [Tone, string]> = {
  idle: ["idle", "Open Xbox Cloud Gaming to connect."],
  connecting: ["wait", "Connecting to the relay server…"],
  unreachable: ["error", "Can't reach the relay server. Retrying…"],
  taken: ["error", "Another host is using this session code. Retrying…"],
  "bad-address": ["error", "The relay server address isn't valid."],
};

function describe(s: Status): [Tone, string] {
  if (s.server !== "connected") return SERVER_TEXT[s.server];
  return s.controller ? ["ok", "Phone connected."] : ["wait", "Waiting for the phone…"];
}

let addressShown = false;

function render(s: Status): void {
  const [tone, text] = describe(s);
  statusEl.dataset.tone = tone;
  statusEl.textContent = text;
  sessionEl.textContent = s.session;
  // Fill the field once, so a status update doesn't overwrite what the user is typing.
  if (!addressShown) {
    addressInput.value = s.address;
    addressInput.placeholder = DEFAULT_ADDRESS;
    addressShown = true;
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const address = addressInput.value.trim() || DEFAULT_ADDRESS;
  if (!relayUrl(address, "000000")) {
    addressError.textContent = "Use host:port, or a ws:// or wss:// URL.";
    return;
  }
  addressError.textContent = "";
  addressInput.value = address;
  await chrome.storage.local.set({ [StorageKey.Address]: address });
});

const port = chrome.runtime.connect({ name: PortName.Popup });
port.onMessage.addListener((message) => render(message as Status));
