import assert from "node:assert/strict";
import { test } from "node:test";

import { buildHotkeyDispatchScript, CHAT_FOCUS_PROBE_SCRIPT } from "../src/main/pageScripts";

/**
 * The injected scripts are source strings meant for a page, so they are exercised here
 * against a stub DOM rather than through Electron.
 *
 * What these lock down is the item-burn stall: the game's general/kingdom action menus
 * are <select>s ("submit selected action"), and a focused select made both halves of the
 * broadcast path go quiet — the leader stopped mirroring, and the followers' own game
 * guard swallowed whatever did arrive. Neither side recovered on its own.
 */

interface StubEl {
  tagName: string;
  id?: string;
  type?: string;
  blurCount?: number;
  blur?: () => void;
  dispatchEvent?: (ev: unknown) => void;
}

function el(tagName: string, extra: Partial<StubEl> = {}): StubEl {
  const node: StubEl = { tagName, id: "", blurCount: 0, ...extra };
  node.blur = () => {
    node.blurCount = (node.blurCount ?? 0) + 1;
  };
  return node;
}

/** A single same-origin document holding the game interface (skipform present). */
function stubWindow(activeElement: StubEl | null, body: StubEl) {
  const ids: Record<string, StubEl> = { skipform: el("form", { id: "skipform" }) };
  const doc = {
    body,
    documentElement: body,
    activeElement,
    getElementById: (id: string) => ids[id] ?? null
  };
  return { document: doc, frames: { length: 0 } };
}

class StubKeyboardEvent {
  type: string;
  constructor(type: string, _init?: unknown) {
    this.type = type;
  }
}

function dispatch(rawKeyCode: number, activeElement: StubEl | null) {
  const fired: string[] = [];
  const body = el("body", { dispatchEvent: (ev) => fired.push((ev as StubKeyboardEvent).type) });
  const run = new Function("window", "KeyboardEvent", `return ${buildHotkeyDispatchScript(rawKeyCode)};`);
  const result = run(stubWindow(activeElement, body), StubKeyboardEvent) as { ok: boolean; blurred: number };
  return { result, fired };
}

function probe(activeElement: StubEl | null) {
  const run = new Function("window", `return ${CHAT_FOCUS_PROBE_SCRIPT};`);
  return run(stubWindow(activeElement, el("body"))) as boolean;
}

test("dispatch drops a focused action menu so the game stops swallowing hotkeys", () => {
  const menu = el("select", { id: "burnmenu" });
  const { result, fired } = dispatch(52, menu); // 4 = general1, "submit selected action"

  assert.equal(menu.blurCount, 1, "the focused <select> must be blurred before dispatch");
  assert.equal(result.ok, true);
  assert.equal(result.blurred, 1);
  // keyup must still follow keydown or the game latches Z.KeyDown[c] and eats the next press.
  assert.deepEqual(fired, ["keydown", "keyup"]);
});

test("dispatch leaves chat focus and the focus hotkeys alone", () => {
  const chat = el("input", { id: "chattybox", type: "text" });
  assert.equal(dispatch(52, chat).result.blurred, 0, "focus parked in chat is deliberate");

  const menu = el("select", { id: "burnmenu" });
  for (const focusKey of [27, 13, 191]) {
    assert.equal(dispatch(focusKey, menu).result.blurred, 0, `keyCode ${focusKey} moves focus itself`);
  }
  assert.equal(menu.blurCount, 0);
});

test("leader mode treats a select as playable, not as typing", () => {
  assert.equal(probe(el("select", { id: "burnmenu" })), false, "a <select> is not text entry");
  assert.equal(probe(el("input", { type: "submit" })), false);
  assert.equal(probe(el("body")), false);

  // Real text entry still suppresses mirroring.
  assert.equal(probe(el("input", { id: "chattybox", type: "text" })), true);
  assert.equal(probe(el("input", { type: "text" })), true);
  assert.equal(probe(el("textarea")), true);
});
