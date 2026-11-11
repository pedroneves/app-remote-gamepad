# Architecture: Virtual Gamepad for Xbox Cloud Gaming

## Goal

Use a phone as a gamepad for Xbox Cloud Gaming (xbox.com/play) running in Chrome on a laptop. The phone shows a touch gamepad. Its input reaches xbox.com as if a real controller were connected.

## Overview

```mermaid
flowchart LR
    A["Virtual Gamepad Web App<br/>(phone)"] -- "WebSocket<br/>input state" --> B["Relay Server<br/>(laptop / LAN)"]
    B -- "WebSocket<br/>input state" --> C["Chrome Extension<br/>(laptop, on xbox.com/play)"]
    C -- "navigator.getGamepads()" --> D["Xbox Cloud Gaming page"]
```

All three parts talk over the local network. No Bluetooth: a web page cannot act as a Bluetooth device, only connect to one.

## Components

### 1. Virtual Gamepad Web App (phone)

A static web page opened in the phone's browser.

- **UI:** Xbox layout: two analog sticks (with click), D-pad, A/B/X/Y, LB/RB, LT/RT (analog), View, Menu, Guide.
- **Input:** Touch events with multi-touch support. Sticks give values from -1 to 1 on each axis, with a dead zone. Triggers give 0 to 1.
- **Output:** Sends the full controller state to the relay server over WebSocket. It sends whenever the state changes, plus a heartbeat about every 100 ms.
- **Display:** Landscape, fullscreen, no scroll or zoom. Optional haptic tap through the Vibration API.
- **Pairing:** The user enters or scans a session code shown by the extension.

### 2. Relay Server (laptop or LAN host)

A small Node.js server, run on the laptop by default.

- **Serves** the web app's static files over HTTP.
- **WebSocket endpoint** with two roles:
  - `controller`: the phone web app
  - `host`: the Chrome extension
- **Sessions:** Pairs one controller with one host by session code. It forwards controller messages to the host unchanged.
- **Stateless:** It doesn't interpret input and keeps no data beyond the live connections.
- **Disconnects:** It tells the host when the controller drops.

### 3. Chrome Extension (laptop)

A Manifest V3 extension active only on `https://www.xbox.com/*/play*`.

It has two scripts:

- **Bridge script** (content script, isolated world)
  - Opens the WebSocket to the relay server. `ws://localhost` is allowed from an HTTPS page. A server on another machine would need `wss://`.
  - Passes each state update to the page script through `window.postMessage`.
- **Page script** (content script, `"world": "MAIN"`, runs at `document_start`)
  - Replaces `navigator.getGamepads()` so the result includes a virtual `Gamepad` with `mapping: "standard"`, 17 buttons and 4 axes.
  - Fires `gamepadconnected` and `gamepaddisconnected` events.
  - Updates `timestamp` on every state change so the page sees new input.
- **Popup:** Shows connection status and the session code, and lets the user set the server address.

## Input Protocol

The same JSON message travels from the phone through the server to the extension:

```json
{ "t": "state", "seq": 1042, "b": 4097, "lt": 0.0, "rt": 0.85, "ax": [0.0, -1.0, 0.12, 0.0] }
```

| Field | Meaning |
|---|---|
| `t` | Message type: `state`, `hello`, `ping` |
| `seq` | Increasing sequence number. The extension drops stale messages. |
| `b` | Button bitmask. Bit *n* is standard-mapping button *n*. |
| `lt`, `rt` | Trigger values, 0 to 1 (buttons 6 and 7) |
| `ax` | `[leftX, leftY, rightX, rightY]`, -1 to 1 |

Standard mapping button indexes:

| Index | Button | Index | Button |
|---|---|---|---|
| 0 | A | 9 | Menu |
| 1 | B | 10 | Left stick click |
| 2 | X | 11 | Right stick click |
| 3 | Y | 12 | D-pad up |
| 4 | LB | 13 | D-pad down |
| 5 | RB | 14 | D-pad left |
| 6 | LT | 15 | D-pad right |
| 7 | RT | 16 | Guide |
| 8 | View | | |

## Reliability

- **No stuck inputs:** If the extension gets no message for 500 ms, or the controller disconnects, it resets to a neutral state with all buttons released and sticks centered.
- **Reconnect:** The phone and the extension both reconnect automatically with backoff.

## Performance

- **Latency target:** under 20 ms from touch to page on the same Wi-Fi network.
- **Message size:** under 100 bytes. It can move to a binary format later if needed.
- **Connection:** One long-lived WebSocket per client, with Nagle's algorithm disabled (`setNoDelay`) on the server.

## Security

- **Network:** Runs on the local network only.
- **Sessions:** A random session code is required to pair. The server rejects a second controller or host on the same session.
- **Permissions:** The extension requests access only to xbox.com.

## Open Questions

- Rumble: forward the page's `vibrationActuator` calls back to the phone?
- More than one virtual controller for local co-op?
- Serve over HTTPS (self-signed) to enable the Screen Wake Lock API on the phone?