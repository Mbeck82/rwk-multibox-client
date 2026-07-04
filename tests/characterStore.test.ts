import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { CharacterStore, decodeStoredPassword, encodePlainPassword } from "../src/main/characterStore";

function withStore<T>(run: (store: CharacterStore, vaultPath: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "mbox-vault-"));
  const vaultPath = join(dir, "multibox-vault.json");
  try {
    return run(new CharacterStore(vaultPath), vaultPath);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("password rows use the parent-compatible plain:base64 encoding", () => {
  const encoded = encodePlainPassword("hunter,2");
  assert.match(encoded, /^plain:/);
  assert.equal(decodeStoredPassword(encoded), "hunter,2");
  assert.equal(decodeStoredPassword("safe:abcd"), null);
});

test("save/load round trip persists characters with encoded passwords", () => {
  withStore((store, vaultPath) => {
    const template = store.createTemplate();
    store.saveCharacter({ ...template, label: "Main", username: "hero", password: "pw" });

    const onDisk = JSON.parse(readFileSync(vaultPath, "utf8"));
    assert.equal(onDisk.version, 1);
    assert.equal(onDisk.characters.length, 1);
    assert.equal(onDisk.characters[0].passwordCiphertext, encodePlainPassword("pw"));
    assert.equal("password" in onDisk.characters[0], false, "plaintext password must not hit disk");

    const reloaded = new CharacterStore(vaultPath);
    const snapshot = reloaded.snapshot();
    assert.equal(snapshot.characters.length, 1);
    assert.equal(snapshot.characters[0].password, "pw");
    assert.equal(snapshot.characters[0].label, "Main");
  });
});

test("saveCharacter rejects missing username", () => {
  withStore((store) => {
    const template = store.createTemplate();
    assert.throws(() => store.saveCharacter({ ...template, username: "  " }), /Username is required/);
  });
});

test("importNamePasswordLines skips duplicate username on the same shard", () => {
  withStore((store) => {
    const first = store.importNamePasswordLines("Hero,pw1\nOther,pw2", "rwk2");
    assert.equal(first.added, 2);

    const second = store.importNamePasswordLines("hero,changed", "rwk2");
    assert.equal(second.added, 0);
    assert.equal(second.skipped, 1);

    // Same name on the other shard is a different account.
    const otherShard = store.importNamePasswordLines("Hero,pw1", "rwk1");
    assert.equal(otherShard.added, 1);
  });
});

test("mergeImportedCharacters replaces by id and skips username duplicates", () => {
  withStore((store) => {
    const saved = store.saveCharacter({
      ...store.createTemplate(),
      label: "Main",
      username: "hero",
      password: "old"
    });

    const result = store.mergeImportedCharacters([
      { ...saved, password: "new", label: "Main2" },
      {
        id: "other-id",
        label: "Dup",
        username: "HERO",
        password: "x",
        rwkServer: saved.rwkServer,
        createdAt: "now",
        updatedAt: "now"
      }
    ]);

    assert.equal(result.updated, 1);
    assert.equal(result.skipped, 1);
    const snapshot = store.snapshot();
    assert.equal(snapshot.characters.length, 1);
    assert.equal(snapshot.characters[0].password, "new");
    assert.equal(snapshot.characters[0].label, "Main2");
  });
});

test("corrupt vault file loads as empty instead of crashing", () => {
  const dir = mkdtempSync(join(tmpdir(), "mbox-vault-"));
  const vaultPath = join(dir, "multibox-vault.json");
  try {
    const store1 = new CharacterStore(vaultPath);
    store1.saveCharacter({ ...store1.createTemplate(), username: "a", password: "b" });

    // Corrupt it.
    require("node:fs").writeFileSync(vaultPath, "{not json");
    const store2 = new CharacterStore(vaultPath);
    assert.equal(store2.snapshot().characters.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
