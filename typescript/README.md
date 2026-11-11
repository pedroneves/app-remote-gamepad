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
    │   └── deno.json      Type checks against browser DOM libraries
    ├── server/            Relay Server (laptop / LAN)
    ├── chrome-extension/  Chrome Extension (laptop, on xbox.com/play)
    └── utils/             Code shared by all three components
```

| Folder | Component | What it does |
|---|---|---|
| `src/web-app/` | Virtual Gamepad Web App | Touch gamepad page for the phone. Sends controller state over WebSocket. |
| `src/server/` | Relay Server | Serves the web app and relays input from controller to host by session code. |
| `src/chrome-extension/` | Chrome Extension | Receives input and exposes it to xbox.com through `navigator.getGamepads()`. |
| `src/utils/` | Shared utilities | Code used by more than one component, such as the input protocol and button mapping. |

Shared code goes in `src/utils/` only. Components import from `utils/` but never from each other.

## Status

The project structure is in place. No source code yet.
