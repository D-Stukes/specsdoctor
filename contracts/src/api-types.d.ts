// API request/response shapes. Technical Design SS4d.
// All routes live under /api, return JSON, and require the access session
// cookie except POST /api/session. Errors share one shape (ApiError).

import type { PageStatus, ReviewSeverity, ReviewStatus } from "./types";

export interface ApiError {
  error: { code: string; message: string };
}

// POST /api/session
export interface PostSessionRequest {
  code: string;
}
// Success: 204 No Content.

// POST /api/runs
export interface PostRunsRequest {
  repo_url: string; // https://github.com/<owner>/<repo>
  ref: string | null;
  intake: Record<string, unknown> | null;
}
export interface PostRunsResponse {
  run_id: string;
  status: "queued";
  duplicate_of: string | null;
}

// GET /api/runs?limit=20&before=<ts>
export interface RunListItem {
  run_id: string;
  repo: { owner: string; name: string };
  resolved_sha: string | null;
  status: string;
  created_at: string;
  cost_usd: number;
  open_findings: number;
  duration_ms: number | null;
}
export interface GetRunsResponse {
  runs: RunListItem[];
}

// GET /api/runs/:id
export interface RunStageProgress {
  stage: string;
  status: string;
  items_total: number | null;
  items_done: number;
  items_failed: number;
  message: string | null;
}
export interface GetRunResponse {
  run_id: string;
  status: string;
  repo: { owner: string; name: string };
  resolved_sha: string | null;
  stages: RunStageProgress[];
  cost_usd: number;
  budget_cap_usd: number;
  coverage: Record<string, unknown> | null;
  failure: { code: string; detail: string } | null;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
}

// GET /api/runs/:id/pages
export interface PageListItem {
  slug: string;
  title: string;
  status: PageStatus;
  current_rev: number;
  checks_fresh: boolean;
  reviewed: boolean;
  open_findings: number;
}
export interface GetPagesResponse {
  pages: PageListItem[];
}

// GET /api/runs/:id/pages/:slug
export interface GetPageResponse {
  slug: string;
  rev: number;
  origin: "generated" | "repaired" | "user";
  markdown: string;
  status: PageStatus;
  checks: {
    fresh: boolean;
    structural_fail: boolean;
    ai: { supported: number; contradicted: number; insufficient: number; not_assessed: number };
  };
  reviewed_at: string | null;
}

// PUT /api/runs/:id/pages/:slug
export interface PutPageRequest {
  base_rev: number;
  markdown: string; // empty string allowed
}
export interface PutPageResponse {
  rev: number;
  checks_fresh: boolean;
}

// POST /api/runs/:id/pages/:slug/review
export interface PostReviewRequest {
  rev: number;
  note: string;
}
// Success: 200, no body defined beyond status.

// GET /api/runs/:id/findings?status=open
export interface Finding {
  id: string;
  page_slug: string | null;
  claim_id: string | null;
  reason: string;
  severity: ReviewSeverity;
  message: string;
  evidence: Record<string, unknown> | null;
  status: ReviewStatus;
  resolution_note: string | null;
  resolved_at: string | null;
}
export interface GetFindingsResponse {
  findings: Finding[];
}

// PATCH /api/findings/:id
export interface PatchFindingRequest {
  status: ReviewStatus;
  note?: string; // required unless reopening (status "open")
}

// GET /api/runs/:id/export.zip?include_review=false
// Success: application/zip (no JSON body).

// GET /api/health (no auth)
export interface GetHealthResponse {
  ok: boolean;
  db: boolean;
}
