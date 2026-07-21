import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  findHotkeyForKeyboardEvent,
  HOTKEY_GROUP_LABELS,
  HOTKEY_GROUP_ORDER,
  HOTKEYS,
  RwkHotkey
} from "../../shared/hotkeys";
import type {
  FleetChildSnapshot,
  FleetSnapshot,
  ManagedCharacter,
  RwkServerId,
  VaultSnapshot
} from "../../shared/types";
import { RWK_SERVER_IDS } from "../../shared/types";
import { HelpPanel } from "./HelpPanel";

type StatusTone = "info" | "ok" | "error";

interface StatusMessage {
  tone: StatusTone;
  text: string;
}

function errorText(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  // Electron prefixes IPC errors with "Error invoking remote method '...': Error:".
  return raw.replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, "");
}

function useMboxSnapshots(): { vault: VaultSnapshot; fleet: FleetSnapshot } {
  const [vault, setVault] = useState<VaultSnapshot>({ characters: [] });
  const [fleet, setFleet] = useState<FleetSnapshot>({ leaderMode: false, children: [] });

  useEffect(() => {
    let alive = true;
    void window.mbox.getVaultSnapshot().then((snap) => {
      if (alive) setVault(snap);
    });
    void window.mbox.getFleetSnapshot().then((snap) => {
      if (alive) setFleet(snap);
    });
    const offVault = window.mbox.onVaultChanged(setVault);
    const offFleet = window.mbox.onFleetChanged(setFleet);
    return () => {
      alive = false;
      offVault();
      offFleet();
    };
  }, []);

  return { vault, fleet };
}

// ---------------------------------------------------------------------------
// Character editor
// ---------------------------------------------------------------------------

interface CharacterEditorProps {
  draft: ManagedCharacter;
  onChange(next: ManagedCharacter): void;
  onSave(): void;
  onCancel(): void;
  saving: boolean;
}

function CharacterEditor({ draft, onChange, onSave, onCancel, saving }: CharacterEditorProps): React.JSX.Element {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="editor">
      <div className="editor-grid">
        <label>
          Label
          <input
            type="text"
            value={draft.label}
            placeholder={draft.username || "Display name"}
            onChange={(e) => onChange({ ...draft, label: e.target.value })}
          />
        </label>
        <label>
          Username
          <input
            type="text"
            value={draft.username}
            onChange={(e) => onChange({ ...draft, username: e.target.value })}
          />
        </label>
        <label>
          Password
          <span className="password-row">
            <input
              type={showPassword ? "text" : "password"}
              value={draft.password}
              onChange={(e) => onChange({ ...draft, password: e.target.value })}
            />
            <button type="button" className="ghost" onClick={() => setShowPassword((v) => !v)}>
              {showPassword ? "Hide" : "Show"}
            </button>
          </span>
        </label>
        <label>
          Server
          <select
            value={draft.rwkServer ?? "rwk2"}
            onChange={(e) => onChange({ ...draft, rwkServer: e.target.value as RwkServerId })}
          >
            {RWK_SERVER_IDS.map((sid) => (
              <option key={sid} value={sid}>
                {sid}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="editor-actions">
        <button type="button" className="primary" onClick={onSave} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vault panel
// ---------------------------------------------------------------------------

interface VaultPanelProps {
  vault: VaultSnapshot;
  fleet: FleetSnapshot;
  report(status: StatusMessage): void;
}

function VaultPanel({ vault, fleet, report }: VaultPanelProps): React.JSX.Element {
  const [draft, setDraft] = useState<ManagedCharacter | null>(null);
  const [saving, setSaving] = useState(false);

  const liveCharacterIds = useMemo(
    () => new Set(fleet.children.map((c) => c.characterId).filter((id): id is string => id !== null)),
    [fleet]
  );

  const startNew = useCallback(async () => {
    try {
      setDraft(await window.mbox.createCharacterTemplate());
    } catch (error) {
      report({ tone: "error", text: errorText(error) });
    }
  }, [report]);

  const save = useCallback(async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const saved = await window.mbox.saveCharacter(draft);
      setDraft(null);
      report({ tone: "ok", text: `Saved "${saved.label}".` });
    } catch (error) {
      report({ tone: "error", text: errorText(error) });
    } finally {
      setSaving(false);
    }
  }, [draft, report]);

  const remove = useCallback(
    async (character: ManagedCharacter) => {
      try {
        // Confirmation happens in the main process (window-parented dialog); null = cancelled.
        const result = await window.mbox.deleteCharacter(character.id);
        if (result === null) return;
        report({ tone: "ok", text: `Deleted "${character.label}".` });
      } catch (error) {
        report({ tone: "error", text: errorText(error) });
      }
    },
    [report]
  );

  const launch = useCallback(
    async (character: ManagedCharacter) => {
      try {
        await window.mbox.launchCharacter(character.id);
      } catch (error) {
        report({ tone: "error", text: errorText(error) });
      }
    },
    [report]
  );

  return (
    <section className="panel">
      <header className="panel-header">
        <h2>Character vault</h2>
        <div className="panel-header-actions">
          <button type="button" onClick={() => void startNew()}>
            + New
          </button>
        </div>
      </header>

      {draft && (
        <CharacterEditor
          draft={draft}
          onChange={setDraft}
          onSave={() => void save()}
          onCancel={() => setDraft(null)}
          saving={saving}
        />
      )}

      {vault.characters.length === 0 && !draft && (
        <p className="empty-hint">
          No characters yet. Add one with <strong>+ New</strong>, paste a{" "}
          <code>Name,Password</code> list below, or import your RWK Client vault.
        </p>
      )}

      <ul className="character-list">
        {vault.characters.map((character) => {
          const live = liveCharacterIds.has(character.id);
          return (
            <li key={character.id} className="character-row">
              <div className="character-info">
                <span className="character-label">{character.label}</span>
                <span className="character-sub">
                  {character.username} · {character.rwkServer ?? "rwk2"}
                  {live && <span className="live-dot" title="Client window open" />}
                </span>
              </div>
              <div className="character-actions">
                <button type="button" className="primary" onClick={() => void launch(character)}>
                  {live ? "Focus" : "Launch"}
                </button>
                <button type="button" onClick={() => setDraft({ ...character })}>
                  Edit
                </button>
                <button type="button" className="danger" onClick={() => void remove(character)}>
                  Delete
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <ImportExportSection report={report} />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Import / export
// ---------------------------------------------------------------------------

function ImportExportSection({ report }: { report(status: StatusMessage): void }): React.JSX.Element {
  const [listText, setListText] = useState("");
  const [listServer, setListServer] = useState<RwkServerId>("rwk2");
  const [jsonText, setJsonText] = useState("");

  const importList = useCallback(async () => {
    try {
      const result = await window.mbox.importNamePasswordLines(listText, listServer);
      const errorNote = result.errors.length > 0 ? ` — ${result.errors.slice(0, 4).join("; ")}` : "";
      report({
        tone: result.errors.length > 0 ? "error" : "ok",
        text: `List import: added ${result.added}, skipped ${result.skipped}${errorNote}`
      });
      if (result.added > 0) setListText("");
    } catch (error) {
      report({ tone: "error", text: errorText(error) });
    }
  }, [listText, listServer, report]);

  const importJson = useCallback(async () => {
    try {
      const result = await window.mbox.importCharactersJson(jsonText);
      const errorNote = result.errors.length > 0 ? ` — ${result.errors.slice(0, 4).join("; ")}` : "";
      report({
        tone: result.errors.length > 0 ? "error" : "ok",
        text: `JSON import: added ${result.added}, updated ${result.updated}, skipped ${result.skipped}${errorNote}`
      });
      if (result.added > 0 || result.updated > 0) setJsonText("");
    } catch (error) {
      report({ tone: "error", text: errorText(error) });
    }
  }, [jsonText, report]);

  const importParentVault = useCallback(async () => {
    try {
      const result = await window.mbox.importParentVault();
      if (!result) return;
      const errorNote = result.errors.length > 0 ? ` — ${result.errors.slice(0, 4).join("; ")}` : "";
      report({
        tone: result.errors.length > 0 ? "error" : "ok",
        text: `Vault import: added ${result.added}, updated ${result.updated}, skipped ${result.skipped}${errorNote}`
      });
    } catch (error) {
      report({ tone: "error", text: errorText(error) });
    }
  }, [report]);

  const exportJson = useCallback(async () => {
    const count = await window.mbox.copyVaultJsonExport();
    report({ tone: "ok", text: `Copied JSON export of ${count} character(s) to the clipboard.` });
  }, [report]);

  const exportLines = useCallback(async () => {
    const count = await window.mbox.copyNamePasswordExport();
    report({ tone: "ok", text: `Copied ${count} username,password line(s) to the clipboard.` });
  }, [report]);

  return (
    <details className="import-export">
      <summary>Import / export</summary>

      <div className="import-block">
        <h3>Name,Password list</h3>
        <textarea
          rows={4}
          placeholder={"Name,Password\nOtherName,OtherPassword"}
          value={listText}
          onChange={(e) => setListText(e.target.value)}
        />
        <div className="import-actions">
          <label>
            Server{" "}
            <select value={listServer} onChange={(e) => setListServer(e.target.value as RwkServerId)}>
              {RWK_SERVER_IDS.map((sid) => (
                <option key={sid} value={sid}>
                  {sid}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => void importList()} disabled={listText.trim() === ""}>
            Import list
          </button>
          <button type="button" onClick={() => void exportLines()}>
            Copy list export
          </button>
        </div>
      </div>

      <div className="import-block">
        <h3>JSON (this app or RWK Client export)</h3>
        <textarea
          rows={4}
          placeholder='{"characters": [...]}'
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
        />
        <div className="import-actions">
          <button type="button" onClick={() => void importJson()} disabled={jsonText.trim() === ""}>
            Merge JSON
          </button>
          <button type="button" onClick={() => void exportJson()}>
            Copy JSON export
          </button>
          <button type="button" onClick={() => void importParentVault()}>
            Import RWK Client vault file…
          </button>
        </div>
      </div>
    </details>
  );
}

// ---------------------------------------------------------------------------
// Fleet panel
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<FleetChildSnapshot["status"], string> = {
  loading: "Loading…",
  manual: "Manual",
  "logging-in": "Logging in…",
  "logged-in": "Logged in",
  "login-failed": "Login failed"
};

function FleetPanel({ fleet, report }: { fleet: FleetSnapshot; report(status: StatusMessage): void }): React.JSX.Element {
  const [blankServer, setBlankServer] = useState<RwkServerId>("rwk2");

  const call = useCallback(
    async (action: () => Promise<unknown>) => {
      try {
        await action();
      } catch (error) {
        report({ tone: "error", text: errorText(error) });
      }
    },
    [report]
  );

  return (
    <section className="panel">
      <header className="panel-header">
        <h2>Fleet ({fleet.children.length})</h2>
        <div className="panel-header-actions">
          <button type="button" onClick={() => void call(() => window.mbox.launchAllCharacters())}>
            Launch all
          </button>
          <select value={blankServer} onChange={(e) => setBlankServer(e.target.value as RwkServerId)}>
            {RWK_SERVER_IDS.map((sid) => (
              <option key={sid} value={sid}>
                {sid}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => void call(() => window.mbox.launchBlankClient(blankServer))}>
            Blank client
          </button>
          <button
            type="button"
            className="danger"
            disabled={fleet.children.length === 0}
            onClick={() => void call(() => window.mbox.closeAllChildren())}
          >
            Close all
          </button>
        </div>
      </header>

      {fleet.children.length === 0 && (
        <p className="empty-hint">No client windows open. Launch a character from the vault.</p>
      )}

      <ul className="fleet-list">
        {fleet.children.map((child) => (
          <li key={child.id} className="fleet-row">
            <label className="fleet-broadcast" title="Include this window in the fleet — uncheck to detach it (no hotkeys sent or received) and control it by hand">
              <input
                type="checkbox"
                checked={child.broadcastEnabled}
                onChange={(e) => void call(() => window.mbox.setChildBroadcast(child.id, e.target.checked))}
              />
            </label>
            <div className="fleet-info">
              <span className="character-label">
                {child.label} <span className="fleet-server">· {child.server}</span>
              </span>
              <span className={`fleet-status status-${child.status}`}>
                {STATUS_LABELS[child.status]}
                {child.statusDetail !== "" && <span className="fleet-detail"> — {child.statusDetail}</span>}
              </span>
            </div>
            <div className="character-actions">
              <button type="button" onClick={() => void call(() => window.mbox.focusChild(child.id))}>
                Focus
              </button>
              {child.characterId !== null && (
                <button type="button" onClick={() => void call(() => window.mbox.loginChild(child.id))}>
                  Login
                </button>
              )}
              <button type="button" onClick={() => void call(() => window.mbox.reloadChild(child.id))}>
                Reload
              </button>
              <button type="button" className="danger" onClick={() => void call(() => window.mbox.closeChild(child.id))}>
                Close
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Hotkey pad
// ---------------------------------------------------------------------------

function HotkeyPad({ fleet, report }: { fleet: FleetSnapshot; report(status: StatusMessage): void }): React.JSX.Element {
  const [armed, setArmed] = useState(false);
  const [lastSent, setLastSent] = useState<string | null>(null);
  const zoneRef = useRef<HTMLDivElement | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const broadcastTargets = fleet.children.filter((c) => c.broadcastEnabled).length;

  useEffect(() => {
    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, []);

  const send = useCallback(
    async (hotkey: RwkHotkey) => {
      try {
        const result = await window.mbox.broadcastHotkey(hotkey.id);
        setLastSent(`${hotkey.label} → ${result.sent} window(s)`);
        if (flashTimer.current) clearTimeout(flashTimer.current);
        flashTimer.current = setTimeout(() => setLastSent(null), 2500);
      } catch (error) {
        report({ tone: "error", text: errorText(error) });
      }
    },
    [report]
  );

  const onZoneKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
      const hotkey = findHotkeyForKeyboardEvent(event.key, event.code);
      if (!hotkey) return;
      event.preventDefault();
      event.stopPropagation();
      void send(hotkey);
    },
    [send]
  );

  const toggleLeaderMode = useCallback(async () => {
    try {
      await window.mbox.setLeaderMode(!fleet.leaderMode);
    } catch (error) {
      report({ tone: "error", text: errorText(error) });
    }
  }, [fleet.leaderMode, report]);

  return (
    <section className="panel">
      <header className="panel-header">
        <h2>Fleet hotkeys</h2>
        <div className="panel-header-actions">
          <label className="leader-toggle" title="Mirror hotkeys you press inside any client window to the rest of the fleet">
            <input type="checkbox" checked={fleet.leaderMode} onChange={() => void toggleLeaderMode()} />
            Leader mode
          </label>
          <span className="target-count">
            {broadcastTargets}/{fleet.children.length} windows receiving
          </span>
        </div>
      </header>

      <div
        ref={zoneRef}
        tabIndex={0}
        className={`capture-zone ${armed ? "armed" : ""}`}
        onFocus={() => setArmed(true)}
        onBlur={() => setArmed(false)}
        onKeyDown={onZoneKeyDown}
      >
        {armed
          ? "Capturing — press any RWK hotkey to broadcast it"
          : "Click here, then press RWK hotkeys to broadcast them"}
        {lastSent && <span className="last-sent">{lastSent}</span>}
      </div>

      <div className="hotkey-groups">
        {HOTKEY_GROUP_ORDER.map((group) => {
          const keys = HOTKEYS.filter((hk) => hk.group === group);
          if (keys.length === 0) return null;
          return (
            <div key={group} className="hotkey-group">
              <span className="hotkey-group-label">{HOTKEY_GROUP_LABELS[group]}</span>
              <div className="hotkey-buttons">
                {keys.map((hk) => (
                  <button
                    key={hk.id}
                    type="button"
                    className="hotkey-btn"
                    title={hk.description}
                    onClick={() => void send(hk)}
                  >
                    {hk.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <p className="hotkey-note">
        Broadcasts fire the game's own keybinds inside each checked window (focused or not).
        Windows where the chat box has focus ignore everything except <strong>Esc</strong> — broadcast
        Esc first if a window stops responding to keys.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function App(): React.JSX.Element {
  const { vault, fleet } = useMboxSnapshots();
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  // F1 toggles the help overlay from the controller window; Esc closes it. (F1 is the universal
  // help key and is unused by both the RWK game — which binds no function keys — and the RWK Client.)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "F1") {
        e.preventDefault();
        setShowHelp((v) => !v);
      } else if (e.key === "Escape") {
        setShowHelp(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>RWK Multibox</h1>
        <span className="app-sub">
          {vault.characters.length} character(s) · {fleet.children.length} window(s)
        </span>
        {status && <span className={`status-message tone-${status.tone}`}>{status.text}</span>}
        <button
          type="button"
          className="ghost help-open-btn"
          title="Game help (F1) — searchable offline guides: quests, beasts, crafting, special locations."
          onClick={() => setShowHelp((v) => !v)}
        >
          📖 Help
        </button>
      </header>
      <main className="app-main">
        <div className="column">
          <VaultPanel vault={vault} fleet={fleet} report={setStatus} />
        </div>
        <div className="column">
          <HotkeyPad fleet={fleet} report={setStatus} />
          <FleetPanel fleet={fleet} report={setStatus} />
        </div>
      </main>
      {showHelp && (
        <div className="help-overlay" role="dialog" aria-modal="true" aria-label="RWK game help">
          <div className="help-overlay-panel">
            <header className="help-overlay-header">
              <h2>Game Help</h2>
              <button type="button" className="ghost" onClick={() => setShowHelp(false)}>
                Close ✕
              </button>
            </header>
            <div className="help-overlay-body">
              <HelpPanel />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
