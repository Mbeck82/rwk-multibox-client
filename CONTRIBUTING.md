# Contributing

Thanks for considering a contribution. This is a small, focused project — please read
[docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md) first if you haven't touched the
codebase before; it explains the non-obvious parts (why keys are dispatched the way
they are, the frame-walking trick, the IPC contract) that are easy to get subtly wrong.

## Scope

Keep it to what's in the [README](README.md#features): character vault, controller +
child windows, fleet hotkey broadcast. Specifically **out of scope**:

- Anything that reads game state and acts on it without a human pressing a key
  (loops, auto-fight, auto-collect, scheduled actions). That belongs in a different
  project — this one is a multiboxing client, not a bot.
- New game-account-wide features that aren't a hotkey the game itself already
  supports. If RWK doesn't have a keybind for it, this app shouldn't invent one.

If you're not sure whether something fits, open an issue describing the idea before
sending a PR.

## Setup

```bash
npm install
npm run dev          # electron-vite dev server with HMR
```

## Before sending a PR

```bash
npm run typecheck
npm run test
npm run build
```

All three must pass. There's no Electron-launching test suite (see the developer
guide for why) — `npm run test` is pure-logic unit tests over the vault, import/export,
and the hotkey table; `npm run build` is the real correctness gate for everything
Electron-specific, since a bad import or a stray reference to Node/Electron-only APIs
from renderer code fails the build.

If you touch `src/main/pageScripts.ts` (the strings executed inside the game page),
also sanity-check the assembled script parses as valid JS — a template-literal typo
there won't be caught by `tsc` since the script body is just a string to TypeScript.
The quickest check:

```bash
npx tsx -e "const s = require('./src/main/pageScripts.ts'); new Function('return (' + s.buildHotkeyDispatchScript(65) + ')')"
```

(swap in whichever exported script/builder you changed).

## Style

- No comments explaining *what* code does — only *why*, when it's non-obvious (a
  game-side quirk, a race condition, a workaround). Match the existing tone.
- Don't add abstractions, options, or config for hypothetical future needs. This
  codebase is intentionally small.
- Keep the vault/import-export format compatible with the sibling RWK Client
  (`plain:<base64>` password rows) unless you have a strong reason to break it.

## Commit / PR conventions

- Small, focused commits. Describe *why*, not just *what* (the diff already shows what
  changed).
- Reference the RWK game behavior you're matching when it's not obvious from the code
  alone — a line number or function name from the original game script
  (`realcComp.js`) in a commit message or PR description is extremely helpful for the
  next person, since that script is the ground truth for how hotkeys/forms actually
  behave.
