// Compares what a README says against what the code facts say: names, environment variables, file
// paths and npm scripts that the README mentions but the code does not have. Demo tooling for the
// stale-README scenario (EV-5); the product's own pages are built from code, never from the README.

const KNOWN_BARE = new Set(["README", "JSON", "HTTP", "HTTPS", "URL", "API", "SQL", "CSS", "HTML", "NODE_ENV", "PATH", "HOME"]);

function backticked(text) {
  const out = [];
  text.split("\n").forEach((line, i) => {
    for (const m of line.matchAll(/`([^`\n]+)`/g)) out.push({ text: m[1].trim(), line: i + 1 });
  });
  return out;
}

export function readmeStaleNames(readme, { index, files }) {
  const itemNames = new Set(index.items.flatMap((i) => [i.name, i.kind === "method" ? i.name.split(".").pop() : null, ...(i.params ?? []).map((p) => p.name)].filter(Boolean)));
  const envNames = new Set(index.project.env_vars.map((e) => e.id.replace(/^env:/, "")));
  const deps = new Set(index.project.workspaces.flatMap((w) => Object.keys(w.dependencies)));
  const scripts = new Set(index.project.workspaces.flatMap((w) => Object.keys(w.scripts)));
  const filePaths = new Set(files.map((f) => f.path));
  const stale = [];

  for (const { text, line } of backticked(readme)) {
    const npm = /^npm run (\S+)/.exec(text);
    if (npm) {
      if (!scripts.has(npm[1])) stale.push({ kind: "npm_script", text, line, why: `no "${npm[1]}" script in any package.json` });
    } else if (/^npm (start|test)\b/.test(text)) {
      const script = text.split(" ")[1];
      if (!scripts.has(script)) stale.push({ kind: "npm_script", text, line, why: `no "${script}" script in any package.json` });
    } else if (/^[A-Z][A-Z0-9_]{2,}$/.test(text)) {
      if (!envNames.has(text) && !KNOWN_BARE.has(text)) stale.push({ kind: "env_var", text, line, why: "the code never reads this environment variable" });
    } else if (/^[\w./-]+\.[A-Za-z]{1,5}$/.test(text) && text.includes("/")) {
      if (!filePaths.has(text)) stale.push({ kind: "path", text, line, why: "no such file in the repository" });
    } else if (/^[A-Za-z_$][\w$]*(\(\))?$/.test(text)) {
      const name = text.replace(/\(\)$/, "");
      const looksLikeCode = text.endsWith("()") || /[a-z][A-Z]/.test(name);
      if (looksLikeCode && !itemNames.has(name) && !deps.has(name)) stale.push({ kind: "name", text, line, why: "no function, class or constant with this name in the code" });
    }
  }
  return stale;
}
