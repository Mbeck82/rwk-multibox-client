import assert from "node:assert/strict";
import { test } from "node:test";

import { encodePlainPassword } from "../src/main/characterStore";
import { parseParentVaultText } from "../src/main/parentVaultImport";

test("parses plain: rows from an RWK Client vault and drops automation metadata", () => {
  const parentVault = {
    version: 2,
    characters: [
      {
        id: "abc",
        label: "Main",
        username: "hero",
        passwordCiphertext: encodePlainPassword("pw"),
        rwkServer: "rwk1",
        metadata: { creatureValue: 12, attackType: "cast", statChoice: "dur", options: { foo: "bar" } },
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-06-01T00:00:00.000Z"
      }
    ]
  };

  const result = parseParentVaultText(JSON.stringify(parentVault));
  assert.equal(result.errors.length, 0);
  assert.equal(result.characters.length, 1);
  const c = result.characters[0];
  assert.equal(c.id, "abc");
  assert.equal(c.username, "hero");
  assert.equal(c.password, "pw");
  assert.equal(c.rwkServer, "rwk1");
  assert.equal(c.createdAt, "2025-01-01T00:00:00.000Z");
  assert.equal("metadata" in c, false);
});

test("safe: rows are reported as non-portable errors, not silently dropped", () => {
  const parentVault = {
    version: 2,
    characters: [
      { id: "1", label: "L", username: "locked", passwordCiphertext: "safe:AAAA", createdAt: "x", updatedAt: "x" },
      { id: "2", label: "OK", username: "open", passwordCiphertext: encodePlainPassword("p"), createdAt: "x", updatedAt: "x" }
    ]
  };

  const result = parseParentVaultText(JSON.stringify(parentVault));
  assert.equal(result.characters.length, 1);
  assert.equal(result.characters[0].username, "open");
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /safeStorage/);
});

test("rejects non-vault JSON", () => {
  assert.equal(parseParentVaultText("[]").characters.length, 0);
  assert.ok(parseParentVaultText("[]").errors.length > 0);
  assert.ok(parseParentVaultText("{not json").errors[0].startsWith("Invalid JSON"));
});
