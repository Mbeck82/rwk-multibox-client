import { randomUUID } from "node:crypto";

import { decodeStoredPassword } from "./characterStore";
import { ManagedCharacter, resolveRwkServerId } from "../shared/types";

export interface ParentVaultParseResult {
  characters: ManagedCharacter[];
  errors: string[];
}

/**
 * Parse an RWK Client (rwk-electron-client) `character-vault.json` file.
 *
 * Parent format: `{ version: 2, characters: [{ ..., passwordCiphertext }] }` where rows
 * are `plain:<base64 utf8>` after the parent's own safeStorage migration. Legacy `safe:`
 * rows are keyed to the parent app's safeStorage and cannot be decrypted here — those
 * are reported as errors so the user knows to re-export from the RWK Client instead.
 * The parent's automation `metadata` field is intentionally dropped.
 */
export function parseParentVaultText(text: string): ParentVaultParseResult {
  const errors: string[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { characters: [], errors: [`Invalid JSON: ${String(error)}`] };
  }

  const rows =
    parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>).characters)
      ? ((parsed as Record<string, unknown>).characters as unknown[])
      : null;
  if (!rows) {
    return { characters: [], errors: ["Not an RWK Client vault file (no \"characters\" array)."] };
  }

  const now = new Date().toISOString();
  const characters: ManagedCharacter[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || typeof row !== "object") {
      errors.push(`Row ${i + 1}: not an object.`);
      continue;
    }
    const r = row as Record<string, unknown>;
    const username = typeof r.username === "string" ? r.username.trim() : "";
    if (username === "") {
      errors.push(`Row ${i + 1}: missing username.`);
      continue;
    }
    const ciphertext = typeof r.passwordCiphertext === "string" ? r.passwordCiphertext : "";
    const password = decodeStoredPassword(ciphertext);
    if (password === null) {
      errors.push(
        `Row ${i + 1} (${username}): password row is not portable (${
          ciphertext.startsWith("safe:") ? "app-keyed safeStorage" : "unknown encoding"
        }); use the RWK Client's JSON export instead.`
      );
      continue;
    }

    characters.push({
      id: typeof r.id === "string" && r.id.trim() !== "" ? r.id : randomUUID(),
      label: typeof r.label === "string" && r.label.trim() !== "" ? r.label.trim() : username,
      username,
      password,
      rwkServer: resolveRwkServerId(r.rwkServer),
      createdAt: typeof r.createdAt === "string" && r.createdAt !== "" ? r.createdAt : now,
      updatedAt: now
    });
  }

  return { characters, errors };
}
