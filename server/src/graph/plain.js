// Plain-English names and sentences for the repo map, so someone who has just opened the codebase (and
// is not very technical) can follow it. Everything here is built from parser facts; nothing is invented.

const WORD_FIXES = { id: "ID", api: "API", url: "URL", jwt: "login token", db: "database", ui: "screen", auth: "sign-in" };

/** createHabit -> "Create habit", HabitsPage -> "Habits page", get_all_users -> "Get all users" */
export function humanizeName(name) {
  const words = name
    .replace(/\.[a-z]+$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => WORD_FIXES[w.toLowerCase()] ?? w.toLowerCase());
  if (words.length === 0) return name;
  const sentence = words.join(" ").replace(/login token token/g, "login token");
  return sentence[0].toUpperCase() + sentence.slice(1);
}

function singular(word) {
  if (/ies$/i.test(word)) return word.replace(/ies$/i, "y");
  if (/(ss|us)$/i.test(word)) return word;
  return word.replace(/s$/i, "");
}

const ACTION_WORDS = {
  login: "Log in",
  logout: "Log out",
  register: "Sign up",
  signup: "Sign up",
  verify: "Check that you are signed in",
  health: "Check the server is running",
  search: "Search",
};

/** "POST /api/habits" -> "Add a habit"; "GET /api/users/:id" -> "Get one user" */
export function endpointPlainLabel(method, path) {
  const segments = path.split("/").filter(Boolean);
  const last = segments[segments.length - 1];
  const named = segments.filter((s) => !s.startsWith(":") && !/^(api|v\d+)$/i.test(s));
  const action = ACTION_WORDS[(named[named.length - 1] ?? "").toLowerCase()];
  if (action) return action;
  if (!named.length) return method === "GET" ? "Home" : `${method} the home page`;
  const resource = named[named.length - 1];
  const one = singular(resource);
  const hasId = last?.startsWith(":");
  const words = (w) => w.replace(/[-_]+/g, " ").toLowerCase();
  if (method === "GET") return hasId ? `Get one ${words(one)}` : `See all ${words(resource)}`;
  if (method === "POST") return `Add a ${words(one)}`;
  if (method === "PUT" || method === "PATCH") return `Change a ${words(one)}`;
  if (method === "DELETE") return `Remove a ${words(one)}`;
  return `${method} ${words(resource)}`;
}

export function tablePlainLabel(tableName) {
  return `${humanizeName(tableName)} (saved data)`;
}

const listOf = (xs) => (xs.length <= 2 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const columnsText = (cols) => (cols.length && !cols.includes("*") ? ` (${cols.join(", ")})` : "");

/** One short sentence about what flows through an endpoint, from its data facts. */
export function endpointPlainSummary(data) {
  const parts = [];
  const body = [...new Set(data.inputs.filter((i) => i.source === "body").map((i) => i.name))];
  const params = [...new Set(data.inputs.filter((i) => i.source === "params").map((i) => i.name))];
  const query = [...new Set(data.inputs.filter((i) => i.source === "query").map((i) => i.name))];
  const headers = [...new Set(data.inputs.filter((i) => i.source === "header").map((i) => i.name))];
  const given = [...body, ...params.map((p) => `${p} (from the address)`), ...query.map((q) => `${q} (from the address)`), ...headers.map((h) => `${h} (sent with the request)`)];
  if (given.length) parts.push(`Takes in ${listOf(given)}.`);
  if (data.reads.length) parts.push(`Looks up ${listOf(data.reads.map((r) => `${r.table}${columnsText(r.columns)}`))}.`);
  if (data.writes.length) parts.push(`Saves to ${listOf(data.writes.map((w) => `${w.table}${columnsText(w.columns)}`))}.`);
  const ok = data.outputs.filter((o) => o.status === null || (o.status >= 200 && o.status < 300));
  const bad = data.outputs.filter((o) => o.status !== null && o.status >= 400);
  if (ok.length) parts.push("Sends back the result.");
  if (bad.length) {
    const msgs = [...new Set(bad.map((b) => b.message).filter(Boolean))];
    parts.push(msgs.length ? `If something is wrong it answers: ${listOf(msgs.map((m) => `"${m}"`))}.` : "If something is wrong it answers with an error.");
  }
  return parts.join(" ");
}
