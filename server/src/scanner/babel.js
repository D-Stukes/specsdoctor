// Centralizes the @babel/parser + @babel/traverse ESM interop (traverse's
// default export comes through double-wrapped under Node's CJS interop) so
// every other scanner module can just `import { parse, traverse }`.
import * as parserMod from "@babel/parser";
import * as traverseMod from "@babel/traverse";

export const parse = parserMod.parse;
export const traverse = traverseMod.default.default ?? traverseMod.default;

const TS_EXTENSIONS = new Set([".ts", ".tsx"]);
const JSX_EXTENSIONS = new Set([".jsx", ".tsx", ".js", ".mjs", ".cjs"]);

function extensionOf(path) {
  const dot = path.lastIndexOf(".");
  return dot === -1 ? "" : path.slice(dot);
}

/** Parses one source file's text into a Babel AST, picking plugins by extension. */
export function parseFile(path, source) {
  const ext = extensionOf(path);
  const plugins = [];
  if (TS_EXTENSIONS.has(ext)) plugins.push("typescript");
  if (JSX_EXTENSIONS.has(ext) && ext !== ".ts") plugins.push("jsx");

  return parse(source, {
    sourceType: "module",
    allowReturnOutsideFunction: true,
    errorRecovery: false,
    plugins,
  });
}
