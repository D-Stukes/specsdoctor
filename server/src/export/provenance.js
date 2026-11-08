// §4d: "provenance.md lists repo, resolved SHA, run date, models, page
// statuses, reviewed/unreviewed pages, and counts of open findings by
// severity." Never the word "verified" - matches the product promise.
export function buildProvenanceMarkdown({ run, pages, openFindingsBySeverity }) {
  const lines = [
    "# Provenance",
    "",
    `- **Repository:** ${run.owner}/${run.name}`,
    `- **Resolved commit:** \`${run.resolved_sha}\``,
    `- **Run date:** ${new Date(run.created_at).toISOString()}`,
    `- **Models:** ${formatModels(run.config?.models)}`,
    "",
    "This is a source-linked documentation draft, not a verified spec. Every technical claim cites the exact lines it came from; nothing here was executed.",
    "",
    "## Pages",
    "",
    "| Page | Status | Reviewed |",
    "| --- | --- | --- |",
  ];
  for (const p of pages) {
    lines.push(`| ${p.title} | ${p.status} | ${p.reviewed_at ? "yes" : "no"} |`);
  }

  lines.push("", "## Open findings by severity", "");
  const severities = ["critical", "warning", "info"];
  lines.push("| Severity | Count |", "| --- | --- |");
  for (const s of severities) {
    lines.push(`| ${s} | ${openFindingsBySeverity[s] ?? 0} |`);
  }

  return lines.join("\n") + "\n";
}

function formatModels(models) {
  if (!models) return "(stub mode - no model calls made)";
  const entries = Object.entries(models);
  if (entries.length === 0) return "(stub mode - no model calls made)";
  return entries.map(([stage, model]) => `${stage}: \`${model}\``).join(", ");
}
