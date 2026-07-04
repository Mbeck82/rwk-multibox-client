import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

import {
  extractCharacterEntriesFromJsonImport,
  managedCharacterFromImportRecord,
  parseNamePasswordLines
} from "../shared/characterImportExport";
import {
  BulkImportJsonResult,
  BulkImportNamePasswordResult,
  DEFAULT_RWK_SERVER_ID,
  ManagedCharacter,
  RwkServerId,
  ValidationResult,
  VaultSnapshot,
  resolveRwkServerId
} from "../shared/types";

/**
 * Vault on disk (`multibox-vault.json`). Passwords are stored `plain:<base64 utf8>` —
 * the same row encoding the RWK Client uses, so vault rows survive round trips
 * between the two apps.
 */
interface VaultOnDisk {
  version: 1;
  characters: StoredCharacter[];
}

export interface StoredCharacter extends Omit<ManagedCharacter, "password"> {
  passwordCiphertext: string;
}

export function encodePlainPassword(password: string): string {
  return `plain:${Buffer.from(password, "utf8").toString("base64")}`;
}

/** Decodes `plain:` rows. `safe:` rows (Electron safeStorage, app-keyed) cannot cross apps. */
export function decodeStoredPassword(value: string): string | null {
  if (value.startsWith("plain:")) {
    try {
      return Buffer.from(value.slice(6), "base64").toString("utf8");
    } catch {
      return null;
    }
  }
  return null;
}

function isStoredCharacter(value: unknown): value is StoredCharacter {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    r.id.length > 0 &&
    typeof r.label === "string" &&
    typeof r.username === "string" &&
    typeof r.passwordCiphertext === "string" &&
    (r.rwkServer === undefined || r.rwkServer === "rwk1" || r.rwkServer === "rwk2") &&
    typeof r.createdAt === "string" &&
    typeof r.updatedAt === "string"
  );
}

function toStored(character: ManagedCharacter): StoredCharacter {
  const { password, ...rest } = character;
  return { ...rest, passwordCiphertext: encodePlainPassword(password) };
}

function toManaged(stored: StoredCharacter): ManagedCharacter {
  const { passwordCiphertext, ...rest } = stored;
  return { ...rest, password: decodeStoredPassword(passwordCiphertext) ?? "" };
}

/**
 * Character vault. Single-process app, so plain in-memory state + atomic file writes
 * are enough (no cross-instance file watching like the automation client needs).
 */
export class CharacterStore {
  private characters: StoredCharacter[] = [];

  constructor(private readonly vaultPath: string) {
    this.load();
  }

  snapshot(): VaultSnapshot {
    return { characters: this.characters.map(toManaged) };
  }

  getCharacter(characterId: string): ManagedCharacter | null {
    const stored = this.characters.find((c) => c.id === characterId);
    return stored ? toManaged(stored) : null;
  }

  createTemplate(): ManagedCharacter {
    const now = new Date().toISOString();
    return {
      id: randomUUID(),
      label: "New RWK Character",
      username: "",
      password: "",
      rwkServer: DEFAULT_RWK_SERVER_ID,
      createdAt: now,
      updatedAt: now
    };
  }

  validateCharacter(input: unknown): ValidationResult {
    const errors: string[] = [];
    if (!input || typeof input !== "object") {
      return { ok: false, errors: ["Character payload must be an object."] };
    }
    const r = input as Record<string, unknown>;
    if (typeof r.id !== "string" || r.id.trim() === "") errors.push("Character id is required.");
    if (typeof r.username !== "string" || r.username.trim() === "") errors.push("Username is required.");
    if (typeof r.password !== "string") errors.push("Password must be a string.");
    if (r.label !== undefined && typeof r.label !== "string") errors.push("Label must be a string.");
    return { ok: errors.length === 0, errors };
  }

  saveCharacter(input: unknown): ManagedCharacter {
    const validation = this.validateCharacter(input);
    if (!validation.ok) {
      throw new Error(`Invalid character: ${validation.errors.join(" ")}`);
    }
    const r = input as Record<string, unknown>;
    const id = (r.id as string).trim();
    const username = (r.username as string).trim();
    const labelRaw = typeof r.label === "string" ? r.label.trim() : "";
    const now = new Date().toISOString();
    const existing = this.characters.find((c) => c.id === id);

    const normalized: ManagedCharacter = {
      id,
      label: labelRaw !== "" ? labelRaw : username,
      username,
      password: r.password as string,
      rwkServer: resolveRwkServerId(r.rwkServer),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };

    const stored = toStored(normalized);
    if (existing) {
      this.characters = this.characters.map((c) => (c.id === id ? stored : c));
    } else {
      this.characters = [...this.characters, stored];
    }
    this.persist();
    return normalized;
  }

  deleteCharacter(characterId: string): VaultSnapshot {
    this.characters = this.characters.filter((c) => c.id !== characterId);
    this.persist();
    return this.snapshot();
  }

  importNamePasswordLines(text: string, rwkServer: RwkServerId): BulkImportNamePasswordResult {
    const { entries, errors } = parseNamePasswordLines(text);
    let added = 0;
    let skipped = 0;
    const now = new Date().toISOString();

    for (const entry of entries) {
      if (this.hasUsernameOnServer(entry.username, rwkServer)) {
        skipped++;
        continue;
      }
      this.characters.push(
        toStored({
          id: randomUUID(),
          label: entry.username,
          username: entry.username,
          password: entry.password,
          rwkServer,
          createdAt: now,
          updatedAt: now
        })
      );
      added++;
    }

    if (added > 0) this.persist();
    return { added, skipped, errors };
  }

  importCharactersJsonText(jsonText: string): BulkImportJsonResult {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch (error) {
      return { added: 0, updated: 0, skipped: 0, errors: [`Invalid JSON: ${String(error)}`] };
    }

    const entries = extractCharacterEntriesFromJsonImport(parsed);
    if (!entries) {
      return {
        added: 0,
        updated: 0,
        skipped: 0,
        errors: ["Expected a JSON array of characters or an object with a \"characters\" array."]
      };
    }

    const now = new Date().toISOString();
    const candidates: ManagedCharacter[] = [];
    const errors: string[] = [];
    for (let i = 0; i < entries.length; i++) {
      const character = managedCharacterFromImportRecord(entries[i], now, randomUUID);
      if (!character) {
        errors.push(`Entry ${i + 1}: missing username or password.`);
        continue;
      }
      candidates.push(character);
    }

    const result = this.mergeImportedCharacters(candidates);
    result.errors.push(...errors);
    return result;
  }

  /** Merge policy: same id → replace; same username+shard → skip; else add. */
  mergeImportedCharacters(candidates: readonly ManagedCharacter[]): BulkImportJsonResult {
    let added = 0;
    let updated = 0;
    let skipped = 0;

    for (const candidate of candidates) {
      const byId = this.characters.findIndex((c) => c.id === candidate.id);
      if (byId >= 0) {
        this.characters[byId] = toStored({ ...candidate, createdAt: this.characters[byId].createdAt });
        updated++;
        continue;
      }
      if (this.hasUsernameOnServer(candidate.username, resolveRwkServerId(candidate.rwkServer))) {
        skipped++;
        continue;
      }
      this.characters.push(toStored(candidate));
      added++;
    }

    if (added > 0 || updated > 0) this.persist();
    return { added, updated, skipped, errors: [] };
  }

  private hasUsernameOnServer(username: string, server: RwkServerId): boolean {
    const needle = username.trim().toLowerCase();
    return this.characters.some(
      (c) => c.username.trim().toLowerCase() === needle && resolveRwkServerId(c.rwkServer) === server
    );
  }

  private load(): void {
    let raw: string;
    try {
      raw = readFileSync(this.vaultPath, "utf8");
    } catch {
      this.characters = [];
      return;
    }

    try {
      const parsed = JSON.parse(raw) as Partial<VaultOnDisk> | null;
      const rows = Array.isArray(parsed?.characters) ? parsed.characters : [];
      this.characters = rows.filter(isStoredCharacter);
    } catch (error) {
      console.warn(`[vault] failed to parse ${this.vaultPath}; starting empty:`, error);
      this.characters = [];
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.vaultPath), { recursive: true });
    const payload: VaultOnDisk = { version: 1, characters: this.characters };
    const tmpPath = `${this.vaultPath}.tmp`;
    writeFileSync(tmpPath, JSON.stringify(payload, null, 2));
    renameSync(tmpPath, this.vaultPath);
  }
}
