/** Extension settings, kept in `chrome.storage.local`. */

import { DEFAULT_SERVER_PORT, RELAY_PATH } from "@remote-gamepad/shared/protocol";

/** Matches the address the relay server prints when it starts. */
export const DEFAULT_ADDRESS = `127.0.0.1:${DEFAULT_SERVER_PORT}`;

/** Keys in `chrome.storage.local`. */
export const StorageKey = {
  /** Relay server address: `host:port`, or a `ws://` or `wss://` URL. */
  Address: "address",
  /** Session code, made once and then kept. */
  Session: "session",
} as const;

export interface Settings {
  address: string;
  session: string;
}

/** Reads the settings. Makes and stores a session code the first time. */
export async function loadSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get([StorageKey.Address, StorageKey.Session]);
  const address = stored[StorageKey.Address];
  let session = stored[StorageKey.Session];
  if (typeof session !== "string") {
    session = newSessionCode();
    await chrome.storage.local.set({ [StorageKey.Session]: session });
  }
  return {
    address: typeof address === "string" && address ? address : DEFAULT_ADDRESS,
    session: session as string,
  };
}

/** A random 6-digit code. */
export function newSessionCode(): string {
  // 4_294_000_000 is the largest multiple of 1_000_000 below 2^32. Retrying above it avoids modulo bias.
  const values = new Uint32Array(1);
  do crypto.getRandomValues(values); while (values[0] >= 4_294_000_000);
  return String(values[0] % 1_000_000).padStart(6, "0");
}

/**
 * The relay server's WebSocket URL for this extension's session, or `null` if
 * the address isn't valid. `host:port` means `ws://host:port`.
 */
export function relayUrl(address: string, session: string): URL | null {
  const trimmed = address.trim();
  let url: URL;
  try {
    url = new URL(trimmed.includes("://") ? trimmed : `ws://${trimmed}`);
  } catch {
    return null;
  }
  if (url.protocol !== "ws:" && url.protocol !== "wss:") return null;
  if (url.pathname !== "/" || url.search || url.hash || url.username || url.password) return null;
  url.pathname = RELAY_PATH;
  url.search = new URLSearchParams({ role: "host", session }).toString();
  return url;
}
