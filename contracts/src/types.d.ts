// Hand-written TS types mirroring contracts/schemas/*.schema.json.
// These are the compile-time half of T01; Ajv (src/index.js) is the runtime half.
// Keep both in sync by hand - there is no codegen step in v1.

export type SchemaVersion = "snapshot/1" | "index/1" | "summary/1" | "page/1" | "verify/1";

// ---- snapshot/1 --------------------------------------------------------

export type FileStatus = "scanned" | "skipped" | "unsupported" | "failed";

export interface SnapshotFile {
  path: string;
  size: number;
  sha256?: string;
  status: FileStatus;
  reason?: string;
}

export interface Snapshot {
  schema_version: "snapshot/1";
  repo: { owner: string; name: string };
  requested_ref: string | null;
  resolved_sha: string; // 40 hex chars
  files: SnapshotFile[];
  limits_hit: Array<"tarball_size" | "archive_size" | "archive_entries" | "file_size" | "module_count">;
}

// ---- index/1 -------------------------------------------------------------

export type CodeItemKind = "function" | "class" | "method" | "constant" | "type";
export type ExportStyle = "named" | "default" | "commonjs" | "re-export" | "none";

export interface Param {
  name: string;
  type: string | null;
  default: string | null;
}

export interface CodeItem {
  id: string; // sym:<path>#<Qualified.name>
  kind: CodeItemKind;
  language: string;
  name: string;
  path: string;
  start_line: number;
  end_line: number;
  exported: boolean;
  export_style: ExportStyle;
  documented: boolean;
  signature: string | null;
  params: Param[];
  returns: string | null;
  doc: string | null;
  wrapped_by: string | null;
}

export interface SourceRange {
  path: string;
  start_line: number;
  end_line: number;
}

export interface EndpointItem {
  id: string; // ep:<METHOD> <full path>@<declaring path>:<line>
  kind: "endpoint";
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "ALL";
  path: string;
  resolved: boolean;
  declaration: SourceRange;
  mounts: Array<SourceRange & { prefix: string }>;
  middleware: string[]; // sym:...
  handler: { symbol_id: string } | { inline: SourceRange };
}

export interface Workspace {
  dir: string;
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  engines: Record<string, unknown> | null;
  frontend: boolean;
}

export interface EnvVarRef {
  path: string;
  line: number;
}

export interface EnvVar {
  id: string; // env:<NAME>
  refs: EnvVarRef[];
  in_env_example: boolean;
}

export interface TableColumn {
  name: string;
  type: string | null;
  nullable: boolean;
}

export interface Table {
  id: string; // tbl:<name>
  format: "sql" | "prisma";
  source: SourceRange;
  columns: TableColumn[];
}

export interface Import {
  from: string;
  to: string;
  kind: "import" | "require";
}

export interface UnresolvedImport {
  from: string;
  spec: string;
}

export interface FlaggedPattern {
  path: string;
  line: number;
  pattern: string;
}

export interface Index {
  schema_version: "index/1";
  parser_version: string;
  items: Array<CodeItem | EndpointItem>;
  project: {
    workspaces: Workspace[];
    env_vars: EnvVar[];
    tables: Table[];
  };
  imports: Import[];
  unresolved_imports: UnresolvedImport[];
  coverage: {
    files: { scanned: number; skipped: number; unsupported: number; failed: number };
    flagged_patterns: FlaggedPattern[];
  };
}

// ---- summary/1 -------------------------------------------------------------

export interface ParamNote {
  name: string;
  note: string;
}

export interface SummaryItem {
  symbol_id: string;
  what_it_does: string;
  param_notes?: ParamNote[];
  example?: { kind: "illustrative"; text: string };
}

export interface OpenQuestion {
  symbol_id: string;
  text: string;
}

export interface Summary {
  schema_version: "summary/1";
  module_path: string;
  purpose: string;
  items: SummaryItem[];
  open_questions: OpenQuestion[];
  confidence_hint: "low" | "medium" | "high";
}

// ---- page/1 -------------------------------------------------------------

export interface EvidenceRef {
  path: string;
  start_line: number;
  end_line: number;
  symbol_id?: string;
}

export interface Claim {
  text: string;
  kind: string;
  symbols: string[];
  evidence: EvidenceRef[];
}

export type Block =
  | { type: "prose"; text: string }
  | { type: "claim"; claim: Claim }
  | { type: "symbol_ref"; symbol_id: string }
  | { type: "endpoint_ref"; endpoint_id: string }
  | { type: "env_ref"; env_id: string }
  | { type: "table_ref"; table_id: string }
  | {
      type: "code";
      kind: "known_command" | "inferred_command" | "illustrative";
      lang: string;
      text: string;
      source?: { path: string; script: string };
    }
  | { type: "mermaid"; text: string };

export interface PageSection {
  heading: string;
  blocks: Block[];
}

export interface Page {
  schema_version: "page/1";
  slug: string;
  title: string;
  sections: PageSection[];
}

// ---- verify/1 -------------------------------------------------------------

export type StructuralFailure =
  | "unknown_symbol"
  | "signature_mismatch"
  | "evidence_out_of_bounds"
  | "route_unresolved"
  | "duplicate_route"
  | "pattern_unsupported";

export type AiAssessment = "supported" | "contradicted" | "insufficient_evidence" | "not_assessed";

export interface ClaimCheck {
  claim_id: string; // clm:<page slug>:<n>
  structural: { status: "pass" | "fail" | "n/a"; failures: StructuralFailure[] };
  ai: { assessment: AiAssessment; explanation: string | null };
}

export interface UnknownMention {
  text: string;
  block: number;
}

export interface VerifyResult {
  schema_version: "verify/1";
  page_slug: string;
  rev: number;
  claims: ClaimCheck[];
  unknown_mentions: UnknownMention[];
  coverage: { expected_refs: number; rendered_refs: number };
}

// ---- shared enums (also in src/constants.js) --------------------------

export type RunStatus = "queued" | "running" | "complete" | "complete_with_errors" | "failed";
export type StageStatus = "pending" | "running" | "done" | "partial" | "skipped" | "failed";
export type StageName = "reader" | "scanner" | "analyst" | "architect" | "writer" | "verifier" | "render";
export type PageStatus = "generated" | "not_applicable" | "not_detected" | "unsupported" | "generation_failed";
export type ReviewStatus = "open" | "corrected" | "dismissed" | "accepted_uncertain";
export type ReviewSeverity = "critical" | "warning" | "info";
export type ReviewReason =
  | "unknown_symbol"
  | "signature_mismatch"
  | "evidence_out_of_bounds"
  | "claim_contradicted"
  | "claim_insufficient_evidence"
  | "inferred_setup"
  | "route_unresolved"
  | "duplicate_route"
  | "pattern_unsupported"
  | "open_question"
  | "module_not_summarized"
  | "page_generation_failed";
