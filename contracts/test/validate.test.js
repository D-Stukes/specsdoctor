import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { validateDoc, getValidator, SCHEMA_VERSIONS } from "../src/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const examplesDir = path.join(__dirname, "examples");

function loadExample(name) {
  return JSON.parse(readFileSync(path.join(examplesDir, `${name}.json`), "utf8"));
}

const EXAMPLES = {
  "snapshot/1": "snapshot",
  "index/1": "index",
  "summary/1": "summary",
  "page/1": "page",
  "verify/1": "verify",
};

test("every schema_version has a compiled validator", () => {
  assert.deepEqual(new Set(SCHEMA_VERSIONS), new Set(Object.keys(EXAMPLES)));
  for (const schemaVersion of SCHEMA_VERSIONS) {
    assert.doesNotThrow(() => getValidator(schemaVersion));
  }
});

for (const [schemaVersion, exampleName] of Object.entries(EXAMPLES)) {
  test(`${schemaVersion} example from the technical design validates`, () => {
    const doc = loadExample(exampleName);
    const { valid, errors } = validateDoc(doc);
    assert.equal(valid, true, JSON.stringify(errors));
  });
}

test("validateDoc rejects a document with no schema_version", () => {
  assert.throws(() => validateDoc({ foo: "bar" }), /no schema_version/);
});

test("validateDoc rejects an unknown schema_version", () => {
  assert.throws(() => validateDoc({ schema_version: "nope/99" }), /Unknown schema_version/);
});

test("snapshot/1 rejects a resolved_sha that isn't 40 hex chars", () => {
  const doc = loadExample("snapshot");
  doc.resolved_sha = "not-a-sha";
  const { valid } = validateDoc(doc);
  assert.equal(valid, false);
});

test("snapshot/1 rejects an unknown file status", () => {
  const doc = loadExample("snapshot");
  doc.files[0].status = "vibes";
  const { valid } = validateDoc(doc);
  assert.equal(valid, false);
});

test("index/1 rejects a code item missing a required field", () => {
  const doc = loadExample("index");
  delete doc.items[0].signature;
  const { valid } = validateDoc(doc);
  assert.equal(valid, false);
});

test("index/1 rejects an endpoint item with both symbol_id and inline handler", () => {
  const doc = loadExample("index");
  doc.items[1].handler = { symbol_id: "sym:x#y", inline: { path: "a", start_line: 1, end_line: 2 } };
  const { valid } = validateDoc(doc);
  assert.equal(valid, false);
});

test("summary/1 rejects an item whose symbol_id isn't sym:-prefixed", () => {
  const doc = loadExample("summary");
  doc.items[0].symbol_id = "users.js#createUser";
  const { valid } = validateDoc(doc);
  assert.equal(valid, false);
});

test("page/1 rejects a claim with no evidence", () => {
  const doc = loadExample("page");
  doc.sections[0].blocks[1].claim.evidence = [];
  const { valid } = validateDoc(doc);
  assert.equal(valid, false);
});

test("page/1 accepts an inferred_command code block with no source", () => {
  const doc = loadExample("page");
  doc.sections[0].blocks[3] = { type: "code", kind: "inferred_command", lang: "bash", text: "createdb docsync" };
  const { valid, errors } = validateDoc(doc);
  assert.equal(valid, true, JSON.stringify(errors));
});

test("verify/1 rejects an unknown ai.assessment value", () => {
  const doc = loadExample("verify");
  doc.claims[0].ai.assessment = "verified";
  const { valid } = validateDoc(doc);
  assert.equal(valid, false);
});
