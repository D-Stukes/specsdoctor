// Shared enums that appear in the SQL schema and the JSON contracts but
// aren't themselves part of a schema_version document (Technical Design SS4b, SS4c).

export const RUN_STATUSES = ["queued", "running", "complete", "complete_with_errors", "failed"];

export const STAGE_STATUSES = ["pending", "running", "done", "partial", "skipped", "failed"];

export const STAGE_NAMES = ["reader", "scanner", "analyst", "architect", "writer", "verifier", "render"];

export const PAGE_STATUSES = ["generated", "not_applicable", "not_detected", "unsupported", "generation_failed"];

export const REVIEW_STATUSES = ["open", "corrected", "dismissed", "accepted_uncertain"];

export const REVIEW_SEVERITIES = ["critical", "warning", "info"];

// review_items.reason (Technical Design SS4c, "Review reason values").
// Distinct from claims[].structural.failures in verify/1, which is the
// narrower set of reasons a structural check itself can report.
export const REVIEW_REASONS = [
  "unknown_symbol",
  "signature_mismatch",
  "evidence_out_of_bounds",
  "claim_contradicted",
  "claim_insufficient_evidence",
  "inferred_setup",
  "route_unresolved",
  "duplicate_route",
  "pattern_unsupported",
  "open_question",
  "module_not_summarized",
  "page_generation_failed",
];

// run_events.code (operational failures and warnings, not content findings).
export const RUN_EVENT_CODES = [
  "module_failed",
  "parse_error",
  "budget_skipped",
  "timeout",
  "interrupted",
];

export const RUN_EVENT_LEVELS = ["info", "warn", "error"];

export const FILE_STATUSES = ["scanned", "skipped", "unsupported", "failed"];

export const PAGE_REVISION_ORIGINS = ["generated", "repaired", "user"];
