# Development

The Virtual Gamepad for Xbox Cloud Gaming is a [Deno](https://deno.com) workspace. Each component is a module under `modules/`. The web app, Chrome extension and shared code are TypeScript only. The server may also get implementations in other languages, so its TypeScript version lives in `modules/server/typescript/`. See the [architecture](ARCHITECTURE.md) for the design.

## No Third-Party Dependencies

**This project must not use any third-party dependency.** Everything is built from the ground up.

Allowed:

- Deno runtime APIs (`Deno.serve`, `Deno.upgradeWebSocket`, `Deno.readFile`, ...)
- Web platform APIs (`WebSocket`, `fetch`, DOM, Touch Events, Vibration API, ...)
- Chrome extension APIs (`chrome.*`)
- Code inside this repository

Not allowed:

- `npm:`, `jsr:` or URL imports of any kind
- The Deno standard library (`jsr:@std/*`), which is also an external package
- UI frameworks, bundlers, WebSocket libraries or test libraries

The `imports` map in the root [deno.json](../deno.json) stays empty. Modules reach shared code through the workspace, not through imports.

## Project Layout

```
deno.json                     Deno workspace root and all tasks (no imports)
modules/
├── shared/                   @remote-gamepad/shared: code shared by all components
│   ├── deno.json             Exports ./gamepad and ./protocol
│   └── src/
│       ├── gamepad.ts        Standard gamepad mapping and state
│       └── protocol.ts       Connection protocol with the relay server
├── web-app/                  Virtual Gamepad Web App (phone)
│   ├── deno.json             Type checks against browser DOM libraries
│   ├── dist/                 Build output
│   └── src/
│       ├── app.html          Page, layout and styles
│       ├── app.ts            Touch input to gamepad state, joining a session
│       ├── connection.ts     WebSocket to the relay server
│       └── dev/              Dev server (runs on Deno, so it is its own workspace member)
├── chrome-extension/         Chrome Extension (laptop, on xbox.com/play)
│   ├── deno.json             Type checks against browser DOM libraries and chrome.d.ts
│   ├── dist/                 Build output, loaded unpacked in Chrome
│   └── src/
│       ├── manifest.json     Manifest V3
│       ├── chrome.d.ts       Hand-written types for the chrome.* APIs used
│       ├── background.ts     Service worker: WebSocket to the relay server
│       ├── bridge.ts         Content script: passes input from the service worker to the page
│       ├── page.ts           Content script in the page's world: the virtual gamepad
│       └── popup.*           Status, session code and server address
└── server/                   Relay Server (laptop / LAN)
    └── typescript/           TypeScript implementation
        ├── deno.json
        ├── dist/             Reserved for a compiled server binary
        └── src/
            ├── main.ts       Entry point: HTTP server and routes
            ├── relay.ts      WebSocket sessions and forwarding
            ├── network.ts    Which client addresses count as local
            └── static.ts     Serves the built web app
```

| Folder | Component | What it does |
|---|---|---|
| `modules/web-app/` | Virtual Gamepad Web App | Touch gamepad page for the phone. Sends controller state over WebSocket. |
| `modules/server/typescript/` | Relay Server | Serves the web app and relays input from controller to host by session code. |
| `modules/chrome-extension/` | Chrome Extension | Receives input and exposes it to xbox.com through `navigator.getGamepads()`. |
| `modules/shared/` | Shared code | Code used by more than one component, such as the input protocol and button mapping. |

Every folder with a `deno.json` is a member of the workspace in the root [deno.json](../deno.json). Shared code goes in `modules/shared/` only. Components import it as `@remote-gamepad/shared/gamepad` and `@remote-gamepad/shared/protocol`, and never import from each other.

## Tasks

Run tasks from the repository root.

| Command | What it does |
|---|---|
| `deno task check` | Type checks, lints and checks formatting |
| `deno task web-app:dev [port]` | Runs the web app dev server at `http://127.0.0.1:7000/` (or `port`). Local connections only. |
| `deno task web-app:build` | Bundles the web app into `modules/web-app/dist/` with `deno bundle` (built into Deno) |
| `deno task chrome-extension:build` | Bundles the extension into `modules/chrome-extension/dist/` |
| `deno task server:start [port]` | Runs the relay server on port 7001 (or `port`) on every network interface. Prints the address to open on the phone. Refuses clients outside the local network. Serves `modules/web-app/dist/` and relays input at `/ws`. |

The dev server reads `app.html` from disk and builds `app.js` from `app.ts` in memory on every request, so a reload shows the latest code. No files are written. Build errors show on the page. It uses `Deno.bundle()`, which is built into Deno but unstable, so it needs `--unstable-bundle`. The build doesn't type check, so run `deno task check` for that.

## Playing

1. Run `deno task web-app:build` and `deno task chrome-extension:build`.
2. Run `deno task server:start`. It prints the web app's address on your network.
3. Load the extension (see below) and open Xbox Cloud Gaming in Chrome. The extension's popup shows the session code.
4. On the phone, on the same Wi-Fi, open the printed address and enter the code.

To use the dev server with a running relay server, open `http://127.0.0.1:7000/?server=127.0.0.1:7001`.

## Loading the Chrome Extension

1. Run `deno task chrome-extension:build`.
2. Open `chrome://extensions`, turn on **Developer mode** and click **Load unpacked**.
3. Pick `modules/chrome-extension/dist/`.

After a rebuild, click the extension's reload button and reload the Xbox tab.

## Status

| Component | Status |
|---|---|
| Web app | Done. Touch layout, input, pairing by session code, sends to the relay server. |
| Relay server | Done. Serves the web app, pairs sessions and relays input. |
| Chrome extension | Written and smoke-tested outside Chrome. Not yet tried on xbox.com. |
