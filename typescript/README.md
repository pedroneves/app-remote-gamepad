# TypeScript Implementation

This is the TypeScript version of the Virtual Gamepad for Xbox Cloud Gaming. It runs on [Deno](https://deno.com). See the [architecture](../docs/ARCHITECTURE.md) for the design.

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

The `imports` map in [deno.json](deno.json) stays empty.

## Project Layout

```
typescript/
├── deno.json              Deno workspace config (no imports)
└── src/
    ├── web-app/           Virtual Gamepad Web App (phone)
    │   ├── deno.json      Type checks against browser DOM libraries
    │   ├── app.html       Page, layout and styles
    │   ├── app.ts         Touch input to gamepad state
    │   └── dev/           Dev server (runs on Deno, so it has its own deno.json)
    ├── server/            Relay Server (laptop / LAN)
    │   ├── main.ts        Entry point: HTTP server and routes
    │   ├── relay.ts       WebSocket sessions and forwarding
    │   └── static.ts      Serves the built web app
    ├── chrome-extension/  Chrome Extension (laptop, on xbox.com/play)
    └── shared/            Code shared by all three components
```

| Folder | Component | What it does |
|---|---|---|
| `src/web-app/` | Virtual Gamepad Web App | Touch gamepad page for the phone. Sends controller state over WebSocket. |
| `src/server/` | Relay Server | Serves the web app and relays input from controller to host by session code. |
| `src/chrome-extension/` | Chrome Extension | Receives input and exposes it to xbox.com through `navigator.getGamepads()`. |
| `src/shared/` | Shared code | Code used by more than one component, such as the input protocol and button mapping. |

Shared code goes in `src/shared/` only. Components import from `shared/` but never from each other.

## Tasks

| Command | What it does |
|---|---|
| `deno task check` | Type checks, lints and checks formatting |
| `deno task web-app:dev [port]` | Runs the web app dev server at `http://127.0.0.1:7000/` (or `port`). Local connections only. |
| `deno task web-app:build` | Bundles the web app into `dist/web-app/` with `deno bundle` (built into Deno) |
| `deno task server:start [port]` | Runs the relay server at `http://127.0.0.1:7001/` (or `port`). Local connections only. Serves `dist/web-app/` and relays input at `/ws`. |

The dev server reads `app.html` from disk and builds `app.js` from `app.ts` in memory on every request, so a reload shows the latest code. No files are written. Build errors show on the page. It uses `Deno.bundle()`, which is built into Deno but unstable, so it needs `--unstable-bundle`. The build doesn't type check, so run `deno task check` for that.

## Status

| Component | Status |
|---|---|
| Web app | Touch layout and input done. Shows the state on screen. Doesn't send it yet. |
| Relay server | Done. Serves the web app, pairs sessions and relays input. |
| Chrome extension | Not started |
