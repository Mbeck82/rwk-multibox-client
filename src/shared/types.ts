/** Official RWK shards (separate servers / worlds). */
export const RWK_SERVER_IDS = ["rwk2", "rwk1"] as const;
export type RwkServerId = (typeof RWK_SERVER_IDS)[number];
export const DEFAULT_RWK_SERVER_ID: RwkServerId = "rwk2";

export function rwkServerHost(id: RwkServerId): string {
  return `${id}.racewarkingdoms.com`;
}

/** HTTPS hostnames allowed for embedded game windows (both shards). */
export const ALLOWED_RWK_GAME_HOSTS: ReadonlySet<string> = new Set(
  RWK_SERVER_IDS.map((sid) => rwkServerHost(sid))
);

export function rwkServerLandingUrl(id: RwkServerId): string {
  return `https://${rwkServerHost(id)}/`;
}

export function resolveRwkServerId(raw: unknown): RwkServerId {
  if (raw === "rwk1" || raw === "rwk2") return raw;
  return DEFAULT_RWK_SERVER_ID;
}

/**
 * A vault entry. Unlike the automation client there is no loop metadata here —
 * this app only stores what login needs.
 */
export interface ManagedCharacter {
  id: string;
  label: string;
  username: string;
  password: string;
  /** RWK shard; legacy/omitted rows default to {@link DEFAULT_RWK_SERVER_ID}. */
  rwkServer?: RwkServerId;
  createdAt: string;
  updatedAt: string;
}

export function effectiveRwkServer(character: Pick<ManagedCharacter, "rwkServer"> | null | undefined): RwkServerId {
  return resolveRwkServerId(character?.rwkServer);
}

export interface VaultSnapshot {
  characters: ManagedCharacter[];
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

/** Result of importing `Name,Password` lines. */
export interface BulkImportNamePasswordResult {
  added: number;
  skipped: number;
  errors: string[];
}

/** Result of merging JSON character exports (or a parent-client vault file) into the vault. */
export interface BulkImportJsonResult {
  added: number;
  updated: number;
  skipped: number;
  errors: string[];
}

export type FleetChildStatus =
  | "loading"
  | "manual"
  | "logging-in"
  | "logged-in"
  | "login-failed";

export interface FleetChildSnapshot {
  id: number;
  characterId: string | null;
  label: string;
  server: RwkServerId;
  status: FleetChildStatus;
  statusDetail: string;
  broadcastEnabled: boolean;
}

export interface FleetSnapshot {
  leaderMode: boolean;
  children: FleetChildSnapshot[];
}

/** Result of a fleet hotkey broadcast: how many children the key was dispatched to. */
export interface BroadcastResult {
  sent: number;
  targets: number;
}
