// T18 "unresolved warnings stay inline": open findings become mkdocs
// admonition blocks, both inline on the page they belong to and gathered
// into a standalone docs/review.md when include_review=true (§4d).
const ADMONITION_BY_SEVERITY = { critical: "danger", warning: "warning", info: "info" };

function admonitionFor(finding) {
  const type = ADMONITION_BY_SEVERITY[finding.severity] ?? "warning";
  const title = finding.reason.replace(/_/g, " ");
  return `!!! ${type} "${title}"\n    ${finding.message}`;
}

export function appendInlineFindings(markdown, findingsForPage) {
  if (findingsForPage.length === 0) return markdown;
  const blocks = findingsForPage.map(admonitionFor).join("\n\n");
  return `${markdown}\n\n## Open findings on this page\n\n${blocks}\n`;
}

export function buildReviewMarkdown(findings) {
  const lines = ["# Open findings", ""];
  if (findings.length === 0) {
    lines.push("No open findings on this run.");
    return lines.join("\n") + "\n";
  }
  lines.push("Grouped by page. Each one is flagged for human review, not resolved automatically.", "");
  const byPage = new Map();
  for (const f of findings) {
    const key = f.page_slug ?? "(run-level)";
    if (!byPage.has(key)) byPage.set(key, []);
    byPage.get(key).push(f);
  }
  for (const [slug, pageFindings] of byPage) {
    lines.push(`## ${slug}`, "");
    for (const f of pageFindings) {
      lines.push(admonitionFor(f), "");
    }
  }
  return lines.join("\n") + "\n";
}
