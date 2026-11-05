// Minimal JSDoc reader: just enough for the matrix's "Types: explicit TS
// annotations and JSDoc @param/@returns" row. Full tag parsing (@example,
// @throws, ...) is out of scope.

function findJsDocComment(node) {
  const comments = node?.leadingComments ?? [];
  for (let i = comments.length - 1; i >= 0; i -= 1) {
    const c = comments[i];
    if (c.type === "CommentBlock" && c.value.startsWith("*")) return c;
  }
  return null;
}

function stripStars(text) {
  return text
    .split("\n")
    .map((line) => line.replace(/^\s*\*\s?/, "").trim())
    .filter((line, i, arr) => !(line === "" && (i === 0 || i === arr.length - 1)))
    .join(" ")
    .trim();
}

/**
 * Reads the JSDoc block comment attached to the first of `nodes` that has
 * one. Babel attaches a leading comment to whichever node starts right
 * after it - for `export function foo() {}` that's the
 * ExportNamedDeclaration, not the FunctionDeclaration inside it - so
 * callers pass every node in the wrapping chain that could plausibly own
 * the comment. Returns { doc, params: {name: type}, returns: type|null }
 * or null if none of them have a JSDoc block.
 */
export function readJsDoc(...nodes) {
  let comment = null;
  for (const node of nodes) {
    comment = findJsDocComment(node);
    if (comment) break;
  }
  if (!comment) return null;

  const lines = comment.value.split("\n").map((l) => l.replace(/^\s*\*\s?/, ""));
  const descriptionLines = [];
  const params = {};
  let returns = null;

  for (const line of lines) {
    const paramMatch = /^@param\s+\{([^}]*)\}\s+(\S+)/.exec(line.trim());
    const returnsMatch = /^@returns?\s+\{([^}]*)\}/.exec(line.trim());
    if (paramMatch) {
      params[paramMatch[2].replace(/^\[|\]$/g, "")] = paramMatch[1];
    } else if (returnsMatch) {
      returns = returnsMatch[1];
    } else if (!/^@/.test(line.trim())) {
      descriptionLines.push(line);
    }
  }

  return { doc: stripStars(descriptionLines.join("\n")) || null, params, returns };
}
