import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { toModelSchema } from "../src/ai/model-schema.js";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "contracts", "schemas");
const BANNED = ["$schema", "$id", "minLength", "maxLength", "pattern", "minimum", "maximum", "minItems", "maxItems", "oneOf"];

function findBanned(node, found = []) {
  if (Array.isArray(node)) node.forEach((n) => findBanned(n, found));
  else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (BANNED.includes(k)) found.push(k);
      if (k === "properties") Object.values(v).forEach((n) => findBanned(n, found));
      else if (k !== "required" && k !== "enum") findBanned(v, found);
    }
  }
  return found;
}

test("every contract schema is sendable to structured outputs after conversion", () => {
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".schema.json"))) {
    const out = toModelSchema(JSON.parse(readFileSync(path.join(dir, file), "utf8")));
    assert.deepEqual(findBanned(out), [], file);
  }
});

test("toModelSchema keeps a property that is merely named like a banned keyword", () => {
  const out = toModelSchema({ type: "object", properties: { title: { type: "string", minLength: 1 }, pattern: { type: "string" } }, required: ["title"] });
  assert.deepEqual(Object.keys(out.properties), ["title", "pattern"]);
  assert.equal(out.properties.title.minLength, undefined);
  assert.deepEqual(out.required, ["title"]);
});

test("toModelSchema turns oneOf into anyOf", () => {
  assert.deepEqual(toModelSchema({ oneOf: [{ type: "string" }, { type: "null" }] }), { anyOf: [{ type: "string" }, { type: "null" }] });
});
