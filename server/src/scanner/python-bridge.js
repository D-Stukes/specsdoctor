import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.join(__dirname, "python", "extract_python.py");
const PYTHON_BIN = process.env.PYTHON_BIN || "python3";
const TIMEOUT_MS = 5000;

let cachedAvailable = null;

/** Probes once (cached) so a deployment without Python degrades gracefully - every .py file
 * just fails the same way a JS parse error does, rather than every file spawning and failing
 * its own subprocess individually. */
export function pythonAvailable(bin = PYTHON_BIN) {
  if (cachedAvailable === null) {
    const probe = spawnSync(bin, ["--version"], { timeout: 2000 });
    cachedAvailable = probe.status === 0;
  }
  return cachedAvailable;
}

/** Resets the cached availability check - test-only (the real check should only ever run once
 * per process in production). */
export function resetPythonAvailabilityCache() {
  cachedAvailable = null;
}

/**
 * Runs the ast-based extractor (extract_python.py) over one file's source. Returns
 * { items, env_refs, flagged_patterns } or null on anything that isn't a clean success - a
 * syntax error, Python being unavailable, a timeout, or unparseable output - so the caller
 * (scanner/index.js) can treat null exactly like today's JS parse-failure path, never crash the
 * whole scan over one file.
 */
export function extractPython(source, { bin = PYTHON_BIN } = {}) {
  if (!pythonAvailable(bin)) return null;
  let result;
  try {
    result = spawnSync(bin, [SCRIPT_PATH], { input: source, encoding: "utf8", timeout: TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 });
  } catch {
    return null;
  }
  if (result.status !== 0 || !result.stdout) return null;
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    return null;
  }
  if (parsed.error) return null;
  return parsed;
}
