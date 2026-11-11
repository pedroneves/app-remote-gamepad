/**
 * WebSocket relay. Pairs one controller with one host by session code and
 * forwards the controller's messages to the host unchanged.
 *
 * It keeps nothing but the live connections. A message from a controller
 * whose host isn't connected is dropped.
 */

import {
  CloseCode,
  isRole,
  isSessionCode,
  otherRole,
  type PeerMessage,
  type Role,
} from "../shared/protocol.ts";

/** Seconds a client may go without answering a ping before the server drops it. */
const IDLE_TIMEOUT_S = 5;

type Session = Record<Role, WebSocket | null>;

function sendPeer(socket: WebSocket, connected: boolean): void {
  const message: PeerMessage = { t: "peer", connected };
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

export class Relay {
  #sessions = new Map<string, Session>();

  /** Handles a request to the relay endpoint. */
  handle(request: Request): Response {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected a WebSocket upgrade", {
        status: 426,
        headers: { upgrade: "websocket" },
      });
    }
    const params = new URL(request.url).searchParams;
    const role = params.get("role");
    const code = params.get("session");
    if (!isRole(role) || !isSessionCode(code)) {
      return new Response("Expected ?role=controller|host&session=<6 digits>", { status: 400 });
    }

    const { socket, response } = Deno.upgradeWebSocket(request, { idleTimeout: IDLE_TIMEOUT_S });
    socket.binaryType = "arraybuffer";
    socket.onopen = () => this.#join(code, role, socket);
    return response;
  }

  #join(code: string, role: Role, socket: WebSocket): void {
    const session = this.#sessions.get(code) ?? { controller: null, host: null };
    if (session[role]) {
      socket.close(CloseCode.RoleTaken, `Session already has a ${role}`);
      return;
    }
    session[role] = socket;
    this.#sessions.set(code, session);
    console.log(`${role} joined session ${code}`);

    const peer = session[otherRole(role)];
    sendPeer(socket, peer !== null);
    if (peer) sendPeer(peer, true);

    if (role === "controller") {
      socket.onmessage = (e) => {
        if (session.host?.readyState === WebSocket.OPEN) session.host.send(e.data);
      };
    }
    socket.onclose = () => this.#leave(code, role, socket);
  }

  #leave(code: string, role: Role, socket: WebSocket): void {
    const session = this.#sessions.get(code);
    if (session?.[role] !== socket) return;
    session[role] = null;
    console.log(`${role} left session ${code}`);

    const peer = session[otherRole(role)];
    if (peer) sendPeer(peer, false);
    else this.#sessions.delete(code);
  }
}
