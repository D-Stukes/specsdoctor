import crypto from "node:crypto";

// T13 Structural Verifier (Technical Design §4c "Verifier rules" 1-3).
// Rule 4 (AI claim check) is Task 7, a gated Should add-on - not built here;
// every claim's ai.assessment is "not_assessed". Rule 5 (repair loop) is
// T16, also not built yet - findings are reported, nothing is retried.
//
// "Rendered signatures equal index signatures" (rule 1's third clause)
// isn't a separate runtime check here: the renderer (render-page.js) always
// pulls `item.signature` directly from the index for every *_ref block, so
// there is no code path where a rendered signature could differ from the
// index's own - it's true by construction, not asserted at runtime.
//
// The spec says the Verifier reads evidence from the stored snapshot's
// `files.content` so saved runs can be rechecked offline (§4b). That column
// isn't populated yet (a known gap - see LOG.md), so this runs only within
// the same pipeline execution that still has `contentByPath` in memory.

const NODE_CORE_MODULES = new Set([
  "fs", "path", "http", "https", "crypto", "os", "util", "events", "stream",
  "url", "querystring", "child_process", "net", "dns", "zlib", "assert",
  "buffer", "process", "module", "timers", "readline",
]);
const JS_GLOBALS = new Set([
  "console", "Object", "Array", "Promise", "JSON", "Math", "Error", "String",
  "Number", "Boolean", "Map", "Set", "Date", "RegExp", "Symbol", "Function",
  "Proxy", "Reflect", "WeakMap", "WeakSet", "parseInt", "parseFloat", "isNaN",
  "setTimeout", "setInterval", "clearTimeout", "clearInterval", "require",
  "module", "exports", "process", "Buffer", "globalThis", "window", "document",
]);

function lineCountOf(content) {
  return content.split("\n").length;
}

function checkClaimEvidence(claim, itemsById, contentByPath) {
  const failures = new Set();
  for (const symId of claim.symbols) {
    if (!itemsById.has(symId)) failures.add("unknown_symbol");
  }
  for (const ev of claim.evidence) {
    const content = contentByPath[ev.path];
    if (content === undefined) {
      failures.add("evidence_out_of_bounds"); // file not in the pinned snapshot
    } else if (ev.start_line < 1 || ev.end_line < ev.start_line || ev.end_line > lineCountOf(content)) {
      failures.add("evidence_out_of_bounds");
    }
    if (ev.symbol_id && !itemsById.has(ev.symbol_id)) failures.add("unknown_symbol");
  }
  return [...failures];
}

function collectClaims(page) {
  const claims = [];
  let n = 1;
  for (const section of page.sections) {
    for (const block of section.blocks) {
      if (block.type === "claim") {
        claims.push({ claim_id: `clm:${page.slug}:${n}`, claim: block.claim });
        n += 1;
      }
    }
  }
  return claims;
}

function computeCoverage(page, renderWarnings) {
  let expected = 0;
  for (const section of page.sections) {
    for (const block of section.blocks) {
      if (["symbol_ref", "endpoint_ref", "env_ref", "table_ref"].includes(block.type)) expected += 1;
    }
  }
  const unresolved = renderWarnings.filter((w) => w.reason === "unknown_symbol").length;
  return { expected_refs: expected, rendered_refs: Math.max(0, expected - unresolved) };
}

/**
 * Rule 3: scans rendered Markdown (outside fenced code blocks, which cover
 * both `illustrative` examples and any other code block) for inline-code
 * identifiers shaped like a call or member access that don't match a real
 * item name, a JS/Node builtin, or a declared dependency.
 */
const FILE_EXTENSIONS = new Set(["json", "js", "jsx", "mjs", "cjs", "ts", "tsx", "md", "yml", "yaml", "sql", "env", "toml", "lock", "html", "css", "txt", "sh", "prisma"]);

function scanUnknownMentions(markdown, index, dependencyNames) {
  // Parameter names (req, res, next, ...) count as known: `req.user` is a member of a real parameter.
  // A method item is named "Class.method"; prose often says just `method()`.
  const knownNames = new Set(index.items.flatMap((i) => [i.name, i.kind === "method" ? i.name.split(".").pop() : null, ...(i.params ?? []).map((p) => p.name)].filter(Boolean)));
  // Backticked file names (package.json, server.js) look like member access;
  // a bare name.ext whose extension is a file type is a file mention, not a symbol.
  const knownFileNames = new Set(index.items.flatMap((i) => [i.path, i.declaration?.path].filter(Boolean).map((p) => p.split("/").pop())));
  const withoutFencedBlocks = markdown.replace(/```[\s\S]*?```/g, "");
  const inlineCodeRegex = /`([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?\(\)|[A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*)`/g;

  const mentions = [];
  let match;
  let position = 0;
  while ((match = inlineCodeRegex.exec(withoutFencedBlocks))) {
    const text = match[1];
    const baseName = text.replace(/\(\)$/, "").split(".")[0];
    if (!text.endsWith("()") && (FILE_EXTENSIONS.has(text.split(".").pop().toLowerCase()) || knownFileNames.has(text))) continue;
    if (knownNames.has(baseName) || JS_GLOBALS.has(baseName) || NODE_CORE_MODULES.has(baseName) || dependencyNames.has(baseName)) continue;
    mentions.push({ text, block: position });
    position += 1;
  }
  return mentions;
}

function fingerprintFor(slug, claimId, reason, extra) {
  return crypto.createHash("sha256").update(`${slug}:${claimId ?? `mention:${extra ?? ""}`}:${reason}`).digest("hex");
}

/**
 * Verifies one page revision. Returns { verifyResult, findings } -
 * verifyResult matches verify/1 (ready to persist to claim_checks);
 * findings are review_items rows (unique per run via fingerprint, so a
 * recheck updates rather than duplicates them - §4b).
 */
export function verifyPage({ page, rev, index, contentByPath, renderWarnings, unknownMentions = [] }) {
  const itemsById = new Map(index.items.map((i) => [i.id, i]));

  const claims = collectClaims(page);
  const claimChecks = claims.map(({ claim_id, claim }) => {
    const failures = checkClaimEvidence(claim, itemsById, contentByPath);
    return {
      claim_id,
      structural: { status: failures.length ? "fail" : "pass", failures },
      ai: { assessment: "not_assessed", explanation: null },
    };
  });

  const verifyResult = {
    schema_version: "verify/1",
    page_slug: page.slug,
    rev,
    claims: claimChecks,
    unknown_mentions: unknownMentions,
    coverage: computeCoverage(page, renderWarnings),
  };

  const findings = [];
  for (const check of claimChecks) {
    for (const reason of check.structural.failures) {
      findings.push({
        claim_id: check.claim_id,
        reason,
        severity: "critical",
        message: `${check.claim_id}: ${reason.replace(/_/g, " ")}`,
        evidence: null,
        fingerprint: fingerprintFor(page.slug, check.claim_id, reason),
      });
    }
  }
  for (const w of renderWarnings) {
    findings.push({
      claim_id: null,
      reason: w.reason,
      severity: "warning",
      message: `${w.reason.replace(/_/g, " ")}: ${w.detail}`,
      evidence: { detail: w.detail },
      fingerprint: fingerprintFor(page.slug, null, w.reason, w.detail),
    });
  }
  for (const mention of unknownMentions) {
    findings.push({
      claim_id: null,
      reason: "unknown_symbol",
      severity: "warning",
      message: `Unmatched mention in rendered text: \`${mention.text}\``,
      evidence: { text: mention.text },
      fingerprint: fingerprintFor(page.slug, null, "unknown_symbol", mention.text),
    });
  }

  return { verifyResult, findings };
}

/** Rule 3's mention scan needs the rendered Markdown, which only exists after renderPage() runs - a separate entry point so verifyPage() stays testable on structured input alone. */
export function scanRenderedPageForUnknownMentions(markdown, index) {
  const dependencyNames = new Set(index.project.workspaces.flatMap((w) => Object.keys(w.dependencies)));
  return scanUnknownMentions(markdown, index, dependencyNames);
}
