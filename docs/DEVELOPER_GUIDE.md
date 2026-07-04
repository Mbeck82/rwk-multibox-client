# Developer guide

This explains what the app actually does under the hood, why it's built the way it
is, and where to look when you need to change something. Read this before touching
`src/main/fleetManager.ts` or `src/main/pageScripts.ts` in particular — both rely on
non-obvious facts about how the RWK game client works, and it's easy to introduce a
subtle regression without knowing them.

## What this app is (and isn't)

A **multiboxing client**, not a bot. One controller window owns a character vault and
spawns one Electron `BrowserWindow` per character (a "child"). Every action a child
window performs is either:

1. A real keystroke or click the player made in that specific window, or
2. A synthetic echo of a keystroke the player made *somewhere* — either by clicking a
   button on the controller's hotkey pad, or by pressing a key inside another child
   while "leader mode" is on.

There is no polling of game state, no decision-making, no timers driving actions. The
one scripted exception is filling in the login form from the vault (`runLogin` in
`fleetManager.ts`) — that's a one-time form fill + submit-click, not an ongoing loop.

## Repo layout

```
src/
  main/           Electron main process — everything privileged lives here
    index.ts        App bootstrap: userData path, single-instance lock, session
                     config, controller window, all ipcMain handlers
    characterStore.ts  Vault CRUD + on-disk persistence
    parentVaultImport.ts  Reads an RWK Client character-vault.json directly
    fleetManager.ts   Child window lifecycle, navigation guards, login runner,
                      hotkey broadcast/leader-mode forwarding
    pageScripts.ts    JS source strings executed inside child game pages via
                      webContents.executeJavaScript
  preload/
    preload.ts      contextBridge: exposes window.mbox to the controller renderer
  renderer/
    index.html, src/App.tsx, src/styles.css   Controller UI (vault, fleet list,
                                               hotkey pad) — plain React, no
                                               state library, no CSS framework
  shared/           Imported by both main and renderer — keep it Electron-free
    types.ts          ManagedCharacter, shard ids, snapshot shapes
    rwkPolicy.ts      URL/domain-lock helpers
    hotkeys.ts        The hotkey table (RWK keybind -> keyCode + capture keys)
    characterImportExport.ts  Name,Password / JSON import-export parsing
    mboxApi.ts        TypeScript interface for window.mbox (single source of
                      truth for the IPC contract — preload and renderer both
                      implement/consume this exact shape)
tests/              Pure-logic unit tests (node:test via tsx), no Electron
docs/DEVELOPER_GUIDE.md  This file
```

Child game windows get **no preload at all**. Everything they need (login form fill,
hotkey dispatch, focus probing) is injected ad hoc via
`webContents.executeJavaScript` from `fleetManager.ts`, using the script builders in
`pageScripts.ts`. This mirrors how the sibling automation project
(`rwk-electron-client`) drives the game, minus the automation loop on top.

## The RWK game's frame layout (ground truth)

Everything about how child windows are driven depends on this, so it's worth stating
explicitly. The game's interface — chat box, action forms, the hotkey handler — lives
inside a **subframe named `main`**, not the top document. The top document holds the
login form and a couple of state markers (`#s_name`, `#IntroDiv`, `#InterfaceDiv`).

Concretely, in the original client script (`realcComp.js`, the compiled game
interface — a copy lives in the sibling `rwk-remake` project's
`reference/original-client/` for reference):

- The hotkey handler is bound once on `Document.body` where `Document` is that
  frame's own `document` — i.e. `frames.main.document.body`.
- `chattybox` (chat input), `skipform` (hidden scratch form used by every hotkey
  action), `general0..3` / `king0..2` (the action-menu forms), and `hkfoc` (a hidden
  focus-catcher element Esc focuses) are all in that same document.
- The login form and `#s_name` / `#IntroDiv` / `#InterfaceDiv` are in the **top**
  document.

Because of this, every script in `pageScripts.ts` starts with a small recursive frame
walker (`COLLECT_DOCS_SRC`) that gathers same-origin documents up to 3 levels deep,
then picks whichever document actually has the element it's looking for (login form
vs. `skipform`/`chattybox`). Nothing assumes `window.top` or `window.frames.main`
directly — the walker is what makes the same script work regardless of exactly how
the game's frameset is nested.

## How hotkey broadcast actually works

The game's hotkey handler:

- Is a single `keydown` listener on the interface frame's body.
- Reads **only `event.keyCode`** — never `event.key`, `event.which` at the semantic
  level, or `event.isTrusted`.
- Runs its own normalization (`Ba()` in the original script): letters get lowercased
  by adding 32, a handful of punctuation codes get remapped, digits 96–105 (numpad)
  get remapped to 48–57. This happens *inside* the game's handler, after the event
  already fired — so what we dispatch must be the **raw**, pre-normalization keyCode.
- Latches each key (`Z.KeyDown[keyCode] = true` on keydown) and ignores repeats of
  the same code until a matching `keyup` clears the latch.
- Bails out entirely (except for Esc) whenever `document.activeElement` is an
  input/select/textarea, or is specifically `#chattybox` or `#StoreIframe`.

`pageScripts.ts`'s `buildHotkeyDispatchScript(keyCode)` embeds this as a template:
find the interface document (the one with `#skipform`/`#chattybox`/`#hkfoc`), build a
`KeyboardEvent("keydown")`, graft a getter onto its `keyCode` property (the
constructor otherwise ignores any `keyCode` you pass — it's read-only), dispatch it,
then fire a matching `keyup`. No OS-level focus is required; this works whether or
not the window is visible or focused, because it's a same-process DOM event, not an
OS input event.

`src/shared/hotkeys.ts` is the single table mapping every documented RWK hotkey to
its raw keyCode, plus the DOM `key`/`code` values used to *capture* a physical
keypress (for the controller's capture zone and for leader mode). **The raw keyCode
in that table is the ground truth for what to send** — do not "clean it up" to a
normalized value; that's the opposite of what the game expects. In particular:

- Letters are the raw uppercase ASCII code (`a` → 65), not the lowercase code the
  game computes internally.
- `[` / `]` are raw 219/221. Sending the *normalized* 91/93 would be read by the
  game's `Ba()` as the OS/Command key and dropped — this is the one gotcha that's
  easy to get backwards.
- Backtick is raw 192, slash is raw 191.

Two dispatch paths use this table:

- **Broadcast pad** (`FleetManager.broadcastHotkey` → `dispatchHotkey`): the
  controller UI calls this directly; it fires the synthetic event into every
  broadcast-enabled child, unconditionally.
- **Leader mode** (`FleetManager.forwardFromLeader`): a *real* keypress inside a
  focused child (captured via Electron's `before-input-event`, which fires before
  the renderer's own keydown) gets mirrored to every other child, gated by a
  chat-focus probe so chat text isn't broadcast as hotkeys. The leader's own window
  is never re-dispatched to — it already handled the real keystroke natively.

### Why Enter and `/` are never auto-mirrored in leader mode

Both keys make the game synchronously move focus into the chat box, at the same
moment `before-input-event` fires. Probing focus state *after* that keystroke (which
is what the chat-focus gate does for every other key) would race the game's own
focus change — whichever finishes first differs run to run. Rather than build a
more complex ordering guarantee for two keys whose "mirror this to everyone" meaning
is questionable anyway (each player's chat focus is independently theirs), leader
mode just excludes them from auto-forwarding. They're still reachable from the
broadcast pad if you deliberately want to send Enter/`/` fleet-wide.

### The Store-iframe focus check

`CHAT_FOCUS_PROBE_SCRIPT` mirrors the game's own focus gate (`ka()`/`da()` in the
original script). One subtlety: the in-game store opens in an `<iframe
id="StoreIframe">` *inside* the interface document. When the store has focus, the
interface document's `activeElement` **is that iframe element itself** — so the
`id === "StoreIframe"` check has to run *before* the "skip iframes, recurse into
them" step, not after. (This was backwards for a while during development — if you
ever see leader mode misbehaving while the store is open, check this ordering first.)

## Login autofill

`pageScripts.ts`'s `buildLoginFillScript` ranks candidate `<form>` elements the same
way the sibling automation client does: prefer a form with a hidden `action=login`
field, then a form whose id/name contains `thelogin`, then any form with a password
input + a text input + a submit input. Username field is matched by `name` in order
`login` → `username` → `name` → first text-like input; password by `name=password`
or the first password input; submit by `value=login` → `name=subshit` (the game's
actual submit button name) → first submit/image input. Values are set through the
native `HTMLInputElement` value setter (so frameworks relying on property setters see
the change) plus synthetic `input`/`change` events, then verified by read-back before
clicking submit.

Login success/failure detection (`LOGIN_STATE_PROBE_SCRIPT`,
`findLoginErrorMarker`) mirrors the same checks: dashboard-ready means `#s_name` has
text, `#InterfaceDiv` is visible, and `#IntroDiv` is not; failure is matched against
a fixed list of server error strings. `runLogin` in `fleetManager.ts` polls this every
500ms for up to 20s.

## Sessions, windows, and navigation locking

Each character gets its own **persistent session partition**
(`persist:mbox-char-<characterId>`), so cookies never cross accounts and a session
survives app restarts (an already-logged-in character often skips the login form
entirely on relaunch). Blank/manual-login clients get a non-persistent, per-launch
partition instead.

Every child window gets three layers of domain locking to
`rwk1.racewarkingdoms.com` / `rwk2.racewarkingdoms.com`:

1. `setWindowOpenHandler` — vets the *target* of any popup/`window.open()` call.
2. `will-navigate` — blocks in-page navigation to a disallowed URL. This does **not**
   fire for server-side redirects.
3. `did-navigate` — a fallback that reloads the shard's landing page if the
   *committed* URL ends up off-domain anyway (catches the redirect case #2 misses).
   Popup windows (e.g. the in-game store) get all three as well — an early version
   only had #1 and #2 on popups, which left them exposed to the redirect gap.

Non-RWK https(s) links (e.g. a wiki link) are opened in the user's default browser
via `shell.openExternal` instead of being denied outright.

### Single instance

The vault (`characterStore.ts`) is loaded once into memory at startup and every save
rewrites the whole file — there's no cross-process file watching like the sibling
automation client has (that app supports up to 50 simultaneous processes sharing one
vault; this one doesn't need to, so it doesn't carry that complexity). Because of
that, `index.ts` calls `app.requestSingleInstanceLock()` at startup: a second launch
just focuses the existing controller instead of starting a second process that would
silently clobber the first's vault writes.

## The IPC contract

`src/shared/mboxApi.ts` is the single source of truth for what the controller
renderer can call. `src/preload/preload.ts` implements it 1:1 over
`contextBridge`/`ipcRenderer.invoke`, and `src/main/index.ts` registers a matching
`ipcMain.handle` for every channel. If you add a method to the vault or fleet API:

1. Add it to `MboxApi` in `mboxApi.ts`.
2. Implement it in `preload.ts` (just a thin `ipcRenderer.invoke` wrapper).
3. Register the `ipcMain.handle` in `index.ts`, delegating to `CharacterStore` or
   `FleetManager`.
4. Call it from `App.tsx`.

Two push channels (`vault:changed`, `fleet:changed`) let the renderer stay in sync
without polling — anything that mutates the vault or fleet state calls
`broadcastVaultSnapshot()` / `broadcastFleetSnapshot()` afterward.

## Testing strategy

There's no Electron-launching test suite (no Playwright, unlike the sibling
automation project). Electron-launching tests need a real GUI session and time out
in a headless/sandboxed environment — the only tests you can actually run everywhere
are pure-logic ones. `npm run test` covers:

- `characterImportExport.test.ts` — Name,Password parsing, JSON export/import
  round-trips.
- `characterStore.test.ts` — vault save/load, password encoding, dedupe/merge
  policy, corrupt-file recovery.
- `hotkeys.test.ts` — every documented hotkey has the exact expected raw keyCode,
  and the DOM key/code capture mapping resolves correctly.
- `parentVaultImport.test.ts` — reading an RWK Client vault file directly.

`npm run build` is the real safety net for everything Electron/renderer-specific —
it'll catch a bad import, a stray reference to a Node-only API from renderer code,
etc. `npm run typecheck` runs the node and web `tsconfig`s separately, matching how
`electron.vite.config.ts` splits main/preload from renderer.

If you change a script in `pageScripts.ts`, remember `tsc` only checks that the
*template literal* (a string) is well-typed — it does **not** parse the JavaScript
inside the string. Sanity-check the assembled script the way CONTRIBUTING.md
describes before assuming it's correct.

## Release process

There's no auto-updater and no S3 publish pipeline (unlike the sibling automation
client) — this is a from-source / manually-distributed tool. `npm run dist` runs
`scripts/dist.cjs`, which clears `out/`, runs `electron-vite build`, then packages an
unsigned Windows installer + portable exe via `electron-builder` into
`release-rwk-multibox/` (`CSC_IDENTITY_AUTO_DISCOVERY=false`, so it doesn't try to
find a code-signing cert that doesn't exist).
