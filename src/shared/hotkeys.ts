/**
 * RWK's built-in hotkeys, as implemented by the game's interface script (realcComp.js).
 *
 * The game binds a single `keydown` listener on the interface document's body and reads
 * ONLY `event.keyCode` (raw, pre-normalization — its `Ba()` helper remaps punctuation and
 * lowercases letters itself). It never checks `event.isTrusted`, so synthetic
 * KeyboardEvents with a populated keyCode trigger real hotkeys.
 *
 * Quirks that matter for dispatch (learned from the original script):
 * - Letters must be sent as RAW uppercase ASCII codes (a→65 …); the game adds 32 itself.
 * - `[` / `]` must be sent as raw 219/221. Sending normalized 91/93 would be treated as
 *   the OS/Command key and swallowed.
 * - Backtick is raw 192, slash raw 191.
 * - A `keyup` must follow every `keydown`: the game latches `Z.KeyDown[c]` on keydown and
 *   ignores repeats until keyup clears it.
 * - ctrl/alt/meta must all be false and `repeat` false or the key is ignored.
 * - All hotkeys except Esc are ignored while the chat box (or any input/select) is focused.
 */

export type HotkeyGroup =
  | "focus"
  | "move"
  | "combat"
  | "beast"
  | "quickchat"
  | "general"
  | "kingdom"
  | "poker";

export interface RwkHotkey {
  id: string;
  /** Short label for the controller pad button. */
  label: string;
  description: string;
  group: HotkeyGroup;
  /** RAW event.keyCode value the game's handler expects (pre-normalization). */
  keyCode: number;
  /** KeyboardEvent.key values (lowercased) that select this hotkey when captured. */
  captureKeys: readonly string[];
  /** KeyboardEvent.code values that select this hotkey when captured. */
  captureCodes: readonly string[];
}

export const HOTKEYS: readonly RwkHotkey[] = [
  {
    id: "esc",
    label: "Esc",
    description: "Remove focus from the chat textfield so hotkeys work",
    group: "focus",
    keyCode: 27,
    captureKeys: ["escape"],
    captureCodes: ["Escape"]
  },
  {
    id: "enter",
    label: "Enter",
    description: "Return focus to the chat textfield",
    group: "focus",
    keyCode: 13,
    captureKeys: ["enter"],
    captureCodes: ["Enter", "NumpadEnter"]
  },
  {
    id: "slash",
    label: "/",
    description: "Return focus to the chat textfield",
    group: "focus",
    keyCode: 191,
    captureKeys: ["/"],
    captureCodes: ["Slash"]
  },
  {
    id: "up",
    label: "↑",
    description: "Move north",
    group: "move",
    keyCode: 38,
    captureKeys: ["arrowup"],
    captureCodes: ["ArrowUp"]
  },
  {
    id: "down",
    label: "↓",
    description: "Move south",
    group: "move",
    keyCode: 40,
    captureKeys: ["arrowdown"],
    captureCodes: ["ArrowDown"]
  },
  {
    id: "left",
    label: "←",
    description: "Move west",
    group: "move",
    keyCode: 37,
    captureKeys: ["arrowleft"],
    captureCodes: ["ArrowLeft"]
  },
  {
    id: "right",
    label: "→",
    description: "Move east",
    group: "move",
    keyCode: 39,
    captureKeys: ["arrowright"],
    captureCodes: ["ArrowRight"]
  },
  {
    id: "planeDown",
    label: "[",
    description: "Change planes (down)",
    group: "move",
    keyCode: 219,
    captureKeys: ["["],
    captureCodes: ["BracketLeft"]
  },
  {
    id: "planeUp",
    label: "]",
    description: "Change planes (up)",
    group: "move",
    keyCode: 221,
    captureKeys: ["]"],
    captureCodes: ["BracketRight"]
  },
  {
    id: "beastBane",
    label: "b",
    description: "Beast Bane teleport (requires the Beast Bane item)",
    group: "beast",
    keyCode: 66,
    captureKeys: ["b"],
    captureCodes: ["KeyB"]
  },
  {
    id: "beastNoobane",
    label: "n",
    description: "Beast Noobane teleport to the last surface beast",
    group: "beast",
    keyCode: 78,
    captureKeys: ["n"],
    captureCodes: ["KeyN"]
  },
  {
    id: "shrineTrack",
    label: "`",
    description: "Ask the Shrine Keeper to track",
    group: "beast",
    keyCode: 192,
    captureKeys: ["`"],
    captureCodes: ["Backquote"]
  },
  {
    id: "attack",
    label: "a",
    description: "Melee attack",
    group: "combat",
    keyCode: 65,
    captureKeys: ["a"],
    captureCodes: ["KeyA"]
  },
  {
    id: "cast",
    label: "c",
    description: "Cast",
    group: "combat",
    keyCode: 67,
    captureKeys: ["c"],
    captureCodes: ["KeyC"]
  },
  {
    id: "defend",
    label: "d",
    description: "Defend",
    group: "combat",
    keyCode: 68,
    captureKeys: ["d"],
    captureCodes: ["KeyD"]
  },
  {
    id: "fightLast",
    label: "f",
    description: "Fight the last creature again",
    group: "combat",
    keyCode: 70,
    captureKeys: ["f"],
    captureCodes: ["KeyF"]
  },
  {
    id: "revive",
    label: "r",
    description: "Revive",
    group: "combat",
    keyCode: 82,
    captureKeys: ["r"],
    captureCodes: ["KeyR"]
  },
  {
    id: "train",
    label: "t",
    description: "Train the Button Enlargement stat",
    group: "combat",
    keyCode: 84,
    captureKeys: ["t"],
    captureCodes: ["KeyT"]
  },
  {
    id: "quickChat1",
    label: "1",
    description: "Quick chat shortcut 1",
    group: "quickchat",
    keyCode: 49,
    captureKeys: ["1"],
    captureCodes: ["Digit1", "Numpad1"]
  },
  {
    id: "quickChat2",
    label: "2",
    description: "Quick chat shortcut 2",
    group: "quickchat",
    keyCode: 50,
    captureKeys: ["2"],
    captureCodes: ["Digit2", "Numpad2"]
  },
  {
    id: "quickChat3",
    label: "3",
    description: "Quick chat shortcut 3",
    group: "quickchat",
    keyCode: 51,
    captureKeys: ["3"],
    captureCodes: ["Digit3", "Numpad3"]
  },
  {
    id: "general1",
    label: "4",
    description: "Submit selected action — general menu 1",
    group: "general",
    keyCode: 52,
    captureKeys: ["4"],
    captureCodes: ["Digit4", "Numpad4"]
  },
  {
    id: "general2",
    label: "5",
    description: "Submit selected action — general menu 2",
    group: "general",
    keyCode: 53,
    captureKeys: ["5"],
    captureCodes: ["Digit5", "Numpad5"]
  },
  {
    id: "general3",
    label: "6",
    description: "Submit selected action — general menu 3",
    group: "general",
    keyCode: 54,
    captureKeys: ["6"],
    captureCodes: ["Digit6", "Numpad6"]
  },
  {
    id: "general4",
    label: "0",
    description: "Submit selected action — general menu 4",
    group: "general",
    keyCode: 48,
    captureKeys: ["0"],
    captureCodes: ["Digit0", "Numpad0"]
  },
  {
    id: "kingdom1",
    label: "7",
    description: "Submit selected action — kingdom menu 1",
    group: "kingdom",
    keyCode: 55,
    captureKeys: ["7"],
    captureCodes: ["Digit7", "Numpad7"]
  },
  {
    id: "kingdom2",
    label: "8",
    description: "Submit selected action — kingdom menu 2",
    group: "kingdom",
    keyCode: 56,
    captureKeys: ["8"],
    captureCodes: ["Digit8", "Numpad8"]
  },
  {
    id: "kingdom3",
    label: "9",
    description: "Submit selected action — kingdom menu 3",
    group: "kingdom",
    keyCode: 57,
    captureKeys: ["9"],
    captureCodes: ["Digit9", "Numpad9"]
  },
  {
    id: "pokerPlay",
    label: "p",
    description: "Play or call poker",
    group: "poker",
    keyCode: 80,
    captureKeys: ["p"],
    captureCodes: ["KeyP"]
  },
  {
    id: "pokerFold",
    label: "j",
    description: "Fold poker hand",
    group: "poker",
    keyCode: 74,
    captureKeys: ["j"],
    captureCodes: ["KeyJ"]
  }
] as const;

export const HOTKEY_GROUP_ORDER: readonly HotkeyGroup[] = [
  "focus",
  "move",
  "combat",
  "beast",
  "quickchat",
  "general",
  "kingdom",
  "poker"
];

export const HOTKEY_GROUP_LABELS: Record<HotkeyGroup, string> = {
  focus: "Chat focus",
  move: "Movement",
  combat: "Combat",
  beast: "Beast / shrine",
  quickchat: "Quick chat 1–3",
  general: "General actions 4/5/6/0",
  kingdom: "Kingdom actions 7/8/9",
  poker: "Poker"
};

const BY_ID = new Map<string, RwkHotkey>(HOTKEYS.map((hk) => [hk.id, hk]));
const BY_KEY = new Map<string, RwkHotkey>();
const BY_CODE = new Map<string, RwkHotkey>();
for (const hk of HOTKEYS) {
  for (const key of hk.captureKeys) BY_KEY.set(key, hk);
  for (const code of hk.captureCodes) BY_CODE.set(code, hk);
}

export function hotkeyById(id: string): RwkHotkey | null {
  return BY_ID.get(id) ?? null;
}

/**
 * Map a captured keyboard event (DOM KeyboardEvent or Electron before-input-event Input)
 * to an RWK hotkey. `key`/`code` follow DOM conventions.
 */
export function findHotkeyForKeyboardEvent(key: string, code: string): RwkHotkey | null {
  return BY_KEY.get(key.toLowerCase()) ?? BY_CODE.get(code) ?? null;
}
