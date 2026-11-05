import { traverse } from "./babel.js";
import { readJsDoc } from "./jsdoc.js";

// Builds a (string, string) -> string function-signature text, matching
// the "signature" field in the index/1 contract (e.g. "createUser(req, res)").
function paramsOf(fnNode) {
  return fnNode.params.map((p) => {
    if (p.type === "Identifier") return p.name;
    if (p.type === "AssignmentPattern" && p.left.type === "Identifier") return p.left.name;
    if (p.type === "ObjectPattern") return "{ " + p.properties.map((prop) => prop.key?.name ?? "...").join(", ") + " }";
    if (p.type === "RestElement" && p.left.type === "Identifier") return `...${p.left.name}`;
    return "arg";
  });
}

function tsTypeToString(typeAnnotation) {
  if (!typeAnnotation) return null;
  // Best-effort: Babel doesn't give us source text directly, so this only
  // handles the simple annotation shapes the fixture and matrix care about.
  const t = typeAnnotation.typeAnnotation ?? typeAnnotation;
  switch (t?.type) {
    case "TSStringKeyword":
      return "string";
    case "TSNumberKeyword":
      return "number";
    case "TSBooleanKeyword":
      return "boolean";
    case "TSVoidKeyword":
      return "void";
    case "TSTypeReference":
      return t.typeName?.name ?? null;
    default:
      return null;
  }
}

function buildSignature(name, fnNode) {
  return `${name}(${paramsOf(fnNode).join(", ")})`;
}

function buildParams(fnNode, jsDoc) {
  return fnNode.params.map((p) => {
    const name = p.type === "AssignmentPattern" && p.left.type === "Identifier" ? p.left.name : p.type === "Identifier" ? p.name : "arg";
    const tsType = tsTypeToString(p.typeAnnotation);
    const jsDocType = jsDoc?.params?.[name] ?? null;
    return { name, type: tsType ?? jsDocType ?? null, default: p.type === "AssignmentPattern" ? "<expr>" : null };
  });
}

/**
 * Extracts the "Items" and "Exports" matrix rows (§2) from a single
 * already-parsed file. Scoped to module top level, matching what a
 * documentation scanner actually needs (nested helpers inside functions
 * aren't documented). Returns { items, flaggedPatterns }, where each item
 * still needs its `id` (`sym:<path>#<name>`) prefixed by the caller, since
 * this module doesn't know its own file path.
 */
export function extractItemsAndExports(ast, { language }) {
  const items = new Map(); // localName -> item draft
  const flaggedPatterns = [];
  const localConstInits = new Map(); // localName -> init AST node, for on-demand constant capture

  function addFlag(line, pattern) {
    flaggedPatterns.push({ line, pattern });
  }

  function markExported(name, style) {
    if (!name) return;
    // A direct `export const x = ...` / `export default x` is itself proof
    // that a plain-value top-level const is worth recording, even though
    // materializeConstant() is normally only called on demand from a later
    // CommonJS export assignment.
    const item = items.get(name) ?? materializeConstant(name);
    if (item) {
      item.exported = true;
      item.export_style = style;
    }
  }

  // Materializes a non-function top-level const/let as a "constant" item,
  // but only when something later actually exports it - otherwise every
  // `const express = require("express")` would become spurious noise.
  function materializeConstant(name, line) {
    if (items.has(name)) return items.get(name);
    const init = localConstInits.get(name);
    if (!init) return null;
    if (init.type === "CallExpression" && init.callee.type === "Identifier" && init.callee.name === "require") {
      return null; // re-export of a required module, not a meaningful constant
    }
    if (isRouterInstance(init)) return null; // Router instances become endpoint items instead (T07)
    const item = {
      kind: "constant",
      name,
      exported: false,
      export_style: "none",
      documented: false,
      start_line: init.loc.start.line,
      end_line: init.loc.end.line,
      signature: null,
      params: [],
      returns: null,
      doc: null,
      wrapped_by: null,
    };
    items.set(name, item);
    return item;
  }

  function isRouterInstance(node) {
    if (node.type !== "CallExpression") return false;
    const callee = node.callee;
    if (callee.type === "Identifier" && callee.name === "Router") return true;
    if (callee.type === "MemberExpression" && callee.property.type === "Identifier" && callee.property.name === "Router") return true;
    return false;
  }

  function addFunctionItem(name, fnNode, commentNodes, wrappedBy) {
    const jsDoc = readJsDoc(...commentNodes);
    items.set(name, {
      kind: "function",
      name,
      exported: false,
      export_style: "none",
      documented: Boolean(jsDoc),
      start_line: fnNode.loc.start.line,
      end_line: fnNode.loc.end.line,
      signature: buildSignature(name, fnNode),
      params: buildParams(fnNode, jsDoc),
      returns: tsTypeToString(fnNode.returnType) ?? jsDoc?.returns ?? null,
      doc: jsDoc?.doc ?? null,
      wrapped_by: wrappedBy ?? null,
    });
  }

  function addClassItem(name, classNode, commentNodes) {
    const jsDoc = readJsDoc(...commentNodes);
    items.set(name, {
      kind: "class",
      name,
      exported: false,
      export_style: "none",
      documented: Boolean(jsDoc),
      start_line: classNode.loc.start.line,
      end_line: classNode.loc.end.line,
      signature: null,
      params: [],
      returns: null,
      doc: jsDoc?.doc ?? null,
      wrapped_by: null,
    });
    for (const member of classNode.body.body) {
      if (member.type !== "ClassMethod" || member.key.type !== "Identifier" || member.kind === "constructor") continue;
      const methodName = `${name}.${member.key.name}`;
      const methodJsDoc = readJsDoc(member);
      items.set(methodName, {
        kind: "method",
        name: methodName,
        exported: false,
        export_style: "none",
        documented: Boolean(methodJsDoc),
        start_line: member.loc.start.line,
        end_line: member.loc.end.line,
        signature: buildSignature(member.key.name, member),
        params: buildParams(member, methodJsDoc),
        returns: tsTypeToString(member.returnType) ?? methodJsDoc?.returns ?? null,
        doc: methodJsDoc?.doc ?? null,
        wrapped_by: null,
      });
    }
  }

  function addTypeItem(name, node, kindLabel, commentNodes) {
    items.set(name, {
      kind: "type",
      name,
      exported: false,
      export_style: "none",
      documented: false,
      start_line: node.loc.start.line,
      end_line: node.loc.end.line,
      signature: null,
      params: [],
      returns: null,
      doc: null,
      wrapped_by: null,
    });
  }

  // Processes a bare declaration node (one that may or may not be wrapped
  // in export syntax) and, if it introduces a name, returns that name.
  function processDeclaration(decl, commentNodes) {
    switch (decl.type) {
      case "FunctionDeclaration": {
        const name = decl.id?.name ?? "default";
        addFunctionItem(name, decl, [decl, ...commentNodes]);
        return name;
      }
      case "ClassDeclaration": {
        const name = decl.id?.name ?? "default";
        addClassItem(name, decl, [decl, ...commentNodes]);
        return name;
      }
      case "TSInterfaceDeclaration":
        addTypeItem(decl.id.name, decl, "interface", commentNodes);
        return decl.id.name;
      case "TSTypeAliasDeclaration":
        addTypeItem(decl.id.name, decl, "type", commentNodes);
        return decl.id.name;
      case "VariableDeclaration": {
        let lastName = null;
        for (const declarator of decl.declarations) {
          if (declarator.id.type !== "Identifier") continue;
          const name = declarator.id.name;
          const init = declarator.init;
          if (init && (init.type === "ArrowFunctionExpression" || init.type === "FunctionExpression")) {
            addFunctionItem(name, init, [decl, declarator, ...commentNodes]);
          } else if (init) {
            localConstInits.set(name, init);
          }
          lastName = name;
        }
        return lastName;
      }
      default:
        return null;
    }
  }

  for (const stmt of ast.program.body) {
    if (stmt.type === "ExportNamedDeclaration" && stmt.declaration) {
      const name = processDeclaration(stmt.declaration, [stmt]);
      if (name) markExported(name, "named");
    } else if (stmt.type === "ExportNamedDeclaration" && stmt.source) {
      // export { a as b } from "./x" - a rename re-export; we don't resolve
      // the source module's own kind, so record it generically.
      for (const spec of stmt.specifiers) {
        if (spec.type !== "ExportSpecifier") continue;
        items.set(spec.exported.name, {
          kind: "constant",
          name: spec.exported.name,
          exported: true,
          export_style: "re-export",
          documented: false,
          start_line: spec.loc.start.line,
          end_line: spec.loc.end.line,
          signature: null,
          params: [],
          returns: null,
          doc: null,
          wrapped_by: null,
        });
      }
    } else if (stmt.type === "ExportNamedDeclaration" && stmt.specifiers.length > 0) {
      // export { a, b as c } - referencing names already declared in this file.
      for (const spec of stmt.specifiers) {
        if (spec.type === "ExportSpecifier" && items.has(spec.local.name)) {
          markExported(spec.local.name, "named");
        }
      }
    } else if (stmt.type === "ExportAllDeclaration") {
      flaggedPatterns.push({ line: stmt.loc.start.line, pattern: "re_export_all", source: stmt.source.value });
    } else if (stmt.type === "ExportDefaultDeclaration") {
      const decl = stmt.declaration;
      if (decl.type === "FunctionDeclaration" || decl.type === "ClassDeclaration") {
        const name = processDeclaration(decl, [stmt]);
        markExported(name, "default");
      } else if (decl.type === "Identifier") {
        markExported(decl.name, "default");
      } else {
        // Anonymous inline expression default export.
        items.set("default", {
          kind: decl.type === "ArrowFunctionExpression" || decl.type === "FunctionExpression" ? "function" : "constant",
          name: "default",
          exported: true,
          export_style: "default",
          documented: false,
          start_line: decl.loc.start.line,
          end_line: decl.loc.end.line,
          signature: decl.type === "ArrowFunctionExpression" || decl.type === "FunctionExpression" ? buildSignature("default", decl) : null,
          params: [],
          returns: null,
          doc: null,
          wrapped_by: null,
        });
      }
    } else {
      processDeclaration(stmt, []);
    }
  }

  // CommonJS: module.exports = ..., module.exports.x = ..., exports.x = ...
  traverse(ast, {
    AssignmentExpression(path) {
      if (path.getFunctionParent()) return; // only module-top-level assignments count
      const { left, right } = path.node;
      const insideIf = Boolean(path.findParent((p) => p.isIfStatement()));

      const wholeModuleExports = left.type === "MemberExpression" && isModuleExports(left);
      const propertyAssign = left.type === "MemberExpression" && !left.computed && isModuleExportsOrExports(left.object);
      const dynamicPropertyAssign = left.type === "MemberExpression" && left.computed && isModuleExportsOrExports(left.object);

      if (dynamicPropertyAssign) {
        addFlag(left.loc.start.line, "dynamic_export");
        return;
      }
      if (insideIf && (wholeModuleExports || propertyAssign)) {
        addFlag(path.node.loc.start.line, "conditional_export");
        return; // deliberately don't mark anything exported - see extract-items-exports.js notes
      }

      if (wholeModuleExports) {
        exportValue(right, null);
      } else if (propertyAssign) {
        exportValue(right, left.property.name);
      }
    },
  });

  function exportValue(valueNode, propertyName) {
    if (valueNode.type === "Identifier") {
      const existing = items.get(valueNode.name) ?? materializeConstant(valueNode.name, valueNode.loc.start.line);
      if (existing) {
        existing.exported = true;
        existing.export_style = "commonjs";
      }
      return;
    }
    if (valueNode.type === "ObjectExpression") {
      for (const prop of valueNode.properties) {
        if (prop.type !== "ObjectProperty" || prop.key.type !== "Identifier") continue;
        if (prop.value.type === "Identifier") {
          const existing = items.get(prop.value.name) ?? materializeConstant(prop.value.name, prop.value.loc.start.line);
          if (existing) {
            existing.exported = true;
            existing.export_style = "commonjs";
          }
        } else if (prop.value.type === "ArrowFunctionExpression" || prop.value.type === "FunctionExpression") {
          addFunctionItem(prop.key.name, prop.value, []);
          items.get(prop.key.name).exported = true;
          items.get(prop.key.name).export_style = "commonjs";
        }
      }
      return;
    }
    if (valueNode.type === "ArrowFunctionExpression" || valueNode.type === "FunctionExpression") {
      // `module.exports.x = function(){}` names the item x; a bare
      // `module.exports = function(){}` (anonymous, no property) is the
      // CommonJS analog of an anonymous ESM default export - name it
      // "default", same convention as the ESM case elsewhere in this file.
      const name = propertyName ?? valueNode.id?.name ?? "default";
      addFunctionItem(name, valueNode, []);
      items.get(name).exported = true;
      items.get(name).export_style = "commonjs";
      return;
    }
    if (valueNode.type === "CallExpression" && propertyName) {
      // e.g. module.exports.createUser = asyncHandler(createUser) - a
      // higher-order wrapper applied at the registration/export site.
      const inner = valueNode.arguments[0];
      if (inner?.type === "Identifier") {
        const existing = items.get(inner.name) ?? materializeConstant(inner.name, inner.loc.start.line);
        if (existing) {
          existing.exported = true;
          existing.export_style = "commonjs";
        }
      }
      const wrapperName = valueNode.callee.type === "Identifier" ? valueNode.callee.name : null;
      if (wrapperName) addFlag(valueNode.loc.start.line, "higher_order_wrapper");
    }
  }

  // "documented" means "exported (JS/TS) or public (Python)" per §2's
  // definitions, not "has a JSDoc comment" - exported status is only known
  // once every export-determination pass above has run, so this is a
  // post-process rather than something set at creation time.
  for (const item of items.values()) item.documented = item.exported;

  return { items: [...items.values()], flaggedPatterns };
}

function isModuleExports(node) {
  return node.type === "MemberExpression" && node.object.type === "Identifier" && node.object.name === "module" && node.property.type === "Identifier" && node.property.name === "exports";
}

function isModuleExportsOrExports(node) {
  if (node.type === "Identifier" && node.name === "exports") return true;
  return isModuleExports(node);
}
