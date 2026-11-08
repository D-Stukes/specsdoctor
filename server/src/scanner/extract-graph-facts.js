import { traverse } from "./babel.js";

// T26: string-match facts for the repo map's two inferred edge kinds (§4f).
// Raw only - SQL text and URLs found in the file; matching them to known
// tables and endpoints happens once the whole project is scanned.

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete"]);

/** Static text of a string or template literal, with ${...} holes as ":param". Null if it isn't one. */
function literalText(node) {
  if (!node) return null;
  if (node.type === "StringLiteral") return node.value;
  if (node.type === "TemplateLiteral") {
    return node.quasis.map((q, i) => q.value.cooked + (i < node.expressions.length ? ":param" : "")).join("");
  }
  return null;
}

function stripOriginAndQuery(url) {
  let out = url.replace(/^[a-z]+:\/\/[^/]+/i, "").replace(/[?#].*$/, "");
  if (!out.startsWith("/")) out = `/${out}`;
  return out;
}

function hasMethodKey(node) {
  return node.properties.some((p) => p.type !== "ObjectProperty" || p.key.name === "method");
}

function methodFromOptions(node) {
  if (!node || node.type !== "ObjectExpression") return null;
  for (const prop of node.properties) {
    if (prop.type === "ObjectProperty" && prop.key.name === "method" && prop.value.type === "StringLiteral") return prop.value.value.toUpperCase();
  }
  return null;
}

export function extractGraphFacts(ast) {
  const sqlStrings = []; // { line, text }
  const httpCalls = []; // { line, url, method|null }

  traverse(ast, {
    StringLiteral(path) {
      if (/\b(from|into|update|join)\b/i.test(path.node.value)) sqlStrings.push({ line: path.node.loc.start.line, text: path.node.value });
    },
    TemplateLiteral(path) {
      const text = literalText(path.node);
      if (/\b(from|into|update|join)\b/i.test(text)) sqlStrings.push({ line: path.node.loc.start.line, text });
    },
    CallExpression(path) {
      const { callee, arguments: args } = path.node;
      const line = path.node.loc.start.line;
      if (callee.type === "Identifier" && (callee.name === "fetch" || callee.name === "axios")) {
        const url = literalText(args[0]);
        if (url !== null) httpCalls.push({ line, url: stripOriginAndQuery(url), method: args.length === 1 ? "GET" : methodFromOptions(args[1]) ?? (args[1]?.type === "ObjectExpression" && !hasMethodKey(args[1]) ? "GET" : null) });
      } else if (callee.type === "MemberExpression" && callee.object.type === "Identifier" && callee.object.name === "axios" && callee.property.type === "Identifier" && HTTP_METHODS.has(callee.property.name)) {
        const url = literalText(args[0]);
        if (url !== null) httpCalls.push({ line, url: stripOriginAndQuery(url), method: callee.property.name.toUpperCase() });
      }
    },
  });

  return { sqlStrings, httpCalls };
}

/** Table names referenced after FROM / INTO / UPDATE / JOIN, kept only if they are known tables. */
export function tablesInSql(text, knownTableNames) {
  const found = new Set();
  const re = /\b(?:from|into|update|join)\s+(?:only\s+)?(?:if\s+exists\s+)?(?:\w+\.)?"?(\w+)"?/gi;
  let m;
  while ((m = re.exec(text))) {
    if (knownTableNames.has(m[1].toLowerCase())) found.add(m[1].toLowerCase());
  }
  return [...found];
}
