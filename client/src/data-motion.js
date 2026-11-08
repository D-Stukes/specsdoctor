// Pure helpers for "data in motion" (Follow the data, animated): idea 3 from the wow-factor
// brainstorm in LOG.md. Every value these return already came from traceSteps()'s chips, which
// come from the run's parsed facts - nothing here invents a field, column or outcome.

const IN_PREFIX = /^in:\s*/;
const SAVE_CHIP = /^saves:\s*([^\s(]+)(?:\s*\(([^)]*)\))?/;

/** The field names a request brings in, from the entry step's "in:" chips, in the order traceSteps gave them. */
export function fieldsFromEntry(entryStep) {
  if (!entryStep) return [];
  return entryStep.chips.filter((c) => c.kind === "in").map((c) => c.text.replace(IN_PREFIX, ""));
}

/** The table and column names from a "write" step's "saves: table (a, b)" chip, or null if it has none. */
export function parseWriteChip(writeStep) {
  const chip = writeStep?.chips.find((c) => c.kind === "write");
  if (!chip) return null;
  const m = SAVE_CHIP.exec(chip.text);
  if (!m) return null;
  return { table: m[1], columns: m[2] ? m[2].split(",").map((s) => s.trim()).filter(Boolean) : [] };
}

/** The reply step's chips split into the happy-path and error outcomes. */
export function replyOutcomes(replyStep) {
  if (!replyStep) return { good: [], bad: [] };
  return { good: replyStep.chips.filter((c) => c.kind === "out"), bad: replyStep.chips.filter((c) => c.kind === "bad") };
}

/** The index of the first step of a kind in a traceSteps() list, or -1. */
export const firstIndexOfKind = (steps, kind) => steps.findIndex((s) => s.kind === kind);
