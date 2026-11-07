import { traverse } from "./babel.js";

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "all"]);

function isRouterOrAppCreation(node) {
  if (node.type !== "CallExpression") return false;
  const callee = node.callee;
  if (callee.type === "Identifier" && (callee.name === "Router" || callee.name === "express")) return true;
  if (callee.type === "MemberExpression" && callee.property.type === "Identifier" && callee.property.name === "Router") return true;
  return false;
}

/**
 * Per-file pass for the "Express" matrix row (§2) - route registrations,
 * `.route().method()` chains, mounts, and which local identifiers are
 * Express app/Router instances or point at another file's router. Cross-
 * file mount resolution (the actual full-path computation) happens in
 * route-graph.js, since it needs every file's facts at once.
 */
export function extractRoutes(ast) {
  const routerInstanceVars = new Set();
  let exportedRouterVar = null; // the var passed to `module.exports = X`, if X is a router/app instance
  const requireBindings = new Map(); // localName -> specifier, for `const X = require("spec")` and named destructures
  const listenVars = new Set();
  const endpoints = []; // { ownerVar, method, pathLiteral, pathResolved, declLine, declEndLine, middleware: [names], handler }
  const mounts = []; // { ownerVar, prefixLiteral, prefixResolved, targetIdentifier, line }
  const flaggedPatterns = [];

  // `app.use("/x", require("./routes/x"))`: the router is loaded inline, with no
  // variable. Give it a synthetic binding so mount resolution treats it like
  // `const x = require("./routes/x"); app.use("/x", x)`.
  function inlineRequireBinding(node, line) {
    if (node?.type !== "CallExpression" || node.callee.type !== "Identifier" || node.callee.name !== "require" || node.arguments[0]?.type !== "StringLiteral") return null;
    const name = `<inline-require@${line}:${node.loc.start.column}>`;
    requireBindings.set(name, node.arguments[0].value);
    return name;
  }

  // Pass 1: find router/app instances and require bindings.
  for (const stmt of ast.program.body) {
    if (stmt.type !== "VariableDeclaration") continue;
    for (const d of stmt.declarations) {
      if (!d.init) continue;
      if (d.id.type === "Identifier" && isRouterOrAppCreation(d.init)) {
        routerInstanceVars.add(d.id.name);
      }
      if (d.id.type === "Identifier" && d.init.type === "CallExpression" && d.init.callee.type === "Identifier" && d.init.callee.name === "require" && d.init.arguments[0]?.type === "StringLiteral") {
        requireBindings.set(d.id.name, d.init.arguments[0].value);
      }
      if (d.id.type === "ObjectPattern" && d.init.type === "CallExpression" && d.init.callee.type === "Identifier" && d.init.callee.name === "require" && d.init.arguments[0]?.type === "StringLiteral") {
        for (const prop of d.id.properties) {
          if (prop.type === "ObjectProperty" && prop.key.type === "Identifier" && prop.value.type === "Identifier") {
            requireBindings.set(prop.value.name, `${d.init.arguments[0].value}#${prop.key.name}`);
          }
        }
      }
    }
  }

  function middlewareNames(args) {
    return args
      .filter((a) => a.type === "Identifier")
      .map((a) => a.name);
  }

  function handlerOf(arg) {
    if (arg.type === "Identifier") return { kind: "identifier", name: arg.name };
    if (arg.type === "ArrowFunctionExpression" || arg.type === "FunctionExpression") {
      return { kind: "inline", start_line: arg.loc.start.line, end_line: arg.loc.end.line };
    }
    if (arg.type === "CallExpression" && arg.callee.type === "Identifier") {
      // Higher-order wrapper applied right at the registration, e.g. asyncHandler(createHabit).
      const inner = arg.arguments[0];
      flaggedPatterns.push({ line: arg.loc.start.line, pattern: "higher_order_wrapper" });
      if (inner?.type === "Identifier") return { kind: "identifier", name: inner.name, wrappedBy: arg.callee.name };
    }
    return { kind: "unknown" };
  }

  traverse(ast, {
    AssignmentExpression(path) {
      const { left, right } = path.node;
      const isModuleExports = left.type === "MemberExpression" && left.object.type === "Identifier" && left.object.name === "module" && left.property.type === "Identifier" && left.property.name === "exports";
      if (isModuleExports && right.type === "Identifier" && routerInstanceVars.has(right.name)) {
        exportedRouterVar = right.name;
      }
    },

    CallExpression(path) {
      const { callee, arguments: args } = path.node;
      if (callee.type !== "MemberExpression" || callee.property.type !== "Identifier") return;
      const prop = callee.property.name;

      // app.listen(...) marks this var as a true root, regardless of mounts.
      if (prop === "listen" && callee.object.type === "Identifier") {
        listenVars.add(callee.object.name);
        return;
      }

      if (prop === "use" && callee.object.type === "Identifier" && (routerInstanceVars.has(callee.object.name) || callee.object.name === "app")) {
        const ownerVar = callee.object.name;
        if (args.length === 1) {
          const target = args[0];
          const inlineName = inlineRequireBinding(target, path.node.loc.start.line);
          if (inlineName) {
            mounts.push({ ownerVar, prefixLiteral: "", prefixResolved: true, targetIdentifier: inlineName, line: path.node.loc.start.line });
          } else if (target.type === "Identifier" && (routerInstanceVars.has(target.name) || requireBindings.has(target.name))) {
            mounts.push({ ownerVar, prefixLiteral: "", prefixResolved: true, targetIdentifier: target.name, line: path.node.loc.start.line });
          }
          return;
        }
        const [prefixArg, ...rest] = args;
        const lastArg = rest[rest.length - 1];
        const inlineName = inlineRequireBinding(lastArg, path.node.loc.start.line);
        const target = inlineName ? { type: "Identifier", name: inlineName } : lastArg;
        if (target?.type !== "Identifier") return;
        const prefixLiteral = prefixArg.type === "StringLiteral" ? prefixArg.value : null;
        const prefixResolved = prefixArg.type === "StringLiteral";
        if (!prefixResolved) flaggedPatterns.push({ line: path.node.loc.start.line, pattern: "dynamic_mount_prefix" });
        mounts.push({ ownerVar, prefixLiteral, prefixResolved, targetIdentifier: target.name, line: path.node.loc.start.line });
        return;
      }

      if (HTTP_METHODS.has(prop) && callee.object.type === "Identifier" && (routerInstanceVars.has(callee.object.name) || callee.object.name === "app")) {
        const pathArg = args[0];
        const pathLiteral = pathArg?.type === "StringLiteral" ? pathArg.value : null;
        const pathResolved = pathArg?.type === "StringLiteral";
        if (!pathResolved) flaggedPatterns.push({ line: path.node.loc.start.line, pattern: "non_literal_route" });
        const rest = args.slice(1);
        endpoints.push({
          ownerVar: callee.object.name,
          method: prop.toUpperCase(),
          pathLiteral,
          pathResolved,
          declLine: path.node.loc.start.line,
          declEndLine: path.node.loc.end.line,
          middleware: middlewareNames(rest.slice(0, -1)),
          handler: rest.length ? handlerOf(rest[rest.length - 1]) : { kind: "unknown" },
        });
        return;
      }

      // `.route(path).method(handler)` chains.
      if (prop === "route" && callee.object.type === "Identifier" && (routerInstanceVars.has(callee.object.name) || callee.object.name === "app")) {
        const pathArg = args[0];
        const pathLiteral = pathArg?.type === "StringLiteral" ? pathArg.value : null;
        const pathResolved = pathArg?.type === "StringLiteral";
        // Walk up the member-call chain collecting .get(...)/.post(...) etc.
        let current = path.parentPath; // CallExpression? MemberExpression first
        while (current && current.isMemberExpression()) {
          const methodCall = current.parentPath;
          if (!methodCall?.isCallExpression()) break;
          const methodProp = current.node.property;
          if (methodProp.type === "Identifier" && HTTP_METHODS.has(methodProp.name)) {
            const handlerArgs = methodCall.node.arguments;
            endpoints.push({
              ownerVar: callee.object.name,
              method: methodProp.name.toUpperCase(),
              pathLiteral,
              pathResolved,
              declLine: methodCall.node.loc.start.line,
              declEndLine: methodCall.node.loc.end.line,
              middleware: middlewareNames(handlerArgs.slice(0, -1)),
              handler: handlerArgs.length ? handlerOf(handlerArgs[handlerArgs.length - 1]) : { kind: "unknown" },
            });
          }
          // Move to the next link: methodCall is now the object of the next MemberExpression, if any.
          current = methodCall.parentPath?.isMemberExpression() ? methodCall.parentPath : null;
        }
      }
    },
  });

  return { routerInstanceVars, exportedRouterVar, requireBindings, listenVars, endpoints, mounts, flaggedPatterns };
}
