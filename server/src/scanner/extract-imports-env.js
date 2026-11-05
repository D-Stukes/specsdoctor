import { traverse } from "./babel.js";

function isProcessEnv(node) {
  return node.type === "MemberExpression" && node.object.type === "Identifier" && node.object.name === "process" && node.property.type === "Identifier" && node.property.name === "env";
}

/**
 * Extracts the "Imports" and "Env vars" matrix rows (§2) from a single
 * parsed file. Returns raw specifiers (not yet resolved to file paths -
 * that's resolve-module.js's job, since it needs the whole snapshot) plus
 * env var references and flagged patterns.
 */
export function extractImportsAndEnv(ast) {
  const staticSpecifiers = []; // { spec, line, kind: 'import'|'require' }
  const dynamicUnresolved = []; // { reason, line }
  const envRefs = []; // { name, line }
  const flaggedPatterns = [];

  traverse(ast, {
    ImportDeclaration(path) {
      staticSpecifiers.push({ spec: path.node.source.value, line: path.node.loc.start.line, kind: "import" });
    },
    ExportNamedDeclaration(path) {
      if (path.node.source) {
        staticSpecifiers.push({ spec: path.node.source.value, line: path.node.loc.start.line, kind: "import" });
      }
    },
    ExportAllDeclaration(path) {
      staticSpecifiers.push({ spec: path.node.source.value, line: path.node.loc.start.line, kind: "import" });
    },
    CallExpression(path) {
      const { callee } = path.node;

      // Dynamic import(): always unresolved per §2, literal or not.
      if (callee.type === "Import") {
        dynamicUnresolved.push({ reason: "dynamic_import", line: path.node.loc.start.line });
        return;
      }

      if (callee.type !== "Identifier" || callee.name !== "require") return;
      const arg = path.node.arguments[0];
      if (arg?.type === "StringLiteral") {
        staticSpecifiers.push({ spec: arg.value, line: path.node.loc.start.line, kind: "require" });
      } else {
        dynamicUnresolved.push({ reason: "dynamic_require", line: path.node.loc.start.line });
      }
    },

    MemberExpression(path) {
      const node = path.node;
      if (!isProcessEnv(node.object)) return;
      if (!node.computed && node.property.type === "Identifier") {
        envRefs.push({ name: node.property.name, line: node.loc.start.line });
      } else if (node.computed && node.property.type === "StringLiteral") {
        envRefs.push({ name: node.property.value, line: node.loc.start.line });
      } else if (node.computed) {
        flaggedPatterns.push({ line: node.loc.start.line, pattern: "dynamic_env_var" });
      }
    },

    VariableDeclarator(path) {
      const { id, init } = path.node;
      if (id.type === "ObjectPattern" && init && isProcessEnv(init)) {
        for (const prop of id.properties) {
          if (prop.type === "ObjectProperty" && prop.key.type === "Identifier") {
            envRefs.push({ name: prop.key.name, line: prop.loc.start.line });
          }
        }
      }
    },
  });

  return { staticSpecifiers, dynamicUnresolved, envRefs, flaggedPatterns };
}
