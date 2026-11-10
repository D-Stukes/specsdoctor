import { planTours } from "../tours/plan-tours.js";
import { JARGON } from "./plain-language.js";

// plan-tours.js's role strings are written for a developer-tour audience ("the handler",
// "middleware", "endpoint") - fine there, not here. This is the complete, fixed set of role
// strings that function actually produces (verified against its source, not guessed), each
// mapped to a plain-language equivalent. A role string with no entry here falls through to a
// jargon-stripped generic sentence instead of being shown verbatim.
const ROLE_PLAIN = new Map([
  ["The screen or function that sends the request", "Start here."],
  ["The endpoint that receives the request", "The app receives what you submitted."],
  ["Middleware that runs before the handler", "The app checks a few things first."],
  ["The handler that does the work", "The app does the work."],
  ["Code that reads or writes this table", "This part reads or saves your information."],
  ["A table the request reads or writes", "This is information the app looks up or saves."],
  ["A table where the app keeps data", "This is where the app keeps some of its information."],
  ["The server's entry point: where the routers are mounted", "This is where the app starts up."],
  ["The front end's entry point", "This is the screen that loads first."],
  ["The busiest endpoint: a good one to read first", "This is one of the most-used actions in the app."],
  ["The most-used table: the shape of the data", "This is where the app keeps most of its information."],
]);

const GENERIC_FALLBACK = "Part of the app does its work here.";

function plainRole(role) {
  if (ROLE_PLAIN.has(role)) return ROLE_PLAIN.get(role);
  const areaMatch = /^The "(.+?)" area: (.+)$/.exec(role);
  if (areaMatch) {
    // The area's own summary is folder-derived when no AI grouping ran ("Files in
    // client/src/api") and can quote a path segment that happens to read as jargon ("api") -
    // real content, not a bug, but still not fit for an everyday-user guide. Drop the raw
    // summary rather than exposing it; the area name alone still orients the reader.
    const sentence = `The ${areaMatch[1]} part of the app: ${areaMatch[2].replace(/\.$/, "")}.`;
    if (!JARGON.test(sentence)) return sentence;
    const nameOnly = `This is one part of the app.`;
    return JARGON.test(areaMatch[1]) ? nameOnly : `This is the ${areaMatch[1]} part of the app.`;
  }
  return GENERIC_FALLBACK;
}

/** The nearest UI string in the same file as this stop's evidence, by line distance - how a step
 * says "click Sign out" instead of inventing or guessing a button's real label. */
function nearestUiString(evidence, uiStrings) {
  const ev = evidence?.[0];
  if (!ev) return null;
  let best = null;
  let bestDistance = Infinity;
  for (const u of uiStrings) {
    if (u.source.path !== ev.path) continue;
    const distance = Math.abs(u.source.start_line - ev.start_line);
    if (distance < bestDistance) {
      best = u;
      bestDistance = distance;
    }
  }
  return best;
}

// A bare evidence_link, not symbol_ref/endpoint_ref/table_ref/route_ref: those render full
// developer-reference detail (signatures, param tables, "Middleware:"/"Handler:" labels) -
// exactly the jargon this page exists to avoid. A guide only needs "here's the code", not a
// reference entry. Works for every stop regardless of node kind (sym:/ep:/tbl:/mod:/group:),
// unlike the per-prefix ref blocks, since it's keyed on the stop's own evidence, not its id.
function evidenceBlockFor(stop) {
  const ev = stop.evidence?.[0];
  return ev ? { type: "evidence_link", path: ev.path, start_line: ev.start_line, end_line: ev.end_line } : null;
}

/**
 * One sentence per stop, grounded in (in priority order): a matching UI string (what the screen
 * actually says), the AI plain-language overlay's summary (already jargon-checked - plain-
 * language.js), or the role-string translation table above. Never the raw role string or a
 * developer-facing label.
 */
function rawStepSentence(stop, plan, nodeById, uiStrings) {
  const node = nodeById.get(stop.node_id);
  const label = node?.plain_label ?? plan.labels[stop.node_id] ?? "This part of the app";
  const ui = nearestUiString(stop.evidence, uiStrings);
  if (ui && (ui.kind === "button" || ui.kind === "aria_label")) {
    return `On the **${label}** screen, select **"${ui.text}"**.`;
  }
  if (node?.plain_summary) return `**${label}**: ${node.plain_summary}`;
  return `**${label}**. ${plainRole(stop.role)}`;
}

// Final guarantee, independent of which of the sources above produced the text: a raw label
// (used when the AI plain-language overlay never ran) can itself be a bare technical name, so
// check the whole rendered sentence once more before it ships, not just the role-text half.
function stepSentence(stop, plan, nodeById, uiStrings) {
  const sentence = rawStepSentence(stop, plan, nodeById, uiStrings);
  return JARGON.test(sentence) ? GENERIC_FALLBACK : sentence;
}

/**
 * Task 12 / T33-T35's required baseline (no AI call): renders every flow planTours() already
 * finds (Task 11's tour skeleton, reused as-is - see LOG.md) as a plain-language, numbered guide
 * instead of an animated tour. Works even when the AI plain-language overlay never ran.
 */
export function buildUserGuidePages(graph, index) {
  const plans = planTours(graph, index);
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const uiStrings = index.project.ui_strings;

  return plans.map((plan) => {
    const blocks = [];
    plan.stops.forEach((stop, i) => {
      blocks.push({ type: "prose", text: `${i + 1}. ${stepSentence(stop, plan, nodeById, uiStrings)}` });
      const ref = evidenceBlockFor(stop);
      if (ref) blocks.push(ref);
    });
    return { schema_version: "page/1", slug: `guide-${plan.tour_id}`, title: `Guide: ${plan.title_hint}`, sections: [{ heading: "Steps", blocks }] };
  });
}

/** True if any rendered guide text still matches a jargon term - a bug if it ever fires, since
 * every text source above (UI strings, plain_summary, the translation table) is meant to be clean. */
export function guidePagesContainJargon(pages) {
  return pages.some((p) => p.sections.some((s) => s.blocks.some((b) => b.type === "prose" && JARGON.test(b.text))));
}
