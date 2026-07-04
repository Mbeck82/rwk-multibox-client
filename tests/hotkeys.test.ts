import assert from "node:assert/strict";
import { test } from "node:test";

import { findHotkeyForKeyboardEvent, HOTKEYS, hotkeyById } from "../src/shared/hotkeys";

/**
 * Raw keyCodes the game's handler (realcComp.js) expects BEFORE its Ba() normalization.
 * Letters are uppercase ASCII; brackets/backtick/slash are the raw punctuation codes —
 * sending the normalized values instead would be swallowed (91/93 read as the OS key).
 */
const EXPECTED_RAW_KEYCODES: Record<string, number> = {
  esc: 27,
  enter: 13,
  slash: 191,
  up: 38,
  down: 40,
  left: 37,
  right: 39,
  planeDown: 219,
  planeUp: 221,
  beastBane: 66,
  beastNoobane: 78,
  shrineTrack: 192,
  attack: 65,
  cast: 67,
  defend: 68,
  fightLast: 70,
  revive: 82,
  train: 84,
  quickChat1: 49,
  quickChat2: 50,
  quickChat3: 51,
  general1: 52,
  general2: 53,
  general3: 54,
  general4: 48,
  kingdom1: 55,
  kingdom2: 56,
  kingdom3: 57,
  pokerPlay: 80,
  pokerFold: 74
};

test("every documented hotkey exists with the exact raw keyCode", () => {
  for (const [id, keyCode] of Object.entries(EXPECTED_RAW_KEYCODES)) {
    const hk = hotkeyById(id);
    assert.ok(hk, `missing hotkey ${id}`);
    assert.equal(hk!.keyCode, keyCode, `wrong keyCode for ${id}`);
  }
  assert.equal(HOTKEYS.length, Object.keys(EXPECTED_RAW_KEYCODES).length);
});

test("hotkey ids are unique", () => {
  const ids = new Set(HOTKEYS.map((hk) => hk.id));
  assert.equal(ids.size, HOTKEYS.length);
});

test("capture mapping resolves DOM key values", () => {
  assert.equal(findHotkeyForKeyboardEvent("ArrowUp", "ArrowUp")?.id, "up");
  assert.equal(findHotkeyForKeyboardEvent("a", "KeyA")?.id, "attack");
  assert.equal(findHotkeyForKeyboardEvent("A", "KeyA")?.id, "attack", "CapsLock letter should match");
  assert.equal(findHotkeyForKeyboardEvent("[", "BracketLeft")?.id, "planeDown");
  assert.equal(findHotkeyForKeyboardEvent("`", "Backquote")?.id, "shrineTrack");
  assert.equal(findHotkeyForKeyboardEvent("/", "Slash")?.id, "slash");
  assert.equal(findHotkeyForKeyboardEvent("Escape", "Escape")?.id, "esc");
  assert.equal(findHotkeyForKeyboardEvent("1", "Digit1")?.id, "quickChat1");
  assert.equal(findHotkeyForKeyboardEvent("1", "Numpad1")?.id, "quickChat1");
});

test("capture mapping ignores non-hotkeys", () => {
  assert.equal(findHotkeyForKeyboardEvent("q", "KeyQ"), null);
  assert.equal(findHotkeyForKeyboardEvent("F5", "F5"), null);
  assert.equal(findHotkeyForKeyboardEvent("Shift", "ShiftLeft"), null);
});
