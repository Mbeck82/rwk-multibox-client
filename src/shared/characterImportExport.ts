import {
  DEFAULT_RWK_SERVER_ID,
  ManagedCharacter,
  RwkServerId,
  VaultSnapshot,
  resolveRwkServerId
} from "./types";

export const CHARACTER_VAULT_JSON_EXPORT_VERSION = 1;

export interface ParsedNamePasswordLine {
  username: string;
  password: string;
}

export interface ParseNamePasswordResult {
  entries: ParsedNamePasswordLine[];
  errors: string[];
}

/**
 * Parse `Name,Password` lines (one account per line). Only the FIRST comma splits, so
 * passwords may contain commas. Blank lines and lines starting with `#` are ignored.
 * Format-compatible with the RWK Client (rwk-electron-client) list export.
 */
export function parseNamePasswordLines(text: string): ParseNamePasswordResult {
  const entries: ParsedNamePasswordLine[] = [];
  const errors: string[] = [];

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === "" || line.startsWith("#")) continue;

    const commaIndex = line.indexOf(",");
    if (commaIndex < 0) {
      errors.push(`Line ${i + 1}: missing comma (expected Name,Password)`);
      continue;
    }

    const username = line.slice(0, commaIndex).trim();
    const password = line.slice(commaIndex + 1).trim();
    if (username === "") {
      errors.push(`Line ${i + 1}: empty name`);
      continue;
    }
    if (password === "") {
      errors.push(`Line ${i + 1}: empty password`);
      continue;
    }

    entries.push({ username, password });
  }

  return { entries, errors };
}

export function formatNamePasswordExportLines(characters: readonly ManagedCharacter[]): string {
  return characters.map((c) => `${c.username},${c.password}`).join("\n");
}

/**
 * JSON export. Passwords are PLAINTEXT in exports — same convention as the RWK Client,
 * so exports can be merged into either app.
 */
export function serializeCharacterVaultJsonExport(snapshot: VaultSnapshot, exportedAt: string): string {
  return JSON.stringify(
    {
      exportVersion: CHARACTER_VAULT_JSON_EXPORT_VERSION,
      exportedAt,
      characters: snapshot.characters
    },
    null,
    2
  );
}

/**
 * Accepts either a raw array of character records or `{ "characters": [...] }` —
 * covering both this app's exports and the RWK Client's exports.
 */
export function extractCharacterEntriesFromJsonImport(parsed: unknown): unknown[] | null {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") {
    const characters = (parsed as Record<string, unknown>).characters;
    if (Array.isArray(characters)) return characters;
  }
  return null;
}

/**
 * Build a ManagedCharacter from an imported record. `username` and `password` are
 * required; everything else gets defaults. Extra fields (e.g. the RWK Client's loop
 * `metadata`) are ignored.
 */
export function managedCharacterFromImportRecord(
  record: unknown,
  nowIso: string,
  generateId: () => string
): ManagedCharacter | null {
  if (!record || typeof record !== "object") return null;
  const r = record as Record<string, unknown>;

  const username = typeof r.username === "string" ? r.username.trim() : "";
  const password = typeof r.password === "string" ? r.password : "";
  if (username === "" || password === "") return null;

  const label = typeof r.label === "string" && r.label.trim() !== "" ? r.label.trim() : username;
  const id = typeof r.id === "string" && r.id.trim() !== "" ? r.id.trim() : generateId();
  const rwkServer: RwkServerId =
    r.rwkServer === undefined ? DEFAULT_RWK_SERVER_ID : resolveRwkServerId(r.rwkServer);
  const createdAt = typeof r.createdAt === "string" && r.createdAt !== "" ? r.createdAt : nowIso;

  return {
    id,
    label,
    username,
    password,
    rwkServer,
    createdAt,
    updatedAt: nowIso
  };
}
