import type {
  BroadcastResult,
  BulkImportJsonResult,
  BulkImportNamePasswordResult,
  FleetSnapshot,
  ManagedCharacter,
  RwkServerId,
  VaultSnapshot
} from "./types";

/** The IPC bridge exposed to the controller renderer as `window.mbox`. */
export interface MboxApi {
  // Vault
  getVaultSnapshot(): Promise<VaultSnapshot>;
  createCharacterTemplate(): Promise<ManagedCharacter>;
  saveCharacter(character: ManagedCharacter): Promise<ManagedCharacter>;
  /** Prompts for confirmation in the main process; resolves to the new vault, or null if cancelled. */
  deleteCharacter(characterId: string): Promise<VaultSnapshot | null>;
  importNamePasswordLines(text: string, rwkServer: RwkServerId): Promise<BulkImportNamePasswordResult>;
  importCharactersJson(jsonText: string): Promise<BulkImportJsonResult>;
  /** Opens a file dialog for an RWK Client `character-vault.json`. Null when cancelled. */
  importParentVault(): Promise<BulkImportJsonResult | null>;
  /** Copies the JSON export to the clipboard; resolves to the number of characters exported. */
  copyVaultJsonExport(): Promise<number>;
  /** Copies `username,password` lines to the clipboard; resolves to the number of lines. */
  copyNamePasswordExport(): Promise<number>;
  onVaultChanged(callback: (snapshot: VaultSnapshot) => void): () => void;

  // Fleet
  getFleetSnapshot(): Promise<FleetSnapshot>;
  launchCharacter(characterId: string): Promise<void>;
  launchAllCharacters(): Promise<number>;
  launchBlankClient(server: RwkServerId): Promise<void>;
  closeChild(childId: number): Promise<void>;
  closeAllChildren(): Promise<void>;
  focusChild(childId: number): Promise<void>;
  reloadChild(childId: number): Promise<void>;
  loginChild(childId: number): Promise<void>;
  setChildBroadcast(childId: number, enabled: boolean): Promise<void>;
  onFleetChanged(callback: (snapshot: FleetSnapshot) => void): () => void;

  // Fleet hotkeys
  broadcastHotkey(hotkeyId: string): Promise<BroadcastResult>;
  setLeaderMode(enabled: boolean): Promise<void>;
}
