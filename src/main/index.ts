import { app, BrowserWindow, clipboard, dialog, ipcMain, session } from "electron";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { CharacterStore } from "./characterStore";
import { FleetManager } from "./fleetManager";
import { parseParentVaultText } from "./parentVaultImport";
import {
  formatNamePasswordExportLines,
  serializeCharacterVaultJsonExport
} from "../shared/characterImportExport";
import { BulkImportJsonResult, resolveRwkServerId, RwkServerId } from "../shared/types";

// Deterministic userData in dev AND packaged builds (Electron would otherwise use the
// productName "RWK Multibox" when packaged but the package name in dev, splitting the vault).
app.setPath("userData", join(app.getPath("appData"), "rwk-multibox-client"));

// Unlike the automation client, this app has no cross-instance file watching: the vault
// is loaded once into memory and every save rewrites the whole file. A second instance
// would silently clobber the first's writes and fight over the same session partitions,
// so only one instance is allowed; a second launch just focuses the first.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

/**
 * Strip the app and Electron tokens from the UA so the game sees a plain Chrome UA —
 * same network-identity discipline as the RWK Client, minus the deep fingerprint scrub
 * (this client is GM-sanctioned).
 */
function cleanedUserAgent(): string {
  const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return app.userAgentFallback
    .replace(new RegExp(`\\s${escapeRegex(app.getName())}/\\S+`, "i"), "")
    .replace(/\sElectron\/\S+/, "");
}

let controllerWindow: BrowserWindow | null = null;
let characterStore: CharacterStore;
let fleet: FleetManager;

const configuredPartitions = new Set<string>();
function getConfiguredSession(partition: string): Electron.Session {
  const ses = partition === "" ? session.defaultSession : session.fromPartition(partition);
  if (!configuredPartitions.has(partition)) {
    configuredPartitions.add(partition);
    ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    ses.setUserAgent(cleanedUserAgent());
  }
  return ses;
}

function broadcastVaultSnapshot(): void {
  if (controllerWindow && !controllerWindow.isDestroyed()) {
    controllerWindow.webContents.send("vault:changed", characterStore.snapshot());
  }
}

function broadcastFleetSnapshot(): void {
  if (controllerWindow && !controllerWindow.isDestroyed()) {
    controllerWindow.webContents.send("fleet:changed", fleet.snapshot());
  }
}

function createControllerWindow(): void {
  controllerWindow = new BrowserWindow({
    width: 1220,
    height: 880,
    minWidth: 760,
    minHeight: 540,
    title: "RWK Multibox — Controller",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(__dirname, "../preload/preload.js"),
      backgroundThrottling: false
    }
  });

  controllerWindow.setMenuBarVisibility(false);
  controllerWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  // Closing the controller closes the whole fleet — children are useless without it.
  controllerWindow.on("close", () => {
    fleet.closeAll();
  });
  controllerWindow.on("closed", () => {
    controllerWindow = null;
  });

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void controllerWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void controllerWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

function registerIpcHandlers(): void {
  // ----- Vault -----
  ipcMain.handle("vault:snapshot", () => characterStore.snapshot());
  ipcMain.handle("vault:template", () => characterStore.createTemplate());
  ipcMain.handle("vault:save", (_event, character: unknown) => {
    const saved = characterStore.saveCharacter(character);
    broadcastVaultSnapshot();
    return saved;
  });
  // Confirm here in the main process, not with the renderer's window.confirm(): a
  // renderer-invoked confirm()/alert() leaves the controller window unable to receive
  // mouse/keyboard input on Windows once other top-level fleet windows exist (Electron
  // focus-restore bug) — the whole panel goes dead until restart. A window-parented
  // dialog.showMessageBox doesn't have that problem.
  ipcMain.handle("vault:delete", async (event, characterId: string) => {
    const id = String(characterId);
    const label = characterStore.getCharacter(id)?.label ?? "this character";
    const parent = BrowserWindow.fromWebContents(event.sender);
    const options: Electron.MessageBoxOptions = {
      type: "warning",
      buttons: ["Cancel", "Delete"],
      defaultId: 0,
      cancelId: 0,
      message: `Delete "${label}"?`,
      detail: "This cannot be undone."
    };
    const { response } = parent
      ? await dialog.showMessageBox(parent, options)
      : await dialog.showMessageBox(options);
    if (response !== 1) return null; // cancelled
    const snapshot = characterStore.deleteCharacter(id);
    broadcastVaultSnapshot();
    return snapshot;
  });
  ipcMain.handle("vault:import-lines", (_event, payload: { text: string; rwkServer: string }) => {
    const result = characterStore.importNamePasswordLines(
      String(payload?.text ?? ""),
      resolveRwkServerId(payload?.rwkServer)
    );
    broadcastVaultSnapshot();
    return result;
  });
  ipcMain.handle("vault:import-json", (_event, jsonText: string) => {
    const result = characterStore.importCharactersJsonText(String(jsonText ?? ""));
    broadcastVaultSnapshot();
    return result;
  });
  ipcMain.handle("vault:import-parent-vault", async (): Promise<BulkImportJsonResult | null> => {
    const picked = await dialog.showOpenDialog({
      title: "Import RWK Client vault",
      filters: [{ name: "RWK Client vault", extensions: ["json"] }],
      properties: ["openFile"]
    });
    if (picked.canceled || picked.filePaths.length === 0) return null;

    const text = readFileSync(picked.filePaths[0], "utf8");
    const parsed = parseParentVaultText(text);
    const result = characterStore.mergeImportedCharacters(parsed.characters);
    result.errors.push(...parsed.errors);
    broadcastVaultSnapshot();
    return result;
  });
  ipcMain.handle("vault:export-json", () => {
    const snapshot = characterStore.snapshot();
    clipboard.writeText(serializeCharacterVaultJsonExport(snapshot, new Date().toISOString()));
    return snapshot.characters.length;
  });
  ipcMain.handle("vault:export-lines", () => {
    const snapshot = characterStore.snapshot();
    clipboard.writeText(formatNamePasswordExportLines(snapshot.characters));
    return snapshot.characters.length;
  });

  // ----- Fleet -----
  ipcMain.handle("fleet:snapshot", () => fleet.snapshot());
  ipcMain.handle("fleet:launch", (_event, characterId: string) => {
    const character = characterStore.getCharacter(String(characterId));
    if (!character) throw new Error("Character not found in the vault.");
    fleet.launchCharacter(character);
  });
  ipcMain.handle("fleet:launch-all", () =>
    fleet.launchAllCharacters(characterStore.snapshot().characters)
  );
  ipcMain.handle("fleet:launch-blank", (_event, server: string) => {
    fleet.launchBlank(resolveRwkServerId(server) as RwkServerId);
  });
  ipcMain.handle("fleet:close", (_event, childId: number) => fleet.closeChild(Number(childId)));
  ipcMain.handle("fleet:close-all", () => fleet.closeAll());
  ipcMain.handle("fleet:focus", (_event, childId: number) => fleet.focusChild(Number(childId)));
  ipcMain.handle("fleet:reload", (_event, childId: number) => fleet.reloadChild(Number(childId)));
  ipcMain.handle("fleet:login", (_event, childId: number) => fleet.loginChild(Number(childId)));
  ipcMain.handle("fleet:set-broadcast", (_event, payload: { childId: number; enabled: boolean }) => {
    fleet.setChildBroadcast(Number(payload?.childId), payload?.enabled === true);
  });

  // ----- Fleet hotkeys -----
  ipcMain.handle("keys:broadcast", (_event, hotkeyId: string) => fleet.broadcastHotkey(String(hotkeyId)));
  ipcMain.handle("keys:set-leader-mode", (_event, enabled: boolean) => {
    fleet.setLeaderMode(enabled === true);
  });
}

if (gotSingleInstanceLock) {
  app.userAgentFallback = cleanedUserAgent();

  // A second launch attempt (e.g. double-clicking the exe again) hits this instead of
  // opening a second process; just bring the existing controller forward.
  app.on("second-instance", () => {
    if (controllerWindow && !controllerWindow.isDestroyed()) {
      if (controllerWindow.isMinimized()) controllerWindow.restore();
      controllerWindow.show();
      controllerWindow.focus();
    }
  });

  void app.whenReady().then(() => {
    characterStore = new CharacterStore(join(app.getPath("userData"), "multibox-vault.json"));
    fleet = new FleetManager({
      getSession: getConfiguredSession,
      getCharacter: (id) => characterStore.getCharacter(id),
      userAgent: cleanedUserAgent,
      onChanged: broadcastFleetSnapshot
    });

    registerIpcHandlers();
    createControllerWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createControllerWindow();
      }
    });
  });

  app.on("window-all-closed", () => {
    app.quit();
  });
}
