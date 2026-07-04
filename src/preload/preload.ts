import { contextBridge, ipcRenderer } from "electron";

import type { MboxApi } from "../shared/mboxApi";
import type { FleetSnapshot, ManagedCharacter, RwkServerId, VaultSnapshot } from "../shared/types";

function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: T): void => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

const api: MboxApi = {
  // Vault
  getVaultSnapshot: () => ipcRenderer.invoke("vault:snapshot"),
  createCharacterTemplate: () => ipcRenderer.invoke("vault:template"),
  saveCharacter: (character: ManagedCharacter) => ipcRenderer.invoke("vault:save", character),
  deleteCharacter: (characterId: string) => ipcRenderer.invoke("vault:delete", characterId),
  importNamePasswordLines: (text: string, rwkServer: RwkServerId) =>
    ipcRenderer.invoke("vault:import-lines", { text, rwkServer }),
  importCharactersJson: (jsonText: string) => ipcRenderer.invoke("vault:import-json", jsonText),
  importParentVault: () => ipcRenderer.invoke("vault:import-parent-vault"),
  copyVaultJsonExport: () => ipcRenderer.invoke("vault:export-json"),
  copyNamePasswordExport: () => ipcRenderer.invoke("vault:export-lines"),
  onVaultChanged: (callback: (snapshot: VaultSnapshot) => void) => subscribe("vault:changed", callback),

  // Fleet
  getFleetSnapshot: () => ipcRenderer.invoke("fleet:snapshot"),
  launchCharacter: (characterId: string) => ipcRenderer.invoke("fleet:launch", characterId),
  launchAllCharacters: () => ipcRenderer.invoke("fleet:launch-all"),
  launchBlankClient: (server: RwkServerId) => ipcRenderer.invoke("fleet:launch-blank", server),
  closeChild: (childId: number) => ipcRenderer.invoke("fleet:close", childId),
  closeAllChildren: () => ipcRenderer.invoke("fleet:close-all"),
  focusChild: (childId: number) => ipcRenderer.invoke("fleet:focus", childId),
  reloadChild: (childId: number) => ipcRenderer.invoke("fleet:reload", childId),
  loginChild: (childId: number) => ipcRenderer.invoke("fleet:login", childId),
  setChildBroadcast: (childId: number, enabled: boolean) =>
    ipcRenderer.invoke("fleet:set-broadcast", { childId, enabled }),
  onFleetChanged: (callback: (snapshot: FleetSnapshot) => void) => subscribe("fleet:changed", callback),

  // Fleet hotkeys
  broadcastHotkey: (hotkeyId: string) => ipcRenderer.invoke("keys:broadcast", hotkeyId),
  setLeaderMode: (enabled: boolean) => ipcRenderer.invoke("keys:set-leader-mode", enabled)
};

contextBridge.exposeInMainWorld("mbox", api);
