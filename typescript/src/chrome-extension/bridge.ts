/**
 * Bridge script. A content script in the extension's isolated world.
 *
 * Connects to the service worker over a runtime port and passes each input
 * event on to the page script with `window.postMessage`. The page script runs
 * in the page's world, so it can't use extension APIs itself.
 */

import { type InputEvent, PAGE_CHANNEL, type PageMessage, PortName } from "./messages.ts";

/** Wait before reconnecting after the service worker restarts. */
const RECONNECT_MS = 100;

function toPage(event: InputEvent): void {
  const message: PageMessage = { channel: PAGE_CHANNEL, event };
  postMessage(message, location.origin);
}

function connect(): void {
  let port: chrome.runtime.Port;
  try {
    port = chrome.runtime.connect({ name: PortName.Bridge });
  } catch {
    // The extension was reloaded or removed. This script is orphaned.
    return;
  }
  port.onMessage.addListener((event) => toPage(event as InputEvent));
  port.onDisconnect.addListener(() => {
    // Release everything rather than leave inputs stuck while disconnected.
    toPage({ kind: "controller", connected: false });
    // Chrome stopped the service worker. Connecting starts it again.
    if (chrome.runtime?.id) setTimeout(connect, RECONNECT_MS);
  });
}

connect();
