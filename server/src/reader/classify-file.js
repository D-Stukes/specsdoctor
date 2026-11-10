// Generic, content-independent file triage. Technical Design §2 "Scanner
// support matrix" Files row + §4e SEC-5. Content-dependent checks (parse
// errors, minified-by-length) happen in extract-tarball.js, which has the
// bytes; this module only looks at the path.

export const MAX_FILE_BYTES = 1024 * 1024; // 1 MB, §4a limits
const MINIFIED_LINE_LENGTH = 2000;

/** Content-dependent half of the Files row's skip rules: minified-by-length. Shared by extract-tarball.js and anything else reading files directly (e.g. test harnesses). */
export function isMinified(content) {
  return content.split("\n").some((line) => line.length > MINIFIED_LINE_LENGTH);
}

const DOCUMENTABLE_JS_EXTENSIONS = [".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx"];
const PYTHON_EXTENSIONS = [".py"];

const SKIP_DIR_SEGMENTS = new Set(["node_modules", "dist", "build", "out", ".git", "coverage", ".next", ".vite"]);

// SEC-5: sensitive files stay out of prompts entirely - skipped, not scanned.
const SENSITIVE_PATTERNS = [
  /(^|\/)\.env(\.[^.]+)?$/, // .env, .env.local, ... but .env.example is allowed below
  /\.pem$/,
  /\.key$/,
  /(^|\/)id_rsa(\.[^.]*)?$/,
  /(^|\/)credentials?\.json$/i,
];

function isSensitive(path) {
  if (/(^|\/)\.env\.example$/.test(path)) return false; // explicitly allowed, §2 "known vs inferred"
  return SENSITIVE_PATTERNS.some((re) => re.test(path));
}

function pathSegments(path) {
  return path.split("/");
}

function hasSkipDir(path) {
  return pathSegments(path).some((seg) => SKIP_DIR_SEGMENTS.has(seg));
}

function extensionOf(path) {
  const base = path.split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  // Handle .d.ts specifically: lastIndexOf('.') would give ".ts".
  if (base.endsWith(".d.ts")) return ".d.ts";
  return dot === -1 ? "" : base.slice(dot);
}

/**
 * Classifies a path before its content is read. Returns:
 *   { status: 'scanned', language } - keep and read the content
 *   { status: 'skipped'|'unsupported', reason } - don't read the content
 * `size` is optional (bytes, from the tar header); when given, the 1MB
 * limit is enforced here too.
 */
export function classifyFile(path, size) {
  if (isSensitive(path)) {
    return { status: "skipped", reason: "sensitive_file" };
  }
  if (hasSkipDir(path)) {
    return { status: "skipped", reason: "node_modules" };
  }
  if (typeof size === "number" && size > MAX_FILE_BYTES) {
    return { status: "skipped", reason: "file_size_exceeded" };
  }

  const ext = extensionOf(path);
  if (ext === ".d.ts") {
    return { status: "skipped", reason: "d_ts" };
  }
  if (DOCUMENTABLE_JS_EXTENSIONS.includes(ext)) {
    return { status: "scanned", language: "javascript" };
  }
  if (PYTHON_EXTENSIONS.includes(ext)) {
    return { status: "scanned", language: "python" };
  }
  if (ext === ".ipynb") {
    // A deliberate, permanent skip (§2 support matrix's Python row: "Skipped: Notebooks"),
    // not a "not built yet" gap - now that Python itself is supported, it gets its own reason
    // rather than the generic unsupported-extension one.
    return { status: "skipped", reason: "notebook" };
  }
  if (path.endsWith("package.json")) {
    return { status: "scanned", language: "json" };
  }
  if (path.endsWith(".sql")) {
    return { status: "scanned", language: "sql" };
  }
  if (path.endsWith("schema.prisma")) {
    return { status: "scanned", language: "prisma" };
  }
  if (/(^|\/)\.env\.example$/.test(path)) {
    return { status: "scanned", language: "dotenv" };
  }

  return { status: "unsupported", reason: "extension_not_supported" };
}
