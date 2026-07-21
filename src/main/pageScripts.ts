/**
 * Scripts injected into child game windows via webContents.executeJavaScript.
 *
 * The RWK page keeps its interface (chattybox, skipform, the hotkey handler) inside a
 * subframe named `main`, while the login form / IntroDiv / InterfaceDiv live in the top
 * document. Every script therefore collects same-origin documents recursively and picks
 * the right one instead of assuming top.
 */

/** Shared frame walker embedded in each script. Collects up to 3 levels of same-origin docs. */
const COLLECT_DOCS_SRC = `
  const collectDocs = () => {
    const out = [];
    const walk = (win, depth) => {
      if (!win || depth > 3) return;
      try { if (win.document) out.push(win.document); } catch (err) {}
      let count = 0;
      try { count = win.frames.length; } catch (err) { count = 0; }
      for (let i = 0; i < count; i++) {
        try { walk(win.frames[i], depth + 1); } catch (err) {}
      }
    };
    walk(window, 0);
    return out;
  };
`;

export interface LoginFillResult {
  ok: boolean;
  reason?: string;
}

/**
 * Login form fill + submit. Adapted from the RWK Client's loginJob: form ranked by
 * hidden action=login input, then id/name containing "thelogin", then any form with
 * password + text + submit inputs. Values are set through the native value setter and
 * verified by read-back before clicking submit.
 */
const LOGIN_FILL_SRC = `(creds) => {
  ${COLLECT_DOCS_SRC}

  const setValue = (el, value) => {
    try {
      const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
      setter.call(el, value);
    } catch (err) {
      el.value = value;
    }
    try { el.dispatchEvent(new Event("input", { bubbles: true })); } catch (err) {}
    try { el.dispatchEvent(new Event("change", { bubbles: true })); } catch (err) {}
  };

  const docs = collectDocs();
  const allForms = [];
  for (const doc of docs) {
    try {
      for (const form of Array.from(doc.querySelectorAll("form"))) allForms.push(form);
    } catch (err) {}
  }

  const candidates = allForms.map((form) => {
    const elems = Array.from(form.elements || []);
    const inputs = elems.filter((e) => e.tagName === "INPUT");
    const passwords = inputs.filter((e) => (e.type || "").toLowerCase() === "password");
    const textLike = inputs.filter((e) => {
      const t = (e.type || "text").toLowerCase();
      return t === "text" || t === "";
    });
    const submits = inputs.filter((e) => {
      const t = (e.type || "").toLowerCase();
      return t === "submit" || t === "image";
    });
    const hiddenAction = inputs.find(
      (e) => (e.name || "").toLowerCase() === "action" && (e.type || "").toLowerCase() === "hidden"
    );
    return {
      form,
      passwords,
      textLike,
      submits,
      formId: form.id || "",
      formName: form.name || "",
      hiddenActionValue: hiddenAction ? (hiddenAction.value || "").toLowerCase() : null
    };
  });

  let chosen = candidates.find((c) => c.hiddenActionValue === "login");
  if (!chosen) {
    chosen = candidates.find((c) =>
      ((c.formId || "") + " " + (c.formName || "")).toLowerCase().includes("thelogin")
    );
  }
  if (!chosen) {
    chosen = candidates.find((c) => c.passwords.length > 0 && c.textLike.length > 0 && c.submits.length > 0);
  }
  if (!chosen) {
    return { ok: false, reason: "no-login-form" };
  }

  const usernameInput =
    chosen.textLike.find((e) => (e.name || "").toLowerCase() === "login") ||
    chosen.textLike.find((e) => (e.name || "").toLowerCase() === "username") ||
    chosen.textLike.find((e) => (e.name || "").toLowerCase() === "name") ||
    chosen.textLike[0];
  const passwordInput =
    chosen.passwords.find((e) => (e.name || "").toLowerCase() === "password") || chosen.passwords[0];
  const submitInput =
    chosen.submits.find((e) => (e.value || "").toLowerCase() === "login") ||
    chosen.submits.find((e) => (e.name || "").toLowerCase() === "subshit") ||
    chosen.submits[0];

  if (!usernameInput || !passwordInput || !submitInput) {
    return { ok: false, reason: "missing-input" };
  }

  try { usernameInput.focus(); } catch (err) {}
  setValue(usernameInput, creds.username);
  try { passwordInput.focus(); } catch (err) {}
  setValue(passwordInput, creds.password);

  if (usernameInput.value !== creds.username || passwordInput.value !== creds.password) {
    return { ok: false, reason: "values-not-set" };
  }

  try { submitInput.focus(); } catch (err) {}
  if (typeof submitInput.click === "function") {
    submitInput.click();
  } else {
    submitInput.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }

  return { ok: true };
}`;

export function buildLoginFillScript(username: string, password: string): string {
  const payload = JSON.stringify({ username, password });
  return `(${LOGIN_FILL_SRC})(${payload})`;
}

export interface LoginStateProbeResult {
  loggedIn: boolean;
  playerName: string;
}

/**
 * Logged-in probe: the dashboard is up when `#s_name` has text, `#InterfaceDiv` is
 * visible and `#IntroDiv` is not (same checks the RWK Client's loginJob uses).
 */
export const LOGIN_STATE_PROBE_SCRIPT = `(() => {
  ${COLLECT_DOCS_SRC}
  for (const doc of collectDocs()) {
    try {
      const nameEl = doc.getElementById("s_name");
      const name = nameEl && nameEl.textContent ? nameEl.textContent.trim() : "";
      const interfaceDiv = doc.getElementById("InterfaceDiv");
      const interfaceVisible = !!(interfaceDiv && interfaceDiv.offsetParent !== null);
      const introDiv = doc.getElementById("IntroDiv");
      const introVisible = !!(introDiv && introDiv.offsetParent !== null);
      if (name !== "" && interfaceVisible && !introVisible) {
        return { loggedIn: true, playerName: name };
      }
    } catch (err) {}
  }
  return { loggedIn: false, playerName: "" };
})()`;

/** Returns the first few KB of visible page text (all frames) for error-marker matching. */
export const PAGE_TEXT_PROBE_SCRIPT = `(() => {
  ${COLLECT_DOCS_SRC}
  let text = "";
  for (const doc of collectDocs()) {
    try {
      if (doc.body && doc.body.innerText) text += doc.body.innerText.slice(0, 4000) + "\\n";
    } catch (err) {}
    if (text.length > 8000) break;
  }
  return text.slice(0, 8000);
})()`;

/** Login rejection markers, verbatim from the RWK Client's loginJob. */
export const LOGIN_ERROR_MARKERS: readonly string[] = [
  "Not enough characters in your name or password",
  "Incorrect password",
  "Incorrect Password",
  "Incorrect login",
  "Login does not exist",
  "is not in our database",
  "Account is currently locked"
];

export function findLoginErrorMarker(pageText: string): string | null {
  for (const marker of LOGIN_ERROR_MARKERS) {
    if (pageText.includes(marker)) return marker;
  }
  return null;
}

/**
 * Hotkey dispatch. Fires a synthetic keydown+keyup pair carrying the RAW keyCode on the
 * game interface document's body (the doc containing skipform/chattybox/hkfoc — that is
 * where realcComp.js bound its handler). KeyboardEvent constructors ignore keyCode, so
 * it is grafted on with a getter. keyup MUST follow keydown: the game latches
 * Z.KeyDown[c] until keyup and would otherwise swallow the next press of the same key.
 */
const KEY_DISPATCH_SRC = `(rawKeyCode) => {
  ${COLLECT_DOCS_SRC}
  const docs = collectDocs();
  let doc = null;
  for (const d of docs) {
    try {
      if (d.getElementById("skipform") || d.getElementById("chattybox") || d.getElementById("hkfoc")) {
        doc = d;
        break;
      }
    } catch (err) {}
  }
  if (!doc) return { ok: false, reason: "no-game-doc" };
  const target = doc.body || doc.documentElement;
  if (!target) return { ok: false, reason: "no-body" };

  // The game's own da()/ka() guard drops every hotkey except Esc while an input/select
  // holds focus. The general/kingdom menus ARE <select>s — "submit selected action" — so
  // once a window has picked an item to burn, that menu keeps focus and swallows every
  // hotkey we dispatch, including the submit that would clear it. Nothing in the client
  // ever dropped that focus, so the window sat there stuck until someone hit Esc by hand.
  // Fights never hit this: a/c/d/f leave focus on the body.
  // Chat is left alone (focus there is deliberate), and so are the focus hotkeys
  // Esc/Enter/'/', whose entire job is moving focus.
  let blurred = 0;
  if (rawKeyCode !== 27 && rawKeyCode !== 13 && rawKeyCode !== 191) {
    for (const d of docs) {
      try {
        const el = d.activeElement;
        if (!el || el.id === "chattybox") continue;
        const tag = (el.tagName || "").toLowerCase();
        // iframe/frame too: focus inside a subframe shows up as the frame element here.
        if (tag !== "input" && tag !== "select" && tag !== "textarea" && tag !== "iframe" && tag !== "frame") continue;
        if (typeof el.blur === "function") {
          el.blur();
          blurred++;
        }
      } catch (err) {}
    }
  }

  const fire = (type) => {
    const ev = new KeyboardEvent(type, { bubbles: true, cancelable: true });
    Object.defineProperty(ev, "keyCode", { get: () => rawKeyCode });
    Object.defineProperty(ev, "which", { get: () => rawKeyCode });
    target.dispatchEvent(ev);
  };
  fire("keydown");
  fire("keyup");
  return { ok: true, blurred };
}`;

export function buildHotkeyDispatchScript(rawKeyCode: number): string {
  if (!Number.isInteger(rawKeyCode) || rawKeyCode < 0 || rawKeyCode > 255) {
    throw new Error(`Invalid keyCode: ${rawKeyCode}`);
  }
  return `(${KEY_DISPATCH_SRC})(${rawKeyCode})`;
}

/**
 * True when typing focus is in a text control (chat box, store iframe, any input/select/
 * textarea) — mirrors the game's own da()/ka() checks. Used by leader mode to avoid
 * rebroadcasting keystrokes the leader is typing into chat.
 */
export const CHAT_FOCUS_PROBE_SCRIPT = `(() => {
  ${COLLECT_DOCS_SRC}
  for (const doc of collectDocs()) {
    try {
      const el = doc.activeElement;
      if (!el) continue;
      // StoreIframe is itself an <iframe>: when the store has focus, the interface
      // document's activeElement IS that iframe element, so this id check must run
      // BEFORE the iframe/frame skip below or it can never match.
      if (el.id === "chattybox" || el.id === "StoreIframe") return true;
      const tag = (el.tagName || "").toLowerCase();
      if (tag === "iframe" || tag === "frame") continue;
      if (tag === "textarea") return true;
      // A <select> is NOT text entry — keystrokes there never become chat. Counting it
      // as "typing" muted leader mode entirely during item burn: the general/kingdom
      // action menus are selects, so the moment the leader picked an item to burn, the
      // submit hotkey stopped mirroring to the fleet and never resumed.
      if (tag === "input") {
        const t = (el.type || "text").toLowerCase();
        if (t !== "submit" && t !== "button" && t !== "image" && t !== "reset" && t !== "checkbox" && t !== "radio") {
          return true;
        }
      }
    } catch (err) {}
  }
  return false;
})()`;
