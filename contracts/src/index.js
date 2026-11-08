import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemasDir = path.join(__dirname, "..", "schemas");

const SCHEMA_FILES = {
  "snapshot/1": "snapshot.schema.json",
  "index/1": "index.schema.json",
  "summary/1": "summary.schema.json",
  "page/1": "page.schema.json",
  "verify/1": "verify.schema.json",
  "graph/1": "graph.schema.json",
  "graph-groups/1": "graph-groups.schema.json",
  "tour/1": "tour.schema.json",
  "tour-narration/1": "tour-narration.schema.json",
};

function loadSchema(file) {
  return JSON.parse(readFileSync(path.join(schemasDir, file), "utf8"));
}

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);

const validators = {};
for (const [schemaVersion, file] of Object.entries(SCHEMA_FILES)) {
  validators[schemaVersion] = ajv.compile(loadSchema(file));
}

/**
 * Validate a stage hand-off document against its schema_version.
 * Throws if schema_version is missing or unknown; otherwise returns
 * { valid, errors } the way Ajv reports them (errors is null when valid).
 */
export function validateDoc(doc) {
  const schemaVersion = doc && doc.schema_version;
  if (!schemaVersion) {
    throw new Error("Document has no schema_version");
  }
  const validate = validators[schemaVersion];
  if (!validate) {
    throw new Error(`Unknown schema_version: ${schemaVersion}`);
  }
  const valid = validate(doc);
  return { valid, errors: valid ? null : validate.errors };
}

export function getValidator(schemaVersion) {
  const validate = validators[schemaVersion];
  if (!validate) {
    throw new Error(`Unknown schema_version: ${schemaVersion}`);
  }
  return validate;
}

export const SCHEMA_VERSIONS = Object.keys(SCHEMA_FILES);

export * from "./constants.js";
