const RESOLVE_EXTENSIONS = [".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx"];

function normalize(path) {
  const out = [];
  for (const seg of path.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") out.pop();
    else out.push(seg);
  }
  return out.join("/");
}

function dirname(path) {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? "" : path.slice(0, idx);
}

/**
 * Resolves an import/require specifier written in `fromPath` to a path
 * present in `scannedPaths` (a Set of every scanned file's path),
 * including the bare-directory -> index.* convention (§2 "Imports" row).
 * Returns the resolved path, or null if it can't be resolved as a local
 * file (the caller decides what that means: external dependency, unknown
 * non-JS asset, or a genuinely broken relative import).
 */
export function resolveModuleSpecifier(fromPath, spec, scannedPaths) {
  if (!spec.startsWith(".") && !spec.startsWith("/")) return null; // not a relative/absolute specifier
  const base = normalize(`${dirname(fromPath)}/${spec}`);

  if (scannedPaths.has(base)) return base;
  for (const ext of RESOLVE_EXTENSIONS) {
    if (scannedPaths.has(base + ext)) return base + ext;
  }
  for (const ext of RESOLVE_EXTENSIONS) {
    const indexed = `${base}/index${ext}`;
    if (scannedPaths.has(indexed)) return indexed;
  }
  return null;
}

/** True if a specifier has a non-JS extension we don't expect to resolve as a module (css, svg, json, ...). */
export function looksLikeNonModuleAsset(spec) {
  return /\.(css|scss|less|svg|png|jpg|jpeg|gif|json|md|txt|yaml|yml)$/.test(spec);
}

/** §2 "Imports" row: the "@/..." bundler-alias convention. */
export function isAliasedSpecifier(spec) {
  return spec.startsWith("@/");
}
