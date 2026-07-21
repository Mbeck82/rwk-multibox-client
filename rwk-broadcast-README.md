# RWK Multibox — the simple Chrome + AutoHotkey way

Play several **Race War Kingdoms** accounts at once, in plain Chrome, with no
special client. Whatever key you press in the window you're looking at is
instantly sent to all your other account windows too.

You need two files: **`rwk-broadcast.ahk`** (the script) and this readme.

---

## Setup (once)

1. **Install AutoHotkey v2** — go to <https://www.autohotkey.com/>, click
   **Download**, choose **v2**, run the installer. (v1 will *not* work.)
2. Save **`rwk-broadcast.ahk`** anywhere you like (Desktop is fine).

## Every time you play

1. Open each account in its **own separate Chrome window** — not tabs.
   One window per account. (New window: `Ctrl+N`, or drag a tab out.) Log in to each.
2. **Double-click `rwk-broadcast.ahk`.** A green **H** icon appears near the clock —
   that means it's running. A tooltip says "loaded."
3. For each window: **click inside the game area once** (this gives the game its
   keyboard focus — required for it to receive keys in the background), then press
   **`Ctrl+Alt+T`** to tag it. A tooltip tells you how many windows are tagged.
4. **Play.** Any supported key you press inside a tagged window is echoed to all of
   them at once — including the windows behind, with no flicker and no delay.

To stop it: right-click the green **H** icon → **Exit**.

---

## Hotkeys

| Keys | What it does |
|------|--------------|
| **Ctrl+Alt+T** | Tag / untag the window you're in |
| **Ctrl+Alt+B** | Pause / resume broadcasting (pause it to type a private chat message in one window) |
| **Ctrl+Alt+Space** | Test — flashes **Esc** to every tagged window |
| **Ctrl+Alt+C** | Clear all tags |
| **Ctrl+Alt+L** | Show status (how many tagged, on/off) |
| **Ctrl+Alt+Enter** | Send **Enter** to the whole fleet on purpose |
| **Ctrl+Alt+/** | Send **/** to the whole fleet on purpose |

**Broadcast keys** (pressed inside a tagged window, sent to all): letters
`b n a c d f r t p j`, digits `0`–`9`, `[` `]` `` ` ``, the four **arrows**, and **Esc**.

**Enter** and **/** are *not* auto-sent — each window's chat box is separate, so
mirroring them would fight the game. Type them normally in one window, or use the
two "on purpose" hotkeys above to send them everywhere.

---

## If the other windows don't react

First, sanity-check: are the windows **tagged** (Ctrl+Alt+L to see the count) and is
broadcasting **on** (Ctrl+Alt+B toggles it)?

Then press **Ctrl+Alt+Space**. Every tagged window should react to Esc (close a menu,
etc.).

**If one window ignores keys, its game frame lost focus.** The script delivers each key
to whatever frame a window last had focused — so if you clicked the address bar, a
different tab, or never clicked into the game after loading, keys land in the wrong
place. Fix: **click once inside that window's game area**, then carry on. Re-tagging
isn't needed; just the click.

That's the only common gotcha — there's no focus-switching or flicker to fight, because
keys are delivered to the background windows directly.

---

## Good to know

- **Tags reset when you close the script or Chrome.** Just re-tag (Ctrl+Alt+T) next time.
- **One window per account.** Keys go to whichever *tab* is showing in a tagged window,
  so keep each account in its own window with the game tab in front.
- **This is not automation** — there are no bots, loops, or macros. It only echoes the
  key *you* press to your other windows, the same as pressing it in each yourself.
- Want an always-visible on-screen "ON / 3 windows tagged" panel instead of tooltips?
  Ask and it can be added.
