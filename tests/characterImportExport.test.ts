import assert from "node:assert/strict";
import { test } from "node:test";

import {
  extractCharacterEntriesFromJsonImport,
  formatNamePasswordExportLines,
  managedCharacterFromImportRecord,
  parseNamePasswordLines,
  serializeCharacterVaultJsonExport
} from "../src/shared/characterImportExport";
import type { ManagedCharacter } from "../src/shared/types";

test("parseNamePasswordLines splits on the first comma only", () => {
  const { entries, errors } = parseNamePasswordLines("Hero,pass,with,commas");
  assert.equal(errors.length, 0);
  assert.deepEqual(entries, [{ username: "Hero", password: "pass,with,commas" }]);
});

test("parseNamePasswordLines skips blanks and comments, collects errors", () => {
  const text = ["# roster", "", "Alpha,secret", "NoCommaHere", "  ,emptyname", "Beta,  "].join("\n");
  const { entries, errors } = parseNamePasswordLines(text);
  assert.deepEqual(entries, [{ username: "Alpha", password: "secret" }]);
  assert.equal(errors.length, 3);
  assert.match(errors[0], /Line 4/);
});

test("JSON export round-trips through the import extractor", () => {
  const character: ManagedCharacter = {
    id: "id-1",
    label: "Hero",
    username: "hero",
    password: "pw",
    rwkServer: "rwk1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
  const json = serializeCharacterVaultJsonExport({ characters: [character] }, "2026-07-04T00:00:00.000Z");
  const entries = extractCharacterEntriesFromJsonImport(JSON.parse(json));
  assert.ok(entries);
  const imported = managedCharacterFromImportRecord(entries![0], "2026-07-04T00:00:00.000Z", () => "fresh");
  assert.ok(imported);
  assert.equal(imported!.id, "id-1");
  assert.equal(imported!.username, "hero");
  assert.equal(imported!.password, "pw");
  assert.equal(imported!.rwkServer, "rwk1");
});

test("extractCharacterEntriesFromJsonImport accepts raw arrays and rejects garbage", () => {
  assert.ok(extractCharacterEntriesFromJsonImport([{ username: "a" }]));
  assert.ok(extractCharacterEntriesFromJsonImport({ characters: [] }));
  assert.equal(extractCharacterEntriesFromJsonImport("nope"), null);
  assert.equal(extractCharacterEntriesFromJsonImport({ foo: 1 }), null);
});

test("managedCharacterFromImportRecord requires username and password, defaults the rest", () => {
  assert.equal(managedCharacterFromImportRecord({ username: "x" }, "now", () => "id"), null);
  assert.equal(managedCharacterFromImportRecord({ password: "y" }, "now", () => "id"), null);

  const imported = managedCharacterFromImportRecord(
    { username: "x", password: "y", metadata: { creatureValue: 5 } },
    "2026-07-04T00:00:00.000Z",
    () => "gen-id"
  );
  assert.ok(imported);
  assert.equal(imported!.id, "gen-id");
  assert.equal(imported!.label, "x");
  assert.equal(imported!.rwkServer, "rwk2");
  // Parent-client automation metadata must not leak through.
  assert.equal("metadata" in imported!, false);
});

test("formatNamePasswordExportLines emits username,password", () => {
  const lines = formatNamePasswordExportLines([
    {
      id: "1",
      label: "Label",
      username: "user",
      password: "pw,1",
      rwkServer: "rwk2",
      createdAt: "",
      updatedAt: ""
    }
  ]);
  assert.equal(lines, "user,pw,1");
});
