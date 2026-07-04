# rwk-multibox-client

A **multiboxing client** for Race War Kingdoms (RWK). One controller
window manages a character vault and spawns child game windows; a fleet hotkey pad
broadcasts RWK's **built-in** keybinds to every child at once.

**No automation.** There are no loops, no schedulers, no game-state polling. Every
action is a direct echo of a keystroke or button press by the player. The only
scripted interaction is filling the login form from the vault.

## Features

1. **Character vault / login manager** — stores label, username, password, shard
   (rwk1/rwk2). Passwords are kept as `plain:<base64>` rows, the same encoding the
   RWK Client uses, and the JSON/list import–export formats are compatible in both
   directions (you can also import an RWK Client `character-vault.json` directly).
   Launching a character opens a child window and auto-fills the login form.
2. **Multi-client architecture** — a single Electron process; each character gets its
   own `BrowserWindow` with its own persistent session partition
   (`persist:mbox-char-<id>`), so cookies never cross accounts and sessions survive
   restarts. Closing the controller closes the fleet.
3. **Fleet hotkey control** — two ways to drive every window at once:
   - **Broadcast pad**: click a key button in the controller (or focus the capture
     zone and press the key) to send it to every checked window.
   - **Leader mode**: press hotkeys inside any child window and they're mirrored to
     the rest of the fleet. Keystrokes typed into the chat box are *not* mirrored
     (except Esc, which the game honors unconditionally). Enter and `/` are never
     auto-mirrored in leader mode — each window's chat focus is independent, and
     mirroring those two specifically races the game's own focus change (still
     available from the broadcast pad if you want to send them fleet-wide anyway).

## How the broadcast works

The original game script (`realcComp.js`) binds one `keydown` listener on the
interface frame's `document.body` and reads only `event.keyCode` — it never checks
`event.isTrusted`. The controller therefore dispatches synthetic
`keydown`/`keyup` pairs (with the raw keyCode grafted on via a getter) directly into
each child's game document through `executeJavaScript`. This works whether or not the
window has OS focus.

Quirks honored from the original script:

- Letters are sent as raw uppercase ASCII codes (the game lowercases itself).
- `[` / `]` are sent as raw 219/221 — normalized 91/93 would read as the OS key.
- A `keyup` always follows, because the game latches each key until keyup.
- Windows with chat focused ignore all keys except **Esc** — broadcast Esc first if a
  window seems deaf.

Supported keys: Esc, Enter, `/`, arrows, `[`, `]`, `b`, `n`, `` ` ``, `a`, `c`, `d`,
`f`, `r`, `t`, `1–3` (quick chat), `4/5/6/0` (general actions), `7/8/9` (kingdom
actions), `p`, `j` (poker).

## Commands

```bash
npm run dev        # electron-vite dev server with HMR
npm run typecheck  # tsc over node + web projects
npm run build      # electron-vite production build
npm run test       # pure-logic unit tests (vault, import/export, hotkey table)
npm run dist       # package unsigned Windows installer into release-rwk-multibox/
```

## Layout

- `src/main/` — app entry, character vault store, fleet manager (child windows,
  login runner, hotkey dispatch), injected page scripts.
- `src/preload/preload.ts` — `window.mbox` IPC bridge for the controller UI.
- `src/renderer/` — React controller UI (vault, fleet list, hotkey pad).
- `src/shared/` — types, RWK domain policy, the hotkey table, import/export helpers.

Child game windows run **without** a preload; the main process drives them purely via
`executeJavaScript`. Navigation is domain-locked to
`rwk1.racewarkingdoms.com` / `rwk2.racewarkingdoms.com`; other links open in the
default browser.

The vault lives at `%APPDATA%/rwk-multibox-client/multibox-vault.json` (same path in
dev and packaged builds). Only one instance of the app runs at a time (a second launch
just focuses the first) — the vault has no cross-process file watching, so two writers
would silently clobber each other.

## Developing

See [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md) for the full architecture
walkthrough (why hotkey dispatch works the way it does, the frame-walking trick, the
IPC contract, testing strategy, release process) and
[CONTRIBUTING.md](CONTRIBUTING.md) for how to send a pull request.

## Disclaimer

This client automates **nothing**. It only echoes real keystrokes/clicks the player
already made, plus a one-time login-form fill from the vault. Multiboxing rules vary
by game and by server; this project was built with the relevant game master's
sign-off for this specific use case — using it elsewhere is your own responsibility
under whatever rules apply there.

## License

Public domain, [The Unlicense](LICENSE). Do whatever you want with it.
