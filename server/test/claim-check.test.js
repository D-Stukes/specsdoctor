// Task 7 / T19: the AI claim check. AT-5 itself (Technical Design §7): "A claim citing real
// createUser but saying it returns 204 is contradicted or insufficient_evidence, never
// supported." Uses an injected fake callModel throughout, never a real Anthropic API call -
// this tests the stage's own plumbing (gating, evidence lookup, graceful degrade), not the real
// model's judgment, which isn't exercised without spending real money.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkClaims } from "../src/stages/claim-check.js";
import { scanFixture } from "./helpers/fixture.js";

const { index, contentByPath } = scanFixture();
const CREATE_USER_ID = "sym:server/controllers/users.js#createUser";

function pageWithClaim(claim) {
  return { schema_version: "page/1", slug: "users", title: "users", sections: [{ heading: "H", blocks: [{ type: "claim", claim }] }] };
}

function passedClaimCheck(claimId) {
  return [{ claim_id: claimId, structural: { status: "pass", failures: [] }, ai: { assessment: "not_assessed", explanation: null } }];
}

test("AT-5: a wrong-behavior claim against the real createUser gets whatever the model (here, a fake one standing in for Claude) assessed, never left as not_assessed", async () => {
  assert.ok(index.items.some((i) => i.id === CREATE_USER_ID), "fixture must have createUser");
  const page = pageWithClaim({
    text: "createUser responds with a 204 status and no body.",
    kind: "behavior",
    symbols: [CREATE_USER_ID],
    evidence: [{ symbol_id: CREATE_USER_ID, path: "server/controllers/users.js", start_line: 10, end_line: 17 }],
  });
  const claimId = "clm:users:1";
  let sawSnippet = null;
  const callModel = async ({ userMessage }) => {
    sawSnippet = userMessage;
    // Standing in for what the real model should conclude - createUser's actual code calls
    // res.status(201), not 204 - this is AT-5's own scenario, just with a fake judge.
    return { parsed: { results: [{ claim_id: claimId, assessment: "contradicted", explanation: "The code calls res.status(201), not 204." }] }, usage: null, costUsd: 0.001 };
  };

  const result = await checkClaims({ runId: null, page, claimChecks: passedClaimCheck(claimId), contentByPath, budgetManager: null, stub: false, callModel });

  assert.equal(result[0].ai.assessment, "contradicted"); // per AT-5: contradicted or insufficient_evidence, never supported
  assert.notEqual(result[0].ai.assessment, "supported");
  assert.ok(sawSnippet.includes("res.status(201)"), "the model should have been shown the real source, which actually says 201");
});

test("a claim whose structural check failed is never sent to the model", async () => {
  const page = pageWithClaim({ text: "x", kind: "behavior", symbols: [], evidence: [{ path: "a.js", start_line: 1, end_line: 1 }] });
  const failed = [{ claim_id: "clm:users:1", structural: { status: "fail", failures: ["unknown_symbol"] }, ai: { assessment: "not_assessed", explanation: null } }];
  let called = false;
  const callModel = async () => {
    called = true;
    return { parsed: { results: [] }, usage: null, costUsd: 0 };
  };
  const result = await checkClaims({ runId: null, page, claimChecks: failed, contentByPath, budgetManager: null, stub: false, callModel });
  assert.equal(called, false);
  assert.equal(result[0].ai.assessment, "not_assessed");
});

test("a page with no claims makes zero calls", async () => {
  const page = { schema_version: "page/1", slug: "empty", title: "empty", sections: [{ heading: "H", blocks: [] }] };
  let called = false;
  const callModel = async () => {
    called = true;
    return { parsed: { results: [] }, usage: null, costUsd: 0 };
  };
  const result = await checkClaims({ runId: null, page, claimChecks: [], contentByPath, budgetManager: null, stub: false, callModel });
  assert.equal(called, false);
  assert.deepEqual(result, []);
});

test("a malformed model response leaves the claim not_assessed, doesn't throw", async () => {
  const page = pageWithClaim({ text: "x", kind: "behavior", symbols: [CREATE_USER_ID], evidence: [{ symbol_id: CREATE_USER_ID, path: "server/controllers/users.js", start_line: 10, end_line: 17 }] });
  const claimId = "clm:users:1";
  const callModel = async () => ({ parsed: { results: [{ claim_id: "wrong-id", assessment: "supported", explanation: "x" }] }, usage: null, costUsd: 0.001 });
  const result = await checkClaims({ runId: null, page, claimChecks: passedClaimCheck(claimId), contentByPath, budgetManager: null, stub: false, callModel });
  assert.equal(result[0].ai.assessment, "not_assessed");
});

test("a thrown error (e.g. budget exceeded) is swallowed, claim stays not_assessed", async () => {
  const page = pageWithClaim({ text: "x", kind: "behavior", symbols: [CREATE_USER_ID], evidence: [{ symbol_id: CREATE_USER_ID, path: "server/controllers/users.js", start_line: 10, end_line: 17 }] });
  const claimId = "clm:users:1";
  const callModel = async () => {
    throw new Error("budget exceeded");
  };
  const result = await checkClaims({ runId: null, page, claimChecks: passedClaimCheck(claimId), contentByPath, budgetManager: null, stub: false, callModel });
  assert.equal(result[0].ai.assessment, "not_assessed");
});

test("stub mode returns insufficient_evidence for every checkable claim, no network call", async () => {
  const page = pageWithClaim({ text: "x", kind: "behavior", symbols: [CREATE_USER_ID], evidence: [{ symbol_id: CREATE_USER_ID, path: "server/controllers/users.js", start_line: 10, end_line: 17 }] });
  const claimId = "clm:users:1";
  const result = await checkClaims({ runId: null, page, claimChecks: passedClaimCheck(claimId), contentByPath, budgetManager: null, stub: true });
  assert.equal(result[0].ai.assessment, "insufficient_evidence");
});
