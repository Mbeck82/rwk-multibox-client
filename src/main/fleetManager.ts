import { BrowserWindow, shell } from "electron";

import {
  buildHotkeyDispatchScript,
  buildLoginFillScript,
  CHAT_FOCUS_PROBE_SCRIPT,
  findLoginErrorMarker,
  LOGIN_STATE_PROBE_SCRIPT,
  LoginFillResult,
  LoginStateProbeResult,
  PAGE_TEXT_PROBE_SCRIPT
} from "./pageScripts";
import { findHotkeyForKeyboardEvent, hotkeyById, RwkHotkey } from "../shared/hotkeys";
import { isAllowedRwkUrl, resolveNavigationHref, isHttpUrl } from "../shared/rwkPolicy";
import {
  BroadcastResult,
  effectiveRwkServer,
  FleetChildSnapshot,
  FleetChildStatus,
  FleetSnapshot,
  ManagedCharacter,
  RwkServerId,
  rwkServerLandingUrl
} from "../shared/types";

const LOGIN_TIMEOUT_MS = 20_000;
const LOGIN_POLL_INTERVAL_MS = 500;
/** Delay between windows when launching the whole roster, so N windows don't thrash at once. */
const LAUNCH_ALL_STAGGER_MS = 600;

interface ChildRecord {
  id: number;
  win: BrowserWindow;
  characterId: string | null;
  label: string;
  server: RwkServerId;
  status: FleetChildStatus;
  statusDetail: string;
  broadcastEnabled: boolean;
  /** Run auto-login on the next finished load (set at spawn / manual login request). */
  autoLoginPending: boolean;
  loginBusy: boolean;
}

export interface FleetManagerDeps {
  getSession(partition: string): Electron.Session;
  getCharacter(characterId: string): ManagedCharacter | null;
  userAgent(): string;
  onChanged(): void;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizePartitionKey(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}

/**
 * Owns the child game windows: spawning, per-character session partitions, auto-login,
 * and fleet hotkey broadcast (controller pad + leader mode).
 */
export class FleetManager {
  private readonly children = new Map<number, ChildRecord>();
  private nextChildId = 1;
  private blankCounter = 0;
  leaderMode = false;

  constructor(private readonly deps: FleetManagerDeps) {}

  snapshot(): FleetSnapshot {
    const children: FleetChildSnapshot[] = [];
    for (const record of this.children.values()) {
      children.push({
        id: record.id,
        characterId: record.characterId,
        label: record.label,
        server: record.server,
        status: record.status,
        statusDetail: record.statusDetail,
        broadcastEnabled: record.broadcastEnabled
      });
    }
    children.sort((a, b) => a.id - b.id);
    return { leaderMode: this.leaderMode, children };
  }

  findByCharacterId(characterId: string): ChildRecord | null {
    for (const record of this.children.values()) {
      if (record.characterId === characterId) return record;
    }
    return null;
  }

  launchCharacter(character: ManagedCharacter): void {
    const existing = this.findByCharacterId(character.id);
    if (existing) {
      this.focusChild(existing.id);
      return;
    }

    const server = effectiveRwkServer(character);
    // persist: partition per character id — the game session (cookies) survives app
    // restarts, so an already-logged-in character usually skips the login form entirely.
    const partition = `persist:mbox-char-${sanitizePartitionKey(character.id)}`;
    this.spawnChild({
      characterId: character.id,
      label: character.label,
      server,
      partition,
      autoLogin: character.username !== "" && character.password !== ""
    });
  }

  async launchAllCharacters(characters: readonly ManagedCharacter[]): Promise<number> {
    let launched = 0;
    for (const character of characters) {
      if (this.findByCharacterId(character.id)) continue;
      this.launchCharacter(character);
      launched++;
      await delay(LAUNCH_ALL_STAGGER_MS);
    }
    return launched;
  }

  launchBlank(server: RwkServerId): void {
    this.blankCounter++;
    this.spawnChild({
      characterId: null,
      label: `Blank ${this.blankCounter}`,
      server,
      // Non-persist partition: throwaway session for manual logins.
      partition: `mbox-blank-${this.blankCounter}`,
      autoLogin: false
    });
  }

  private spawnChild(options: {
    characterId: string | null;
    label: string;
    server: RwkServerId;
    partition: string;
    autoLogin: boolean;
  }): void {
    const ses = this.deps.getSession(options.partition);
    const win = new BrowserWindow({
      width: 1180,
      height: 900,
      minWidth: 240,
      minHeight: 160,
      title: this.childTitle(options.label, options.server),
      webPreferences: {
        session: ses,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        // Children must keep processing dispatched hotkeys and game timers while
        // hidden behind other fleet windows.
        backgroundThrottling: false
      }
    });

    const record: ChildRecord = {
      id: this.nextChildId++,
      win,
      characterId: options.characterId,
      label: options.label,
      server: options.server,
      status: options.autoLogin ? "loading" : "manual",
      statusDetail: "",
      broadcastEnabled: true,
      autoLoginPending: options.autoLogin,
      loginBusy: false
    };
    this.children.set(record.id, record);

    win.setMenuBarVisibility(false);
    win.webContents.setUserAgent(this.deps.userAgent());
    win.webContents.setBackgroundThrottling(false);
    // The game sets window.onbeforeunload to an "Are you sure you wish to leave?" confirm
    // (unless the player's NoWarning option is set). Electron doesn't show a dialog for
    // that — it just silently blocks win.close() — so force the close through instead.
    win.webContents.on("will-prevent-unload", (event) => {
      event.preventDefault();
    });
    this.attachNavigationGuards(record);
    this.attachInputHandlers(record);

    win.on("page-title-updated", (event) => {
      event.preventDefault();
    });

    win.on("closed", () => {
      this.children.delete(record.id);
      this.deps.onChanged();
    });

    win.webContents.on("did-finish-load", () => {
      if (!record.autoLoginPending) return;
      if (!isAllowedRwkUrl(win.webContents.getURL())) return;
      record.autoLoginPending = false;
      void this.runLogin(record);
    });

    void win.loadURL(rwkServerLandingUrl(options.server));
    this.deps.onChanged();
  }

  private childTitle(label: string, server: RwkServerId, playerName?: string): string {
    const who = playerName && playerName !== "" ? `${label} (${playerName})` : label;
    return `${who} · ${server} — RWK Multibox`;
  }

  private attachNavigationGuards(record: ChildRecord): void {
    const contents = record.win.webContents;

    contents.setWindowOpenHandler(({ url }) => {
      // The game opens about:blank helper windows for some flows.
      if (url === "about:blank" || url === "") {
        return { action: "allow" };
      }
      const absolute = resolveNavigationHref(url, contents.getURL());
      if (absolute && isAllowedRwkUrl(absolute)) {
        // RWK popups (store, etc.) stay in-app on the same session so cookies carry.
        return { action: "allow" };
      }
      if (absolute && isHttpUrl(absolute)) {
        void shell.openExternal(absolute);
      }
      return { action: "deny" };
    });

    contents.on("will-navigate", (event, rawUrl) => {
      const absolute = resolveNavigationHref(rawUrl, contents.getURL());
      if (absolute && isAllowedRwkUrl(absolute)) return;
      event.preventDefault();
      if (absolute && isHttpUrl(absolute)) {
        void shell.openExternal(absolute);
      }
    });

    contents.on("did-navigate", (_event, url) => {
      if (!isAllowedRwkUrl(url)) {
        void contents.loadURL(rwkServerLandingUrl(record.server));
      }
    });

    // Domain-lock any popup window the game opens from this child (store, etc.).
    contents.on("did-create-window", (childWin) => {
      childWin.setMenuBarVisibility(false);
      childWin.webContents.setUserAgent(this.deps.userAgent());
      childWin.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      childWin.webContents.on("will-navigate", (event, rawUrl) => {
        const absolute = resolveNavigationHref(rawUrl, childWin.webContents.getURL());
        if (absolute && isAllowedRwkUrl(absolute)) return;
        event.preventDefault();
      });
      // will-navigate never fires for server-side redirects, so a redirect straight to
      // an external host during the popup's initial (allowed) load would otherwise slip
      // through — close the popup instead of letting it render off-domain content.
      childWin.webContents.on("did-navigate", (_event, url) => {
        if (url !== "about:blank" && !isAllowedRwkUrl(url) && !childWin.isDestroyed()) {
          childWin.close();
        }
      });
    });
  }

  private attachInputHandlers(record: ChildRecord): void {
    const contents = record.win.webContents;
    contents.on("before-input-event", (_event, input) => {
      if (input.type !== "keyDown") return;

      // Convenience: children have no menu, so wire reload + devtools manually.
      if (input.key === "F5" || ((input.control || input.meta) && input.key.toLowerCase() === "r")) {
        contents.reload();
        return;
      }
      if (input.key === "F12") {
        contents.openDevTools({ mode: "detach" });
        return;
      }

      if (!this.leaderMode) return;
      // A broadcast-disabled window is detached from the fleet in BOTH directions: it
      // must not mirror its own keystrokes out either, so you can hand-control it solo.
      if (!record.broadcastEnabled) return;
      if (input.isAutoRepeat || input.control || input.alt || input.meta) return;
      const hotkey = findHotkeyForKeyboardEvent(input.key, input.code);
      if (!hotkey) return;
      void this.forwardFromLeader(record, hotkey);
    });
  }

  /**
   * Leader mode: a real keystroke in a focused child is mirrored to every other
   * broadcast-enabled child. The leader's own window handles the keystroke natively;
   * we never re-dispatch to the source. Feedback loops are impossible because
   * broadcasts use executeJavaScript (synthetic DOM events never reach
   * before-input-event).
   */
  private async forwardFromLeader(source: ChildRecord, hotkey: RwkHotkey): Promise<void> {
    // Enter/`/` synchronously move the game's own chat focus on keydown, at the same
    // moment before-input-event fires — probing focus afterward would race that change
    // and make forwarding nondeterministic. Each follower's chat focus is independent
    // anyway, so leader mode never auto-mirrors these two (the broadcast pad still can).
    if (hotkey.id === "enter" || hotkey.id === "slash") return;

    let typingInChat = true;
    try {
      typingInChat = (await source.win.webContents.executeJavaScript(CHAT_FOCUS_PROBE_SCRIPT, true)) === true;
    } catch {
      typingInChat = true;
    }
    // While the leader is typing in chat (or any input), letters are chat text, not
    // hotkeys — mirror nothing except Esc, which the game honors unconditionally.
    if (typingInChat && hotkey.id !== "esc") return;
    this.dispatchHotkey(hotkey, source.id);
  }

  broadcastHotkey(hotkeyId: string): BroadcastResult {
    const hotkey = hotkeyById(hotkeyId);
    if (!hotkey) {
      throw new Error(`Unknown hotkey id: ${hotkeyId}`);
    }
    return this.dispatchHotkey(hotkey, null);
  }

  private dispatchHotkey(hotkey: RwkHotkey, excludeChildId: number | null): BroadcastResult {
    const script = buildHotkeyDispatchScript(hotkey.keyCode);
    let sent = 0;
    let targets = 0;
    for (const record of this.children.values()) {
      if (!record.broadcastEnabled) continue;
      if (excludeChildId !== null && record.id === excludeChildId) continue;
      if (record.win.isDestroyed() || record.win.webContents.isDestroyed()) continue;
      targets++;
      record.win.webContents
        .executeJavaScript(script, true)
        .then(() => undefined)
        .catch((error) => {
          console.warn(`[fleet] hotkey ${hotkey.id} dispatch failed for child ${record.id}:`, error);
        });
      sent++;
    }
    return { sent, targets };
  }

  setLeaderMode(enabled: boolean): void {
    this.leaderMode = enabled;
    this.deps.onChanged();
  }

  setChildBroadcast(childId: number, enabled: boolean): void {
    const record = this.requireChild(childId);
    record.broadcastEnabled = enabled;
    this.deps.onChanged();
  }

  focusChild(childId: number): void {
    const record = this.requireChild(childId);
    if (record.win.isMinimized()) record.win.restore();
    record.win.show();
    record.win.focus();
  }

  reloadChild(childId: number): void {
    const record = this.requireChild(childId);
    record.win.webContents.reload();
  }

  closeChild(childId: number): void {
    const record = this.requireChild(childId);
    record.win.close();
  }

  closeAll(): void {
    for (const record of [...this.children.values()]) {
      if (!record.win.isDestroyed()) record.win.close();
    }
  }

  /** Manual "Login" button: re-run the vault login against the child's current page. */
  async loginChild(childId: number): Promise<void> {
    const record = this.requireChild(childId);
    await this.runLogin(record);
  }

  private requireChild(childId: number): ChildRecord {
    const record = this.children.get(childId);
    if (!record || record.win.isDestroyed()) {
      throw new Error(`No such client window (id ${childId}).`);
    }
    return record;
  }

  private setStatus(record: ChildRecord, status: FleetChildStatus, detail = ""): void {
    record.status = status;
    record.statusDetail = detail;
    this.deps.onChanged();
  }

  private async runLogin(record: ChildRecord): Promise<void> {
    if (record.loginBusy) return;
    if (!record.characterId) {
      this.setStatus(record, "manual", "No vault character attached — log in by hand.");
      return;
    }
    const character = this.deps.getCharacter(record.characterId);
    if (!character) {
      this.setStatus(record, "login-failed", "Character no longer exists in the vault.");
      return;
    }
    if (character.username === "" || character.password === "") {
      this.setStatus(record, "login-failed", "Vault entry is missing a username or password.");
      return;
    }

    record.loginBusy = true;
    try {
      const contents = record.win.webContents;
      this.setStatus(record, "logging-in");

      if (!isAllowedRwkUrl(contents.getURL())) {
        this.setStatus(record, "login-failed", "Window is not on the RWK domain.");
        return;
      }

      // Session cookies may still be valid from a previous run.
      const already = await this.probeLoginState(contents);
      if (already?.loggedIn) {
        this.onLoggedIn(record, already.playerName);
        return;
      }

      const fill = (await contents
        .executeJavaScript(buildLoginFillScript(character.username, character.password), true)
        .catch((error: unknown) => ({ ok: false, reason: `script-error: ${String(error)}` }))) as LoginFillResult;

      if (!fill.ok) {
        this.setStatus(record, "login-failed", `Could not fill the login form (${fill.reason ?? "unknown"}).`);
        return;
      }

      const deadline = Date.now() + LOGIN_TIMEOUT_MS;
      while (Date.now() < deadline) {
        await delay(LOGIN_POLL_INTERVAL_MS);
        if (record.win.isDestroyed() || contents.isDestroyed()) return;

        const state = await this.probeLoginState(contents);
        if (state?.loggedIn) {
          this.onLoggedIn(record, state.playerName);
          return;
        }

        const pageText = (await contents
          .executeJavaScript(PAGE_TEXT_PROBE_SCRIPT, true)
          .catch(() => "")) as string;
        const marker = findLoginErrorMarker(pageText);
        if (marker) {
          this.setStatus(record, "login-failed", `Rejected by the server: "${marker}".`);
          return;
        }
      }

      this.setStatus(
        record,
        "login-failed",
        `Submitted login but the dashboard didn't appear within ${Math.round(LOGIN_TIMEOUT_MS / 1000)}s.`
      );
    } finally {
      record.loginBusy = false;
    }
  }

  private async probeLoginState(contents: Electron.WebContents): Promise<LoginStateProbeResult | null> {
    try {
      return (await contents.executeJavaScript(LOGIN_STATE_PROBE_SCRIPT, true)) as LoginStateProbeResult;
    } catch {
      // Navigation in flight — treat as "not yet".
      return null;
    }
  }

  private onLoggedIn(record: ChildRecord, playerName: string): void {
    if (!record.win.isDestroyed()) {
      record.win.setTitle(this.childTitle(record.label, record.server, playerName));
    }
    this.setStatus(record, "logged-in", playerName !== "" ? `Playing as ${playerName}` : "");
  }
}
