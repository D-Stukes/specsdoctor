import { traverse } from "./babel.js";

const ROUTER_FACTORIES = new Set(["createBrowserRouter", "createHashRouter"]);

function jsxElementName(node) {
  if (!node || node.type !== "JSXElement") return null;
  const name = node.openingElement.name;
  return name.type === "JSXIdentifier" ? name.name : null;
}

function objectProp(objExpr, key) {
  return objExpr.properties.find((p) => p.type === "ObjectProperty" && p.key?.name === key);
}

/**
 * Per-file pass for the "Frontend" matrix row's react-router half (Task 9 / T21):
 * `createBrowserRouter`/`createHashRouter([{path, element}, ...])` configs, and JSX
 * `<Route path="..." element={...} />` elements. Returns route facts with their own evidence -
 * the caller (scanner/index.js) prefixes ids and the file path. A path built from a variable or
 * template literal (not a plain string) is a computed route and is left out, same as Express'
 * non-literal paths - §2's matrix flags those, it doesn't guess them.
 */
export function extractReactRoutes(ast) {
  const routes = []; // { path, element_component, start_line, end_line, via }

  traverse(ast, {
    CallExpression(path) {
      const callee = path.node.callee;
      const name = callee.type === "Identifier" ? callee.name : null;
      if (!name || !ROUTER_FACTORIES.has(name)) return;
      const arg = path.node.arguments[0];
      if (arg?.type !== "ArrayExpression") return;
      for (const el of arg.elements) {
        if (el?.type !== "ObjectExpression") continue;
        const pathProp = objectProp(el, "path");
        if (pathProp?.value?.type !== "StringLiteral") continue;
        const elementProp = objectProp(el, "element");
        routes.push({
          path: pathProp.value.value,
          element_component: jsxElementName(elementProp?.value),
          start_line: el.loc.start.line,
          end_line: el.loc.end.line,
          via: "createBrowserRouter",
        });
      }
    },

    JSXElement(path) {
      const opening = path.node.openingElement;
      if (opening.name.type !== "JSXIdentifier" || opening.name.name !== "Route") return;
      const pathAttr = opening.attributes.find((a) => a.type === "JSXAttribute" && a.name?.name === "path");
      const elementAttr = opening.attributes.find((a) => a.type === "JSXAttribute" && a.name?.name === "element");
      if (pathAttr?.value?.type !== "StringLiteral") return;
      const elementNode = elementAttr?.value?.type === "JSXExpressionContainer" ? elementAttr.value.expression : null;
      routes.push({
        path: pathAttr.value.value,
        element_component: jsxElementName(elementNode),
        start_line: path.node.loc.start.line,
        end_line: path.node.loc.end.line,
        via: "<Route path element>",
      });
    },
  });

  return routes;
}
