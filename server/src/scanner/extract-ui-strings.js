import { traverse } from "./babel.js";

const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

function isButtonLike(name) {
  return name === "button" || /button/i.test(name);
}

/**
 * Per-file pass for the "headings, buttons, labels, placeholders" matrix row (Task 12 / T33):
 * what the real screens actually say, so a plain-language user guide can cite "Click Sign out"
 * instead of inventing or guessing UI copy. Scope is deliberately narrow (what Task 12's guide
 * builder actually needs) rather than a general UI-text crawler.
 */
export function extractUiStrings(ast) {
  const strings = []; // { kind, text, start_line, end_line }

  const pushText = (kind, text, loc) => {
    const trimmed = text.replace(/\s+/g, " ").trim();
    if (!trimmed) return;
    strings.push({ kind, text: trimmed, start_line: loc.start.line, end_line: loc.end.line });
  };

  traverse(ast, {
    JSXElement(path) {
      const opening = path.node.openingElement;
      if (opening.name.type !== "JSXIdentifier") return;
      const tag = opening.name.name;
      const isHeading = HEADING_TAGS.has(tag.toLowerCase());
      const isButton = isButtonLike(tag);
      if (!isHeading && !isButton) return;
      for (const child of path.node.children) {
        if (child.type === "JSXText") pushText(isButton ? "button" : "heading", child.value, child.loc);
      }
    },

    JSXAttribute(path) {
      const attrName = path.node.name?.name;
      if (attrName !== "placeholder" && attrName !== "aria-label") return;
      const value = path.node.value;
      if (value?.type !== "StringLiteral") return;
      pushText(attrName === "placeholder" ? "placeholder" : "aria_label", value.value, path.node.loc);
    },
  });

  return strings;
}
