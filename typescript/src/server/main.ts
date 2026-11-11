/**
 * Relay Server.
 *
 * - Serves the built web app from `dist/web-app/` (build it with `deno task web-app:build`).
 * - Relays input from the controller (phone) to the host (Chrome extension) at `/ws`.
 *
 * Listens on every network interface so a phone on the same network can
 * connect, but only answers this machine and private network addresses.
 *
 * Usage: deno task server:start [port]
 */

import { DEFAULT_SERVER_PORT, RELAY_PATH } from "../shared/protocol.ts";
import { isLocalAddress, lanAddresses } from "./network.ts";
import { Relay } from "./relay.ts";
import { serveStatic } from "./static.ts";

const WEB_APP_DIR = new URL("../../dist/web-app/", import.meta.url);
const WEB_APP_INDEX = "app.html";

const port = Number(Deno.args[0] ?? DEFAULT_SERVER_PORT);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error(`Invalid port: ${Deno.args[0]}`);
  Deno.exit(1);
}

async function exists(file: URL): Promise<boolean> {
  try {
    await Deno.stat(file);
    return true;
  } catch {
    return false;
  }
}

const relay = new Relay();
const webApp = serveStatic(WEB_APP_DIR, WEB_APP_INDEX);

if (!(await exists(new URL(WEB_APP_INDEX, WEB_APP_DIR)))) {
  console.warn("Web app not built yet. Run `deno task web-app:build`.");
}

Deno.serve({
  // Every interface, so the phone can reach it. Requests from outside the local network are refused below.
  hostname: "0.0.0.0",
  port,
  onListen({ port }) {
    console.log("Relay server running.");
    const addresses = lanAddresses();
    for (const address of addresses) console.log(`  Web app (phone): http://${address}:${port}/`);
    if (addresses.length === 0) {
      console.warn("  No local network address found. Is this machine on Wi-Fi?");
    }
    console.log(`  Chrome extension server address: 127.0.0.1:${port}`);
  },
}, (request, info) => {
  if (!isLocalAddress(info.remoteAddr.hostname)) {
    return new Response("Forbidden", { status: 403 });
  }
  const { pathname } = new URL(request.url);
  return pathname === RELAY_PATH ? relay.handle(request) : webApp(request);
});
