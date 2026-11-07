// T13 Structural Verifier. AT-4 "injected defects" - Technical Design §7:
// a fake function, an out-of-range line, a nonexistent file, and a fake
// endpoint must all be flagged with the correct reason. "Wrong signature"
// (AT-4's fifth case) has no runtime check here on purpose: the renderer
// always pulls a symbol's signature straight from the index for every
// *_ref block (render-page.js), so a rendered signature can't diverge from
// the index's own - there's nothing for this Verifier to catch that
// renderer.test.js's "byte-equal signatures" tests don't already cover.
import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyPage, scanRenderedPageForUnknownMentions } from "../src/stages/verifier.js";
import { getValidator } from "@docsync/contracts";

const index = {
  items: [
    { id: "sym:a.js#real", kind: "function", name: "real", path: "a.js", start_line: 1, end_line: 3, signature: "real()" },
    { id: "ep:GET /real@routes.js:1", kind: "endpoint", method: "GET", path: "/real", resolved: true, declaration: { path: "routes.js", start_line: 1, end_line: 1 }, middleware: [], handler: { inline: { path: "routes.js", start_line: 1, end_line: 1 } } },
  ],
  project: { workspaces: [{ dir: "", scripts: {}, dependencies: { express: "^4.0.0" }, engines: null, frontend: false }], env_vars: [], tables: [] },
};
const contentByPath = { "a.js": "line1\nline2\nline3\n", "routes.js": "line1\n" };

function pageWithClaim(claim) {
  return {
    schema_version: "page/1",
    slug: "test-page",
    title: "Test page",
    sections: [{ heading: "H", blocks: [{ type: "claim", claim }] }],
  };
}

const verifyValidator = getValidator("verify/1");

test("a claim citing a real, in-bounds symbol passes structurally", () => {
  const page = pageWithClaim({
    text: "real() does a thing",
    kind: "behavior",
    symbols: ["sym:a.js#real"],
    evidence: [{ path: "a.js", start_line: 1, end_line: 2 }],
  });
  const { verifyResult } = verifyPage({ page, rev: 1, index, contentByPath, renderWarnings: [] });
  assert.ok(verifyValidator(verifyResult), JSON.stringify(verifyValidator.errors));
  assert.equal(verifyResult.claims[0].structural.status, "pass");
  assert.deepEqual(verifyResult.claims[0].structural.failures, []);
});

test("AT-4a: a fake function (symbol_id not in the index) is flagged unknown_symbol", () => {
  const page = pageWithClaim({
    text: "fakeFunction() does a thing",
    kind: "behavior",
    symbols: ["sym:a.js#fakeFunction"],
    evidence: [{ path: "a.js", start_line: 1, end_line: 1 }],
  });
  const { verifyResult, findings } = verifyPage({ page, rev: 1, index, contentByPath, renderWarnings: [] });
  assert.equal(verifyResult.claims[0].structural.status, "fail");
  assert.deepEqual(verifyResult.claims[0].structural.failures, ["unknown_symbol"]);
  assert.ok(findings.some((f) => f.reason === "unknown_symbol"));
});

test("AT-4b: an out-of-range evidence line is flagged evidence_out_of_bounds", () => {
  const page = pageWithClaim({
    text: "real() does a thing",
    kind: "behavior",
    symbols: ["sym:a.js#real"],
    evidence: [{ path: "a.js", start_line: 1, end_line: 99 }], // a.js only has 3 lines
  });
  const { verifyResult } = verifyPage({ page, rev: 1, index, contentByPath, renderWarnings: [] });
  assert.equal(verifyResult.claims[0].structural.status, "fail");
  assert.deepEqual(verifyResult.claims[0].structural.failures, ["evidence_out_of_bounds"]);
});

test("AT-4c: a nonexistent file in evidence is flagged evidence_out_of_bounds", () => {
  const page = pageWithClaim({
    text: "real() does a thing",
    kind: "behavior",
    symbols: ["sym:a.js#real"],
    evidence: [{ path: "does/not/exist.js", start_line: 1, end_line: 1 }],
  });
  const { verifyResult } = verifyPage({ page, rev: 1, index, contentByPath, renderWarnings: [] });
  assert.equal(verifyResult.claims[0].structural.status, "fail");
  assert.deepEqual(verifyResult.claims[0].structural.failures, ["evidence_out_of_bounds"]);
});

test("AT-4d: a fake endpoint (symbol_id in evidence, not in the index) is flagged unknown_symbol", () => {
  const page = pageWithClaim({
    text: "the fake endpoint requires auth",
    kind: "behavior",
    symbols: [],
    evidence: [{ path: "routes.js", start_line: 1, end_line: 1, symbol_id: "ep:GET /fake@routes.js:1" }],
  });
  const { verifyResult } = verifyPage({ page, rev: 1, index, contentByPath, renderWarnings: [] });
  assert.equal(verifyResult.claims[0].structural.status, "fail");
  assert.deepEqual(verifyResult.claims[0].structural.failures, ["unknown_symbol"]);
});

test("claim_ids are assigned in document order, Orchestrator-side, not trusted from input", () => {
  const page = {
    schema_version: "page/1",
    slug: "multi",
    title: "Multi",
    sections: [
      { heading: "H", blocks: [
        { type: "claim", claim: { text: "one", kind: "behavior", symbols: [], evidence: [{ path: "a.js", start_line: 1, end_line: 1 }] } },
        { type: "prose", text: "between" },
        { type: "claim", claim: { text: "two", kind: "behavior", symbols: [], evidence: [{ path: "a.js", start_line: 1, end_line: 1 }] } },
      ] },
    ],
  };
  const { verifyResult } = verifyPage({ page, rev: 1, index, contentByPath, renderWarnings: [] });
  assert.deepEqual(verifyResult.claims.map((c) => c.claim_id), ["clm:multi:1", "clm:multi:2"]);
});

test("every ai.assessment is not_assessed - the AI claim check (Task 7) isn't built", () => {
  const page = pageWithClaim({ text: "x", kind: "behavior", symbols: [], evidence: [{ path: "a.js", start_line: 1, end_line: 1 }] });
  const { verifyResult } = verifyPage({ page, rev: 1, index, contentByPath, renderWarnings: [] });
  assert.equal(verifyResult.claims[0].ai.assessment, "not_assessed");
});

test("coverage counts *_ref blocks against render warnings for unresolved ones", () => {
  const page = {
    schema_version: "page/1", slug: "refs", title: "Refs",
    sections: [{ heading: "H", blocks: [
      { type: "symbol_ref", symbol_id: "sym:a.js#real" },
      { type: "symbol_ref", symbol_id: "sym:a.js#ghost" },
      { type: "endpoint_ref", endpoint_id: "ep:GET /real@routes.js:1" },
    ] }],
  };
  const renderWarnings = [{ reason: "unknown_symbol", detail: "sym:a.js#ghost" }];
  const { verifyResult } = verifyPage({ page, rev: 1, index, contentByPath, renderWarnings });
  assert.deepEqual(verifyResult.coverage, { expected_refs: 3, rendered_refs: 2 });
});

test("render warnings (e.g. a broken *_ref) become their own findings", () => {
  const page = { schema_version: "page/1", slug: "refs", title: "Refs", sections: [{ heading: "H", blocks: [] }] };
  const renderWarnings = [{ reason: "unknown_symbol", detail: "sym:a.js#ghost" }];
  const { findings } = verifyPage({ page, rev: 1, index, contentByPath, renderWarnings });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].reason, "unknown_symbol");
  assert.equal(findings[0].severity, "warning");
});

test("findings fingerprints are stable across a recheck of the same page", () => {
  const page = pageWithClaim({ text: "x", kind: "behavior", symbols: ["sym:a.js#fake"], evidence: [{ path: "a.js", start_line: 1, end_line: 1 }] });
  const run1 = verifyPage({ page, rev: 1, index, contentByPath, renderWarnings: [] });
  const run2 = verifyPage({ page, rev: 2, index, contentByPath, renderWarnings: [] });
  assert.equal(run1.findings[0].fingerprint, run2.findings[0].fingerprint);
});

test("scanRenderedPageForUnknownMentions flags a mention that matches no real symbol, builtin, or dependency", () => {
  const markdown = "Call `real()` first, then `ghostFunction()` runs, and `express.Router()` is a known dependency.";
  const mentions = scanRenderedPageForUnknownMentions(markdown, index);
  assert.ok(mentions.some((m) => m.text === "ghostFunction()"));
  assert.ok(!mentions.some((m) => m.text === "real()"));
  assert.ok(!mentions.some((m) => m.text.startsWith("express")));
});

test("scanRenderedPageForUnknownMentions ignores anything inside a fenced code block", () => {
  const markdown = "```js\nghostFunction();\n```\nNo mention outside the fence.";
  const mentions = scanRenderedPageForUnknownMentions(markdown, index);
  assert.equal(mentions.length, 0);
});

test("backticked file names are not flagged as unknown symbols, but unknown calls still are", () => {
  const md = "Run `npm start` after editing `package.json`, `server.js` and `.env.example`; `fakeThing.run()` and `fakeThing.size` are not real.";
  const texts = scanRenderedPageForUnknownMentions(md, index).map((m) => m.text);
  assert.deepEqual(texts, ["fakeThing.run()", "fakeThing.size"]);
});

test("a member of a real parameter (req.user) is not an unknown symbol, a member of an invented name still is", () => {
  const idx = { ...index, items: [...index.items, { id: "sym:h.js#handler", kind: "function", name: "handler", path: "h.js", start_line: 1, end_line: 2, signature: "handler(req, res)", params: [{ name: "req", type: null }, { name: "res", type: null }] }] };
  const texts = scanRenderedPageForUnknownMentions("It sets `req.user` and calls `res.json()` but never `ghost.user`.", idx).map((m) => m.text);
  assert.deepEqual(texts, ["ghost.user"]);
});

test("a class method mentioned by its bare name (close()) is known; an invented bare call is not", () => {
  const idx = { ...index, items: [...index.items, { id: "sym:p.js#Pool.close", kind: "method", name: "Pool.close", path: "p.js", start_line: 5, end_line: 7, signature: "close()", params: [] }] };
  const texts = scanRenderedPageForUnknownMentions("Call `close()` to end it, not `shutdown()`.", idx).map((m) => m.text);
  assert.deepEqual(texts, ["shutdown()"]);
});
