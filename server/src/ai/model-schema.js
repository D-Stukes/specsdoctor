// Structured outputs accepts only a subset of JSON Schema and answers 400
// "Schema is too complex" otherwise. Our contract schemas keep the full
// constraints for Ajv; this strips what the API rejects before sending.
// Ajv still validates every response against the original schema.
const UNSUPPORTED = new Set([
  "$schema", "$id", "title", "minLength", "maxLength", "pattern",
  "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf",
  "minItems", "maxItems", "uniqueItems", "minProperties", "maxProperties",
]);

export function toModelSchema(schema) {
  if (Array.isArray(schema)) return schema.map(toModelSchema);
  if (schema === null || typeof schema !== "object") return schema;
  const out = {};
  for (const [key, value] of Object.entries(schema)) {
    if (UNSUPPORTED.has(key)) continue;
    if (key === "properties" || key === "$defs" || key === "definitions") {
      out[key] = Object.fromEntries(Object.entries(value).map(([name, sub]) => [name, toModelSchema(sub)]));
    } else if (key === "oneOf") {
      out.anyOf = toModelSchema(value);
    } else if (key === "const" || key === "enum" || key === "required" || key === "default" || key === "examples") {
      out[key] = value;
    } else {
      out[key] = toModelSchema(value);
    }
  }
  return out;
}
