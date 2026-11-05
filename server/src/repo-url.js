// SEC-2: accept only https://github.com/<owner>/<repo> with an optional
// /tree/<ref>. owner and repo are restricted to GitHub's own charset.
const REPO_URL_PATTERN = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:\/tree\/(.+))?\/?$/;

/**
 * Parses a GitHub repo URL. Returns { owner, name, ref } or null if the URL
 * doesn't match the allowlisted shape.
 */
export function parseRepoUrl(url) {
  if (typeof url !== "string") return null;
  const match = REPO_URL_PATTERN.exec(url.trim());
  if (!match) return null;
  const [, owner, name, ref] = match;
  return { owner, name: name.replace(/\.git$/, ""), ref: ref ?? null };
}
