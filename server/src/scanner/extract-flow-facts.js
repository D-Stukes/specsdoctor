import { traverse } from "./babel.js";

// Flow facts for the repo map's "how does it work" story: who calls whom, what data goes in and
// what comes back. Raw facts per file; resolving them against items and imports happens in
// index.js once every file has been read.

const REQUEST_SOURCES = { body: "body", params: "params", query: "query" };
const RESPONDERS = new Set(["json", "send", "sendStatus", "end"]);

function isReq(node) {
  return node?.type === "Identifier" && (node.name === "req" || node.name === "request");
}
function isRes(node) {
  return node?.type === "Identifier" && (node.name === "res" || node.name === "response");
}
/** `req.body` / `req.params` / `req.query` -> "body" | "params" | "query" | null */
function requestSource(node) {
  if (node?.type === "MemberExpression" && isReq(node.object) && node.property.type === "Identifier" && REQUEST_SOURCES[node.property.name]) return REQUEST_SOURCES[node.property.name];
  return null;
}
const stringOf = (n) => (n?.type === "StringLiteral" ? n.value : null);

export function extractFlowFacts(ast) {
  const bindings = new Map(); // local name -> { spec, imported: "default" | "*" | exported name }
  const instances = new Map(); // variable -> class name, from `const x = new Thing()`
  const calls = []; // { line, name } for f(), or { line, object, property } for obj.m()
  const inputs = []; // { line, source: body|params|query|header, name }
  const outputs = []; // { line, status, message, keys }

  traverse(ast, {
    ImportDeclaration(path) {
      const spec = path.node.source.value;
      for (const s of path.node.specifiers) {
        if (s.type === "ImportDefaultSpecifier") bindings.set(s.local.name, { spec, imported: "default" });
        else if (s.type === "ImportNamespaceSpecifier") bindings.set(s.local.name, { spec, imported: "*" });
        else bindings.set(s.local.name, { spec, imported: s.imported.name ?? s.imported.value });
      }
    },

    VariableDeclarator(path) {
      const { id, init } = path.node;
      if (!init) return;
      // const x = require("./m")  /  const { a, b: c } = require("./m")
      if (init.type === "CallExpression" && init.callee.type === "Identifier" && init.callee.name === "require" && init.arguments[0]?.type === "StringLiteral") {
        const spec = init.arguments[0].value;
        if (id.type === "Identifier") bindings.set(id.name, { spec, imported: "*" });
        else if (id.type === "ObjectPattern") {
          for (const p of id.properties) if (p.type === "ObjectProperty" && p.key.type === "Identifier" && p.value.type === "Identifier") bindings.set(p.value.name, { spec, imported: p.key.name });
        }
        return;
      }
      // const service = new HabitService()
      if (init.type === "NewExpression" && init.callee.type === "Identifier" && id.type === "Identifier") instances.set(id.name, init.callee.name);
      // const { name, email } = req.body
      const source = requestSource(init);
      if (source && id.type === "ObjectPattern") {
        for (const p of id.properties) if (p.type === "ObjectProperty" && p.key.type === "Identifier") inputs.push({ line: p.loc.start.line, source, name: p.key.name });
      }
    },

    MemberExpression(path) {
      const n = path.node;
      // req.body.name / req.params.id / req.query.page
      const source = requestSource(n.object);
      if (source && n.property.type === "Identifier" && !n.computed) inputs.push({ line: n.loc.start.line, source, name: n.property.name });
      // req.headers["x-user-id"]
      if (n.object.type === "MemberExpression" && isReq(n.object.object) && n.object.property.name === "headers" && n.computed) {
        const name = stringOf(n.property);
        if (name) inputs.push({ line: n.loc.start.line, source: "header", name });
      }
    },

    CallExpression(path) {
      const { callee, arguments: args } = path.node;
      const line = path.node.loc.start.line;

      if (callee.type === "Identifier") {
        calls.push({ line, name: callee.name });
        return;
      }
      if (callee.type !== "MemberExpression" || callee.property.type !== "Identifier") return;

      // req.header("x-user-id") / req.get("authorization")
      if (isReq(callee.object) && (callee.property.name === "header" || callee.property.name === "get")) {
        const name = stringOf(args[0]);
        if (name) inputs.push({ line, source: "header", name });
        return;
      }

      // res.json(x) / res.status(201).json(x) / res.sendStatus(204)
      if (RESPONDERS.has(callee.property.name)) {
        let status = null;
        const target = callee.object;
        if (isRes(target)) {
          if (callee.property.name === "sendStatus" && args[0]?.type === "NumericLiteral") status = args[0].value;
        } else if (target.type === "CallExpression" && target.callee.type === "MemberExpression" && isRes(target.callee.object) && target.callee.property.name === "status") {
          if (target.arguments[0]?.type === "NumericLiteral") status = target.arguments[0].value;
        } else {
          calls.push({ line, object: target.type === "Identifier" ? target.name : null, property: callee.property.name });
          return;
        }
        let message = null;
        let keys = null;
        const arg = args[0];
        if (arg?.type === "ObjectExpression") {
          keys = arg.properties.filter((p) => p.type === "ObjectProperty" && p.key.type === "Identifier").map((p) => p.key.name);
          for (const p of arg.properties) {
            if (p.type === "ObjectProperty" && p.key.type === "Identifier" && ["error", "message", "msg"].includes(p.key.name)) message = stringOf(p.value) ?? message;
          }
        } else if (arg?.type === "StringLiteral") message = arg.value;
        outputs.push({ line, status, message, keys });
        return;
      }

      // obj.method(): imported module, namespace or instance call, resolved later; this.method() inside a class
      if (callee.object.type === "Identifier") calls.push({ line, object: callee.object.name, property: callee.property.name });
      else if (callee.object.type === "ThisExpression") calls.push({ line, object: "this", property: callee.property.name });
    },
  });

  return { bindings, instances, calls, inputs, outputs };
}
